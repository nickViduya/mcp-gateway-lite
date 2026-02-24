import { z } from "zod";
import { fetchWithTimeout } from "../../common/http.js";
import { logger } from "../../common/logger.js";
import { config } from "../../config.js";
import type { RegistryServer, RegistryTool } from "../../registry/types.js";

import type { SyncSourceFetcher } from "../types.js";

const smitheryToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

const smitheryServerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().default(""),
  remoteUrl: z.string().url().optional(),
  deploymentStatus: z.string().optional(),
  remote: z.boolean().optional(),
  authType: z.string().optional(),
  tools: z.array(smitheryToolSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const smitheryListResponseSchema = z.object({
  items: z.array(smitheryServerSchema),
  nextCursor: z.string().optional(),
});

const normalizeSlug = (nameOrSlug: string): string => {
  return nameOrSlug
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
};

const resolveAuthType = (
  authType: string | undefined,
): "none" | "api_key" | "bearer" | "oauth2" => {
  if (authType === undefined) {
    return "none";
  }

  const normalizedAuthType = authType.toLowerCase();
  if (normalizedAuthType.includes("oauth")) {
    return "oauth2";
  }
  if (normalizedAuthType.includes("api")) {
    return "api_key";
  }
  if (normalizedAuthType.includes("bearer")) {
    return "bearer";
  }

  return "none";
};

export const fetchSmitheryRegistry: SyncSourceFetcher = async (_updatedSince) => {
  if (config.smitheryBearerToken === undefined) {
    logger.info("Skipping Smithery sync because bearer token is not configured");
    return {
      source: "smithery",
      servers: [],
      tools: [],
    };
  }

  const servers: RegistryServer[] = [];
  const tools: RegistryTool[] = [];
  let nextCursor: string | undefined;

  do {
    const endpoint = new URL(`${config.smitheryBaseUrl}/v1/servers`);
    endpoint.searchParams.set("remote", "true");
    if (nextCursor !== undefined) {
      endpoint.searchParams.set("cursor", nextCursor);
    }

    const response = await fetchWithTimeout(endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.smitheryBearerToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Smithery sync failed with status ${response.status}`);
    }

    const payload = smitheryListResponseSchema.parse(await response.json());
    for (const serverEntry of payload.items) {
      const isRemote = serverEntry.remote === true || serverEntry.remoteUrl !== undefined;
      const isDeployed =
        serverEntry.deploymentStatus === undefined ||
        serverEntry.deploymentStatus.toLowerCase() === "deployed";

      if (!isRemote || !isDeployed) {
        continue;
      }

      const serverSlug = normalizeSlug(serverEntry.slug ?? serverEntry.id ?? serverEntry.name);
      const authType = resolveAuthType(serverEntry.authType);

      servers.push({
        name: serverEntry.name,
        slug: serverSlug,
        description: serverEntry.description,
        source: "smithery",
        sourceUrl: endpoint.toString(),
        remoteUrl: serverEntry.remoteUrl,
        transport: "streamable-http",
        version: undefined,
        authType,
        authConfig: {},
        packageName: undefined,
        packageRegistry: undefined,
        execCapability: "remote-direct",
        isVerified: true,
        isActive: true,
        metadata: serverEntry.metadata ?? {},
      });

      for (const tool of serverEntry.tools ?? []) {
        tools.push({
          serverSlug,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? {},
          metadata: {},
        });
      }
    }

    nextCursor = payload.nextCursor;
  } while (nextCursor !== undefined);

  logger.info(
    {
      servers: servers.length,
      tools: tools.length,
    },
    "Fetched Smithery registry data",
  );

  return {
    source: "smithery",
    servers,
    tools,
  };
};
