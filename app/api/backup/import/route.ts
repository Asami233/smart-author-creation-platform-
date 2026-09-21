import { readBackupJson } from "@/server/backup-request";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { importBackup } from "@/server/services/data-safety";

export async function POST(request: Request) {
  return api(async () => importBackup(ownerIdForRequest(request), await readBackupJson(request)), 201);
}
