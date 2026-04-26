import type { ParsedBookmark } from '@siftmarks/shared';

/**
 * Parse Netscape Bookmark HTML format exported from Chrome, Firefox, Edge, Brave.
 *
 * The Netscape bookmark format uses non-standard HTML where DT tags are not closed.
 * We use a line-by-line state machine approach rather than DOM parsing for reliability.
 */
export function parseBookmarkHTML(html: string): ParsedBookmark[] {
  const bookmarks: ParsedBookmark[] = [];
  const folderStack: string[] = [];
  const lines = html.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect folder start: <DT><H3 ...>Folder Name</H3>
    const folderMatch = trimmed.match(/<DT><H3[^>]*>(.*?)<\/H3>/i);
    if (folderMatch) {
      folderStack.push(folderMatch[1]!.trim());
      continue;
    }

    // Detect folder end: </DL>
    if (/<\/DL>/i.test(trimmed)) {
      folderStack.pop();
      continue;
    }

    // Detect bookmark: <DT><A HREF="..." ...>Title</A>
    const bookmarkMatch = trimmed.match(
      /<DT><A\s+([^>]*)>([\s\S]*?)<\/A>/i
    );
    if (bookmarkMatch) {
      const attrs = bookmarkMatch[1]!;
      const title = bookmarkMatch[2]!.trim();

      // Extract HREF
      const hrefMatch = attrs.match(/HREF="([^"]*)"/i);
      const url = hrefMatch?.[1] ?? '';

      if (!url || url.startsWith('javascript:') || url.startsWith('data:')) {
        continue;
      }

      // Extract ADD_DATE
      const addDateMatch = attrs.match(/ADD_DATE="([^"]*)"/i);
      let createdAt: string | null = null;
      if (addDateMatch) {
        const timestamp = parseInt(addDateMatch[1]!, 10);
        if (!isNaN(timestamp) && timestamp > 0) {
          createdAt = new Date(timestamp * 1000).toISOString();
        }
      }

      // Extract ICON
      const iconMatch = attrs.match(/ICON="([^"]*)"/i);
      const icon = iconMatch?.[1] ?? null;

      bookmarks.push({
        title: title || '',
        url,
        folderPath: folderStack.length > 0 ? folderStack.join('/') : '',
        createdAt,
        icon: icon || null,
      });
    }
  }

  return bookmarks;
}
