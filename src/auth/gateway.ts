import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { z } from "zod";

import { config } from "../config.js";

const bearerClaimsSchema = z.object({
  sub: z.string().min(1),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  exp: z.number().int().optional(),
  iat: z.number().int().optional(),
});

export type GatewayPrincipal = {
  userId: string;
  authMethod: "api_key" | "bearer";
  claims?: Record<string, unknown>;
};

const decodeBase64Url = (value: string): Buffer => {
  const normalizedValue = value.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = normalizedValue.length % 4 === 0 ? 0 : 4 - (normalizedValue.length % 4);
  const paddedValue = `${normalizedValue}${"=".repeat(paddingLength)}`;
  return Buffer.from(paddedValue, "base64");
};

const verifyJwtHs256Signature = (token: string, jwtSecret: string): Record<string, unknown> => {
  const tokenParts = token.split(".");

  if (tokenParts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerPart, payloadPart, signaturePart] = tokenParts;
  if (headerPart === undefined || payloadPart === undefined || signaturePart === undefined) {
    throw new Error("Invalid token format");
  }

  const header = z
    .object({
      alg: z.literal("HS256"),
      typ: z.string().optional(),
    })
    .parse(JSON.parse(decodeBase64Url(headerPart).toString("utf8")));

  if (header.alg !== "HS256") {
    throw new Error("Unsupported JWT algorithm");
  }

  const signedPayload = `${headerPart}.${payloadPart}`;
  const expectedSignature = createHmac("sha256", jwtSecret).update(signedPayload).digest();
  const providedSignature = decodeBase64Url(signaturePart);

  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8"));
  const claims = bearerClaimsSchema.parse(payload);
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (claims.exp !== undefined && claims.exp <= nowInSeconds) {
    throw new Error("Bearer token has expired");
  }

  return claims;
};

const setPrincipalOnContext = (context: Context, principal: GatewayPrincipal): void => {
  context.set("principal", principal);
};

const unauthorizedResponse = (context: Context): Response => {
  return context.json(
    {
      error: "unauthorized",
      message: "Missing or invalid gateway credentials",
    },
    401,
  );
};

const tryApiKeyAuthentication = (context: Context): boolean => {
  if (config.gatewayApiKey === undefined) {
    return false;
  }

  const providedApiKey = context.req.header("x-api-key");
  if (providedApiKey === undefined) {
    return false;
  }

  const expectedApiKey = Buffer.from(config.gatewayApiKey, "utf8");
  const actualApiKey = Buffer.from(providedApiKey, "utf8");
  if (
    expectedApiKey.length !== actualApiKey.length ||
    !timingSafeEqual(expectedApiKey, actualApiKey)
  ) {
    return false;
  }

  const userIdFromHeader = context.req.header("x-user-id");
  const userId = userIdFromHeader ?? "gateway-api-key-user";
  setPrincipalOnContext(context, {
    userId,
    authMethod: "api_key",
  });
  return true;
};

const tryBearerAuthentication = (context: Context): boolean => {
  if (config.bearerJwtSecret === undefined) {
    return false;
  }

  const authorizationHeader = context.req.header("authorization");
  if (authorizationHeader === undefined || !authorizationHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (token.length === 0) {
    return false;
  }

  try {
    const claims = verifyJwtHs256Signature(token, config.bearerJwtSecret);
    const parsedClaims = bearerClaimsSchema.parse(claims);

    setPrincipalOnContext(context, {
      userId: parsedClaims.sub,
      authMethod: "bearer",
      claims,
    });
    return true;
  } catch {
    return false;
  }
};

export const gatewayAuthMiddleware = async (
  context: Context,
  next: Next,
): Promise<undefined | Response> => {
  if (tryApiKeyAuthentication(context) || tryBearerAuthentication(context)) {
    await next();
    return;
  }

  return unauthorizedResponse(context);
};

export const getGatewayPrincipal = (context: Context): GatewayPrincipal => {
  const principal = context.get("principal");
  return z
    .object({
      userId: z.string().min(1),
      authMethod: z.union([z.literal("api_key"), z.literal("bearer")]),
      claims: z.record(z.string(), z.unknown()).optional(),
    })
    .parse(principal);
};
