const EXPECTED_VECTOR_DIMENSION = 1536;

export const toSqlVector = (embedding: number[]): string => {
  if (embedding.length !== EXPECTED_VECTOR_DIMENSION) {
    throw new Error(
      `Expected embedding dimension ${EXPECTED_VECTOR_DIMENSION}, received ${embedding.length}`,
    );
  }

  return `[${embedding.join(",")}]`;
};

export const validateEmbedding = (embedding: number[]): number[] => {
  if (embedding.length !== EXPECTED_VECTOR_DIMENSION) {
    throw new Error(
      `Expected embedding dimension ${EXPECTED_VECTOR_DIMENSION}, received ${embedding.length}`,
    );
  }

  return embedding;
};

export const embeddingDimension = EXPECTED_VECTOR_DIMENSION;
