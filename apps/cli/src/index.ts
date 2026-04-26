#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { SiftMarksDB, getDbPath } from '@siftmarks/db';
import { importFromFile, generateCleanupSuggestions, keywordSearch, exportToJSON, fetchBatch } from '@siftmarks/core';
import { createProvider } from '@siftmarks/ai';
import { indexBookmarks, rebuildFTSIndex } from '@siftmarks/indexer';
import { formatNumber, type AIProviderConfig, DEFAULT_SETTINGS } from '@siftmarks/shared';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const program = new Command();

program
  .name('siftmarks')
  .description('Local-first AI bookmark manager')
  .version('0.1.0');

// --- init ---
program
  .command('init')
  .description('Initialize local database')
  .action(() => {
    const dbPath = getDbPath();
    const spinner = ora('Initializing SiftMarks...').start();

    const db = new SiftMarksDB(dbPath);
    db.initialize();
    db.close();

    spinner.succeed(`SiftMarks initialized at ${dbPath}`);
  });

// --- import ---
program
  .command('import')
  .description('Import bookmarks from HTML file')
  .argument('<file>', 'Path to bookmarks.html')
  .action((file: string) => {
    if (!existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }

    const spinner = ora('Importing bookmarks...').start();

    const db = new SiftMarksDB();
    db.initialize();

    try {
      const result = importFromFile(file, db);

      // Build FTS index
      spinner.text = 'Building search index...';
      rebuildFTSIndex(db);

      spinner.succeed('Import complete!');
      console.log('');
      console.log(`  Imported:    ${chalk.green(formatNumber(result.imported))} bookmarks`);
      console.log(`  Folders:     ${chalk.blue(formatNumber(result.folders))}`);
      console.log(`  Duplicates:  ${chalk.yellow(formatNumber(result.duplicates))}`);
      console.log(`  No title:    ${chalk.dim(formatNumber(result.missingTitles))}`);
    } finally {
      db.close();
    }
  });

// --- stats ---
program
  .command('stats')
  .description('Show bookmark statistics')
  .action(() => {
    const db = new SiftMarksDB();
    db.initialize();

    try {
      const stats = db.getStats();

      console.log('');
      console.log(chalk.bold('📚 SiftMarks Library'));
      console.log('');
      console.log(`  Bookmarks:         ${chalk.green(formatNumber(stats.bookmarks))}`);
      console.log(`  Folders:           ${chalk.blue(formatNumber(stats.folders))}`);
      console.log(`  Tags:              ${chalk.cyan(formatNumber(stats.tags))}`);
      console.log(`  Duplicates:        ${chalk.yellow(formatNumber(stats.duplicates))}`);
      console.log(`  Broken:            ${chalk.red(formatNumber(stats.broken))}`);
      console.log(`  Missing summaries: ${chalk.dim(formatNumber(stats.missingSummaries))}`);
      console.log(`  Missing tags:      ${chalk.dim(formatNumber(stats.missingTags))}`);
      console.log('');
    } finally {
      db.close();
    }
  });

// --- search ---
program
  .command('search')
  .description('Search bookmarks')
  .argument('<query>', 'Search query')
  .option('-l, --limit <n>', 'Max results', '10')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-f, --folder <folder>', 'Filter by folder')
  .action((query: string, opts: { limit: string; tag?: string; folder?: string }) => {
    const db = new SiftMarksDB();
    db.initialize();

    try {
      const results = keywordSearch(db, {
        query,
        limit: parseInt(opts.limit),
        tag: opts.tag,
        folder: opts.folder,
      });

      if (results.length === 0) {
        console.log(chalk.dim('\n  No matching bookmarks found.\n'));
        return;
      }

      console.log('');
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        console.log(chalk.bold(`  ${i + 1}. ${r.bookmark.title ?? '(untitled)'}`));
        console.log(chalk.dim(`     ${r.bookmark.url}`));
        if (r.tags.length > 0) {
          console.log(`     Tags: ${r.tags.map((t) => chalk.cyan(t)).join(', ')}`);
        }
        if (r.bookmark.summary) {
          console.log(chalk.dim(`     ${r.bookmark.summary.slice(0, 120)}`));
        }
        console.log('');
      }
    } finally {
      db.close();
    }
  });

