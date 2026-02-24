import { describe, expect, it } from "vitest";

import { embeddingDimension, toSqlVector, validateEmbedding } from "../../src/common/vector.js";

describe("vector helpers", () => {
  it("converts embedding to SQL vector literal", () => {
    const embedding = Array.from({ length: embeddingDimension }, () => 0.5);
    const sqlVector = toSqlVector(embedding);

    expect(sqlVector.startsWith("[")).toBe(true);
    expect(sqlVector.endsWith("]")).toBe(true);
  });

  it("rejects wrong embedding dimensions", () => {
    expect(() => validateEmbedding([1, 2, 3])).toThrowError();
  });
});
