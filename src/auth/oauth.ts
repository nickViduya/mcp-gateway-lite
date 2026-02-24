import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { fetchWithTimeout } from "../common/http.js";
import { config } from "../config.js";

const oauthServerMetadataSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  issuer: z.string().url().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

const oauthAuthorizationRequestStateSchema = z.object({
  state: z.string().min(32),
  codeVerifier: z.string().min(43),
  createdAt: z.number().int().positive(),
  clientId: z.string().min(1),
  userId: z.string().min(1),
  service: z.string().min(1),
  resource: z.string().url(),
  tokenEndpoint: z.string().url(),
  redirectUri: z.string().url(),
});

const oauthStateStore = new Map<string, z.infer<typeof oauthAuthorizationRequestStateSchema>>();

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const encodeBase64Url = (value: Buffer): string => {
  return value.toString("base64url");
};

const generateRandomUrlSafeString = (byteLength: number): string => {
  return encodeBase64Url(randomBytes(byteLength));
};

const isPrivateIpv4 = (address: string): boolean => {
  const octets = address.split(".");
  if (octets.length !== 4) {
    return false;
  }

  const [first, second] = octets.map((part) => Number(part));

  if (Number.isNaN(first) || Number.isNaN(second)) {
    return false;
  }

  if (first === 10 || first === 127 || first === 0) {
    return true;
  }

  if (first === 172 && second !== undefined && second >= 16 && second <= 31) {
    return true;
  }

  if (first === 192 && second === 168) {
    return true;
  }

  if (first === 169 && second === 254) {
    return true;
  }

  return false;
};

const isPrivateIpv6 = (address: string): boolean => {
  const normalizedAddress = address.toLowerCase();
  return (
    normalizedAddress === "::1" ||
    normalizedAddress.startsWith("fc") ||
    normalizedAddress.startsWith("fd") ||
    normalizedAddress.startsWith("fe80:")
  );
};

const assertPublicHttpsUrl = async (urlToValidate: string): Promise<void> => {
  const parsedUrl = new URL(urlToValidate);

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`Only HTTPS URLs are allowed: ${urlToValidate}`);
  }

  if (parsedUrl.hostname === "localhost") {
    throw new Error(`Localhost URLs are not allowed: ${urlToValidate}`);
  }

  const hostnameIsIpAddress = isIP(parsedUrl.hostname);
  if (hostnameIsIpAddress === 4 && isPrivateIpv4(parsedUrl.hostname)) {
    throw new Error(`Private IPv4 addresses are not allowed: ${urlToValidate}`);
  }
  if (hostnameIsIpAddress === 6 && isPrivateIpv6(parsedUrl.hostname)) {
    throw new Error(`Private IPv6 addresses are not allowed: ${urlToValidate}`);
  }

  const dnsRecord = await lookup(parsedUrl.hostname, { all: false });
  if (dnsRecord.family === 4 && isPrivateIpv4(dnsRecord.address)) {
    throw new Error(`Resolved private IPv4 target is not allowed: ${urlToValidate}`);
  }
  if (dnsRecord.family === 6 && isPrivateIpv6(dnsRecord.address)) {
    throw new Error(`Resolved private IPv6 target is not allowed: ${urlToValidate}`);
  }
};

const assertAllowedRedirectUri = (redirectUri: string): void => {
  const parsedRedirectUrl = new URL(redirectUri);

  if (parsedRedirectUrl.protocol !== "https:") {
    throw new Error("OAuth redirect URI must use HTTPS");
  }

  if (
    config.allowedOauthRedirectHosts.length > 0 &&
    !config.allowedOauthRedirectHosts.includes(parsedRedirectUrl.hostname)
  ) {
    throw new Error(`OAuth redirect host ${parsedRedirectUrl.hostname} is not allowed`);
  }
};

