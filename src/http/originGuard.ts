import type { Context, Next } from "hono";

import { config } from "../config.js";

const isOriginAllowed = (originHeader: string): boolean => {
  if (config.requiredOrigins.length === 0) {
    return true;
  }

  return config.requiredOrigins.includes(originHeader);
};

export const originGuardMiddleware = async (
  context: Context,
  next: Next,
): Promise<undefined | Response> => {
  const originHeader = context.req.header("origin");

  if (originHeader === undefined) {
    if (config.requiredOrigins.length > 0) {
      return context.json(
        {
          error: "invalid_origin",
          message: "Origin header is required",
        },
        403,
      );
    }

    await next();
    return;
  }

  if (!isOriginAllowed(originHeader)) {
    return context.json(
      {
        error: "invalid_origin",
        message: "Origin is not allowed",
      },
      403,
    );
  }

  await next();
};
