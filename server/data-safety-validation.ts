import {
  backupDocumentSchema,
  type BackupDocument,
  type BackupSummary,
  type BackupValidationResult,
} from "@/contracts/data-safety";
import { AppError } from "@/server/errors";

export function summarizeBackup(backup: BackupDocument): BackupSummary {
  return {
    workCount: backup.data.works.length,
    volumeCount: backup.data.volumes.length,
    chapterCount: backup.data.chapters.length,
    activeChapterCount: backup.data.chapters.filter((chapter) => !chapter.deletedAt).length,
    versionCount: backup.data.chapterVersions.length,
    knowledgeCount:
      backup.data.outlines.length +
      backup.data.characters.length +
      backup.data.worldEntries.length +
      backup.data.timelineEvents.length,
    totalWords: backup.data.chapters
      .filter((chapter) => !chapter.deletedAt)
      .reduce((sum, chapter) => sum + chapter.wordCount, 0),
  };
}

export function backupReferenceIssues(backup: BackupDocument): string[] {
  const issues: string[] = [];
  const unique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) issues.push(`${label}包含重复 ID`);
  };

  unique("作品", backup.data.works.map((item) => item.id));
  unique("分卷", backup.data.volumes.map((item) => item.id));
  unique("章节", backup.data.chapters.map((item) => item.id));
  unique("大纲", backup.data.outlines.map((item) => item.id));
  unique("角色", backup.data.characters.map((item) => item.id));
  unique("世界观", backup.data.worldEntries.map((item) => item.id));
  unique("时间线", backup.data.timelineEvents.map((item) => item.id));
  unique("历史版本", backup.data.chapterVersions.map((item) => item.id));

  const works = new Set(backup.data.works.map((item) => item.id));
  const volumes = new Map(backup.data.volumes.map((item) => [item.id, item.workId]));
  const chapters = new Map(backup.data.chapters.map((item) => [item.id, item.workId]));
  const outlines = new Map(backup.data.outlines.map((item) => [item.id, item.workId]));
  const characters = new Map(backup.data.characters.map((item) => [item.id, item.workId]));
  const worldEntries = new Map(backup.data.worldEntries.map((item) => [item.id, item.workId]));
  const timelineEvents = new Map(backup.data.timelineEvents.map((item) => [item.id, item.workId]));

  for (const volume of backup.data.volumes) {
    if (!works.has(volume.workId)) issues.push(`分卷 ${volume.title} 引用了不存在的作品`);
  }
  for (const chapter of backup.data.chapters) {
    if (!works.has(chapter.workId)) issues.push(`章节 ${chapter.title} 引用了不存在的作品`);
    if (chapter.volumeId && volumes.get(chapter.volumeId) !== chapter.workId) {
      issues.push(`章节 ${chapter.title} 引用了其他作品的分卷`);
    }
  }
  for (const outline of backup.data.outlines) {
    if (outline.scopeType === "volume" && (!outline.scopeId || volumes.get(outline.scopeId) !== outline.workId)) {
      issues.push(`大纲 ${outline.title} 引用了无效分卷`);
    }
    if (outline.scopeType === "chapter" && (!outline.scopeId || chapters.get(outline.scopeId) !== outline.workId)) {
      issues.push(`大纲 ${outline.title} 引用了无效章节`);
    }
  }
  for (const item of [
    ...backup.data.outlines,
    ...backup.data.characters,
    ...backup.data.worldEntries,
    ...backup.data.timelineEvents,
    ...backup.data.writingDailyStats,
  ]) {
    if (!works.has(item.workId)) issues.push(`备份条目 ${item.id} 引用了不存在的作品`);
  }
  for (const version of backup.data.chapterVersions) {
    if (!chapters.has(version.chapterId)) issues.push(`历史版本 ${version.id} 引用了不存在的章节`);
  }
  for (const event of backup.data.timelineEvents) {
    if (event.relatedChapterId && chapters.get(event.relatedChapterId) !== event.workId) {
      issues.push(`时间线 ${event.title} 引用了其他作品的章节`);
    }
    for (const participantId of event.participantIds) {
      if (characters.get(participantId) !== event.workId) {
        issues.push(`时间线 ${event.title} 引用了其他作品的角色`);
      }
    }
  }
  const statKeys = backup.data.writingDailyStats.map((item) => `${item.workId}:${item.statDate}`);
  if (new Set(statKeys).size !== statKeys.length) issues.push("写作统计包含重复的作品日期");
  const linkKeys = backup.data.chapterLinks.map(
    (item) => `${item.chapterId}:${item.entityType}:${item.entityId}`,
  );
  if (new Set(linkKeys).size !== linkKeys.length) issues.push("章节关联包含重复条目");
  for (const link of backup.data.chapterLinks) {
    const workId = chapters.get(link.chapterId);
    const entityWorkId =
      link.entityType === "outline"
        ? outlines.get(link.entityId)
        : link.entityType === "character"
          ? characters.get(link.entityId)
          : link.entityType === "world"
            ? worldEntries.get(link.entityId)
            : timelineEvents.get(link.entityId);
    if (!workId || entityWorkId !== workId) issues.push(`章节关联 ${link.chapterId}/${link.entityId} 无效`);
  }
  return [...new Set(issues)].slice(0, 100);
}

export function assertBackupReferences(backup: BackupDocument): void {
  const issues = backupReferenceIssues(backup);
  if (issues.length) throw new AppError(400, "INVALID_BACKUP_REFERENCES", "备份内部关联不完整", issues);
}

export function validateBackupPayload(payload: unknown): BackupValidationResult {
  const parsed = backupDocumentSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.slice(0, 100).map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      summary: null,
    };
  }
  const issues = backupReferenceIssues(parsed.data);
  return { valid: issues.length === 0, issues, summary: summarizeBackup(parsed.data) };
}
