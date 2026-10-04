// Shared by ordinary saves and history restores. Recheck access inside the
// UPDATE, not only before awaiting other reads (snapshots/volume validation).
export function chapterWriteGuard(
  chapterId: string,
  revision: number,
  ownerId: string,
  targetVolumeId?: string | null,
) {
  const bindings: (string | number)[] = [chapterId, revision, ownerId];
  let sql = `id = ? AND revision = ? AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM works w WHERE w.id = chapters.work_id
      AND w.owner_id = ? AND w.status != 'archived')`;
  if (targetVolumeId != null) {
    sql += ` AND EXISTS (SELECT 1 FROM volumes v
      WHERE v.id = ? AND v.work_id = chapters.work_id)`;
    bindings.push(targetVolumeId);
  }
  return { sql, bindings };
}

// The response belongs to this write, even if another write/archive happens
// before the request finishes. Do not perform a second mutable-row read.
export const chapterReturningColumns = `id, work_id, volume_id, title, summary,
  content, plain_text, word_count, status, sort_order, revision, content_format_version, created_at, updated_at`;
