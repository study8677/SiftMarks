import { BookmarkFilterPage } from '@/components/bookmark-filter-page';

export default function DuplicatesPage() {
  return (
    <BookmarkFilterPage
      title="已存在链接"
      desc="导入时已经存在的链接会直接跳过，不再作为整理任务二次导入。"
      emptyTitle="暂无已存在链接"
      emptyDesc="当前没有需要单独查看的已存在链接。"
      query={{ isDuplicate: 'true' }}
      badgeLabel="已存在"
    />
  );
}
