import type { Context, Next } from "hono";

import { config } from "../config.js";

type RateLimitState = {
  windowStartMs: number;
  count: number;
};

const rateLimitStateByKey = new Map<string, RateLimitState>();

const resolveClientIpAddress = (context: Context): string => {
  const forwardedFor = context.req.header("x-forwarded-for");
  const firstForwardedAddress = forwardedFor?.split(",").at(0)?.trim();
  if (firstForwardedAddress !== undefined && firstForwardedAddress.length > 0) {
    return firstForwardedAddress;
  }

  const realIp = context.req.header("x-real-ip");
  if (realIp !== undefined && realIp.length > 0) {
    return realIp;
  }

  return "unknown";
};

const isRateLimited = (key: string): boolean => {
  const nowMs = Date.now();
  const current = rateLimitStateByKey.get(key);

  if (current === undefined || nowMs - current.windowStartMs > config.authRateLimitWindowMs) {
    rateLimitStateByKey.set(key, {
      windowStartMs: nowMs,
      count: 1,
    });
    return false;
  }

  if (current.count >= config.authRateLimitMaxRequests) {
    return true;
  }

  rateLimitStateByKey.set(key, {
    windowStartMs: current.windowStartMs,
    count: current.count + 1,
  });
  return false;
};

export const authRateLimitMiddleware = async (
  context: Context,
  next: Next,
): Promise<undefined | Response> => {
  const clientIpAddress = resolveClientIpAddress(context);
  const rateLimitKey = `${context.req.path}|${clientIpAddress}`;

  if (isRateLimited(rateLimitKey)) {
    return context.json(
      {
        error: "rate_limited",
        message: "Too many auth requests. Please retry later.",
      },
      429,
    );
  }

  await next();
};
