import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core/columns/vector_extension/vector";

const embeddingDimension = 1536;

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const sourceEnum = pgEnum("source", ["official", "pulsemcp", "smithery"]);
export const transportEnum = pgEnum("transport", ["stdio", "streamable-http", "sse"]);
export const authTypeEnum = pgEnum("auth_type", ["none", "api_key", "bearer", "oauth2"]);
export const execCapabilityEnum = pgEnum("exec_capability", ["remote-direct", "runner-required"]);
export const syncStatusEnum = pgEnum("sync_status", ["success", "failed", "partial"]);

export const serversTable = pgTable(
  "servers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    source: sourceEnum("source").notNull(),
    sourceUrl: text("source_url"),
    remoteUrl: text("remote_url"),
    transport: transportEnum("transport").notNull(),
    version: text("version"),
    authType: authTypeEnum("auth_type").notNull().default("none"),
    authConfig: jsonb("auth_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    packageName: text("package_name"),
    packageRegistry: text("package_registry"),
    execCapability: execCapabilityEnum("exec_capability").notNull().default("runner-required"),
    isVerified: boolean("is_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    embedding: vector("embedding", { dimensions: embeddingDimension }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => {
    return {
      slugUniqueIndex: uniqueIndex("servers_slug_unique_idx").on(table.slug),
      sourceAndSlugIndex: uniqueIndex("servers_source_slug_unique_idx").on(
        table.source,
        table.slug,
      ),
      sourceIndex: index("servers_source_idx").on(table.source),
      activeIndex: index("servers_is_active_idx").on(table.isActive),
      embeddingHnswIndex: index("servers_embedding_hnsw_idx").using(
        "hnsw",
        table.embedding.op("vector_cosine_ops"),
      ),
    };
  },
);

export const toolsTable = pgTable(
  "tools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => serversTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    embedding: vector("embedding", { dimensions: embeddingDimension }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => {
    return {
      uniqueToolPerServerIndex: uniqueIndex("tools_server_name_unique_idx").on(
        table.serverId,
        table.name,
      ),
      toolServerIndex: index("tools_server_id_idx").on(table.serverId),
      embeddingHnswIndex: index("tools_embedding_hnsw_idx").using(
        "hnsw",
        table.embedding.op("vector_cosine_ops"),
      ),
    };
  },
);

export const credentialsTable = pgTable(
  "credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    service: text("service").notNull(),
    authType: authTypeEnum("auth_type").notNull(),
    encrypted: bytea("encrypted").notNull(),
    iv: bytea("iv").notNull(),
    authTag: bytea("auth_tag").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => {
    return {
      userServiceUniqueIndex: uniqueIndex("credentials_user_service_unique_idx").on(
        table.userId,
        table.service,
      ),
    };
  },
);

export const syncLogsTable = pgTable(
  "sync_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: sourceEnum("source").notNull(),
    status: syncStatusEnum("status").notNull(),
    serversAdded: integer("servers_added").notNull().default(0),
    serversUpdated: integer("servers_updated").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => {
    return {
      sourceStartedAtIndex: index("sync_logs_source_started_at_idx").on(
        table.source,
        table.startedAt,
      ),
    };
  },
);
