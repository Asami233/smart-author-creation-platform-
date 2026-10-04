import { backupRestoreRequestSchema } from "@/contracts/data-safety";
import { MAX_BACKUP_BYTES, readBackupJson } from "@/server/backup-request";
import { assertSameOrigin } from "@/server/auth/runtime";
import { AppError } from "@/server/errors";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { restoreBackup } from "@/server/services/backup-restore";

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    const payload = await readBackupJson(request, MAX_BACKUP_BYTES + 64 * 1024);
    if (payload && typeof payload === "object" && "format" in payload) {
      throw new AppError(428, "BACKUP_PREFLIGHT_REQUIRED", "请先调用备份预检，再提交确认恢复请求");
    }
    return restoreBackup(await ownerIdForRequest(request), backupRestoreRequestSchema.parse(payload));
  }, 201);
}
