import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { logger } from "../common/logger.js";
import { config } from "../config.js";

type PooledConnection = {
  client: Client;
  transport: StreamableHTTPClientTransport;
  lastUsedAt: number;
};

type ConnectionInput = {
  remoteUrl: string;
  requestHeaders?: Headers;
};

const connectionPool = new Map<string, PooledConnection>();
const CONNECTION_IDLE_TTL_MS = 2 * 60 * 1000;

const buildConnectionKey = (input: ConnectionInput): string => {
  const headerEntries = Array.from(input.requestHeaders?.entries() ?? [])
    .sort(([aName], [bName]) => aName.localeCompare(bName))
    .map(([name, value]) => `${name}:${value}`)
    .join("|");
  return `${input.remoteUrl}|${headerEntries}`;
};

const removeStaleConnections = async (): Promise<void> => {
  const now = Date.now();

  for (const [connectionKey, pooledConnection] of connectionPool.entries()) {
    if (now - pooledConnection.lastUsedAt <= CONNECTION_IDLE_TTL_MS) {
      continue;
    }

    await pooledConnection.transport.close();
    connectionPool.delete(connectionKey);
  }
};

const buildRequestInitWithHeaders = (requestHeaders: Headers | undefined): RequestInit => {
  const headers = new Headers(requestHeaders);
  headers.set("MCP-Protocol-Version", config.protocolVersion);
  return {
    headers,
  };
};

const createConnection = async (input: ConnectionInput): Promise<PooledConnection> => {
  const client = new Client({
    name: "mcp-gateway-lite-proxy",
    version: "0.1.0",
  });

  const transport = new StreamableHTTPClientTransport(new URL(input.remoteUrl), {
    requestInit: buildRequestInitWithHeaders(input.requestHeaders),
  });

  await client.connect(transport);

  return {
    client,
    transport,
    lastUsedAt: Date.now(),
  };
};

export const getPooledConnection = async (input: ConnectionInput): Promise<PooledConnection> => {
  await removeStaleConnections();

  const connectionKey = buildConnectionKey(input);
  const existingConnection = connectionPool.get(connectionKey);

  if (existingConnection !== undefined) {
    existingConnection.lastUsedAt = Date.now();
    return existingConnection;
  }

  const newConnection = await createConnection(input);
  connectionPool.set(connectionKey, newConnection);
  logger.debug({ remoteUrl: input.remoteUrl }, "Created new pooled MCP connection");
  return newConnection;
};

export const closeAllPooledConnections = async (): Promise<void> => {
  for (const pooledConnection of connectionPool.values()) {
    await pooledConnection.transport.close();
  }

  connectionPool.clear();
};
