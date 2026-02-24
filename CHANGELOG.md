# Changelog

All notable changes to this project are documented in this file.

The format follows Keep a Changelog and semantic versioning.

## [0.1.0] - 2026-02-24

### Added

- Initial release scaffolding for MCP Gateway Lite
- Hono + MCP Streamable HTTP gateway with `search` and `execute` tools
- PostgreSQL + pgvector schema with HNSW indexes and Drizzle migrations
- Encrypted credential storage (AES-256-GCM + HKDF) and key rotation command
- Gateway auth middleware (API key and Bearer token)
- OAuth 2.1 PKCE flow (start + callback + refresh support)
- Registry sync sources for Official MCP Registry, PulseMCP, and Smithery
- Sync orchestration, deduplication, embeddings generation, and sync logging
- Security controls: origin validation, SSRF protections, auth endpoint rate limiting, log redaction
- Docker Compose, Dockerfile, Railway deployment template
- CI workflow, tests, and open-source policy docs
