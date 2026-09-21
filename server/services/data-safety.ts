import {
  backupDocumentSchema,
  type BackupDocument,
  type BackupImportResult,
  type BackupSummary,
  type BackupValidationResult,
  type StorageSummary,
  type TrashOverview,
} from "@/contracts/data-safety";
export { summarizeBackup, validateBackupPayload } from "@/server/data-safety-validation";
import { assertBackupReferences, summarizeBackup } from "@/server/data-safety-validation";
import { all, batch, first, run, statement } from "@/server/db";
import { AppError, conflict, notFound } from "@/server/errors";
import { countWords, htmlToPlainText, isoNow, newId, safeJsonParse } from "@/server/text";

type JsonRow = Record<string, unknown>;

function mapJsonArray(value: unknown): string[] {
  return safeJsonParse(String(value ?? "[]"), [] as string[]);
}

function mapJsonObject(value: unknown): Record<string, unknown> {
  return safeJsonParse(String(value ?? "{}"), {} as Record<string, unknown>);
}

export async function createFullBackup(ownerId: string): Promise<BackupDocument> {
  const works = await all<JsonRow>(
    `SELECT id, title, description, genre, status, target_words AS targetWords,
            created_at AS createdAt, updated_at AS updatedAt
     FROM works WHERE owner_id = ? ORDER BY created_at`,
    ownerId,
  );
  const volumes = await all<JsonRow>(
    `SELECT v.id, v.work_id AS workId, v.title, v.summary, v.sort_order AS sortOrder,
            v.created_at AS createdAt, v.updated_at AS updatedAt
     FROM volumes v JOIN works w ON w.id = v.work_id
     WHERE w.owner_id = ? ORDER BY v.work_id, v.sort_order`,
    ownerId,
  );
  const chapters = await all<JsonRow>(
    `SELECT c.id, c.work_id AS workId, c.volume_id AS volumeId, c.title, c.summary,
            c.content, c.plain_text AS plainText, c.word_count AS wordCount,
            c.status, c.sort_order AS sortOrder, c.revision, c.deleted_at AS deletedAt,
            c.created_at AS createdAt, c.updated_at AS updatedAt
     FROM chapters c JOIN works w ON w.id = c.work_id
     WHERE w.owner_id = ? ORDER BY c.work_id, c.sort_order`,
    ownerId,
  );
  const outlines = await all<JsonRow>(
    `SELECT o.id, o.work_id AS workId, o.scope_type AS scopeType, o.scope_id AS scopeId,
            o.title, o.content, o.sort_order AS sortOrder,
            o.created_at AS createdAt, o.updated_at AS updatedAt
     FROM outlines o JOIN works w ON w.id = o.work_id
     WHERE w.owner_id = ? ORDER BY o.work_id, o.sort_order`,
    ownerId,
  );
  const characterRows = await all<JsonRow>(
    `SELECT c.id, c.work_id AS workId, c.name, c.role, c.aliases_json AS aliasesJson,
            c.description, c.personality, c.motivation, c.character_arc AS characterArc,
            c.metadata_json AS metadataJson, c.created_at AS createdAt, c.updated_at AS updatedAt
     FROM characters c JOIN works w ON w.id = c.work_id
     WHERE w.owner_id = ? ORDER BY c.work_id, c.name`,
    ownerId,
  );
  const worldRows = await all<JsonRow>(
    `SELECT e.id, e.work_id AS workId, e.category, e.name, e.summary, e.content,
            e.metadata_json AS metadataJson, e.created_at AS createdAt, e.updated_at AS updatedAt
     FROM world_entries e JOIN works w ON w.id = e.work_id
     WHERE w.owner_id = ? ORDER BY e.work_id, e.category, e.name`,
    ownerId,
  );
  const timelineRows = await all<JsonRow>(
    `SELECT t.id, t.work_id AS workId, t.title, t.description, t.story_time AS storyTime,
            t.sort_order AS sortOrder, t.related_chapter_id AS relatedChapterId,
            t.participants_json AS participantsJson, t.created_at AS createdAt, t.updated_at AS updatedAt
     FROM timeline_events t JOIN works w ON w.id = t.work_id
     WHERE w.owner_id = ? ORDER BY t.work_id, t.sort_order`,
    ownerId,
  );
  const chapterLinks = await all<JsonRow>(
    `SELECT l.chapter_id AS chapterId, l.entity_type AS entityType,
            l.entity_id AS entityId, l.created_at AS createdAt
     FROM chapter_links l JOIN chapters c ON c.id = l.chapter_id JOIN works w ON w.id = c.work_id
     WHERE w.owner_id = ? ORDER BY l.created_at`,
    ownerId,
  );
  const chapterVersions = await all<JsonRow>(
    `SELECT v.id, v.chapter_id AS chapterId, v.kind, v.label, v.content,
            v.plain_text AS plainText, v.word_count AS wordCount,
            v.source_revision AS sourceRevision, v.created_at AS createdAt
     FROM chapter_versions v JOIN chapters c ON c.id = v.chapter_id JOIN works w ON w.id = c.work_id
     WHERE w.owner_id = ? ORDER BY v.created_at`,
    ownerId,
  );
  const writingDailyStats = await all<JsonRow>(
    `SELECT s.id, s.work_id AS workId, s.stat_date AS statDate,
            s.target_words AS targetWords, s.words_written AS wordsWritten,
            s.created_at AS createdAt, s.updated_at AS updatedAt
     FROM writing_daily_stats s JOIN works w ON w.id = s.work_id
     WHERE w.owner_id = ? ORDER BY s.stat_date`,
    ownerId,
  );
  const aiSettings = await first<{ baseUrl: string; model: string; updatedAt: string }>(
    `SELECT base_url AS baseUrl, model, updated_at AS updatedAt
     FROM ai_provider_configs WHERE owner_id = ?`,
    ownerId,
  );

  return backupDocumentSchema.parse({
    format: "smart-author-backup",
    schemaVersion: 1,
    appVersion: "0.1.0",
    exportedAt: isoNow(),
    data: {
      works,
      volumes,
      chapters,
      outlines,
      characters: characterRows.map(({ aliasesJson, metadataJson, ...row }) => ({
        ...row,
        aliases: mapJsonArray(aliasesJson),
        metadata: mapJsonObject(metadataJson),
      })),
      worldEntries: worldRows.map(({ metadataJson, ...row }) => ({
        ...row,
        metadata: mapJsonObject(metadataJson),
      })),
      timelineEvents: timelineRows.map(({ participantsJson, ...row }) => ({
        ...row,
        participantIds: mapJsonArray(participantsJson),
      })),
      chapterLinks,
      chapterVersions,
      writingDailyStats,
      aiSettings: aiSettings ? { ...aiSettings, apiKeyIncluded: false } : null,
    },
  });
}

