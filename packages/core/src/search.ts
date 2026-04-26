import { SiftMarksDB } from '@siftmarks/db';
import type { SearchResult, SearchOptions, Bookmark } from '@siftmarks/shared';

/**
 * Keyword search using FTS5.
 */
export function keywordSearch(db: SiftMarksDB, options: SearchOptions): SearchResult[] {
  const { query, limit = 20, tag, folder, status } = options;

  // FTS search
  const ftsResults = db.searchFTS(query, limit * 2);

  // Get full bookmark details
  const results: SearchResult[] = [];

  for (const fts of ftsResults) {
    const bookmark = db.getBookmarkById(fts.bookmarkId);
    if (!bookmark || bookmark.status === 'deleted') continue;

    // Apply filters
    if (status && bookmark.status !== status) continue;
    if (folder && bookmark.folderPath !== folder) continue;

    const tags = db.getBookmarkTags(bookmark.id).map((t) => t.name);
    if (tag && !tags.some((t) => t === tag)) continue;

    // Calculate score components
    const titleScore = matchScore(query, bookmark.title ?? '');
    const tagScore = matchScore(query, tags.join(' '));
    const keywordScore = Math.abs(fts.rank);

    // Without embeddings, use keyword-only scoring
    const finalScore =
      0.55 * normalize(keywordScore) +
      0.20 * titleScore +
      0.15 * tagScore +
      0.10 * recencyScore(bookmark);

    const matchedFields: string[] = [];
    if (titleScore > 0.3) matchedFields.push('title');
    if (tagScore > 0.3) matchedFields.push('tags');
    if (keywordScore > 0) matchedFields.push('content');

    results.push({
      bookmark,
      score: finalScore,
      matchReason: buildMatchReason(matchedFields, query),
      matchedFields,
      tags,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/**
 * Hybrid search: combines FTS + vector search when embeddings are available.
 */
export function hybridSearch(
  db: SiftMarksDB,
  options: SearchOptions,
  queryEmbedding?: number[]
): SearchResult[] {
  const keywordResults = keywordSearch(db, { ...options, limit: (options.limit ?? 20) * 2 });

  if (!queryEmbedding) {
    return keywordResults.slice(0, options.limit ?? 20);
  }

  // Vector search
  const allEmbeddings = db.getAllEmbeddings();
  const vectorScores = new Map<string, number>();

  for (const emb of allEmbeddings) {
    const vector = JSON.parse(emb.vectorJson) as number[];
    const similarity = cosineSimilarity(queryEmbedding, vector);
    vectorScores.set(emb.bookmarkId, similarity);
  }

  // Merge results
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const result of keywordResults) {
    const semanticScore = vectorScores.get(result.bookmark.id) ?? 0;
    const keywordScore = result.score;

    result.score =
      0.45 * semanticScore +
      0.30 * keywordScore +
      0.10 * matchScore(options.query, result.bookmark.title ?? '') +
      0.10 * matchScore(options.query, result.tags.join(' ')) +
      0.05 * recencyScore(result.bookmark);

    if (semanticScore > 0.5) {
      result.matchedFields.push('semantic');
      result.matchReason = `Semantically similar to "${options.query}"`;
    }

    seen.add(result.bookmark.id);
    merged.push(result);
  }

  // Add vector-only results
  for (const [bookmarkId, score] of vectorScores) {
    if (seen.has(bookmarkId) || score < 0.3) continue;

    const bookmark = db.getBookmarkById(bookmarkId);
    if (!bookmark || bookmark.status === 'deleted') continue;

    const tags = db.getBookmarkTags(bookmarkId).map((t) => t.name);
    merged.push({
      bookmark,
      score: 0.45 * score + 0.05 * recencyScore(bookmark),
      matchReason: `Semantically related to "${options.query}"`,
      matchedFields: ['semantic'],
      tags,
    });
  }

  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, options.limit ?? 20);
}

// --- Helpers ---

function matchScore(query: string, text: string): number {
  if (!text || !query) return 0;
  const qLower = query.toLowerCase();
  const tLower = text.toLowerCase();

  if (tLower === qLower) return 1.0;
  if (tLower.includes(qLower)) return 0.8;

  const qWords = qLower.split(/\s+/);
  const matched = qWords.filter((w) => tLower.includes(w)).length;
  return matched / qWords.length;
}

function recencyScore(bookmark: Bookmark): number {
  const date = bookmark.createdAt ?? bookmark.importedAt;
  const age = Date.now() - new Date(date).getTime();
  const dayAge = age / (1000 * 60 * 60 * 24);
  return Math.max(0, 1 - dayAge / 365);
}

function normalize(rank: number): number {
  // FTS5 rank is negative (more negative = better match)
  // Normalize to 0-1
  return Math.min(1, Math.max(0, 1 / (1 + Math.abs(rank))));
}

function buildMatchReason(fields: string[], query: string): string {
  if (fields.length === 0) return `Matched query "${query}"`;
  return `Matched in ${fields.join(', ')} for "${query}"`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
