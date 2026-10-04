export type ChapterJumpItem = { id: string; title: string; volumeTitle: string; ordinal: number };

export function filterChapterJumpItems(items: ChapterJumpItem[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return items;
  return items.filter((item) => item.title.toLocaleLowerCase().includes(needle) ||
    item.volumeTitle.toLocaleLowerCase().includes(needle) || String(item.ordinal) === needle);
}

/** A delayed chapter response must never replace a different work or newer draft. */
export function canCommitChapterJump(start: { workId: string | null; chapterId: string | null; seq: number },
  current: { workId: string | null; chapterId: string | null; seq: number; dirty: boolean }) {
  return start.workId === current.workId && start.chapterId === current.chapterId &&
    start.seq === current.seq && !current.dirty;
}