const chunks = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

export async function importBackup(ownerId: string, payload: unknown): Promise<BackupImportResult> {
  const backup = backupDocumentSchema.parse(payload);
  assertBackupReferences(backup);

  const workIds = new Map(backup.data.works.map((item) => [item.id, newId()]));
  const volumeIds = new Map(backup.data.volumes.map((item) => [item.id, newId()]));
  const chapterIds = new Map(backup.data.chapters.map((item) => [item.id, newId()]));
  const outlineIds = new Map(backup.data.outlines.map((item) => [item.id, newId()]));
  const characterIds = new Map(backup.data.characters.map((item) => [item.id, newId()]));
  const worldIds = new Map(backup.data.worldEntries.map((item) => [item.id, newId()]));
  const timelineIds = new Map(backup.data.timelineEvents.map((item) => [item.id, newId()]));
  const importedWorkIds = [...workIds.values()];
  const statements: D1PreparedStatement[] = [];
  const mapped = (mapping: Map<string, string>, sourceId: string) => mapping.get(sourceId)!;

  for (const item of backup.data.works) {
    statements.push(statement(
      `INSERT INTO works (id, owner_id, title, description, genre, status, target_words, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mapped(workIds, item.id), ownerId, item.title, item.description, item.genre,
      item.status, item.targetWords, item.createdAt, item.updatedAt,
    ));
  }
  for (const item of backup.data.volumes) {
    statements.push(statement(
      `INSERT INTO volumes (id, work_id, title, summary, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      mapped(volumeIds, item.id), mapped(workIds, item.workId), item.title, item.summary,
      item.sortOrder, item.createdAt, item.updatedAt,
    ));
  }
  for (const item of backup.data.chapters) {
    const plainText = htmlToPlainText(item.content);
    statements.push(statement(
      `INSERT INTO chapters
       (id, work_id, volume_id, title, summary, content, plain_text, word_count, status,
        sort_order, revision, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mapped(chapterIds, item.id), mapped(workIds, item.workId),
      item.volumeId ? mapped(volumeIds, item.volumeId) : null, item.title, item.summary,
      item.content, plainText, countWords(plainText), item.status, item.sortOrder,
      item.revision, item.deletedAt, item.createdAt, item.updatedAt,
    ));
  }
  for (const item of backup.data.outlines) {
    const scopeId = item.scopeId
      ? item.scopeType === "volume"
        ? volumeIds.get(item.scopeId) ?? null
        : item.scopeType === "chapter"
          ? chapterIds.get(item.scopeId) ?? null
          : null
      : null;
    statements.push(statement(
      `INSERT INTO outlines
       (id, work_id, scope_type, scope_id, title, content, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mapped(outlineIds, item.id), mapped(workIds, item.workId), item.scopeType, scopeId,
      item.title, item.content, item.sortOrder, item.createdAt, item.updatedAt,
    ));
  }
  for (const item of backup.data.characters) {
    statements.push(statement(
      `INSERT INTO characters
       (id, work_id, name, role, aliases_json, description, personality, motivation,
        character_arc, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mapped(characterIds, item.id), mapped(workIds, item.workId), item.name, item.role,
      JSON.stringify(item.aliases), item.description, item.personality, item.motivation,
      item.characterArc, JSON.stringify(item.metadata), item.createdAt, item.updatedAt,
    ));
  }
  for (const item of backup.data.worldEntries) {
    statements.push(statement(
      `INSERT INTO world_entries
       (id, work_id, category, name, summary, content, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mapped(worldIds, item.id), mapped(workIds, item.workId), item.category, item.name,
      item.summary, item.content, JSON.stringify(item.metadata), item.createdAt, item.updatedAt,
    ));
  }
  for (const item of backup.data.timelineEvents) {
    statements.push(statement(
      `INSERT INTO timeline_events
       (id, work_id, title, description, story_time, sort_order, related_chapter_id,
        participants_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mapped(timelineIds, item.id), mapped(workIds, item.workId), item.title, item.description,
      item.storyTime, item.sortOrder,
      item.relatedChapterId ? chapterIds.get(item.relatedChapterId) ?? null : null,
      JSON.stringify(item.participantIds.flatMap((id) => characterIds.get(id) ?? [])),
      item.createdAt, item.updatedAt,
    ));
  }
  for (const item of backup.data.chapterLinks) {
    const entityId =
      item.entityType === "outline"
        ? mapped(outlineIds, item.entityId)
        : item.entityType === "character"
          ? mapped(characterIds, item.entityId)
          : item.entityType === "world"
            ? mapped(worldIds, item.entityId)
            : mapped(timelineIds, item.entityId);
    statements.push(statement(
      `INSERT INTO chapter_links (chapter_id, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?)`,
      mapped(chapterIds, item.chapterId), item.entityType, entityId, item.createdAt,
    ));
  }
  for (const item of backup.data.chapterVersions) {
    const plainText = htmlToPlainText(item.content);
    statements.push(statement(
      `INSERT INTO chapter_versions
       (id, chapter_id, kind, label, content, plain_text, word_count, source_revision, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(), mapped(chapterIds, item.chapterId), item.kind, item.label, item.content,
      plainText, countWords(plainText), item.sourceRevision, item.createdAt,
    ));
  }
  for (const item of backup.data.writingDailyStats) {
    statements.push(statement(
      `INSERT INTO writing_daily_stats
       (id, work_id, stat_date, target_words, words_written, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(), mapped(workIds, item.workId), item.statDate, item.targetWords,
      item.wordsWritten, item.createdAt, item.updatedAt,
    ));
  }

  try {
    for (const group of chunks(statements, 75)) await batch(group);
  } catch {
    for (const group of chunks(importedWorkIds, 75)) {
      await batch(group.map((id) => statement("DELETE FROM works WHERE id = ? AND owner_id = ?", id, ownerId)));
    }
    throw new AppError(400, "BACKUP_IMPORT_FAILED", "备份导入失败，已回滚本次新增的数据");
  }

  return {
    importedWorkIds,
    summary: summarizeBackup(backup),
    warnings: backup.data.aiSettings
      ? ["出于安全原因，备份不包含 API Key；AI 模型配置需要重新填写密钥。"]
      : [],
  };
}

export async function getTrashOverview(ownerId: string): Promise<TrashOverview> {
  const works = await all<TrashOverview["works"][number]>(
    `SELECT w.id, w.title, w.genre, COUNT(c.id) AS chapterCount,
            COALESCE(SUM(CASE WHEN c.deleted_at IS NULL THEN c.word_count ELSE 0 END), 0) AS totalWords,
            w.updated_at AS archivedAt
     FROM works w LEFT JOIN chapters c ON c.work_id = w.id
     WHERE w.owner_id = ? AND w.status = 'archived'
     GROUP BY w.id ORDER BY w.updated_at DESC`,
    ownerId,
  );
  const chapters = await all<TrashOverview["chapters"][number]>(
    `SELECT c.id, c.work_id AS workId, w.title AS workTitle, c.title,
            c.word_count AS wordCount, c.deleted_at AS deletedAt
     FROM chapters c JOIN works w ON w.id = c.work_id
     WHERE w.owner_id = ? AND w.status != 'archived' AND c.deleted_at IS NOT NULL
     ORDER BY c.deleted_at DESC`,
    ownerId,
  );
  return { works, chapters };
}

export async function restoreArchivedWork(workId: string, ownerId: string) {
  const work = await first<{ id: string; status: string }>(
    "SELECT id, status FROM works WHERE id = ? AND owner_id = ?",
    workId,
    ownerId,
  );
  if (!work) notFound("作品");
  if (work.status !== "archived") conflict("作品不在回收站中");
  await run("UPDATE works SET status = 'draft', updated_at = ? WHERE id = ?", isoNow(), workId);
  return { id: workId, restored: true };
}

export async function restoreDeletedChapter(chapterId: string, ownerId: string) {
  const chapter = await first<{ id: string; workId: string; deletedAt: string | null; workStatus: string }>(
    `SELECT c.id, c.work_id AS workId, c.deleted_at AS deletedAt, w.status AS workStatus
     FROM chapters c JOIN works w ON w.id = c.work_id
     WHERE c.id = ? AND w.owner_id = ?`,
    chapterId,
    ownerId,
  );
  if (!chapter) notFound("章节");
  if (!chapter.deletedAt) conflict("章节不在回收站中");
  if (chapter.workStatus === "archived") conflict("请先恢复章节所属作品");
  const now = isoNow();
  await batch([
    statement(
      "UPDATE chapters SET deleted_at = NULL, revision = revision + 1, updated_at = ? WHERE id = ?",
      now,
      chapterId,
    ),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, chapter.workId),
  ]);
  return { id: chapterId, workId: chapter.workId, restored: true };
}

export async function getStorageSummary(ownerId: string): Promise<StorageSummary> {
  const row = await first<Record<string, number>>(
    `SELECT
       (SELECT COUNT(*) FROM works WHERE owner_id = ? AND status != 'archived') AS activeWorks,
       (SELECT COUNT(*) FROM works WHERE owner_id = ? AND status = 'archived') AS archivedWorks,
       (SELECT COUNT(*) FROM chapters c JOIN works w ON w.id = c.work_id
        WHERE w.owner_id = ? AND c.deleted_at IS NULL) AS activeChapters,
       (SELECT COUNT(*) FROM chapters c JOIN works w ON w.id = c.work_id
        WHERE w.owner_id = ? AND c.deleted_at IS NOT NULL) AS deletedChapters,
       (SELECT COUNT(*) FROM chapter_versions v JOIN chapters c ON c.id = v.chapter_id
        JOIN works w ON w.id = c.work_id WHERE w.owner_id = ?) AS versions,
       ((SELECT COUNT(*) FROM outlines o JOIN works w ON w.id = o.work_id WHERE w.owner_id = ?) +
        (SELECT COUNT(*) FROM characters c JOIN works w ON w.id = c.work_id WHERE w.owner_id = ?) +
        (SELECT COUNT(*) FROM world_entries e JOIN works w ON w.id = e.work_id WHERE w.owner_id = ?) +
        (SELECT COUNT(*) FROM timeline_events t JOIN works w ON w.id = t.work_id WHERE w.owner_id = ?)) AS knowledgeEntries,
       (SELECT COALESCE(SUM(c.word_count), 0) FROM chapters c JOIN works w ON w.id = c.work_id
        WHERE w.owner_id = ? AND c.deleted_at IS NULL) AS totalWords,
       ((SELECT COALESCE(SUM(LENGTH(c.content) + LENGTH(c.summary) + LENGTH(c.title)), 0)
         FROM chapters c JOIN works w ON w.id = c.work_id WHERE w.owner_id = ?) +
        (SELECT COALESCE(SUM(LENGTH(v.content) + LENGTH(v.label)), 0)
         FROM chapter_versions v JOIN chapters c ON c.id = v.chapter_id
         JOIN works w ON w.id = c.work_id WHERE w.owner_id = ?)) * 2 AS approximateTextBytes`,
    ...Array(12).fill(ownerId),
  );
  return {
    activeWorks: Number(row?.activeWorks ?? 0),
    archivedWorks: Number(row?.archivedWorks ?? 0),
    activeChapters: Number(row?.activeChapters ?? 0),
    deletedChapters: Number(row?.deletedChapters ?? 0),
    versions: Number(row?.versions ?? 0),
    knowledgeEntries: Number(row?.knowledgeEntries ?? 0),
    totalWords: Number(row?.totalWords ?? 0),
    approximateTextBytes: Number(row?.approximateTextBytes ?? 0),
  };
}
