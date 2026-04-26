# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install: `npm install`
- Build TS packages + CLI + MCP server (skips Next build): `npm run build:packages`
- Build everything (packages + web): `npm run build`
- Run the local dashboard at `http://localhost:4399`: `npm run dev`
- Typecheck the workspace via project references: `npm run typecheck` (builds `tsconfig.json` references; the web app is *not* listed, so this passes even when Next would fail — see Caveats)
- Lint: `npm run lint` (root config is minimal; the web app uses its own `eslint.config.mjs` via `npm run lint -w apps/web`)
- Run the CLI after `build:packages`: `npm run cli -- <command>` (e.g. `init`, `stats`, `doctor`, `search "..."`, `rescue`, `index --limit 100`, `import ./bookmarks.html`, `export out.json`, `mcp`)
- Start MCP server directly: `node apps/mcp-server/dist/index.js`
- There is **no test runner configured** — no `npm test`, no test files. Don't claim tests pass; verify by running CLI commands or hitting API routes.

Per-workspace builds use `tsc` (or `next build` for `apps/web`); workspaces are wired via npm `workspaces`. Build order matters: `shared → db → ai → core → indexer → cli → mcp-server → web`. `npm run build:packages` enforces this order — if you build a single workspace, build its deps first.

For experiments that should not touch the user's real bookmark library at `~/.siftmarks/`, set `SIFTMARKS_HOME=/tmp/siftmarks-test` (read by `getDataDir()` in `packages/db/src/database.ts`).

## Architecture

SiftMarks is a **local-first TypeScript monorepo** that turns browser bookmarks into a searchable, AI-augmented memory library. Everything runs on the user's machine; no account, no telemetry. The app data lives in a single SQLite file at `~/.siftmarks/siftmarks.sqlite` (overridable via `SIFTMARKS_HOME`).

### The four entry points share one database

All four apps open the same SQLite file via `new SiftMarksDB()` and call `.initialize()` on startup. `database.ts` is the single source of truth for SQL — neither the web routes nor the MCP tools issue raw SQL. Schema (`packages/db/src/schema.ts`) is idempotent (`CREATE TABLE IF NOT EXISTS`), so any entry point can boot a fresh DB.

- **`apps/web`** — Next.js 16 dashboard *and* HTTP API on port 4399. It is the only entry point with a UI and is also the API server the Chrome extension talks to (`http://localhost:4399/api/extension/*`). The DB is held in a module-level singleton in `apps/web/src/lib/db.ts` (`getDB()`).
- **`apps/cli`** — `siftmarks` (Commander). Each command opens and closes the DB itself.
- **`apps/mcp-server`** — stdio MCP server exposing 9 tools (`search_bookmarks`, `read_bookmark`, `list_tags`, `list_folders`, `find_related_bookmarks`, `summarize_collection`, `save_bookmark`, `run_bookmark_rescue`, `get_bookmark_stats`). It does NOT proxy through the web app — it opens the SQLite file directly.
- **`apps/chrome-extension`** — MV3 service worker + popup. It uses `chrome.bookmarks.*` to read the live browser tree and POSTs to the local web app. It does **not** access SQLite. It also performs its own client-side cleanup (`cleanupBookmarkBar`, `classifyBookmark`) on sync-back, with hardcoded Chinese category labels — keep that in mind before refactoring `background.js`.

### Package layering (lower depends on higher)

```
shared    types + URL/tag normalization + DEFAULT_SETTINGS
  ↑
db        better-sqlite3 schema + SiftMarksDB class (sync API; WAL mode)
  ↑
ai        AIProvider interface + Mock / OpenAICompatible / OllamaCompatible
  ↑
core      importer, parser, duplicates, fetcher, rescue, search, export, chrome-detect
  ↑
indexer   indexBookmarks (summary+tags+embedding+FTS), rebuildFTSIndex
```

`@siftmarks/ai` deliberately only depends on `shared` so `core` can call rescue-AI without a circular import.

### Data flow: bookmark import → cleanup PR → sync-back

This is the central workflow. Understanding it is what makes most edits safe.

