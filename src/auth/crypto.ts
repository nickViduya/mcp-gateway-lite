import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";

import { config } from "../config.js";

const CIPHER_ALGORITHM = "aes-256-gcm";
const INITIALIZATION_VECTOR_LENGTH = 12;
const AUTHENTICATION_TAG_LENGTH = 16;
const DERIVED_KEY_LENGTH = 32;
const HKDF_INFO_CONTEXT = Buffer.from("mcp-gateway-lite-credentials", "utf8");

const encryptedPayloadSchema = z.object({
  encrypted: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
});

const parseBase64ToBuffer = (value: string, fieldName: string): Buffer => {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new Error(`Invalid base64 input for ${fieldName}`);
  }
};

const getMasterKeyMaterial = (masterKeyBase64: string): Buffer => {
  const masterKeyBuffer = parseBase64ToBuffer(masterKeyBase64, "MASTER_ENCRYPTION_KEY");

  if (masterKeyBuffer.length < DERIVED_KEY_LENGTH) {
    throw new Error("MASTER_ENCRYPTION_KEY must decode to at least 32 bytes");
  }

  return masterKeyBuffer;
};

const deriveEncryptionKey = (salt: Buffer, masterKeyBase64: string): Buffer => {
  return Buffer.from(
    hkdfSync(
      "sha256",
      getMasterKeyMaterial(masterKeyBase64),
      salt,
      HKDF_INFO_CONTEXT,
      DERIVED_KEY_LENGTH,
    ),
  );
};

const buildSalt = (iv: Buffer): Buffer => {
  return Buffer.concat([Buffer.from("mcp-gateway-lite", "utf8"), iv]);
};

export type EncryptedPayload = z.infer<typeof encryptedPayloadSchema>;

export const encryptPayloadWithMasterKey = (
  plaintextPayload: Record<string, unknown>,
  masterKeyBase64: string,
): EncryptedPayload => {
  const initializationVector = randomBytes(INITIALIZATION_VECTOR_LENGTH);
  const encryptionKey = deriveEncryptionKey(buildSalt(initializationVector), masterKeyBase64);

  const cipher = createCipheriv(CIPHER_ALGORITHM, encryptionKey, initializationVector, {
    authTagLength: AUTHENTICATION_TAG_LENGTH,
  });

  const plaintextBuffer = Buffer.from(JSON.stringify(plaintextPayload), "utf8");
  const encryptedBuffer = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encryptedBuffer.toString("base64"),
    iv: initializationVector.toString("base64"),
    authTag: authTag.toString("base64"),
  };
};

export const decryptPayload = (rawEncryptedPayload: EncryptedPayload): Record<string, unknown> => {
  return decryptPayloadWithMasterKey(rawEncryptedPayload, config.masterEncryptionKey);
};

export const encryptPayload = (plaintextPayload: Record<string, unknown>): EncryptedPayload => {
  return encryptPayloadWithMasterKey(plaintextPayload, config.masterEncryptionKey);
};

export const decryptPayloadWithMasterKey = (
  rawEncryptedPayload: EncryptedPayload,
  masterKeyBase64: string,
): Record<string, unknown> => {
  const payload = encryptedPayloadSchema.parse(rawEncryptedPayload);
  const initializationVector = parseBase64ToBuffer(payload.iv, "iv");
  const encryptedBuffer = parseBase64ToBuffer(payload.encrypted, "encrypted");
  const authenticationTag = parseBase64ToBuffer(payload.authTag, "authTag");

  const encryptionKey = deriveEncryptionKey(buildSalt(initializationVector), masterKeyBase64);

  const decipher = createDecipheriv(CIPHER_ALGORITHM, encryptionKey, initializationVector, {
    authTagLength: AUTHENTICATION_TAG_LENGTH,
  });
  decipher.setAuthTag(authenticationTag);

  const decryptedBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  const decryptedText = decryptedBuffer.toString("utf8");
  const parsedJson = JSON.parse(decryptedText);

  return z.record(z.string(), z.unknown()).parse(parsedJson);
};

export const validateMasterKeyConfiguration = (): void => {
  void getMasterKeyMaterial(config.masterEncryptionKey);
};
