import pino from "pino";

import { config } from "../config.js";

const sensitiveLogKeys = [
  "headers.authorization",
  "headers.x-api-key",
  "apiKey",
  "access_token",
  "refresh_token",
  "token",
  "password",
  "client_secret",
];

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: sensitiveLogKeys,
    censor: "[REDACTED]",
  },
});
