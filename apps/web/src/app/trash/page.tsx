import { BookmarkFilterPage } from '@/components/bookmark-filter-page';

export default function TrashPage() {
  return (
    <BookmarkFilterPage
      title="回收站"
      desc="查看状态为已删除的书签，并选择恢复或永久删除。"
      emptyTitle="回收站为空"
      emptyDesc="目前没有状态为已删除的书签。"
      query={{ status: 'deleted' }}
      trashMode
    />
  );
}
