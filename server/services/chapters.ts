import type { CreateChapterInput, ReorderChaptersInput, UpdateChapterInput } from "@/contracts";
import { all, batch, first, statement } from "@/server/db";
import { chapterReturningColumns, chapterWriteGuard } from "@/server/chapter-write";
import { isMatchingSaveReplay } from "@/server/chapter-save";
import { conflict, notFound } from "@/server/errors";
import { countWords, htmlToPlainText, isoNow, localDateKey, newId } from "@/server/text";
import { assertWorkOwned } from "./works";

export type ChapterRow = {
  id: string;
  work_id: string;
  volume_id: string | null;
  title: string;
  summary: string;
  content: string;
  plain_text: string;
  word_count: number;
  status: string;
  sort_order: number;
  revision: number;
  last_save_id?: string | null;
  client_save_id?: string | null;
  content_format_version: number;
  created_at: string;
  updated_at: string;
};

export function mapChapter(row: ChapterRow) {
  return {
    id: row.id,
    workId: row.work_id,
    volumeId: row.volume_id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    wordCount: row.word_count,
    status: row.status,
    sortOrder: row.sort_order,
    revision: row.revision,
    contentFormatVersion: row.content_format_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getChapter(chapterId: string, ownerId: string): Promise<ReturnType<typeof mapChapter>> {
  const row = await getChapterRow(chapterId, ownerId);
  return mapChapter(row);
}

export async function getChapterRow(chapterId: string, ownerId: string): Promise<ChapterRow> {
  const row = await first<ChapterRow>(
    `SELECT c.id, c.work_id, c.volume_id, c.title, c.summary, c.content, c.plain_text,
            c.word_count, c.status, c.sort_order, c.revision, c.last_save_id,
            c.client_save_id, c.content_format_version, c.created_at, c.updated_at
     FROM chapters c JOIN works w ON w.id = c.work_id
     WHERE c.id = ? AND c.deleted_at IS NULL AND w.owner_id = ? AND w.status != 'archived'`,
    chapterId,
    ownerId,
  );
  if (!row) notFound("章节");
  return row;
}

async function assertVolumeInWork(volumeId: string | null | undefined, workId: string): Promise<void> {
  if (!volumeId) return;
  const row = await first<{ id: string }>("SELECT id FROM volumes WHERE id = ? AND work_id = ?", volumeId, workId);
  if (!row) conflict("目标分卷不属于当前作品");
}

export async function listChapters(workId: string, ownerId: string, includeContent = false) {
  await assertWorkOwned(workId, ownerId);
  const rows = await all<ChapterRow>(
    `SELECT id, work_id, volume_id, title, summary, ${includeContent ? "content, plain_text," : "'' AS content, '' AS plain_text,"}
            word_count, status, sort_order, revision, content_format_version, created_at, updated_at
     FROM chapters WHERE work_id = ? AND deleted_at IS NULL
     ORDER BY COALESCE(volume_id, ''), sort_order, created_at`,
    workId,
  );
  return rows.map(mapChapter);
}

export async function createChapter(workId: string, ownerId: string, input: CreateChapterInput) {
  await assertWorkOwned(workId, ownerId);
  await assertVolumeInWork(input.volumeId, workId);
  const id = newId();
  const now = isoNow();
  const plainText = htmlToPlainText(input.content);
  const wordCount = countWords(plainText);
  const volumeId = input.volumeId ?? null;
  const orderRow = await first<{ next_order: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM chapters WHERE work_id = ? AND deleted_at IS NULL
       AND ((volume_id = ?) OR (volume_id IS NULL AND ? IS NULL))`,
    workId,
    volumeId,
    volumeId,
  );
  const sortOrder = input.sortOrder ?? orderRow?.next_order ?? 0;

  await batch([
    statement(
      `INSERT INTO chapters
       (id, work_id, volume_id, title, summary, content, plain_text, word_count,
        status, sort_order, revision, content_format_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      id,
      workId,
      volumeId,
      input.title,
      input.summary,
      input.content,
      plainText,
      wordCount,
      input.status,
      sortOrder,
      now,
      now,
    ),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, workId),
  ]);
  return getChapter(id, ownerId);
}

async function shouldSnapshot(chapter: ChapterRow, nextWordCount: number): Promise<boolean> {
  const latest = await first<{ created_at: string; word_count: number }>(
    `SELECT created_at, word_count FROM chapter_versions
     WHERE chapter_id = ? AND kind = 'auto' ORDER BY created_at DESC LIMIT 1`,
    chapter.id,
  );
  if (!latest) return true;
  const elapsed = Date.now() - new Date(latest.created_at).getTime();
  return elapsed >= 5 * 60 * 1000 || Math.abs(nextWordCount - latest.word_count) >= 200;
}

