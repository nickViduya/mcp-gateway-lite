import { z } from "zod";
import { fetchWithTimeout } from "../../common/http.js";
import { logger } from "../../common/logger.js";
import { config } from "../../config.js";
import type { RegistryServer, RegistryTool } from "../../registry/types.js";

import type { SyncSourceFetcher } from "../types.js";

const registryToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  input_schema: z.record(z.string(), z.unknown()).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

const officialServerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().default(""),
  version: z.string().optional(),
  url: z.string().url().optional(),
  website: z.string().url().optional(),
  auth_type: z.string().optional(),
  authType: z.string().optional(),
  transport: z.string().optional(),
  tools: z.array(registryToolSchema).optional(),
  remotes: z
    .array(
      z.object({
        url: z.string().url(),
        transport: z.string().optional(),
        auth_type: z.string().optional(),
        authType: z.string().optional(),
      }),
    )
    .optional(),
  packages: z
    .array(
      z.object({
        name: z.string().optional(),
        registry_name: z.string().optional(),
        registry: z.string().optional(),
      }),
    )
    .optional(),
});

const officialListResponseSchema = z.object({
  servers: z.array(officialServerSchema),
  next_cursor: z.string().optional(),
  nextCursor: z.string().optional(),
});

const normalizeSlug = (nameOrId: string): string => {
  return nameOrId
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

const toRegistryRecords = (
  upstreamServer: z.infer<typeof officialServerSchema>,
): {
  server: RegistryServer;
  tools: RegistryTool[];
} => {
  const slug = normalizeSlug(upstreamServer.id ?? upstreamServer.name);
  const primaryRemote = upstreamServer.remotes?.at(0);
  const primaryPackage = upstreamServer.packages?.at(0);
  const resolvedAuthType = resolveAuthType(
    primaryRemote?.auth_type ??
      primaryRemote?.authType ??
      upstreamServer.auth_type ??
      upstreamServer.authType,
  );
  const hasRemote = primaryRemote !== undefined;

  const server: RegistryServer = {
    name: upstreamServer.name,
    slug,
    description: upstreamServer.description,
    source: "official",
    sourceUrl: upstreamServer.url ?? upstreamServer.website,
    remoteUrl: primaryRemote?.url,
    transport: hasRemote
      ? primaryRemote?.transport === "sse"
        ? "sse"
        : "streamable-http"
      : "stdio",
    version: upstreamServer.version,
    authType: resolvedAuthType,
    authConfig: {},
    packageName: primaryPackage?.name,
    packageRegistry: primaryPackage?.registry_name ?? primaryPackage?.registry,
    execCapability: hasRemote ? "remote-direct" : "runner-required",
    isVerified: true,
    isActive: true,
    metadata: {
      upstream: "official_registry",
      remotesCount: upstreamServer.remotes?.length ?? 0,
      packagesCount: upstreamServer.packages?.length ?? 0,
    },
  };

  const tools = (upstreamServer.tools ?? []).map<RegistryTool>((tool) => ({
    serverSlug: slug,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema ?? tool.inputSchema ?? {},
    metadata: {},
  }));

  return { server, tools };
};

export const fetchOfficialRegistry: SyncSourceFetcher = async (updatedSince) => {
  const servers: RegistryServer[] = [];
  const tools: RegistryTool[] = [];

  let nextCursor: string | undefined;

  do {
    const endpoint = new URL(`${config.officialRegistryBaseUrl}/servers`);
    if (nextCursor !== undefined) {
      endpoint.searchParams.set("cursor", nextCursor);
    }
    if (updatedSince !== undefined) {
      endpoint.searchParams.set("updated_since", updatedSince);
    }

    const response = await fetchWithTimeout(endpoint, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Official registry sync failed with status ${response.status}`);
    }

    const responseData = officialListResponseSchema.parse(await response.json());
    for (const upstreamServer of responseData.servers) {
      const normalizedRecord = toRegistryRecords(upstreamServer);
      servers.push(normalizedRecord.server);
      tools.push(...normalizedRecord.tools);
    }

    nextCursor = responseData.next_cursor ?? responseData.nextCursor;
  } while (nextCursor !== undefined);

  logger.info(
    {
      servers: servers.length,
      tools: tools.length,
    },
    "Fetched Official MCP Registry data",
  );

  return {
    source: "official",
    servers,
    tools,
  };
};
