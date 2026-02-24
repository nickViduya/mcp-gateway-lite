import { describe, expect, it } from "vitest";

import { decryptPayload, encryptPayload } from "../../src/auth/crypto.js";

describe("credential encryption", () => {
  it("encrypts and decrypts payload round-trip", () => {
    const plaintext = {
      apiKey: "test-key",
      scope: "read:issues",
    };

    const encrypted = encryptPayload(plaintext);
    const decrypted = decryptPayload(encrypted);

    expect(decrypted).toEqual(plaintext);
  });

  it("throws when auth tag is invalid", () => {
    const encrypted = encryptPayload({
      token: "secret",
    });

    expect(() =>
      decryptPayload({
        ...encrypted,
        authTag: "AAAAAAAAAAAAAAAAAAAAAA==",
      }),
    ).toThrowError();
  });
});
