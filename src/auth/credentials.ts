import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { database } from "../db/client.js";
import { credentialsTable } from "../db/schema.js";

import { decryptPayload, encryptPayload } from "./crypto.js";

const apiKeySecretSchema = z.object({
  apiKey: z.string().min(1),
  headerName: z.string().min(1).default("Authorization"),
  headerPrefix: z.string().min(1).default("Bearer "),
});

const bearerSecretSchema = z.object({
  accessToken: z.string().min(1),
});

const oauthSecretSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  tokenType: z.string().min(1).default("Bearer"),
  expiresAt: z.string().datetime().optional(),
});

const credentialSecretByAuthTypeSchema: {
  api_key: typeof apiKeySecretSchema;
  bearer: typeof bearerSecretSchema;
  oauth2: typeof oauthSecretSchema;
} = {
  api_key: apiKeySecretSchema,
  bearer: bearerSecretSchema,
  oauth2: oauthSecretSchema,
};

const toIsoStringIfPresent = (date: Date | undefined): string | undefined => {
  if (date === undefined) {
    return undefined;
  }

  return date.toISOString();
};

const toBuffer = (base64Value: string): Buffer => {
  return Buffer.from(base64Value, "base64");
};

const toBase64 = (value: Buffer): string => {
  return value.toString("base64");
};

export type GatewayAuthType = keyof typeof credentialSecretByAuthTypeSchema;

type StoredCredentialInput = {
  userId: string;
  service: string;
  authType: GatewayAuthType;
  secret: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
};

export const upsertCredential = async (input: StoredCredentialInput): Promise<void> => {
  const secretSchema = credentialSecretByAuthTypeSchema[input.authType];
  const validatedSecret = secretSchema.parse(input.secret);
  const encryptedPayload = encryptPayload(validatedSecret);

  await database
    .insert(credentialsTable)
    .values({
      userId: input.userId,
      service: input.service,
      authType: input.authType,
      encrypted: toBuffer(encryptedPayload.encrypted),
      iv: toBuffer(encryptedPayload.iv),
      authTag: toBuffer(encryptedPayload.authTag),
      metadata: input.metadata ?? {},
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: [credentialsTable.userId, credentialsTable.service],
      set: {
        authType: input.authType,
        encrypted: toBuffer(encryptedPayload.encrypted),
        iv: toBuffer(encryptedPayload.iv),
        authTag: toBuffer(encryptedPayload.authTag),
        metadata: input.metadata ?? {},
        expiresAt: input.expiresAt,
        updatedAt: new Date(),
      },
    });
};

export const deleteCredential = async (userId: string, service: string): Promise<void> => {
  await database
    .delete(credentialsTable)
    .where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.service, service)));
};

type DecryptedCredentialRecord = {
  authType: GatewayAuthType;
  secret: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expiresAt?: string;
};

export const getDecryptedCredential = async (
  userId: string,
  service: string,
): Promise<DecryptedCredentialRecord | undefined> => {
  const [credentialRow] = await database
    .select()
    .from(credentialsTable)
    .where(and(eq(credentialsTable.userId, userId), eq(credentialsTable.service, service)))
    .limit(1);

  if (credentialRow === undefined) {
    return undefined;
  }

  if (
    credentialRow.authType !== "api_key" &&
    credentialRow.authType !== "bearer" &&
    credentialRow.authType !== "oauth2"
  ) {
    return undefined;
  }

  const secretSchema = credentialSecretByAuthTypeSchema[credentialRow.authType];
  const decryptedSecret = secretSchema.parse(
    decryptPayload({
      encrypted: toBase64(credentialRow.encrypted),
      iv: toBase64(credentialRow.iv),
      authTag: toBase64(credentialRow.authTag),
    }),
  );

  return {
    authType: credentialRow.authType,
    secret: decryptedSecret,
    metadata: credentialRow.metadata,
    expiresAt: toIsoStringIfPresent(credentialRow.expiresAt ?? undefined),
  };
};

const addAuthorizationHeader = (
  requestHeaders: Headers,
  tokenType: string,
  tokenValue: string,
): Headers => {
  requestHeaders.set("Authorization", `${tokenType} ${tokenValue}`);
  return requestHeaders;
};

type ResolveCredentialHeaderInput = {
  userId: string;
  service: string;
};

export const resolveCredentialHeaders = async (
  input: ResolveCredentialHeaderInput,
): Promise<Headers | undefined> => {
  const credential = await getDecryptedCredential(input.userId, input.service);

  if (credential === undefined) {
    return undefined;
  }

  const requestHeaders = new Headers();

  switch (credential.authType) {
    case "api_key": {
      const parsedSecret = apiKeySecretSchema.parse(credential.secret);
      requestHeaders.set(
        parsedSecret.headerName,
        `${parsedSecret.headerPrefix}${parsedSecret.apiKey}`.trim(),
      );
      return requestHeaders;
    }
    case "bearer": {
      const parsedSecret = bearerSecretSchema.parse(credential.secret);
      return addAuthorizationHeader(requestHeaders, "Bearer", parsedSecret.accessToken);
    }
    case "oauth2": {
      const parsedSecret = oauthSecretSchema.parse(credential.secret);
      const tokenType = parsedSecret.tokenType;
      return addAuthorizationHeader(requestHeaders, tokenType, parsedSecret.accessToken);
    }
    default: {
      return undefined;
    }
  }
};
