import { BookmarkFilterPage } from '@/components/bookmark-filter-page';

export default function BrokenLinksPage() {
  return (
    <BookmarkFilterPage
      title="失效链接"
      desc="集中查看检测为失效的书签，便于重新检查、修复或删除。"
      emptyTitle="暂无失效链接"
      emptyDesc="当前没有被标记为失效的书签。"
      query={{ status: 'broken' }}
      badgeLabel="失效"
    />
  );
}