export async function updateChapter(chapterId: string, ownerId: string, input: UpdateChapterInput) {
  const current = await getChapterRow(chapterId, ownerId);
  if (input.saveId && current.client_save_id === input.saveId) {
    if (isMatchingSaveReplay(current, input)) return mapChapter(current);
    conflict("保存请求 ID 已用于其他内容，请重新获取章节后再保存");
  }
  if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) {
    conflict("章节已在其他位置更新，请刷新后重试", {
      expectedRevision: input.expectedRevision,
      currentRevision: current.revision,
    });
  }
  await assertVolumeInWork(input.volumeId, current.work_id);

  const nextContent = input.content ?? current.content;
  const nextPlainText = input.content === undefined ? current.plain_text : htmlToPlainText(nextContent);
  const nextWordCount = input.content === undefined ? current.word_count : countWords(nextPlainText);
  const contentChanged = input.content !== undefined && input.content !== current.content;
  const now = isoNow();
  const saveId = newId();
  const statements: D1PreparedStatement[] = [];

  if (contentChanged && (input.preservePreviousVersion || await shouldSnapshot(current, nextWordCount))) {
    statements.push(
      statement(
        `INSERT INTO chapter_versions
         (id, chapter_id, kind, label, content, plain_text, word_count, source_revision, created_at)
         SELECT ?, ?, 'auto', '', ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM chapters WHERE id = ? AND last_save_id = ?)`,
        newId(),
        current.id,
        current.content,
        current.plain_text,
        current.word_count,
        current.revision,
        now,
        chapterId,
        saveId,
      ),
    );
  }

  const columns = ["updated_at = ?", "last_save_id = ?", "client_save_id = ?", "revision = revision + 1"];
  const values: unknown[] = [now, saveId, input.saveId ?? null];
  const add = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    values.push(value);
  };
  if (input.volumeId !== undefined) add("volume_id", input.volumeId);
  if (input.title !== undefined) add("title", input.title);
  if (input.summary !== undefined) add("summary", input.summary);
  if (input.content !== undefined) {
    add("content", input.content);
    add("plain_text", nextPlainText);
    add("word_count", nextWordCount);
  }
  if (input.status !== undefined) add("status", input.status);
  if (input.sortOrder !== undefined) add("sort_order", input.sortOrder);
  const guard = chapterWriteGuard(chapterId, current.revision, ownerId, input.volumeId);
  statements.unshift(
    statement(
      `UPDATE chapters SET ${columns.join(", ")} WHERE ${guard.sql}
       RETURNING ${chapterReturningColumns}`,
      ...values,
      ...guard.bindings,
    ),
  );

  const positiveDelta = Math.max(0, nextWordCount - current.word_count);
  if (positiveDelta > 0) {
    const date = localDateKey();
    statements.push(
      statement(
        `INSERT INTO writing_daily_stats
         (id, work_id, stat_date, target_words, words_written, created_at, updated_at)
         SELECT ?, ?, ?, 3000, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM chapters WHERE id = ? AND last_save_id = ?)
         ON CONFLICT(work_id, stat_date) DO UPDATE SET
           words_written = words_written + excluded.words_written,
           updated_at = excluded.updated_at`,
        newId(),
        current.work_id,
        date,
        positiveDelta,
        now,
        now,
        chapterId,
        saveId,
      ),
    );
  }
  statements.push(
    statement(
      `UPDATE works SET updated_at = ? WHERE id = ?
       AND EXISTS (SELECT 1 FROM chapters WHERE id = ? AND last_save_id = ?)`,
      now,
      current.work_id,
      chapterId,
      saveId,
    ),
  );

  const results = await batch(statements);
  const updateResult = results[0];
  const updated = updateResult?.results[0] as ChapterRow | undefined;
  if (!updated) {
    if (input.saveId) {
      const latest = await getChapterRow(chapterId, ownerId);
      if (latest.client_save_id === input.saveId && isMatchingSaveReplay(latest, input)) return mapChapter(latest);
    }
    conflict("章节更新发生冲突，请刷新后重试");
  }
  return mapChapter(updated);
}

