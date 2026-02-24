import { and, asc, desc, eq, sql } from "drizzle-orm";

import { database } from "../db/client.js";
import { serversTable, syncLogsTable, toolsTable } from "../db/schema.js";

import type { RegistryServer, RegistrySource, RegistryTool } from "./types.js";

type UpsertedServer = {
  id: string;
  slug: string;
  source: RegistrySource;
};

type ServerWithTool = {
  server: {
    id: string;
    slug: string;
    name: string;
    description: string;
    source: RegistrySource;
    transport: "stdio" | "streamable-http" | "sse";
    authType: "none" | "api_key" | "bearer" | "oauth2";
    authConfig: Record<string, unknown>;
    execCapability: "remote-direct" | "runner-required";
    remoteUrl?: string;
    packageName?: string;
    packageRegistry?: string;
  };
  tool: {
    id: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
};

export const upsertRegistryServers = async (
  servers: RegistryServer[],
): Promise<Map<string, UpsertedServer>> => {
  const serverIdBySlug = new Map<string, UpsertedServer>();

  for (const server of servers) {
    const [upsertedServer] = await database
      .insert(serversTable)
      .values({
        name: server.name,
        slug: server.slug,
        description: server.description,
        source: server.source,
        sourceUrl: server.sourceUrl,
        remoteUrl: server.remoteUrl,
        transport: server.transport,
        version: server.version,
        authType: server.authType,
        authConfig: server.authConfig,
        packageName: server.packageName,
        packageRegistry: server.packageRegistry,
        execCapability: server.execCapability,
        isVerified: server.isVerified,
        isActive: server.isActive,
        metadata: server.metadata,
        embedding: server.embedding,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [serversTable.source, serversTable.slug],
        set: {
          name: server.name,
          description: server.description,
          sourceUrl: server.sourceUrl,
          remoteUrl: server.remoteUrl,
          transport: server.transport,
          version: server.version,
          authType: server.authType,
          authConfig: server.authConfig,
          packageName: server.packageName,
          packageRegistry: server.packageRegistry,
          execCapability: server.execCapability,
          isVerified: server.isVerified,
          isActive: server.isActive,
          metadata: server.metadata,
          embedding: server.embedding,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({
        id: serversTable.id,
        slug: serversTable.slug,
        source: serversTable.source,
      });

    if (upsertedServer !== undefined) {
      serverIdBySlug.set(server.slug, upsertedServer);
    }
  }

  return serverIdBySlug;
};

export const upsertRegistryTools = async (
  tools: RegistryTool[],
  serverIdBySlug: Map<string, UpsertedServer>,
): Promise<void> => {
  for (const tool of tools) {
    const server = serverIdBySlug.get(tool.serverSlug);
    if (server === undefined) {
      continue;
    }

    await database
      .insert(toolsTable)
      .values({
        serverId: server.id,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        metadata: tool.metadata,
        embedding: tool.embedding,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [toolsTable.serverId, toolsTable.name],
        set: {
          description: tool.description,
          inputSchema: tool.inputSchema,
          metadata: tool.metadata,
          embedding: tool.embedding,
          updatedAt: new Date(),
        },
      });
  }
};

export const findServerWithTool = async (
  serverSlug: string,
  toolName: string,
): Promise<ServerWithTool | undefined> => {
  const [row] = await database
    .select({
      serverId: serversTable.id,
      slug: serversTable.slug,
      serverName: serversTable.name,
      serverDescription: serversTable.description,
      source: serversTable.source,
      transport: serversTable.transport,
      authType: serversTable.authType,
      authConfig: serversTable.authConfig,
      execCapability: serversTable.execCapability,
      remoteUrl: serversTable.remoteUrl,
      packageName: serversTable.packageName,
      packageRegistry: serversTable.packageRegistry,
      toolId: toolsTable.id,
      toolName: toolsTable.name,
      toolDescription: toolsTable.description,
      inputSchema: toolsTable.inputSchema,
    })
    .from(serversTable)
    .innerJoin(toolsTable, eq(serversTable.id, toolsTable.serverId))
    .where(
      and(
        eq(serversTable.slug, serverSlug),
        eq(toolsTable.name, toolName),
        eq(serversTable.isActive, true),
      ),
    )
    .limit(1);

  if (row === undefined) {
    return undefined;
  }

  return {
    server: {
      id: row.serverId,
      slug: row.slug,
      name: row.serverName,
      description: row.serverDescription,
      source: row.source,
      transport: row.transport,
      authType: row.authType,
      authConfig: row.authConfig,
      execCapability: row.execCapability,
      remoteUrl: row.remoteUrl ?? undefined,
      packageName: row.packageName ?? undefined,
      packageRegistry: row.packageRegistry ?? undefined,
    },
    tool: {
      id: row.toolId,
      name: row.toolName,
      description: row.toolDescription,
      inputSchema: row.inputSchema,
    },
  };
};

export const findServerBySlug = async (serverSlug: string): Promise<RegistryServer | undefined> => {
  const [row] = await database
    .select()
    .from(serversTable)
    .where(and(eq(serversTable.slug, serverSlug), eq(serversTable.isActive, true)))
    .limit(1);

  if (row === undefined) {
    return undefined;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    source: row.source,
    sourceUrl: row.sourceUrl ?? undefined,
    remoteUrl: row.remoteUrl ?? undefined,
    transport: row.transport,
    version: row.version ?? undefined,
    authType: row.authType,
    authConfig: row.authConfig,
    packageName: row.packageName ?? undefined,
    packageRegistry: row.packageRegistry ?? undefined,
    execCapability: row.execCapability,
    isVerified: row.isVerified,
    isActive: row.isActive,
    metadata: row.metadata,
  };
};

export const searchToolsByText = async (
  query: string,
  limit: number,
): Promise<
  Array<{
    serverSlug: string;
    serverName: string;
    serverDescription: string;
    source: RegistrySource;
    transport: "stdio" | "streamable-http" | "sse";
    authType: "none" | "api_key" | "bearer" | "oauth2";
    execCapability: "remote-direct" | "runner-required";
    remoteUrl?: string;
    packageName?: string;
    packageRegistry?: string;
    toolName: string;
    toolDescription: string;
    inputSchema: Record<string, unknown>;
    score: number;
  }>
> => {
  const rows = await database
    .select({
      serverSlug: serversTable.slug,
      serverName: serversTable.name,
      serverDescription: serversTable.description,
      source: serversTable.source,
      transport: serversTable.transport,
      authType: serversTable.authType,
      execCapability: serversTable.execCapability,
      remoteUrl: serversTable.remoteUrl,
      packageName: serversTable.packageName,
      packageRegistry: serversTable.packageRegistry,
      toolName: toolsTable.name,
      toolDescription: toolsTable.description,
      inputSchema: toolsTable.inputSchema,
      score: sql<number>`CASE
        WHEN ${toolsTable.name} ILIKE ${`%${query}%`} THEN 1.0
        WHEN ${serversTable.name} ILIKE ${`%${query}%`} THEN 0.8
        WHEN ${toolsTable.description} ILIKE ${`%${query}%`} THEN 0.6
        WHEN ${serversTable.description} ILIKE ${`%${query}%`} THEN 0.5
        ELSE 0.3
      END`,
    })
    .from(toolsTable)
    .innerJoin(serversTable, eq(toolsTable.serverId, serversTable.id))
    .where(
      and(
        eq(serversTable.isActive, true),
        sql`(
          ${toolsTable.name} ILIKE ${`%${query}%`}
          OR ${toolsTable.description} ILIKE ${`%${query}%`}
          OR ${serversTable.name} ILIKE ${`%${query}%`}
          OR ${serversTable.description} ILIKE ${`%${query}%`}
        )`,
      ),
    )
    .orderBy(desc(sql`score`), asc(serversTable.slug), asc(toolsTable.name))
    .limit(limit);

  return rows.map((row) => ({
    serverSlug: row.serverSlug,
    serverName: row.serverName,
    serverDescription: row.serverDescription,
    source: row.source,
    transport: row.transport,
    authType: row.authType,
    execCapability: row.execCapability,
    remoteUrl: row.remoteUrl ?? undefined,
    packageName: row.packageName ?? undefined,
    packageRegistry: row.packageRegistry ?? undefined,
    toolName: row.toolName,
    toolDescription: row.toolDescription,
    inputSchema: row.inputSchema,
    score: row.score,
  }));
};

export const appendSyncLog = async (entry: {
  source: RegistrySource;
  status: "success" | "failed" | "partial";
  serversAdded: number;
  serversUpdated: number;
  errorMessage?: string;
  startedAt: Date;
  completedAt: Date;
}): Promise<void> => {
  await database.insert(syncLogsTable).values({
    source: entry.source,
    status: entry.status,
    serversAdded: entry.serversAdded,
    serversUpdated: entry.serversUpdated,
    errorMessage: entry.errorMessage,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
  });
};

export const getRecentSyncLogs = async (): Promise<
  Array<{
    id: string;
    source: RegistrySource;
    status: "success" | "failed" | "partial";
    serversAdded: number;
    serversUpdated: number;
    errorMessage?: string;
    startedAt: Date;
    completedAt?: Date;
  }>
> => {
  const rows = await database
    .select({
      id: syncLogsTable.id,
      source: syncLogsTable.source,
      status: syncLogsTable.status,
      serversAdded: syncLogsTable.serversAdded,
      serversUpdated: syncLogsTable.serversUpdated,
      errorMessage: syncLogsTable.errorMessage,
      startedAt: syncLogsTable.startedAt,
      completedAt: syncLogsTable.completedAt,
    })
    .from(syncLogsTable)
    .orderBy(desc(syncLogsTable.startedAt))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    status: row.status,
    serversAdded: row.serversAdded,
    serversUpdated: row.serversUpdated,
    errorMessage: row.errorMessage ?? undefined,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
  }));
};
