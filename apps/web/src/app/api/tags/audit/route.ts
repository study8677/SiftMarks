import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getAIProvider } from '@/lib/ai';
import { extractJSONFromAIText } from '@siftmarks/shared';

interface RawMergeSuggestion {
  sourceIndexes?: unknown;
  targetIndex?: unknown;
  reason?: unknown;
  confidence?: unknown;
}

export async function POST() {
  const db = getDB();
  const provider = getAIProvider();

  if (provider.name === 'mock') {
    return NextResponse.json(
      { error: '当前是 Mock 模式。请先配置真实 AI，再生成标签审核建议。', code: 'mock_provider' },
      { status: 400 }
    );
  }

  const tags = db.listTags();
  if (tags.length < 2) {
    return NextResponse.json({ suggestions: [], auditedTags: tags.length, aiPowered: true });
  }

  const tagEvidence = tags.map((tag, index) => {
    const { items } = db.listBookmarks({ tag: tag.normalizedName, limit: 4 });
    return {
      i: index,
      name: tag.name,
      count: tag.count,
      samples: items.map((bookmark) => ({
        title: bookmark.title ?? '',
        domain: hostname(bookmark.url),
        folderPath: bookmark.folderPath ?? '',
        summary: bookmark.summary ?? bookmark.description ?? '',
      })),
    };
  });

  const response = await provider.chat([
    {
      role: 'system',
      content: `你是本地书签库的标签治理 AI。标签只用于辅助检索，不是主分类；目标是减少近义标签和碎片标签，而不是生成更多标签。

请基于全库标签及其书签样本，找出“明确应该合并”的标签。只在这些情况给建议：
- 拼写、大小写、单双数、分隔符不同但语义相同
- 中英文/缩写/全称明显指向同一概念
- 低频标签是高频标签的同义词或明显别名

不要合并只是同一大主题但用户可能需要区分的标签，例如 react 和 nextjs、github 和 git、ai 和 llm、文章和文档。目标标签必须是已有标签，优先选择使用次数更多、更清晰的标签。

只返回 JSON 数组，不要 markdown。只能使用输入里的短编号 i，不要返回标签名或数据库 id：
[
  {"sourceIndexes":[要合并掉的标签 i],"targetIndex":保留的目标标签 i,"reason":"为什么这些标签应合并","confidence":0.9}
]`,
    },
    {
      role: 'user',
      content: JSON.stringify({ tags: tagEvidence }, null, 0),
    },
  ]);

  let parsed: RawMergeSuggestion[];
  try {
    parsed = JSON.parse(extractJSONFromAIText(response)) as RawMergeSuggestion[];
  } catch {
    return NextResponse.json({ error: 'AI 标签审核返回了无法解析的结果。' }, { status: 502 });
  }

  if (!Array.isArray(parsed)) {
    return NextResponse.json({ error: 'AI 标签审核结果格式不正确。' }, { status: 502 });
  }

  const tagByIndex = new Map(tags.map((tag, index) => [index, tag]));
  const usedSourceIds = new Set<string>();
  const suggestions = [];

  for (const item of parsed) {
    const targetIndex = typeof item.targetIndex === 'number' ? Math.round(item.targetIndex) : -1;
    const target = tagByIndex.get(targetIndex);
    if (!target) continue;

    const sourceIndexes = Array.isArray(item.sourceIndexes)
      ? Array.from(new Set(item.sourceIndexes.filter((index): index is number => typeof index === 'number').map(Math.round)))
      : [];
    const validSourceIds = sourceIndexes
      .map((index) => tagByIndex.get(index))
      .filter((tag): tag is (typeof tags)[number] => Boolean(tag))
      .map((tag) => tag.id)
      .filter((id) => id !== target.id && !usedSourceIds.has(id));
    if (validSourceIds.length === 0) continue;

    for (const id of validSourceIds) usedSourceIds.add(id);
    const confidence = typeof item.confidence === 'number'
      ? Math.min(Math.max(item.confidence, 0), 1)
      : 0.75;

    suggestions.push({
      sources: validSourceIds.map((id) => tags.find((tag) => tag.id === id)!.name),
      sourceIds: validSourceIds,
      target: target.name,
      targetId: target.id,
      reason: typeof item.reason === 'string' ? item.reason : 'AI 判断这些标签语义冗余，建议合并。',
      confidence,
    });
  }

  return NextResponse.json({
    suggestions,
    auditedTags: tags.length,
    aiPowered: true,
  });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
