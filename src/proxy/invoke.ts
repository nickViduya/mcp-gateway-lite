import { z } from "zod";
import {
  getDecryptedCredential,
  resolveCredentialHeaders,
  upsertCredential,
} from "../auth/credentials.js";
import { refreshOauthToken } from "../auth/oauth.js";
import { logger } from "../common/logger.js";

import { getPooledConnection } from "./connect.js";

type ExecuteRemoteToolInput = {
  userId: string;
  server: {
    slug: string;
    authType: "none" | "api_key" | "bearer" | "oauth2";
    authConfig: Record<string, unknown>;
    execCapability: "remote-direct" | "runner-required";
    remoteUrl?: string;
    packageName?: string;
    packageRegistry?: string;
  };
  toolName: string;
  params: Record<string, unknown>;
};

type ExecuteRemoteToolResult =
  | {
      success: true;
      result: unknown;
    }
  | {
      success: false;
      error: "authentication_required";
      authUrl?: string;
      message: string;
    }
  | {
      success: false;
      error: "runner_required";
      message: string;
    }
  | {
      success: false;
      error: "execution_failed";
      message: string;
    };

const oauthAuthConfigSchema = z.object({
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  clientId: z.string().optional(),
  resource: z.string().url().optional(),
});

const oauthCredentialSecretSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  tokenType: z.string().min(1).default("Bearer"),
  expiresAt: z.string().datetime().optional(),
});

const isCredentialExpired = (expiresAtIso: string | undefined): boolean => {
  if (expiresAtIso === undefined) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= Date.now() + 30_000;
};

const buildRunnerRequiredMessage = (server: ExecuteRemoteToolInput["server"]): string => {
  const packageName = server.packageName ?? "unknown-package";
  const packageRegistry = server.packageRegistry ?? "npm";
  return `This server requires local execution via npx/uvx. Package: ${packageName} (${packageRegistry}).`;
};

const resolveAuthUrlFromConfig = (authConfig: Record<string, unknown>): string | undefined => {
  const parsed = oauthAuthConfigSchema.safeParse(authConfig);
  if (!parsed.success) {
    return undefined;
  }

  return parsed.data.authorizationEndpoint;
};

const refreshOauthCredentialIfNeeded = async (input: ExecuteRemoteToolInput): Promise<void> => {
  if (input.server.authType !== "oauth2") {
    return;
  }

  const credential = await getDecryptedCredential(input.userId, input.server.slug);
  if (credential === undefined || credential.authType !== "oauth2") {
    return;
  }

  const parsedSecret = oauthCredentialSecretSchema.safeParse(credential.secret);
  if (!parsedSecret.success) {
    return;
  }

  if (
    !isCredentialExpired(parsedSecret.data.expiresAt) ||
    parsedSecret.data.refreshToken === undefined
  ) {
    return;
  }

  const parsedAuthConfig = oauthAuthConfigSchema.safeParse(input.server.authConfig);
  if (!parsedAuthConfig.success) {
    return;
  }

  if (
    parsedAuthConfig.data.tokenEndpoint === undefined ||
    parsedAuthConfig.data.clientId === undefined ||
    parsedAuthConfig.data.resource === undefined
  ) {
    return;
  }

  const refreshed = await refreshOauthToken({
    tokenEndpoint: parsedAuthConfig.data.tokenEndpoint,
    clientId: parsedAuthConfig.data.clientId,
    refreshToken: parsedSecret.data.refreshToken,
    resource: parsedAuthConfig.data.resource,
  });

  await upsertCredential({
    userId: input.userId,
    service: input.server.slug,
    authType: "oauth2",
    secret: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? parsedSecret.data.refreshToken,
      tokenType: refreshed.tokenType,
      expiresAt: refreshed.expiresAt?.toISOString(),
    },
    metadata: credential.metadata,
    expiresAt: refreshed.expiresAt,
  });
};

export const executeRemoteTool = async (
  input: ExecuteRemoteToolInput,
): Promise<ExecuteRemoteToolResult> => {
  if (input.server.execCapability === "runner-required") {
    return {
      success: false,
      error: "runner_required",
      message: buildRunnerRequiredMessage(input.server),
    };
  }

  if (input.server.remoteUrl === undefined) {
    return {
      success: false,
      error: "execution_failed",
      message: "Remote URL is missing for this server",
    };
  }

  await refreshOauthCredentialIfNeeded(input);

  const credentialHeaders = await resolveCredentialHeaders({
    userId: input.userId,
    service: input.server.slug,
  });

  if (input.server.authType !== "none" && credentialHeaders === undefined) {
    return {
      success: false,
      error: "authentication_required",
      authUrl: resolveAuthUrlFromConfig(input.server.authConfig),
      message: `No credentials are stored for ${input.server.slug}`,
    };
  }

  try {
    const { client } = await getPooledConnection({
      remoteUrl: input.server.remoteUrl,
      requestHeaders: credentialHeaders,
    });

    const toolResult = await client.callTool({
      name: input.toolName,
      arguments: input.params,
    });

    if ("isError" in toolResult && toolResult.isError === true) {
      return {
        success: false,
        error: "execution_failed",
        message: "Upstream tool execution failed",
      };
    }

    return {
      success: true,
      result: toolResult,
    };
  } catch (error: unknown) {
    logger.error(
      { error, server: input.server.slug, tool: input.toolName },
      "Remote tool invocation failed",
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown upstream execution error";
    const lowerCaseErrorMessage = errorMessage.toLowerCase();
    if (lowerCaseErrorMessage.includes("unauthorized") || lowerCaseErrorMessage.includes("401")) {
      return {
        success: false,
        error: "authentication_required",
        authUrl: resolveAuthUrlFromConfig(input.server.authConfig),
        message: "Upstream server rejected credentials",
      };
    }

    return {
      success: false,
      error: "execution_failed",
      message: errorMessage,
    };
  }
};
