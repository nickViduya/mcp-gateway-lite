import "dotenv/config";

import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { oauthCallbackRouter } from "./auth/callback.js";
import { validateMasterKeyConfiguration } from "./auth/crypto.js";
import { gatewayAuthMiddleware, getGatewayPrincipal } from "./auth/gateway.js";
import { logger } from "./common/logger.js";
import { config } from "./config.js";
import { closeDatabaseConnection } from "./db/client.js";
import { authRouter } from "./http/authRoutes.js";
import { originGuardMiddleware } from "./http/originGuard.js";
import { authRateLimitMiddleware } from "./http/rateLimit.js";
import { closeAllPooledConnections } from "./proxy/connect.js";
import { createGatewayMcpServer } from "./server.js";
import { runSyncOnce, startSyncScheduler } from "./sync/run.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (config.requiredOrigins.length === 0) {
        return origin;
      }

      return config.requiredOrigins.includes(origin) ? origin : "";
    },
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "MCP-Protocol-Version",
      "Mcp-Session-Id",
      "X-API-Key",
      "X-User-Id",
    ],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["MCP-Protocol-Version", "Mcp-Session-Id"],
  }),
);

app.use("*", originGuardMiddleware);
app.use("/mcp", gatewayAuthMiddleware);
app.use("/auth/*", gatewayAuthMiddleware);
app.use("/auth/*", authRateLimitMiddleware);
app.use("/oauth/callback", authRateLimitMiddleware);

app.get("/health", (context) => {
  return context.json({
    status: "ok",
    service: "mcp-gateway-lite",
  });
});

app.route("/", oauthCallbackRouter);
app.route("/", authRouter);

app.all("/mcp", async (context) => {
  const principal = getGatewayPrincipal(context);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  const server = createGatewayMcpServer();

  await server.connect(transport);
  const response = await transport.handleRequest(context.req.raw, {
    authInfo: {
      token: principal.authMethod,
      clientId: principal.userId,
      scopes: [],
      extra: {
        userId: principal.userId,
      },
    },
  });

  response.headers.set("MCP-Protocol-Version", config.protocolVersion);
  return response;
});

const shutdown = async (): Promise<void> => {
  logger.info("Shutting down MCP Gateway Lite");
  await closeAllPooledConnections();
  await closeDatabaseConnection();
};

const start = async (): Promise<void> => {
  validateMasterKeyConfiguration();

  if (!config.disableSyncOnBoot) {
    await runSyncOnce();
  }

  startSyncScheduler();

  serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    (info) => {
      logger.info({ port: info.port }, "MCP Gateway Lite started");
    },
  );
};

void start().catch((error: unknown) => {
  logger.error({ error }, "Failed to start MCP Gateway Lite");
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
