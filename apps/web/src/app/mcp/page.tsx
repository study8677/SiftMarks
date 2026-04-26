'use client';

import { useI18n } from '@/lib/i18n';

export default function MCPPage() {
  const { t } = useI18n();

  const toolNames = [
    'search_bookmarks',
    'read_bookmark',
    'list_tags',
    'list_folders',
    'find_related_bookmarks',
    'summarize_collection',
    'save_bookmark',
    'run_bookmark_rescue',
    'get_bookmark_stats',
  ] as const;

  const claudeConfig = `{
  "mcpServers": {
    "siftmarks": {
      "command": "node",
      "args": ["/path/to/siftmarks/apps/mcp-server/dist/index.js"]
    }
  }
}`;

  const cursorConfig = `{
  "mcpServers": {
    "siftmarks": {
      "command": "node",
      "args": ["/path/to/siftmarks/apps/mcp-server/dist/index.js"]
    }
  }
}`;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{t.mcp.title}</h1>
      <p className="text-muted mb-6">{t.mcp.desc}</p>

      <section className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-2">{t.mcp.startServer}</h2>
        <p className="text-sm text-muted mb-3">{t.mcp.startDesc}</p>
        <code className="block px-4 py-2 rounded bg-background border border-border text-sm font-mono">
          npx siftmarks mcp
        </code>
      </section>

      <section className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-2">{t.mcp.claudeConfig}</h2>
        <p className="text-sm text-muted mb-3">
          {t.mcp.claudeConfigDesc} <code className="text-xs bg-background px-1 py-0.5 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code>:
        </p>
        <pre className="px-4 py-3 rounded bg-background border border-border text-xs font-mono overflow-x-auto">
          {claudeConfig}
        </pre>
      </section>

      <section className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-2">{t.mcp.cursorConfig}</h2>
        <p className="text-sm text-muted mb-3">
          {t.mcp.cursorConfigDesc} <code className="text-xs bg-background px-1 py-0.5 rounded">.cursor/mcp.json</code>:
        </p>
        <pre className="px-4 py-3 rounded bg-background border border-border text-xs font-mono overflow-x-auto">
          {cursorConfig}
        </pre>
      </section>

      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="font-semibold mb-4">{t.mcp.tools}</h2>
        <div className="space-y-3">
          {toolNames.map((name) => (
            <div key={name} className="flex items-start gap-3">
              <code className="text-xs bg-accent-light text-accent px-2 py-0.5 rounded font-mono shrink-0">
                {name}
              </code>
              <span className="text-sm text-muted">{t.mcp.toolDescs[name]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