1. **Import** — Either Chrome extension (`background.js → flattenBookmarks`) or HTML file (`parseBookmarkHTML`). Both produce `ParsedBookmark[]` and call `importBookmarks()` which inserts into `bookmarks` (with `chromeId`/`chromeParentId` preserved when from extension), populates `folders`, and sets `source: 'extension' | 'import'`.
2. **Index** — `indexer.indexBookmarks()` walks bookmarks missing summaries, calls the AI provider for `summarizeBookmark` / `generateTags` / `generateEmbedding`, and updates the FTS5 virtual table `bookmarks_fts` via `db.indexBookmarkFTS()`. With the mock provider it only refreshes FTS.
3. **Rescue** — `generateCleanupSuggestions()` clears pending suggestions and rebuilds rule-based ones (duplicates, vague titles via `isVagueTitle`, broken links). `generateAICleanupSuggestions()` adds AI suggestions on top via `@siftmarks/ai`'s `generateAIRescueSuggestions`. Each suggestion has `before_json`/`after_json` and a `type` from `CleanupType`.
4. **Review** — User accepts/dismisses suggestions in the web `/rescue` page → `applySuggestion()` mutates the bookmark row. The status it sets matters:
   - If `type ∈ {rename, move, merge_duplicate, delete_broken}` AND the bookmark has a `chromeId`, status becomes `accepted` (queued for Chrome).
   - Otherwise status becomes `synced` immediately (local-only).
5. **Sync-back** — Web `GET /api/extension/sync-back` calls `getChromeSyncPlan()`, which converts accepted suggestions into `ChromeOp[]` (`update`/`remove`/`move`), deduped by `${action}:${chromeId}`. The extension applies them via `chrome.bookmarks.*`, then POSTs the applied IDs back to be marked `synced`. The set `CHROME_SYNC_TYPES` in `core/rescue.ts` and the switch in `chrome-sync.ts` must stay in sync — adding a new sync-eligible cleanup type means editing both.

### Search

Two-tier:

- `keywordSearch` — FTS5 query on `bookmarks_fts` (the SQL escapes special chars and ORs the terms), then re-scores using title match, tag match, FTS rank, and recency (weights `0.55 / 0.20 / 0.15 / 0.10`).
- `hybridSearch` — same as keyword but additionally cosine-similar against any stored embeddings (pulled in full from the `embeddings` table — there is no vector index, so this scales linearly with library size).

The web `/api/search` route picks between them based on whether an embedding is available for the query.

### AI providers

`createProvider(config)` returns one of three implementations all behind the `AIProvider` interface in `packages/ai/src/provider.ts`. **Mock is the default** (`DEFAULT_SETTINGS.aiProvider = { type: 'mock' }`). Mock makes no network calls and returns placeholder strings — code paths must remain functional under mock. Provider config is stored as JSON in `app_settings.aiProvider` and read on boot in each entry point. Never call provider methods at module load — always go through `getAIProvider()` / equivalent so the user's saved settings apply.

### Privacy invariants (do not violate)

- No external network calls unless the user explicitly configured an OpenAI- or Ollama-compatible provider (mock is default).
- No telemetry. No API keys in logs.
- Bookmark and content data never leaves the local SQLite file unless an indexing/rescue call sends snippets to the configured AI provider.
- The Chrome extension only reaches `http://localhost:4399` (see `host_permissions` in `manifest.json`).

## Caveats

- **`apps/web` has its own agent rules at `apps/web/AGENTS.md` (and `CLAUDE.md` aliases it).** That file declares this is *not* stock Next.js — Next 16 + React 19 with breaking changes from training-data-era APIs. Read `node_modules/next/dist/docs/` before writing Next code in `apps/web/`. Heed deprecation notices.
- The root `npm run typecheck` does **not** include `apps/web` in its `tsconfig.json` references. A green typecheck does not prove the Next app builds. Use `npm run build` (or `npm run build -w apps/web`) when changes touch the web app.
- `better-sqlite3` is a native module and is listed under `serverExternalPackages` in `apps/web/next.config.ts`. Don't import it into Client Components or edge routes.
- The CLI `mcp` subcommand spawns `apps/mcp-server/dist/index.js` — `npm run build:packages` must have run first.
- Adding a new `CleanupType` requires touching: `shared/types.ts` (the union), `core/rescue.ts` (`applySuggestion` switch and `CHROME_SYNC_TYPES` if browser-syncable), and `apps/web/src/lib/chrome-sync.ts` (`getChromeSyncPlan` switch).
- Adding a new MCP tool: register in `apps/mcp-server/src/index.ts`. The server reads `aiProvider` settings *once at startup* — restarts are required after settings changes.
- The web app is bilingual (zh default, en) via `apps/web/src/lib/i18n/`. UI strings live in `zh.ts` / `en.ts`; both must be updated in lockstep.
- `examples/bookmarks.html` is a real sample importable file — useful for `npm run cli -- import ./examples/bookmarks.html` against a `SIFTMARKS_HOME=/tmp/...` test DB.

## Working Rules (from AGENTS.md)

- Don't run git actions unless explicitly asked.
- Keep changes scoped; prefer existing package boundaries over cross-package shortcuts.
- Treat the user's `~/.siftmarks/` and Chrome profile as user data — use `SIFTMARKS_HOME=/tmp/...` for tests.
- Preserve local-first behavior: no silent external network calls.
