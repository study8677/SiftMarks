import { BookmarkFilterPage } from '@/components/bookmark-filter-page';

export default function RecentBookmarksPage() {
  return (
    <BookmarkFilterPage
      title="最近添加"
      desc="按导入时间查看最近进入 SiftMarks 的书签。"
      emptyTitle="暂无最近书签"
      emptyDesc="导入或保存书签后，会在这里按时间展示。"
      query={{}}
      badgeLabel="最近"
    />
  );
}
