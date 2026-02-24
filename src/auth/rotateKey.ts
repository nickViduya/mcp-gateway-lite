import "dotenv/config";

import { eq } from "drizzle-orm";
import { logger } from "../common/logger.js";
import { closeDatabaseConnection, database } from "../db/client.js";
import { credentialsTable } from "../db/schema.js";
import {
  decryptPayload,
  encryptPayloadWithMasterKey,
  validateMasterKeyConfiguration,
} from "./crypto.js";

const toBase64 = (value: Buffer): string => {
  return value.toString("base64");
};

const toBuffer = (base64Value: string): Buffer => {
  return Buffer.from(base64Value, "base64");
};

const rotateCredentialEncryptionKey = async (): Promise<void> => {
  validateMasterKeyConfiguration();

  const newMasterKey = process.env.NEW_MASTER_ENCRYPTION_KEY;
  if (newMasterKey === undefined || newMasterKey.length === 0) {
    throw new Error("NEW_MASTER_ENCRYPTION_KEY must be set");
  }

  const credentials = await database
    .select({
      id: credentialsTable.id,
      encrypted: credentialsTable.encrypted,
      iv: credentialsTable.iv,
      authTag: credentialsTable.authTag,
    })
    .from(credentialsTable);

  logger.info({ credentialCount: credentials.length }, "Starting credential key rotation");

  for (const credential of credentials) {
    const decrypted = decryptPayload({
      encrypted: toBase64(credential.encrypted),
      iv: toBase64(credential.iv),
      authTag: toBase64(credential.authTag),
    });

    const reEncrypted = encryptPayloadWithMasterKey(decrypted, newMasterKey);

    await database
      .update(credentialsTable)
      .set({
        encrypted: toBuffer(reEncrypted.encrypted),
        iv: toBuffer(reEncrypted.iv),
        authTag: toBuffer(reEncrypted.authTag),
        updatedAt: new Date(),
      })
      .where(eq(credentialsTable.id, credential.id));
  }

  logger.info("Credential key rotation completed");
};

rotateCredentialEncryptionKey()
  .catch((error: unknown) => {
    logger.error({ error }, "Credential key rotation failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
