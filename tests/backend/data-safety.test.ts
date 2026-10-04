import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BACKUP_RESTORE_MODE,
  backupDocumentSchema,
  backupRestoreRequestSchema,
} from "../../contracts/data-safety";
import {
  backupSnapshotHash,
  createBackupPreviewToken,
  findBackupTitleConflicts,
  verifyBackupPreviewToken,
} from "../../server/backup-restore";
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
  it("treats chapters in older v1 backups as HTML format version 1", () => {
    assert.equal(backup.data.chapters[0].contentFormatVersion, 1);
    const unknownFormat = structuredClone(backup);
    (unknownFormat.data.chapters[0] as { contentFormatVersion: number }).contentFormatVersion = 2;
    assert.equal(backupDocumentSchema.safeParse(unknownFormat).success, false);
  });

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

  it("binds a restore preview to the account, backup content and expiry", async () => {
    const secret = "r".repeat(32);
    const snapshotHash = await backupSnapshotHash(backup);
    const nowMs = 1_800_000_000_000;
    const preview = await createBackupPreviewToken(secret, "account-a", snapshotHash, nowMs);
    assert.equal(await verifyBackupPreviewToken(preview.token, secret, "account-a", snapshotHash, nowMs), true);
    assert.equal(await verifyBackupPreviewToken(preview.token, secret, "account-b", snapshotHash, nowMs), false);
    assert.equal(await verifyBackupPreviewToken(preview.token, secret, "account-a", "different", nowMs), false);
    assert.equal(await verifyBackupPreviewToken(preview.token, secret, "account-a", snapshotHash, nowMs + 30 * 60 * 1000 + 1), false);
  });

  it("requires explicit merge-copy confirmation and finds normalized title conflicts", async () => {
    const preview = await createBackupPreviewToken("r".repeat(32), "account-a", await backupSnapshotHash(backup));
    assert.equal(backupRestoreRequestSchema.safeParse({
      backup, previewToken: preview.token, mode: BACKUP_RESTORE_MODE, confirm: true,
    }).success, true);
    assert.equal(backupRestoreRequestSchema.safeParse({
      backup, previewToken: preview.token, mode: BACKUP_RESTORE_MODE, confirm: false,
    }).success, false);
    const conflicts = findBackupTitleConflicts(backup, [
      { id: "existing", title: "  长夜行 ", status: "draft" },
      { id: "other", title: "另一部作品", status: "completed" },
    ]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].existingWorks[0].id, "existing");

    const spacedBackup = backupDocumentSchema.parse({
      ...backup,
      data: {
        ...backup.data,
        works: [{ ...backup.data.works[0], title: "长 夜 行" }],
      },
    });
    assert.equal(findBackupTitleConflicts(spacedBackup, [
      { id: "spaced", title: "长   夜\t行", status: "draft" },
    ]).length, 1);
  });
});
