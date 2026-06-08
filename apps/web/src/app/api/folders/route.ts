import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');
  const chromeLinked = scope === 'chrome' || searchParams.get('chromeLinked') === 'true';

  const db = getDB();
  const folders = db.listFolders({ chromeLinked });
  const localPendingCount = db
    .listBookmarks({ limit: 100000, chromeUnlinked: true })
    .items.filter((bookmark) => Boolean(bookmark.folderPath)).length;

  return NextResponse.json({
    folders,
    scope: chromeLinked ? 'chrome' : 'all',
    localPendingCount,
  });
}
