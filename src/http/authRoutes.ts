import { Hono } from "hono";
import { z } from "zod";
import { upsertCredential } from "../auth/credentials.js";
import { getGatewayPrincipal } from "../auth/gateway.js";
import { buildRedirectUri, startOauthAuthorization } from "../auth/oauth.js";

const storeCredentialRequestSchema = z.object({
  service: z.string().min(1),
  authType: z.union([z.literal("api_key"), z.literal("bearer")]),
  secret: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const startOauthRequestSchema = z.object({
  service: z.string().min(1),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  clientId: z.string().min(1),
  resource: z.string().url(),
  scope: z.string().optional(),
  redirectPath: z.string().default("/oauth/callback"),
});

export const authRouter = new Hono();

authRouter.post("/auth/credentials", async (context) => {
  const principal = getGatewayPrincipal(context);
  const body = storeCredentialRequestSchema.parse(await context.req.json());

  await upsertCredential({
    userId: principal.userId,
    service: body.service,
    authType: body.authType,
    secret: body.secret,
    metadata: body.metadata,
    expiresAt: body.expiresAt !== undefined ? new Date(body.expiresAt) : undefined,
  });

  return context.json({
    success: true,
  });
});

authRouter.post("/auth/oauth/start", async (context) => {
  const principal = getGatewayPrincipal(context);
  const body = startOauthRequestSchema.parse(await context.req.json());
  const redirectUri = buildRedirectUri(body.redirectPath);

  const authorizationUrl = startOauthAuthorization({
    authorizationEndpoint: body.authorizationEndpoint,
    tokenEndpoint: body.tokenEndpoint,
    clientId: body.clientId,
    redirectUri,
    resource: body.resource,
    userId: principal.userId,
    service: body.service,
    scope: body.scope,
  });

  return context.json({
    success: true,
    authUrl: authorizationUrl,
  });
});
