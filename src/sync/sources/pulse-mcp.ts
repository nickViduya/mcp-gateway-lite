import { z } from "zod";
import { fetchWithTimeout } from "../../common/http.js";
import { logger } from "../../common/logger.js";
import { config } from "../../config.js";
import type { RegistryServer, RegistryTool } from "../../registry/types.js";

import type { SyncSourceFetcher } from "../types.js";

const pulseToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

const pulseServerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().default(""),
  remoteUrl: z.string().url().optional(),
  packageName: z.string().optional(),
  authType: z.string().optional(),
  tools: z.array(pulseToolSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const pulseListResponseSchema = z.object({
  items: z.array(pulseServerSchema),
  nextCursor: z.string().optional(),
});

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

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

export const fetchPulseMcpRegistry: SyncSourceFetcher = async (_updatedSince) => {
  if (config.pulseMcpApiKey === undefined || config.pulseMcpTenantId === undefined) {
    logger.info("Skipping PulseMCP sync because credentials are not configured");
    return {
      source: "pulsemcp",
      servers: [],
      tools: [],
    };
  }

  const servers: RegistryServer[] = [];
  const tools: RegistryTool[] = [];

  let nextCursor: string | undefined;

  do {
    const endpoint = new URL(`${config.pulseMcpBaseUrl}/v1/servers`);
    if (nextCursor !== undefined) {
      endpoint.searchParams.set("cursor", nextCursor);
    }

    const response = await fetchWithTimeout(endpoint, {
      headers: {
        Accept: "application/json",
        "X-API-Key": config.pulseMcpApiKey,
        "X-Tenant-ID": config.pulseMcpTenantId,
      },
    });

    if (!response.ok) {
      throw new Error(`PulseMCP sync failed with status ${response.status}`);
    }

    const payload = pulseListResponseSchema.parse(await response.json());
    for (const item of payload.items) {
      const serverSlug = normalizeSlug(item.slug ?? item.id ?? item.name);
      const authType = resolveAuthType(item.authType);
      const hasRemote = item.remoteUrl !== undefined;
      servers.push({
        name: item.name,
        slug: serverSlug,
        description: item.description,
        source: "pulsemcp",
        sourceUrl: endpoint.toString(),
        remoteUrl: item.remoteUrl,
        transport: hasRemote ? "streamable-http" : "stdio",
        version: undefined,
        authType,
        authConfig: {},
        packageName: item.packageName,
        packageRegistry: item.packageName !== undefined ? "npm" : undefined,
        execCapability: hasRemote ? "remote-direct" : "runner-required",
        isVerified: true,
        isActive: true,
        metadata: item.metadata ?? {},
      });

      for (const tool of item.tools ?? []) {
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
    if (nextCursor !== undefined) {
      await sleep(350);
    }
  } while (nextCursor !== undefined);

  logger.info(
    {
      servers: servers.length,
      tools: tools.length,
    },
    "Fetched PulseMCP registry data",
  );

  return {
    source: "pulsemcp",
    servers,
    tools,
  };
};
