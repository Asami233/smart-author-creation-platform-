import { all, batch, first, statement } from "@/server/db";
import { AppError, conflict, notFound } from "@/server/errors";
import { countWords, htmlToPlainText, isoNow, newId } from "@/server/text";
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

function encodeVersionCursor(row: VersionRow): string {
  return btoa(`${row.created_at}|${row.id}`).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeVersionCursor(cursor: string): { createdAt: string; id: string } {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("invalid alphabet");
    const decoded = atob(cursor.replaceAll("-", "+").replaceAll("_", "/"));
    const [createdAt, id, extra] = decoded.split("|");
    if (extra !== undefined || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(createdAt)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("invalid cursor payload");
    }
    return { createdAt, id };
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "历史版本分页游标无效");
  }
}

export async function listVersions(
  chapterId: string,
  ownerId: string,
  input: { limit: number; cursor?: string },
) {
  await getChapterRow(chapterId, ownerId);
  const cursor = input.cursor ? decodeVersionCursor(input.cursor) : null;
  const rows = await all<VersionRow>(
    `SELECT id, chapter_id, kind, label, '' AS content, '' AS plain_text,
            word_count, source_revision, created_at
     FROM chapter_versions WHERE chapter_id = ?
       ${cursor ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    chapterId,
    ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []),
    input.limit + 1,
  );
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return {
    data: page.map((row) => mapVersion(row)),
    pagination: {
      hasMore,
      nextCursor: hasMore ? encodeVersionCursor(page[page.length - 1]) : null,
    },
  };
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

export async function restoreVersion(versionId: string, ownerId: string, expectedRevision?: number) {
  const version = await getVersion(versionId, ownerId);
  const current = await getChapterRow(version.chapterId, ownerId);
  if (expectedRevision !== undefined && expectedRevision !== current.revision) {
    conflict("章节已在其他位置更新，请刷新后再恢复历史版本", {
      expectedRevision,
      currentRevision: current.revision,
    });
  }
  const content = version.content ?? "";
  const plainText = htmlToPlainText(content);
  const wordCount = countWords(plainText);
  const now = isoNow();
  const saveId = newId();
  const statements = [
    statement(
      `UPDATE chapters SET content = ?, plain_text = ?, word_count = ?,
       revision = revision + 1, last_save_id = ?, updated_at = ?
       WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
      content,
      plainText,
      wordCount,
      saveId,
      now,
      current.id,
      current.revision,
    ),
    statement(
      `INSERT INTO chapter_versions
       (id, chapter_id, kind, label, content, plain_text, word_count, source_revision, created_at)
       SELECT ?, ?, 'restore', ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM chapters WHERE id = ? AND last_save_id = ?)`,
      newId(),
      current.id,
      `恢复 ${version.createdAt} 前的内容`,
      current.content,
      current.plain_text,
      current.word_count,
      current.revision,
      now,
      current.id,
      saveId,
    ),
    statement(
      `UPDATE works SET updated_at = ? WHERE id = ?
       AND EXISTS (SELECT 1 FROM chapters WHERE id = ? AND last_save_id = ?)`,
      now,
      current.work_id,
      current.id,
      saveId,
    ),
  ];
  // Restoring existing prose changes total words but is not new writing toward today's goal.
  const results = await batch(statements);
  if ((results[0]?.meta?.changes ?? 0) === 0) {
    conflict("章节恢复时发生版本冲突，请刷新后重试");
  }
  return getChapter(current.id, ownerId);
}