// --- doctor ---
program
  .command('doctor')
  .description('Check for issues in bookmark library')
  .action(() => {
    const db = new SiftMarksDB();
    db.initialize();

    try {
      const stats = db.getStats();

      console.log('');
      console.log(chalk.bold('🩺 Bookmark Health Check'));
      console.log('');

      const issues: string[] = [];

      if (stats.duplicates > 0) {
        issues.push(`${chalk.yellow(formatNumber(stats.duplicates))} duplicate bookmarks`);
      }
      if (stats.broken > 0) {
        issues.push(`${chalk.red(formatNumber(stats.broken))} broken links`);
      }
      if (stats.missingSummaries > 0) {
        issues.push(`${chalk.dim(formatNumber(stats.missingSummaries))} missing summaries`);
      }
      if (stats.missingTags > 0) {
        issues.push(`${chalk.dim(formatNumber(stats.missingTags))} missing tags`);
      }

      if (issues.length === 0) {
        console.log(chalk.green('  ✓ No issues found!'));
      } else {
        console.log('  Found:');
        for (const issue of issues) {
          console.log(`  - ${issue}`);
        }
        console.log('');
        console.log(chalk.dim('  Run `siftmarks rescue` to generate cleanup suggestions.'));
      }
      console.log('');
    } finally {
      db.close();
    }
  });

// --- index ---
program
  .command('index')
  .description('Index bookmarks: fetch metadata, generate summaries and tags')
  .option('-l, --limit <n>', 'Max bookmarks to index', '100')
  .option('--only-missing', 'Only index bookmarks without summaries', true)
  .option('--no-ai', 'Skip AI processing')
  .action(async (opts: { limit: string; onlyMissing: boolean; ai: boolean }) => {
    const db = new SiftMarksDB();
    db.initialize();

    try {
      // Load AI provider config
      const configStr = db.getSetting('aiProvider');
      const config: AIProviderConfig = configStr
        ? JSON.parse(configStr)
        : DEFAULT_SETTINGS.aiProvider;

      const provider = createProvider(config);

      if (opts.ai && provider.name === 'mock') {
        console.log(chalk.yellow('\n  AI provider is not configured. Using mock provider.'));
        console.log(chalk.dim('  Configure via the web UI Settings page or siftmarks web.\n'));
      }

      const spinner = ora('Indexing bookmarks...').start();

      const result = await indexBookmarks(db, provider, {
        limit: parseInt(opts.limit),
        onlyMissing: opts.onlyMissing,
        useAI: opts.ai,
        onProgress: (done, total, bookmark) => {
          spinner.text = `Indexing... (${done}/${total}) ${bookmark.title?.slice(0, 40) ?? bookmark.url.slice(0, 40)}`;
        },
      });

      spinner.succeed('Indexing complete!');
      console.log('');
      console.log(`  Processed:  ${chalk.green(formatNumber(result.processed))}`);
      console.log(`  Summaries:  ${chalk.blue(formatNumber(result.summaries))}`);
      console.log(`  Tags:       ${chalk.cyan(formatNumber(result.tags))}`);
      console.log(`  Embeddings: ${chalk.magenta(formatNumber(result.embeddings))}`);
      console.log('');
    } finally {
      db.close();
    }
  });

// --- rescue ---
program
  .command('rescue')
  .description('Generate cleanup suggestions (Bookmark Rescue)')
  .action(() => {
    const spinner = ora('Scanning bookmark library...').start();
    const db = new SiftMarksDB();
    db.initialize();

    try {
      const suggestions = generateCleanupSuggestions(db);

      const byType = new Map<string, number>();
      for (const s of suggestions) {
        byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
      }

      spinner.succeed(`Created cleanup PR with ${formatNumber(suggestions.length)} suggestions`);
      console.log('');

      for (const [type, count] of byType) {
        console.log(`  - ${chalk.cyan(type)}: ${formatNumber(count)}`);
      }

      console.log('');
      console.log(chalk.dim('  Review suggestions in the web dashboard or export them.'));
      console.log('');
    } finally {
      db.close();
    }
  });

// --- export ---
program
  .command('export')
  .description('Export bookmarks to JSON')
  .argument('<output>', 'Output file path')
  .action((output: string) => {
    const spinner = ora('Exporting...').start();
    const db = new SiftMarksDB();
    db.initialize();

    try {
      const data = exportToJSON(db, output);
      spinner.succeed(`Exported ${formatNumber(data.bookmarks.length)} bookmarks to ${output}`);
    } finally {
      db.close();
    }
  });

// --- mcp ---
program
  .command('mcp')
  .description('Start MCP server')
  .action(() => {
    // Launch the MCP server process
    const mcpPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../mcp-server/dist/index.js');
    console.log(chalk.bold('Starting SiftMarks MCP Server...'));

    if (!existsSync(mcpPath)) {
      console.error(chalk.red('MCP server not built. Run `npm run build` first.'));
      process.exit(1);
    }

    const child = spawn('node', [mcpPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  });

program.parse();
