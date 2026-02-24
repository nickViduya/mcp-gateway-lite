import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { runExecuteTool } from "./tools/execute.js";
import { runSearchTool } from "./tools/search.js";

const searchToolInputSchema = {
  query: z.string().min(1).describe("Natural language query to search available MCP tools"),
  limit: z.number().int().min(1).max(25).optional().describe("Maximum results to return"),
};

const executeToolInputSchema = {
  server: z.string().min(1).describe("Server slug returned from search"),
  tool: z.string().min(1).describe("Tool name to execute"),
  params: z.record(z.string(), z.unknown()).describe("Tool parameters to send upstream"),
};

const resolveUserIdFromAuthInfo = (authInfo: unknown): string | undefined => {
  const parsedAuthInfo = z
    .object({
      extra: z
        .object({
          userId: z.string().min(1),
        })
        .optional(),
    })
    .safeParse(authInfo);

  if (!parsedAuthInfo.success) {
    return undefined;
  }

  return parsedAuthInfo.data.extra?.userId;
};

export const createGatewayMcpServer = (): McpServer => {
  const mcpServer = new McpServer({
    name: "mcp-gateway-lite",
    version: "0.1.0",
  });

  mcpServer.registerTool(
    "search",
    {
      title: "Search Registry",
      description:
        "Search MCP servers and tools across synced registries. Returns transport, auth type, and execution capability.",
      inputSchema: searchToolInputSchema,
    },
    async (args) => runSearchTool(args),
  );

  mcpServer.registerTool(
    "execute",
    {
      title: "Execute Tool",
      description:
        "Execute a tool from a remote-capable MCP server. For stdio/package-only servers this returns runner guidance.",
      inputSchema: executeToolInputSchema,
    },
    async (args, extra) => {
      const userId = resolveUserIdFromAuthInfo(extra.authInfo);
      if (userId === undefined) {
        return {
          content: [
            {
              type: "text",
              text: "Authenticated user context is required before execute can run.",
            },
          ],
          structuredContent: {
            success: false,
            error: "authentication_required",
            message: "Authenticated user context is missing",
          },
        };
      }

      return runExecuteTool(args, { userId });
    },
  );

  return mcpServer;
};
