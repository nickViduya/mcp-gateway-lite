import { config } from "../config.js";

export const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = config.requestTimeoutMs,
): Promise<Response> => {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: abortController.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const buildJsonRequestInit = (init: RequestInit = {}): RequestInit => {
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("Content-Type", "application/json");
  requestHeaders.set("Accept", "application/json");

  return {
    ...init,
    headers: requestHeaders,
  };
};
