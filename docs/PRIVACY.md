# SiftMarks Privacy Model

SiftMarks is designed as a local-first bookmark tool. This document explains the practical data flow so users can decide how to run it.

## Default Local Behavior

- No account is required.
- The local app runs on `localhost:4399`.
- Bookmark data is stored in SQLite at `~/.siftmarks/siftmarks.sqlite` by default.
- The Chrome extension talks to the local app only.
- Mock AI mode is the default.
- The app does not send telemetry.

## What Gets Stored Locally

SiftMarks stores imported bookmark metadata such as URL, title, folder path, created/imported timestamps, duplicate state, status, tags, summaries, embeddings, and cleanup suggestions.

If you import from the Chrome extension, SiftMarks also stores Chrome bookmark IDs so accepted suggestions can be mapped back to the original browser bookmarks during sync-back.

## AI Providers

External AI calls are disabled until you configure a provider in Settings.

When configured, OpenAI-compatible or Ollama-compatible providers may receive the bookmark fields needed for the action you trigger:

- indexing can send titles, URLs, descriptions, summaries, and content snippets for summaries, tags, and embeddings
- AI rescue can send active bookmarks for cleanup suggestions
- taxonomy generation can send compact bookmark rows for category design and classification
- memory search can send the query text for embedding generation

Mock mode does not send bookmarks to an external model.

## Chrome Sync-Back

SiftMarks does not directly change Chrome bookmarks from the web dashboard. Sync-back is performed by the Chrome extension after you accept cleanup suggestions and confirm the extension action.

Sync-back can rename, move, or remove Chrome bookmarks according to accepted suggestions. It may also clean up duplicate URLs and empty folders after move/remove operations.

If Chrome Sync is enabled, Chrome may sync those browser-side changes to your Google account. That sync is controlled by Chrome, not by SiftMarks.

## Recommended Testing Practice

Use a temporary SiftMarks home when testing imports or cleanup logic:

```bash
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- init
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- import examples/bookmarks.html
```

This keeps experiments away from your real `~/.siftmarks` database.
