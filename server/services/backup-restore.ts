import {
  BACKUP_RESTORE_MODE,
  backupDocumentSchema,
  type BackupDocument,
  type BackupImportPreflightResult,
  type BackupImportResult,
} from "@/contracts/data-safety";
import { getAuthSecret } from "@/server/auth/runtime";
import {
  backupSnapshotHash,
  createBackupPreviewToken,
  findBackupTitleConflicts,
  verifyBackupPreviewToken,
} from "@/server/backup-restore";
import { all, batch, first, run, statement } from "@/server/db";
import { AppError } from "@/server/errors";
import { safeJsonParse, isoNow, newId } from "@/server/text";
import { assertBackupReferences, summarizeBackup } from "@/server/data-safety-validation";
import { createBackupImportPlan, importBackup } from "./data-safety";

type ImportJob = {
  id: string;
  status: string;
  importedWorkIdsJson: string;
  updatedAt: string;
};

const STALE_IMPORT_MS = 5 * 60 * 1000;

function restoreWarnings(backup: BackupDocument, titleConflictCount: number): string[] {
  const warnings: string[] = [];
  if (titleConflictCount > 0) warnings.push(`有 ${titleConflictCount} 部备份作品与现有作品同名；将创建独立副本，不会覆盖。`);
  if (backup.data.works.some((work) => work.status === "archived")) warnings.push("备份中包含归档作品；恢复后仍保持归档状态。");
  if (backup.data.chapters.some((chapter) => chapter.deletedAt)) warnings.push("备份中包含回收站章节；恢复后仍保持已删除状态。");
  if (backup.data.aiSettings) warnings.push("备份不包含 AI API Key；恢复后需要重新配置密钥。");
  return warnings;
}

async function existingJob(ownerId: string, snapshotHash: string): Promise<ImportJob | null> {
  return first<ImportJob>(
    `SELECT id, status, imported_work_ids_json AS importedWorkIdsJson, updated_at AS updatedAt
     FROM backup_import_jobs WHERE owner_id = ? AND snapshot_hash = ?`,
    ownerId,
    snapshotHash,
  );
}

async function cleanupPlannedWorks(ownerId: string, ids: string[]): Promise<void> {
  for (let index = 0; index < ids.length; index += 75) {
    await batch(ids.slice(index, index + 75).map((id) => statement(
      "DELETE FROM works WHERE id = ? AND owner_id = ?",
      id,
      ownerId,
    )));
  }
}

export async function preflightBackupRestore(ownerId: string, payload: unknown): Promise<BackupImportPreflightResult> {
  const backup = backupDocumentSchema.parse(payload);
  assertBackupReferences(backup);
  const snapshotHash = await backupSnapshotHash(backup);
  const existingWorks = await all<{ id: string; title: string; status: string }>(
    "SELECT id, title, status FROM works WHERE owner_id = ? ORDER BY updated_at DESC",
    ownerId,
  );
  const titleConflicts = findBackupTitleConflicts(backup, existingWorks);
  const job = await existingJob(ownerId, snapshotHash);
  const warnings = restoreWarnings(backup, titleConflicts.length);
  if (job?.status === "completed") warnings.unshift("这份备份已经恢复过；再次确认只会返回上次结果，不会重复创建作品。");
  if (job?.status === "importing") warnings.unshift("这份备份已有恢复任务正在处理；请稍后重试。");
  const preview = await createBackupPreviewToken(getAuthSecret(), ownerId, snapshotHash);
  return {
    valid: true,
    mode: BACKUP_RESTORE_MODE,
    snapshotHash,
    previewToken: preview.token,
    expiresAt: preview.expiresAt,
    summary: summarizeBackup(backup),
    existingWorkCount: existingWorks.length,
    titleConflicts,
    warnings,
    alreadyImported: job?.status === "completed",
  };
}

function completedResult(job: ImportJob, backup: BackupDocument): BackupImportResult {
  return {
    importId: job.id,
    importedWorkIds: safeJsonParse(job.importedWorkIdsJson, [] as string[]),
    summary: summarizeBackup(backup),
    warnings: restoreWarnings(backup, 0),
    mode: BACKUP_RESTORE_MODE,
    alreadyImported: true,
  };
}

export async function restoreBackup(
  ownerId: string,
  input: { backup: BackupDocument; previewToken: string; mode: typeof BACKUP_RESTORE_MODE; confirm: true },
): Promise<BackupImportResult> {
  const backup = backupDocumentSchema.parse(input.backup);
  assertBackupReferences(backup);
  const snapshotHash = await backupSnapshotHash(backup);
  if (!(await verifyBackupPreviewToken(input.previewToken, getAuthSecret(), ownerId, snapshotHash))) {
    throw new AppError(412, "BACKUP_PREFLIGHT_REQUIRED", "预检凭据无效或已过期，请重新检查备份");
  }

  let job = await existingJob(ownerId, snapshotHash);
  if (job?.status === "completed") return completedResult(job, backup);
  if (job?.status === "importing") {
    const updatedAt = new Date(job.updatedAt).getTime();
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_IMPORT_MS) {
      throw new AppError(409, "BACKUP_IMPORT_IN_PROGRESS", "这份备份正在恢复，请稍后重试");
    }
    await cleanupPlannedWorks(ownerId, safeJsonParse(job.importedWorkIdsJson, [] as string[]));
    await run("DELETE FROM backup_import_jobs WHERE id = ? AND owner_id = ? AND status = 'importing'", job.id, ownerId);
    job = null;
  }

  const plan = createBackupImportPlan(backup);
  const importedWorkIds = [...plan.workIds.values()];
  const importId = newId();
  const now = isoNow();
  const claimed = await first<{ id: string }>(
    `INSERT INTO backup_import_jobs
       (id, owner_id, snapshot_hash, status, imported_work_ids_json, source_exported_at, created_at, updated_at)
     VALUES (?, ?, ?, 'importing', ?, ?, ?, ?)
     ON CONFLICT(owner_id, snapshot_hash) DO NOTHING RETURNING id`,
    importId,
    ownerId,
    snapshotHash,
    JSON.stringify(importedWorkIds),
    backup.exportedAt,
    now,
    now,
  );
  if (!claimed) {
    const raced = await existingJob(ownerId, snapshotHash);
    if (raced?.status === "completed") return completedResult(raced, backup);
    throw new AppError(409, "BACKUP_IMPORT_IN_PROGRESS", "这份备份正在恢复，请稍后重试");
  }

  try {
    const result = await importBackup(ownerId, backup, plan);
    const completedAt = isoNow();
    await run(
      `UPDATE backup_import_jobs SET status = 'completed', completed_at = ?, updated_at = ?
       WHERE id = ? AND owner_id = ? AND status = 'importing'`,
      completedAt,
      completedAt,
      importId,
      ownerId,
    );
    return {
      importId,
      ...result,
      mode: BACKUP_RESTORE_MODE,
      alreadyImported: false,
    };
  } catch (error) {
    await cleanupPlannedWorks(ownerId, importedWorkIds);
    await run("DELETE FROM backup_import_jobs WHERE id = ? AND owner_id = ?", importId, ownerId);
    throw error;
  }
}
