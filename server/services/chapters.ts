import type { CreateChapterInput, UpdateChapterInput } from "@/contracts";
import { all, batch, first, statement } from "@/server/db";
import { conflict, notFound } from "@/server/errors";
import { countWords, htmlToPlainText, isoNow, localDateKey, newId } from "@/server/text";
import { assertWorkOwned } from "./works";

type ChapterRow = {
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
  created_at: string;
  updated_at: string;
};

function mapChapter(row: ChapterRow) {
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
            c.word_count, c.status, c.sort_order, c.revision, c.created_at, c.updated_at
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
            word_count, status, sort_order, revision, created_at, updated_at
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
        status, sort_order, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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

  if (contentChanged && (await shouldSnapshot(current, nextWordCount))) {
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

  const columns = ["updated_at = ?", "last_save_id = ?", "revision = revision + 1"];
  const values: unknown[] = [now, saveId];
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
  statements.unshift(
    statement(
      `UPDATE chapters SET ${columns.join(", ")} WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
      ...values,
      chapterId,
      current.revision,
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
  if ((updateResult?.meta?.changes ?? 0) === 0) {
    conflict("章节更新发生冲突，请刷新后重试");
  }
  return getChapter(chapterId, ownerId);
}

export async function reorderChapters(
  workId: string,
  ownerId: string,
  volumeId: string | null,
  chapterIds: string[],
) {
  await assertWorkOwned(workId, ownerId);
  await assertVolumeInWork(volumeId, workId);
  const placeholders = chapterIds.map(() => "?").join(",");
  const rows = await all<{ id: string }>(
    `SELECT id FROM chapters WHERE work_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    workId,
    ...chapterIds,
  );
  if (rows.length !== chapterIds.length || new Set(chapterIds).size !== chapterIds.length) {
    conflict("章节排序列表包含无效或重复的章节");
  }
  const now = isoNow();
  await batch([
    ...chapterIds.map((id, index) =>
      statement(
        "UPDATE chapters SET volume_id = ?, sort_order = ?, updated_at = ?, revision = revision + 1 WHERE id = ?",
        volumeId,
        index,
        now,
        id,
      ),
    ),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, workId),
  ]);
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
