import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backupDocumentSchema } from "../../contracts/data-safety";
import { summarizeBackup, validateBackupPayload } from "../../server/data-safety-validation";

const workId = "00000000-0000-4000-8000-000000000001";
const chapterId = "00000000-0000-4000-8000-000000000002";
const now = "2026-09-21T10:00:00.000Z";

const backup = backupDocumentSchema.parse({
  format: "smart-author-backup",
  schemaVersion: 1,
  appVersion: "0.1.0",
  exportedAt: now,
  data: {
    works: [{ id: workId, title: "长夜行", description: "", genre: "仙侠", status: "draft", targetWords: 1000000, createdAt: now, updatedAt: now }],
    volumes: [],
    chapters: [{ id: chapterId, workId, volumeId: null, title: "第一章", summary: "", content: "<p>雨夜来客</p>", plainText: "雨夜来客", wordCount: 4, status: "draft", sortOrder: 0, revision: 1, deletedAt: null, createdAt: now, updatedAt: now }],
    outlines: [], characters: [], worldEntries: [], timelineEvents: [], chapterLinks: [], chapterVersions: [], writingDailyStats: [], aiSettings: null,
  },
});

describe("data safety contracts", () => {
  it("summarizes a valid backup", () => {
    assert.deepEqual(summarizeBackup(backup), {
      workCount: 1, volumeCount: 0, chapterCount: 1, activeChapterCount: 1,
      versionCount: 0, knowledgeCount: 0, totalWords: 4,
    });
    assert.equal(validateBackupPayload(backup).valid, true);
  });

  it("rejects missing references", () => {
    const broken = structuredClone(backup);
    broken.data.chapters[0].workId = "00000000-0000-4000-8000-000000000099";
    const result = validateBackupPayload(broken);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.includes("不存在的作品")));
  });

  it("does not allow a backup to contain an API key", () => {
    const unsafe = structuredClone(backup) as unknown as Record<string, unknown>;
    const data = (unsafe.data ?? {}) as Record<string, unknown>;
    data.aiSettings = { baseUrl: "https://api.example.com/v1", model: "model", updatedAt: now, apiKeyIncluded: false, apiKey: "secret" };
    assert.equal(backupDocumentSchema.safeParse(unsafe).success, false);
  });
});
