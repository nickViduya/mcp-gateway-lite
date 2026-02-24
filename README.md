# MCP Gateway Lite

Lightweight open-source MCP gateway that aggregates public MCP server metadata and exposes two MCP tools:

- `search` to discover servers/tools across registries
- `execute` to run tools on remote-capable upstream servers

The gateway keeps the agent tool surface small while preserving broad MCP ecosystem coverage.

## Features

- Streamable HTTP MCP endpoint (`/mcp`)
- Gateway auth (API key or Bearer token)
- Encrypted credential vault (AES-256-GCM + HKDF)
- OAuth 2.1 + PKCE callback flow
- Multi-source registry sync:
  - Official MCP Registry
  - PulseMCP
  - Smithery
- Semantic search with PostgreSQL + pgvector (HNSW)
- Docker, Railway template, and GitHub Actions CI

## Architecture

- Runtime: Node.js 22+
- Framework: Hono
- MCP SDK: `@modelcontextprotocol/sdk`
- DB: PostgreSQL + `pgvector`
- ORM: Drizzle

Core flow:

1. Sync jobs ingest registry metadata into local Postgres
2. Embeddings are generated and indexed for semantic retrieval
3. Agent calls `search` to find tools
4. Agent calls `execute` to proxy tool calls to remote MCP servers

## Quick Start

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

Generate a 32-byte base64 master key:

```bash
openssl rand -base64 32
```

Put that value in `MASTER_ENCRYPTION_KEY`.

### 3) Start Postgres with pgvector

```bash
docker compose up -d postgres
```

### 4) Generate and run migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5) Optional seed data

```bash
pnpm db:seed
```

### 6) Run the gateway

```bash
pnpm dev
```

Health endpoint:

```text
GET /health
```

MCP endpoint:

```text
POST /mcp
```

## Environment Variables

See `.env.example` for full list. Main variables:

- `DATABASE_URL`: Postgres connection string
- `MASTER_ENCRYPTION_KEY`: Base64-encoded encryption root key
- `GATEWAY_API_KEY`: Optional API key for gateway auth
- `BEARER_JWT_SECRET`: Optional HS256 secret for Bearer auth
- `OPENAI_API_KEY`: Optional, used for production embeddings
- `SYNC_INTERVAL_CRON`: Registry sync schedule
- `ALLOWED_ORIGINS`: Comma-separated allowed origins for inbound requests

## Auth Endpoints

- `POST /auth/credentials` stores API key/Bearer credentials for upstream services
- `POST /auth/oauth/start` starts OAuth flow and returns `authUrl`
- `GET /oauth/callback` finalizes OAuth code exchange

## Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm sync:run`
- `pnpm rotate-keys`

## Deployment

### Docker

```bash
docker compose up -d
```

### Railway

- `railway.json` is included
- set environment variables from `.env.example`
- ensure Postgres has `pgvector` enabled
- use `/health` for service health checks

## Security

See `SECURITY.md` for vulnerability reporting and hardening notes.

## License

MIT
