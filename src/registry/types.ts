export type RegistrySource = "official" | "pulsemcp" | "smithery";
export type ServerTransport = "stdio" | "streamable-http" | "sse";
export type ServerAuthType = "none" | "api_key" | "bearer" | "oauth2";
export type ServerExecutionCapability = "remote-direct" | "runner-required";

export type RegistryServer = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  source: RegistrySource;
  sourceUrl?: string;
  remoteUrl?: string;
  transport: ServerTransport;
  version?: string;
  authType: ServerAuthType;
  authConfig: Record<string, unknown>;
  packageName?: string;
  packageRegistry?: string;
  execCapability: ServerExecutionCapability;
  isVerified: boolean;
  isActive: boolean;
  metadata: Record<string, unknown>;
  embedding?: number[];
};

export type RegistryTool = {
  id?: string;
  serverSlug: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  embedding?: number[];
};

export type SearchResult = {
  server: {
    slug: string;
    name: string;
    description: string;
    source: RegistrySource;
    transport: ServerTransport;
    authType: ServerAuthType;
    execCapability: ServerExecutionCapability;
    remoteUrl?: string;
    packageName?: string;
    packageRegistry?: string;
  };
  tool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
  score: number;
};

export type ExecuteResult =
  | {
      success: true;
      result: unknown;
    }
  | {
      success: false;
      error: "authentication_required";
      authUrl?: string;
      message: string;
    }
  | {
      success: false;
      error: "runner_required";
      message: string;
    }
  | {
      success: false;
      error: "execution_failed";
      message: string;
    };
