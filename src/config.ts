import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MCP_PATH: z.string().min(1).default("/mcp"),
  DATABASE_URL: z.string().url(),
  MASTER_ENCRYPTION_KEY: z.string().min(44),
  GATEWAY_API_KEY: z.string().min(16).optional(),
  BEARER_JWT_SECRET: z.string().min(16).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  SYNC_INTERVAL_CRON: z.string().min(1).default("0 */6 * * *"),
  ALLOWED_ORIGINS: z.string().default(""),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  PULSEMCP_API_KEY: z.string().min(1).optional(),
  PULSEMCP_TENANT_ID: z.string().min(1).optional(),
  SMITHERY_BEARER_TOKEN: z.string().min(1).optional(),
  OFFICIAL_REGISTRY_BASE_URL: z
    .string()
    .url()
    .default("https://registry.modelcontextprotocol.io/v0"),
  PULSEMCP_BASE_URL: z.string().url().default("https://api.pulsemcp.com"),
  SMITHERY_BASE_URL: z.string().url().default("https://api.smithery.ai"),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20),
  OAUTH_REDIRECT_BASE_URL: z.string().url().optional(),
  OAUTH_ALLOWED_REDIRECT_HOSTS: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DISABLE_SYNC_ON_BOOT: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const formattedErrors = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(", ");
  throw new Error(`Invalid environment configuration: ${formattedErrors}`);
}

const parseCommaSeparatedValues = (rawValue: string): string[] => {
  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const requiredOrigins = parseCommaSeparatedValues(parsedEnvironment.data.ALLOWED_ORIGINS);
const allowedOauthRedirectHosts = parseCommaSeparatedValues(
  parsedEnvironment.data.OAUTH_ALLOWED_REDIRECT_HOSTS,
);

export const config = {
  environment: parsedEnvironment.data.NODE_ENV,
  port: parsedEnvironment.data.PORT,
  mcpPath: parsedEnvironment.data.MCP_PATH,
  databaseUrl: parsedEnvironment.data.DATABASE_URL,
  masterEncryptionKey: parsedEnvironment.data.MASTER_ENCRYPTION_KEY,
  gatewayApiKey: parsedEnvironment.data.GATEWAY_API_KEY,
  bearerJwtSecret: parsedEnvironment.data.BEARER_JWT_SECRET,
  openAiApiKey: parsedEnvironment.data.OPENAI_API_KEY,
  embeddingModel: parsedEnvironment.data.EMBEDDING_MODEL,
  syncIntervalCron: parsedEnvironment.data.SYNC_INTERVAL_CRON,
  requestTimeoutMs: parsedEnvironment.data.REQUEST_TIMEOUT_MS,
  pulseMcpApiKey: parsedEnvironment.data.PULSEMCP_API_KEY,
  pulseMcpTenantId: parsedEnvironment.data.PULSEMCP_TENANT_ID,
  smitheryBearerToken: parsedEnvironment.data.SMITHERY_BEARER_TOKEN,
  officialRegistryBaseUrl: parsedEnvironment.data.OFFICIAL_REGISTRY_BASE_URL,
  pulseMcpBaseUrl: parsedEnvironment.data.PULSEMCP_BASE_URL,
  smitheryBaseUrl: parsedEnvironment.data.SMITHERY_BASE_URL,
  authRateLimitWindowMs: parsedEnvironment.data.AUTH_RATE_LIMIT_WINDOW_MS,
  authRateLimitMaxRequests: parsedEnvironment.data.AUTH_RATE_LIMIT_MAX_REQUESTS,
  oauthRedirectBaseUrl: parsedEnvironment.data.OAUTH_REDIRECT_BASE_URL,
  logLevel: parsedEnvironment.data.LOG_LEVEL,
  disableSyncOnBoot: parsedEnvironment.data.DISABLE_SYNC_ON_BOOT,
  requiredOrigins,
  allowedOauthRedirectHosts,
  protocolVersion: "2025-06-18",
};

export type RuntimeConfig = typeof config;
