# Contributing

Thanks for contributing to MCP Gateway Lite.

## Development Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure local environment:

```bash
cp .env.example .env
```

3. Start Postgres:

```bash
docker compose up -d postgres
```

4. Run migrations:

```bash
pnpm db:migrate
```

## Quality Gates

Run before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Pull Requests

- Keep changes focused and small
- Include tests for behavior changes
- Update docs when behavior/config changes
- Fill in the PR template completely

## Coding Guidelines

- TypeScript strict mode only
- No `any` without strong justification
- Prefer clear, explicit naming
- Validate external inputs with Zod
- Never log secrets/tokens