export async function reorderChapters(
  workId: string,
  ownerId: string,
  volumeId: string | null,
  chapterIds: string[],
  expectedRevisions?: ReorderChaptersInput["expectedRevisions"],
) {
  await assertWorkOwned(workId, ownerId);
  await assertVolumeInWork(volumeId, workId);
  const ids = new Set(chapterIds);
  if (!chapterIds.length || ids.size !== chapterIds.length) {
    conflict("章节排序列表不能为空或包含重复章节");
  }
  type OrderRow = { id: string; volume_id: string | null; sort_order: number; revision: number };
  const idsJson = JSON.stringify(chapterIds);
  const rows = await all<OrderRow>(
    `SELECT id, volume_id, sort_order, revision FROM chapters
     WHERE work_id = ? AND deleted_at IS NULL
       AND (volume_id IS ? OR id IN (SELECT value FROM json_each(?)))`,
    workId, volumeId, idsJson,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (chapterIds.some((id) => !byId.has(id))
    || rows.some((row) => row.volume_id === volumeId && !ids.has(row.id))) {
    conflict("请提交目标分卷的全部现有章节及待移入章节，不能遗漏或跨作品移动");
  }
  const revisions = new Map(expectedRevisions?.map((item) => [item.chapterId, item.revision]));
  if (expectedRevisions && (
    expectedRevisions.length !== chapterIds.length || revisions.size !== chapterIds.length
    || chapterIds.some((id) => revisions.get(id) !== byId.get(id)!.revision)
  )) conflict("章节版本已变化，请保存草稿并刷新目录后重试");

  const requested = chapterIds.map((id, index) => {
    const row = byId.get(id)!;
    return {
      id,
      revision: revisions.get(id) ?? row.revision,
      sourceVolumeId: row.volume_id,
      sourceOrder: row.sort_order,
      changed: row.volume_id !== volumeId || row.sort_order !== index ? 1 : 0,
    };
  });
  const now = isoNow();
  // Freeze the pre-update snapshot: validation must not see revisions changed by
  // this UPDATE itself. One guarded statement prevents partially applied moves.
  const [updated] = await batch([
    statement(
      `WITH requested AS MATERIALIZED (
         SELECT json_extract(value, '$.id') AS id, CAST(key AS INTEGER) AS position,
                json_extract(value, '$.revision') AS revision,
                json_extract(value, '$.sourceVolumeId') AS source_volume_id,
                json_extract(value, '$.sourceOrder') AS source_order,
                json_extract(value, '$.changed') AS changed
         FROM json_each(?)
       ), snapshot AS MATERIALIZED (
         SELECT id, volume_id, sort_order, revision FROM chapters
         WHERE work_id = ? AND deleted_at IS NULL
           AND (volume_id IS ? OR id IN (SELECT id FROM requested))
       ), valid AS MATERIALIZED (
         SELECT
           (SELECT COUNT(*) FROM snapshot s JOIN requested r ON s.id = r.id
             AND s.revision = r.revision AND s.volume_id IS r.source_volume_id
             AND s.sort_order = r.source_order) = ?
           AND NOT EXISTS (SELECT 1 FROM snapshot
             WHERE volume_id IS ? AND id NOT IN (SELECT id FROM requested))
           AND (? IS NULL OR EXISTS (SELECT 1 FROM volumes WHERE id = ? AND work_id = ?))
           AND EXISTS (SELECT 1 FROM works WHERE id = ? AND owner_id = ? AND status != 'archived') AS ok
       )
       UPDATE chapters SET
         volume_id = ?,
         sort_order = (SELECT position FROM requested WHERE requested.id = chapters.id),
         revision = revision + (SELECT changed FROM requested WHERE requested.id = chapters.id),
         updated_at = CASE WHEN (SELECT changed FROM requested WHERE requested.id = chapters.id) = 1
                          THEN ? ELSE updated_at END
       WHERE work_id = ? AND id IN (SELECT id FROM requested) AND (SELECT ok FROM valid)
       RETURNING id`,
      JSON.stringify(requested), workId, volumeId, chapterIds.length, volumeId,
      volumeId, volumeId, workId, workId, ownerId, volumeId, now, workId,
    ),
    statement(
      "UPDATE works SET updated_at = ? WHERE id = ? AND owner_id = ? AND changes() = ? AND ? = 1",
      now, workId, ownerId, chapterIds.length, requested.some((item) => item.changed) ? 1 : 0,
    ),
  ]);
  if (updated.results.length !== chapterIds.length) {
    conflict("章节或分卷在操作期间发生变化，请刷新后重试");
  }
  return listChapters(workId, ownerId, false);
}

export async function archiveChapter(chapterId: string, ownerId: string): Promise<void> {
  const current = await getChapterRow(chapterId, ownerId);
  const now = isoNow();
  await batch([
    statement(
      `INSERT INTO chapter_versions
       (id, chapter_id, kind, label, content, plain_text, word_count, source_revision, created_at)
       VALUES (?, ?, 'manual', '删除前快照', ?, ?, ?, ?, ?)`,
      newId(),
      chapterId,
      current.content,
      current.plain_text,
      current.word_count,
      current.revision,
      now,
    ),
    statement("UPDATE chapters SET deleted_at = ?, updated_at = ? WHERE id = ?", now, now, chapterId),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, current.work_id),
  ]);
}
