import "dotenv/config";

import { logger } from "../common/logger.js";

import { closeDatabaseConnection, database } from "./client.js";
import { serversTable, toolsTable } from "./schema.js";

const runSeed = async (): Promise<void> => {
  logger.info("Seeding database");

  const [server] = await database
    .insert(serversTable)
    .values({
      name: "MCP GitHub",
      slug: "github",
      description: "Official GitHub MCP server",
      source: "official",
      sourceUrl: "https://github.com/modelcontextprotocol/servers",
      transport: "streamable-http",
      remoteUrl: "https://example.invalid/mcp",
      authType: "oauth2",
      execCapability: "remote-direct",
      metadata: {
        tags: ["git", "github"],
      },
    })
    .onConflictDoNothing()
    .returning({ id: serversTable.id });

  if (server === undefined) {
    logger.info("Seed server already exists");
    return;
  }

  await database
    .insert(toolsTable)
    .values({
      serverId: server.id,
      name: "createIssue",
      description: "Create a GitHub issue",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["owner", "repo", "title"],
      },
    })
    .onConflictDoNothing();

  logger.info("Seed completed");
};

runSeed()
  .catch((error: unknown) => {
    logger.error({ error }, "Database seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
