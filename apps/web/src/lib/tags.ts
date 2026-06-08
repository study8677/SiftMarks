import { normalizeTagName } from '@siftmarks/shared';

export function cleanTagName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizeTagKey(name: string): string {
  const normalized = normalizeTagName(name);
  if (normalized) return normalized;

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
