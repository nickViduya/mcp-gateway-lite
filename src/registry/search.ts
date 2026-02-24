import { sql } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../common/logger.js";
import { toSqlVector } from "../common/vector.js";
import { config } from "../config.js";
import { database } from "../db/client.js";
import { generateEmbedding } from "../sync/embeddings.js";

import { searchToolsByText } from "./store.js";
import type { SearchResult } from "./types.js";

const semanticSearchRowSchema = z.object({
  server_slug: z.string(),
  server_name: z.string(),
  server_description: z.string(),
  source: z.union([z.literal("official"), z.literal("pulsemcp"), z.literal("smithery")]),
  transport: z.union([z.literal("stdio"), z.literal("streamable-http"), z.literal("sse")]),
  auth_type: z.union([
    z.literal("none"),
    z.literal("api_key"),
    z.literal("bearer"),
    z.literal("oauth2"),
  ]),
  exec_capability: z.union([z.literal("remote-direct"), z.literal("runner-required")]),
  remote_url: z.string().nullable(),
  package_name: z.string().nullable(),
  package_registry: z.string().nullable(),
  tool_name: z.string(),
  tool_description: z.string(),
  input_schema: z.record(z.string(), z.unknown()),
  score: z.number(),
});

const textSearchToResult = async (query: string, limit: number): Promise<SearchResult[]> => {
  const rows = await searchToolsByText(query, limit);

  return rows.map((row) => ({
    server: {
      slug: row.serverSlug,
      name: row.serverName,
      description: row.serverDescription,
      source: row.source,
      transport: row.transport,
      authType: row.authType,
      execCapability: row.execCapability,
      remoteUrl: row.remoteUrl,
      packageName: row.packageName,
      packageRegistry: row.packageRegistry,
    },
    tool: {
      name: row.toolName,
      description: row.toolDescription,
      inputSchema: row.inputSchema,
    },
    score: row.score,
  }));
};

const semanticSearch = async (query: string, limit: number): Promise<SearchResult[]> => {
  const queryEmbedding = await generateEmbedding(query);
  const sqlVector = toSqlVector(queryEmbedding);

  const results = await database.execute(sql`
    SELECT
      s.slug AS server_slug,
      s.name AS server_name,
      s.description AS server_description,
      s.source AS source,
      s.transport AS transport,
      s.auth_type AS auth_type,
      s.exec_capability AS exec_capability,
      s.remote_url AS remote_url,
      s.package_name AS package_name,
      s.package_registry AS package_registry,
      t.name AS tool_name,
      t.description AS tool_description,
      t.input_schema AS input_schema,
      (1 - (t.embedding <=> ${sql.raw(`'${sqlVector}'::vector`)})) AS score
    FROM tools t
    INNER JOIN servers s ON s.id = t.server_id
    WHERE s.is_active = true
      AND t.embedding IS NOT NULL
    ORDER BY score DESC
    LIMIT ${limit}
  `);

  const parsedResults = z
    .union([
      z.array(semanticSearchRowSchema),
      z.object({
        rows: z.array(semanticSearchRowSchema),
      }),
    ])
    .safeParse(results);
  if (!parsedResults.success) {
    throw new Error(`Failed to parse semantic search rows: ${parsedResults.error.message}`);
  }

  const rows = Array.isArray(parsedResults.data) ? parsedResults.data : parsedResults.data.rows;

  return rows.map((row) => ({
    server: {
      slug: row.server_slug,
      name: row.server_name,
      description: row.server_description,
      source: row.source,
      transport: row.transport,
      authType: row.auth_type,
      execCapability: row.exec_capability,
      remoteUrl: row.remote_url ?? undefined,
      packageName: row.package_name ?? undefined,
      packageRegistry: row.package_registry ?? undefined,
    },
    tool: {
      name: row.tool_name,
      description: row.tool_description,
      inputSchema: row.input_schema,
    },
    score: row.score,
  }));
};

export const searchRegistry = async (query: string, limit: number): Promise<SearchResult[]> => {
  if (query.trim().length === 0) {
    return [];
  }

  if (limit <= 0) {
    return [];
  }

  if (config.openAiApiKey === undefined) {
    return textSearchToResult(query, limit);
  }

  try {
    return await semanticSearch(query, limit);
  } catch (error: unknown) {
    logger.warn({ error }, "Semantic search failed. Falling back to text search");
    return textSearchToResult(query, limit);
  }
};
