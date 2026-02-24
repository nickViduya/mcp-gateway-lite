import "dotenv/config";

import cron from "node-cron";
import { logger } from "../common/logger.js";
import { config } from "../config.js";
import { closeDatabaseConnection } from "../db/client.js";
import { appendSyncLog, upsertRegistryServers, upsertRegistryTools } from "../registry/store.js";
import type { RegistryServer, RegistryTool } from "../registry/types.js";

import { buildServerEmbeddingInput, generateEmbedding } from "./embeddings.js";
import { fetchOfficialRegistry } from "./sources/official.js";
import { fetchPulseMcpRegistry } from "./sources/pulse-mcp.js";
import { fetchSmitheryRegistry } from "./sources/smithery.js";
import type { SyncSourceFetcher, SyncSourceResult } from "./types.js";

const dedupeServers = (
  servers: RegistryServer[],
  tools: RegistryTool[],
): { servers: RegistryServer[]; tools: RegistryTool[] } => {
  const serverBySlug = new Map<string, RegistryServer>();

  for (const server of servers) {
    const existingServer = serverBySlug.get(server.slug);
    if (existingServer === undefined) {
      serverBySlug.set(server.slug, server);
      continue;
    }

    if (
      existingServer.execCapability === "runner-required" &&
      server.execCapability === "remote-direct"
    ) {
      serverBySlug.set(server.slug, server);
    }
  }

  const availableServerSlugs = new Set(serverBySlug.keys());
  const dedupedTools = tools.filter((tool) => availableServerSlugs.has(tool.serverSlug));

  return {
    servers: Array.from(serverBySlug.values()),
    tools: dedupedTools,
  };
};

const addEmbeddings = async (
  servers: RegistryServer[],
  tools: RegistryTool[],
): Promise<{ servers: RegistryServer[]; tools: RegistryTool[] }> => {
  const toolsByServerSlug = new Map<string, RegistryTool[]>();

  for (const tool of tools) {
    const existingTools = toolsByServerSlug.get(tool.serverSlug) ?? [];
    existingTools.push(tool);
    toolsByServerSlug.set(tool.serverSlug, existingTools);
  }

  const serverEmbeddings = await Promise.all(
    servers.map(async (server): Promise<RegistryServer> => {
      const serverTools = toolsByServerSlug.get(server.slug) ?? [];
      const embeddingInput = buildServerEmbeddingInput(server, serverTools);
      const embedding = await generateEmbedding(embeddingInput);

      return {
        ...server,
        embedding,
      };
    }),
  );

  const toolEmbeddings = await Promise.all(
    tools.map(async (tool): Promise<RegistryTool> => {
      const embedding = await generateEmbedding(`${tool.name}: ${tool.description}`);
      return {
        ...tool,
        embedding,
      };
    }),
  );

  return {
    servers: serverEmbeddings,
    tools: toolEmbeddings,
  };
};

const fetchers: Record<SyncSourceResult["source"], SyncSourceFetcher> = {
  official: fetchOfficialRegistry,
  pulsemcp: fetchPulseMcpRegistry,
  smithery: fetchSmitheryRegistry,
};

const runSourceSync = async (
  source: SyncSourceResult["source"],
  updatedSince?: string,
): Promise<void> => {
  const syncStartTime = new Date();
  let serversAdded = 0;
  let serversUpdated = 0;

  try {
    const sourceResult = await fetchers[source](updatedSince);
    const deduped = dedupeServers(sourceResult.servers, sourceResult.tools);
    const withEmbeddings = await addEmbeddings(deduped.servers, deduped.tools);
    const upsertedServerMap = await upsertRegistryServers(withEmbeddings.servers);

    await upsertRegistryTools(withEmbeddings.tools, upsertedServerMap);
    serversAdded = withEmbeddings.servers.length;
    serversUpdated = withEmbeddings.tools.length;

    await appendSyncLog({
      source,
      status: "success",
      serversAdded,
      serversUpdated,
      startedAt: syncStartTime,
      completedAt: new Date(),
    });
  } catch (error: unknown) {
    logger.error({ source, error }, "Source sync failed");

    await appendSyncLog({
      source,
      status: "failed",
      serversAdded,
      serversUpdated,
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
      startedAt: syncStartTime,
      completedAt: new Date(),
    });
  }
};

export const runSyncOnce = async (updatedSince?: string): Promise<void> => {
  await runSourceSync("official", updatedSince);
  await runSourceSync("pulsemcp", updatedSince);
  await runSourceSync("smithery", updatedSince);
};

export const startSyncScheduler = (): void => {
  cron.schedule(config.syncIntervalCron, () => {
    void runSyncOnce().catch((error: unknown) => {
      logger.error({ error }, "Scheduled sync run failed");
    });
  });
};

if (process.argv[1]?.endsWith("/sync/run.ts")) {
  runSyncOnce()
    .catch((error: unknown) => {
      logger.error({ error }, "Manual sync run failed");
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabaseConnection();
    });
}