export const discoverOauthServerMetadata = async (
  metadataUrl: string,
): Promise<z.infer<typeof oauthServerMetadataSchema>> => {
  await assertPublicHttpsUrl(metadataUrl);

  const response = await fetchWithTimeout(metadataUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch OAuth metadata: HTTP ${response.status}`);
  }

  const responseBody = await response.json();
  const metadata = oauthServerMetadataSchema.parse(responseBody);

  await assertPublicHttpsUrl(metadata.authorization_endpoint);
  await assertPublicHttpsUrl(metadata.token_endpoint);

  return metadata;
};

const createPkceVerifier = (): string => {
  return generateRandomUrlSafeString(64);
};

const createPkceChallenge = (verifier: string): string => {
  const digest = createHash("sha256").update(verifier).digest();
  return encodeBase64Url(digest);
};

type StartOauthAuthorizationInput = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  userId: string;
  service: string;
  scope?: string;
};

export const startOauthAuthorization = (input: StartOauthAuthorizationInput): string => {
  const state = generateRandomUrlSafeString(32);
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);
  const authorizationUrl = new URL(input.authorizationEndpoint);

  assertAllowedRedirectUri(input.redirectUri);

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", input.clientId);
  authorizationUrl.searchParams.set("redirect_uri", input.redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("resource", input.resource);
  if (input.scope !== undefined) {
    authorizationUrl.searchParams.set("scope", input.scope);
  }

  oauthStateStore.set(
    state,
    oauthAuthorizationRequestStateSchema.parse({
      state,
      codeVerifier,
      createdAt: Date.now(),
      clientId: input.clientId,
      userId: input.userId,
      service: input.service,
      resource: input.resource,
      tokenEndpoint: input.tokenEndpoint,
      redirectUri: input.redirectUri,
    }),
  );

  return authorizationUrl.toString();
};

const consumeOauthState = (
  state: string,
): z.infer<typeof oauthAuthorizationRequestStateSchema> | undefined => {
  const storedState = oauthStateStore.get(state);
  if (storedState === undefined) {
    return undefined;
  }

  oauthStateStore.delete(state);

  if (Date.now() - storedState.createdAt > OAUTH_STATE_TTL_MS) {
    return undefined;
  }

  return storedState;
};

type AuthorizationCodeExchangeInput = {
  state: string;
  authorizationCode: string;
};

type ExchangedToken = {
  userId: string;
  service: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: Date;
};

export const exchangeAuthorizationCode = async (
  input: AuthorizationCodeExchangeInput,
): Promise<ExchangedToken> => {
  const storedState = consumeOauthState(input.state);
  if (storedState === undefined) {
    throw new Error("Invalid or expired OAuth state");
  }

  const tokenResponse = await fetchWithTimeout(storedState.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.authorizationCode,
      client_id: storedState.clientId,
      code_verifier: storedState.codeVerifier,
      redirect_uri: storedState.redirectUri,
      resource: storedState.resource,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`OAuth token exchange failed with status ${tokenResponse.status}`);
  }

  const parsedToken = tokenResponseSchema.parse(await tokenResponse.json());
  const expiresAt =
    parsedToken.expires_in !== undefined
      ? new Date(Date.now() + parsedToken.expires_in * 1000)
      : undefined;

  return {
    userId: storedState.userId,
    service: storedState.service,
    accessToken: parsedToken.access_token,
    refreshToken: parsedToken.refresh_token,
    tokenType: parsedToken.token_type,
    expiresAt,
  };
};

type RefreshOauthTokenInput = {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
  resource: string;
};

export const refreshOauthToken = async (
  input: RefreshOauthTokenInput,
): Promise<{
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  expiresAt?: Date;
}> => {
  await assertPublicHttpsUrl(input.tokenEndpoint);

  const tokenResponse = await fetchWithTimeout(input.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      resource: input.resource,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`OAuth refresh failed with status ${tokenResponse.status}`);
  }

  const parsedToken = tokenResponseSchema.parse(await tokenResponse.json());
  const expiresAt =
    parsedToken.expires_in !== undefined
      ? new Date(Date.now() + parsedToken.expires_in * 1000)
      : undefined;

  return {
    accessToken: parsedToken.access_token,
    tokenType: parsedToken.token_type,
    refreshToken: parsedToken.refresh_token,
    expiresAt,
  };
};

export const buildRedirectUri = (callbackPath: string): string => {
  if (config.oauthRedirectBaseUrl === undefined) {
    throw new Error("OAUTH_REDIRECT_BASE_URL must be configured for OAuth flows");
  }

  const redirectUrl = new URL(callbackPath, config.oauthRedirectBaseUrl);
  const finalRedirectUri = redirectUrl.toString();
  assertAllowedRedirectUri(finalRedirectUri);
  return finalRedirectUri;
};
