import { all, batch, first, statement } from "@/server/db";
import { notFound } from "@/server/errors";
import { countWords, htmlToPlainText, isoNow, localDateKey, newId } from "@/server/text";
import { getChapter, getChapterRow } from "./chapters";

type VersionRow = {
  id: string;
  chapter_id: string;
  kind: string;
  label: string;
  content: string;
  plain_text: string;
  word_count: number;
  source_revision: number;
  created_at: string;
};

function mapVersion(row: VersionRow, includeContent = false) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    kind: row.kind,
    label: row.label,
    ...(includeContent ? { content: row.content, plainText: row.plain_text } : {}),
    wordCount: row.word_count,
    sourceRevision: row.source_revision,
    createdAt: row.created_at,
  };
}

export async function listVersions(chapterId: string, ownerId: string) {
  await getChapterRow(chapterId, ownerId);
  const rows = await all<VersionRow>(
    `SELECT id, chapter_id, kind, label, '' AS content, '' AS plain_text,
            word_count, source_revision, created_at
     FROM chapter_versions WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 200`,
    chapterId,
  );
  return rows.map((row) => mapVersion(row));
}

export async function getVersion(versionId: string, ownerId: string) {
  const row = await first<VersionRow>(
    `SELECT v.id, v.chapter_id, v.kind, v.label, v.content, v.plain_text,
            v.word_count, v.source_revision, v.created_at
     FROM chapter_versions v
     JOIN chapters c ON c.id = v.chapter_id
     JOIN works w ON w.id = c.work_id
     WHERE v.id = ? AND w.owner_id = ?`,
    versionId,
    ownerId,
  );
  if (!row) notFound("历史版本");
  return mapVersion(row, true);
}

export async function createManualVersion(chapterId: string, ownerId: string, label: string) {
  const chapter = await getChapterRow(chapterId, ownerId);
  const id = newId();
  await statement(
    `INSERT INTO chapter_versions
     (id, chapter_id, kind, label, content, plain_text, word_count, source_revision, created_at)
     VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?)`,
    id,
    chapterId,
    label,
    chapter.content,
    chapter.plain_text,
    chapter.word_count,
    chapter.revision,
    isoNow(),
  ).run();
  return getVersion(id, ownerId);
}

export async function restoreVersion(versionId: string, ownerId: string) {
  const version = await getVersion(versionId, ownerId);
  const current = await getChapterRow(version.chapterId, ownerId);
  const content = version.content ?? "";
  const plainText = htmlToPlainText(content);
  const wordCount = countWords(plainText);
  const now = isoNow();
  const statements = [
    statement(
      `INSERT INTO chapter_versions
       (id, chapter_id, kind, label, content, plain_text, word_count, source_revision, created_at)
       VALUES (?, ?, 'restore', ?, ?, ?, ?, ?, ?)`,
      newId(),
      current.id,
      `恢复 ${version.createdAt} 前的内容`,
      current.content,
      current.plain_text,
      current.word_count,
      current.revision,
      now,
    ),
    statement(
      `UPDATE chapters SET content = ?, plain_text = ?, word_count = ?,
       revision = revision + 1, updated_at = ? WHERE id = ?`,
      content,
      plainText,
      wordCount,
      now,
      current.id,
    ),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, current.work_id),
  ];
  const positiveDelta = Math.max(0, wordCount - current.word_count);
  if (positiveDelta > 0) {
    statements.push(
      statement(
        `INSERT INTO writing_daily_stats
         (id, work_id, stat_date, target_words, words_written, created_at, updated_at)
         VALUES (?, ?, ?, 3000, ?, ?, ?)
         ON CONFLICT(work_id, stat_date) DO UPDATE SET
           words_written = words_written + excluded.words_written,
           updated_at = excluded.updated_at`,
        newId(),
        current.work_id,
        localDateKey(),
        positiveDelta,
        now,
        now,
      ),
    );
  }
  await batch(statements);
  return getChapter(current.id, ownerId);
}
