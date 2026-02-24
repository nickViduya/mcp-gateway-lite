import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchWithTimeout } from "../common/http.js";
import { embeddingDimension, validateEmbedding } from "../common/vector.js";
import { config } from "../config.js";

import type { RegistryServer, RegistryTool } from "../registry/types.js";

const embeddingsResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
    }),
  ),
});

const stableFallbackEmbedding = (input: string): number[] => {
  const digest = createHash("sha256").update(input).digest();
  const generatedEmbedding = Array.from({ length: embeddingDimension }, (_, index) => {
    const digestValue = digest[index % digest.length] ?? 0;
    return digestValue / 255;
  });

  return validateEmbedding(generatedEmbedding);
};

export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (config.openAiApiKey === undefined) {
    return stableFallbackEmbedding(text);
  }

  const response = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate embedding: HTTP ${response.status}`);
  }

  const parsedBody = embeddingsResponseSchema.parse(await response.json());
  const embeddingVector = parsedBody.data.at(0)?.embedding;

  if (embeddingVector === undefined) {
    throw new Error("Embedding API did not return an embedding vector");
  }

  return validateEmbedding(embeddingVector);
};

export const buildServerEmbeddingInput = (
  server: RegistryServer,
  tools: RegistryTool[],
): string => {
  const toolDescriptions = tools.map((tool) => `${tool.name} - ${tool.description}`).join(", ");
  return `${server.name}: ${server.description} | Tools: ${toolDescriptions}`;
};
