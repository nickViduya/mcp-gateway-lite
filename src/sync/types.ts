import type { RegistryServer, RegistrySource, RegistryTool } from "../registry/types.js";

export type SyncSourceResult = {
  source: RegistrySource;
  servers: RegistryServer[];
  tools: RegistryTool[];
};

export type SyncSourceFetcher = (updatedSince?: string) => Promise<SyncSourceResult>;
