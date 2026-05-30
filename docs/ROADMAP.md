# SiftMarks Roadmap

SiftMarks is currently focused on becoming the best local-first repair and search layer for browser bookmarks.

## Now

- Local Next.js dashboard and API.
- Chrome extension import from the browser bookmark tree.
- Chrome sync-back for accepted cleanup suggestions.
- SQLite storage under `~/.siftmarks` by default.
- Keyword search with SQLite FTS.
- Memory-mode search that uses embeddings when available.
- Rule-based duplicate, vague-title, and broken-link cleanup suggestions.
- Optional AI summaries, tags, embeddings, title suggestions, rescue suggestions, and taxonomy moves.
- MCP server for AI clients.
- CLI for init, import, stats, doctor, search, rescue, export, index, and MCP startup.

## Next

- Make semantic search easier to set up and easier to understand in the UI.
- Add stronger tests around import, duplicate detection, rescue suggestions, and sync plans.
- Improve folder policy controls so users can define the shape of a cleaned bookmark bar.
- Add richer dry-run and diff views before Chrome sync-back.
- Document Chrome extension setup for common Chromium-based browsers.
- Improve MCP result formatting for agent workflows.

## Later

- Firefox import and possible sync-back support.
- Optional local full-page archives for selected bookmarks.
- Better broken-link checking controls and retry policies.
- Portable export/import bundles for moving a SiftMarks library between machines.
- More local-model guidance for Ollama users.

## Non-Goals For Now

- SiftMarks is not a hosted bookmark sync service.
- SiftMarks is not a replacement browser UI.
- SiftMarks does not silently reorganize bookmarks in the background.
- SiftMarks does not require an AI provider for the core local workflow.
