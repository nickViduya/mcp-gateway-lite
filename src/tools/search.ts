import { z } from "zod";

import { searchRegistry } from "../registry/search.js";

const searchToolInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(25).optional(),
});

export const searchToolSchema = searchToolInputSchema;

export const runSearchTool = async (
  input: unknown,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    results: Array<{
      server: {
        slug: string;
        name: string;
        description: string;
        source: "official" | "pulsemcp" | "smithery";
        transport: "stdio" | "streamable-http" | "sse";
        authType: "none" | "api_key" | "bearer" | "oauth2";
        execCapability: "remote-direct" | "runner-required";
        remoteUrl?: string;
        packageName?: string;
        packageRegistry?: string;
      };
      tool: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      };
      score: number;
    }>;
  };
}> => {
  const parsedInput = searchToolInputSchema.parse(input);
  const results = await searchRegistry(parsedInput.query, parsedInput.limit ?? 10);

  return {
    content: [
      {
        type: "text",
        text: `Found ${results.length} matching tools for query "${parsedInput.query}".`,
      },
    ],
    structuredContent: {
      results,
    },
  };
};
