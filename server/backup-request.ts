import { AppError } from "./errors";

export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export async function readBackupJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BACKUP_BYTES) {
    throw new AppError(413, "BACKUP_TOO_LARGE", "备份文件不能超过 25 MB");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new AppError(413, "BACKUP_TOO_LARGE", "备份文件不能超过 25 MB");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(400, "INVALID_BACKUP_JSON", "备份文件不是有效的 JSON");
  }
}
