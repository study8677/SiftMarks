# SiftMarks Web App

This is the local dashboard and API surface for SiftMarks.

It runs on `localhost:4399` from the root workspace and provides:

- dashboard stats for the local bookmark library
- bookmark HTML import and browser detection
- library browsing and bookmark detail pages
- keyword and memory-mode search
- Bookmark Rescue review flow
- taxonomy generation and application flow
- AI provider settings
- MCP setup examples
- extension APIs for Chrome import, save-current-tab, and sync-back

## Run Locally

From the repository root:

```bash
npm install
npm run build:packages
npm run dev
```

Open:

```text
http://localhost:4399
```

The root `npm run dev` command runs this app with:

```bash
npm run dev --workspace=apps/web -- -p 4399
```

## Data Location

By default, the app uses the local SiftMarks database:

```text
~/.siftmarks/siftmarks.sqlite
```

For experiments, set a temporary home before running root CLI commands:

```bash
SIFTMARKS_HOME=/tmp/siftmarks-test npm run cli -- init
```

## Notes

- Keep AI calls disabled unless the user explicitly configures a provider.
- Keep Chrome sync-back explicit and confirmation-gated through the extension.
- Read `apps/web/AGENTS.md` before changing web app code.
