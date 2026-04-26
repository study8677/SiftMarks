# SiftMarks

English | [简体中文](./README.zh-CN.md)

**Turn your messy browser bookmarks into a local AI memory library.**

SiftMarks is a local-first bookmark manager for people who save too much and find too little. It imports your Chrome bookmarks, cleans up duplicate and scattered folders, makes the library searchable, and exposes your saved knowledge to AI tools through MCP.

The goal is simple: your bookmarks should feel like memory, not a junk drawer.

## What It Does

- **Import browser bookmarks** from Chrome through the local web app or Chrome extension.
- **Search by meaning or keywords** instead of remembering exact titles.
- **Rescue messy bookmark bars** by detecting duplicates, vague titles, broken links, and folder chaos.
- **Review cleanup suggestions first** before applying them back to Chrome.
- **Sync accepted cleanup back to Chrome** through the extension, including duplicate removal and empty-folder cleanup.
- **Generate tags and summaries** with mock, OpenAI-compatible, or Ollama-compatible AI providers.
- **Serve bookmarks to AI agents** through an MCP server for Claude, Cursor, Windsurf, and other clients.
- **Stay local by default** with SQLite storage and no account requirement.

## Why SiftMarks

Browser bookmarks are easy to save and hard to use. After a few months, the bookmark bar becomes a mix of imports, duplicates, vague titles, abandoned folders, and links you cannot search by memory.

SiftMarks treats bookmark cleanup like a code review:

1. Import the real browser state.
2. Generate cleanup suggestions.
3. Review and accept the changes you want.
4. Apply them back to Chrome with the extension.
5. Keep the cleaned library searchable for yourself and your AI tools.

## Quick Start

Requirements:

- Node.js 18+
- npm
- Google Chrome if you want browser import/sync

```bash
npm install
npm run build
npm run dev
```

Open the local dashboard:

[http://localhost:4399](http://localhost:4399)

SiftMarks stores its local database at:

```text
~/.siftmarks/siftmarks.sqlite
```

## Recommended Workflow

### 1. Start The Local App

```bash
npm run dev
```

Then open:

```text
http://localhost:4399
```

The dashboard includes:

- **Import** for bookmark HTML files and local browser detection.
- **Library** for browsing bookmarks by folder, tag, and status.
- **Search** for finding saved pages.
- **Rescue** for reviewing cleanup suggestions.
- **Settings** for AI provider configuration.
- **MCP** for AI-client setup examples.

### 2. Load The Chrome Extension

The extension talks to the local app at `http://localhost:4399`.

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select:

```text
apps/chrome-extension
```

After loading it, click the SiftMarks extension icon.

### 3. Import Chrome Bookmarks

In the extension, click:

```text
一键导入浏览器书签
```

This reads your current Chrome bookmarks and imports them into the local SiftMarks database.

### 4. Rescue The Library

Open the web dashboard:

```text
http://localhost:4399/rescue
```

Click **Generate** or run rescue from the extension. SiftMarks will create cleanup suggestions such as:

- move bookmarks into clearer folders
- rename vague titles
- detect duplicate URLs
- mark broken links
- add tags

Review the suggestions, accept the ones you want, then sync them back.

### 5. Sync Accepted Changes Back To Chrome

In the extension, click:

```text
同步回 Chrome
```

The extension applies accepted changes through the Chrome Bookmarks API. It can also:

- merge duplicate URLs
- remove empty folders
- consolidate scattered folders into readable top-level categories

Chrome will show a confirmation before modifying bookmarks. If Chrome Sync is enabled, those changes may sync to your Google account.

## CLI

Build first:

```bash
npm run build:packages
```

Then use the local CLI:

```bash
npm run cli -- init
npm run cli -- stats
npm run cli -- doctor
npm run cli -- search "mcp browser automation"
npm run cli -- rescue
npm run cli -- export ./siftmarks-export.json
```

Import a browser-exported bookmark HTML file:

```bash
npm run cli -- import ./bookmarks.html
```

Index bookmarks for summaries, tags, and embeddings:

```bash
npm run cli -- index --limit 100
```

By default, SiftMarks uses the mock AI provider, so indexing does not send data to an external AI service unless you configure one.

## MCP Server

SiftMarks can expose your bookmark library to AI clients through MCP.

Build the server:

```bash
npm run build:packages
```

Start it manually:

```bash
npm run cli -- mcp
```

Claude Desktop example:

```json
{
  "mcpServers": {
    "siftmarks": {
      "command": "node",
      "args": ["/absolute/path/to/SiftMarks/apps/mcp-server/dist/index.js"]
    }
  }
}
```

Available MCP tools include:

| Tool | Purpose |
| --- | --- |
| `search_bookmarks` | Search saved bookmarks |
| `read_bookmark` | Read one bookmark in detail |
| `list_tags` | List tags and counts |
| `list_folders` | List folders and counts |
| `find_related_bookmarks` | Find related saved pages |
| `summarize_collection` | Summarize by tag or folder |
| `save_bookmark` | Save a new bookmark |
| `run_bookmark_rescue` | Generate cleanup suggestions |
| `get_bookmark_stats` | Get library statistics |

## AI Providers

SiftMarks supports three AI modes:

| Mode | Use Case |
| --- | --- |
| **Mock** | Default. No external AI calls. Good for local testing. |
| **OpenAI Compatible** | OpenAI, Azure OpenAI, Groq, Together, or compatible endpoints. |
| **Ollama Compatible** | Local models running through Ollama. |

Configure providers in the web **Settings** page.

No external AI calls are made unless you explicitly configure a provider.

## Privacy Model

SiftMarks is designed to be local-first:

- No account is required.
- Bookmark data is stored in local SQLite by default.
- The Chrome extension talks to your local app on `localhost:4399`.
- No telemetry is sent by the app.
- API keys are not logged.
- External AI calls are disabled unless you configure an AI provider.

Important: when you apply cleanup back to Chrome, Chrome itself may sync bookmark changes to your Google account if Chrome Sync is enabled.

## Project Layout

```text
siftmarks/
  apps/
    web/              Local Next.js dashboard and API
    cli/              Command-line interface
    mcp-server/       MCP stdio server
    chrome-extension/ Chrome extension for import and sync-back

  packages/
    shared/           Shared types and utilities
    db/               SQLite schema and data access
    core/             Import, search, rescue, cleanup logic
    ai/               Mock, OpenAI-compatible, and Ollama providers
    indexer/          FTS, summaries, tags, embeddings
```

## Development

Common commands:

```bash
npm install
npm run dev
npm run build:packages
npm run build
npm run typecheck
```

For tests or experiments that should not touch your real bookmark library, point SiftMarks at a temporary home:

```bash
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- init
```

## Current Status

SiftMarks currently includes:

- local web dashboard
- Chrome extension import
- Chrome sync-back for accepted cleanup
- SQLite storage
- keyword search and FTS indexing
- duplicate detection
- cleanup suggestions
- AI summaries and tags
- MCP server
- CLI workflow

Upcoming work may include richer semantic search, better folder policy editing, Firefox support, and full-page local archives.

## License

MIT
