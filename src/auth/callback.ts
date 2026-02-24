import { Hono } from "hono";
import { z } from "zod";
import { logger } from "../common/logger.js";

import { upsertCredential } from "./credentials.js";
import { exchangeAuthorizationCode } from "./oauth.js";

const callbackQuerySchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const oauthCallbackRouter = new Hono();

oauthCallbackRouter.get("/oauth/callback", async (context) => {
  const queryParse = callbackQuerySchema.safeParse(context.req.query());
  if (!queryParse.success) {
    return context.json(
      {
        success: false,
        error: "invalid_callback_request",
        issues: queryParse.error.issues,
      },
      400,
    );
  }

  if (queryParse.data.error !== undefined) {
    logger.warn(
      {
        error: queryParse.data.error,
        description: queryParse.data.error_description,
      },
      "OAuth provider returned an error callback",
    );

    return context.json(
      {
        success: false,
        error: queryParse.data.error,
        message: queryParse.data.error_description ?? "OAuth provider rejected authorization",
      },
      400,
    );
  }

  try {
    const exchangedToken = await exchangeAuthorizationCode({
      state: queryParse.data.state,
      authorizationCode: queryParse.data.code,
    });

    await upsertCredential({
      userId: exchangedToken.userId,
      service: exchangedToken.service,
      authType: "oauth2",
      secret: {
        accessToken: exchangedToken.accessToken,
        refreshToken: exchangedToken.refreshToken,
        tokenType: exchangedToken.tokenType,
        expiresAt: exchangedToken.expiresAt?.toISOString(),
      },
      metadata: {
        source: "oauth_callback",
      },
      expiresAt: exchangedToken.expiresAt,
    });

    return context.json({
      success: true,
      message: "OAuth authorization succeeded. You can return to your MCP client.",
    });
  } catch (error: unknown) {
    logger.error({ error }, "OAuth callback processing failed");
    return context.json(
      {
        success: false,
        error: "oauth_callback_failed",
        message: "Failed to finalize OAuth flow",
      },
      500,
    );
  }
});
