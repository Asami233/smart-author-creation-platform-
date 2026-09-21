import { z } from "zod";

const id = z.string().uuid();
const timestamp = z.string().min(1).max(64);
const shortText = (max: number) => z.string().max(max);

export const backupWorkSchema = z.object({
  id,
  title: shortText(120),
  description: shortText(2000),
  genre: shortText(60),
  status: z.enum(["draft", "completed", "archived"]),
  targetWords: z.number().int().min(0).max(20_000_000),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupVolumeSchema = z.object({
  id,
  workId: id,
  title: shortText(120),
  summary: shortText(10_000),
  sortOrder: z.number().int().min(0),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupChapterSchema = z.object({
  id,
  workId: id,
  volumeId: id.nullable(),
  title: shortText(160),
  summary: shortText(10_000),
  content: shortText(2_000_000),
  plainText: shortText(2_000_000),
  wordCount: z.number().int().min(0),
  status: z.enum(["draft", "completed"]),
  sortOrder: z.number().int().min(0),
  revision: z.number().int().min(1),
  deletedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupOutlineSchema = z.object({
  id,
  workId: id,
  scopeType: z.enum(["work", "volume", "chapter"]),
  scopeId: id.nullable(),
  title: shortText(160),
  content: shortText(200_000),
  sortOrder: z.number().int().min(0),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupCharacterSchema = z.object({
  id,
  workId: id,
  name: shortText(80),
  role: shortText(40),
  aliases: z.array(shortText(80)).max(30),
  description: shortText(50_000),
  personality: shortText(20_000),
  motivation: shortText(20_000),
  characterArc: shortText(50_000),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupWorldEntrySchema = z.object({
  id,
  workId: id,
  category: z.enum(["location", "faction", "system", "item", "custom"]),
  name: shortText(100),
  summary: shortText(10_000),
  content: shortText(100_000),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupTimelineEventSchema = z.object({
  id,
  workId: id,
  title: shortText(160),
  description: shortText(50_000),
  storyTime: shortText(160),
  sortOrder: z.number().int().min(0),
  relatedChapterId: id.nullable(),
  participantIds: z.array(id).max(100),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupChapterLinkSchema = z.object({
  chapterId: id,
  entityType: z.enum(["character", "world", "timeline", "outline"]),
  entityId: id,
  createdAt: timestamp,
});

export const backupChapterVersionSchema = z.object({
  id,
  chapterId: id,
  kind: z.enum(["auto", "manual", "restore"]),
  label: shortText(160),
  content: shortText(2_000_000),
  plainText: shortText(2_000_000),
  wordCount: z.number().int().min(0),
  sourceRevision: z.number().int().min(1),
  createdAt: timestamp,
});

export const backupWritingStatSchema = z.object({
  id,
  workId: id,
  statDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetWords: z.number().int().min(0).max(100_000),
  wordsWritten: z.number().int().min(0),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const backupDocumentSchema = z
  .object({
    format: z.literal("smart-author-backup"),
    schemaVersion: z.literal(1),
    appVersion: z.string().max(40),
    exportedAt: timestamp,
    data: z.object({
      works: z.array(backupWorkSchema).max(100),
      volumes: z.array(backupVolumeSchema).max(1_000),
      chapters: z.array(backupChapterSchema).max(2_000),
      outlines: z.array(backupOutlineSchema).max(2_000),
      characters: z.array(backupCharacterSchema).max(2_000),
      worldEntries: z.array(backupWorldEntrySchema).max(5_000),
      timelineEvents: z.array(backupTimelineEventSchema).max(5_000),
      chapterLinks: z.array(backupChapterLinkSchema).max(20_000),
      chapterVersions: z.array(backupChapterVersionSchema).max(10_000),
      writingDailyStats: z.array(backupWritingStatSchema).max(20_000),
      aiSettings: z
        .object({
          baseUrl: z.string().url().max(500),
          model: shortText(160),
          updatedAt: timestamp,
          apiKeyIncluded: z.literal(false),
        })
        .strict()
        .nullable(),
    }),
  })
  .strict();

export type BackupDocument = z.infer<typeof backupDocumentSchema>;

export type BackupSummary = {
  workCount: number;
  volumeCount: number;
  chapterCount: number;
  activeChapterCount: number;
  versionCount: number;
  knowledgeCount: number;
  totalWords: number;
};

export type BackupValidationResult = {
  valid: boolean;
  issues: string[];
  summary: BackupSummary | null;
};

export type BackupImportResult = {
  importedWorkIds: string[];
  summary: BackupSummary;
  warnings: string[];
};

export type TrashOverview = {
  works: Array<{
    id: string;
    title: string;
    genre: string;
    chapterCount: number;
    totalWords: number;
    archivedAt: string;
  }>;
  chapters: Array<{
    id: string;
    workId: string;
    workTitle: string;
    title: string;
    wordCount: number;
    deletedAt: string;
  }>;
};

export type StorageSummary = {
  activeWorks: number;
  archivedWorks: number;
  activeChapters: number;
  deletedChapters: number;
  versions: number;
  knowledgeEntries: number;
  totalWords: number;
  approximateTextBytes: number;
};
