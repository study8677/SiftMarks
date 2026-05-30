# Contributing To SiftMarks

Thanks for helping make bookmark libraries useful again.

SiftMarks is a local-first TypeScript monorepo. The main rule is simple: protect user bookmark data. Changes should preserve local-first defaults, avoid silent external network calls, and keep Chrome sync-back explicit.

## Setup

```bash
npm install
npm run build:packages
npm run dev
```

Open the dashboard at:

```text
http://localhost:4399
```

Use a temporary data home for smoke tests:

```bash
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- init
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- import examples/bookmarks.html
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- search "mcp"
```

## Project Boundaries

```text
apps/web              Local Next.js dashboard and API
apps/cli              Local command-line interface
apps/mcp-server       MCP stdio server
apps/chrome-extension Chrome import and sync-back extension
packages/shared       Shared types and utilities
packages/db           SQLite schema and data access
packages/core         Import, search, rescue, cleanup logic
packages/ai           Mock, OpenAI-compatible, and Ollama providers
packages/indexer      FTS, summaries, tags, embeddings
```

## Development Commands

```bash
npm run build:packages
npm run build
npm run typecheck
```

The root `build` command builds packages, CLI, MCP server, and the web app. The root `typecheck` command runs the TypeScript project build.

## Data Safety

- Do not read browser profile files directly when a Chrome API path exists.
- Do not mutate Chrome bookmarks without a visible confirmation path.
- Keep AI providers disabled by default.
- Keep mock mode useful for local testing.
- Do not log API keys, full bookmark exports, or user databases.
- Prefer `SIFTMARKS_HOME=/tmp/siftmarks-test` for local smoke tests.

## Good First Contributions

- Improve import compatibility for browser-exported bookmark HTML.
- Add focused tests around duplicate detection and cleanup suggestion generation.
- Improve MCP tool responses with better result explanations.
- Expand docs for extension setup on Chrome variants.
- Polish empty states and error messages in the local dashboard.

## Pull Request Checklist

- The change is scoped to one behavior or docs improvement.
- Local-first behavior is preserved.
- Chrome sync-back still requires explicit user action.
- New AI behavior has a mock-mode fallback or a clear disabled-by-default path.
- Docs are updated when commands, setup, or user-visible behavior changes.
