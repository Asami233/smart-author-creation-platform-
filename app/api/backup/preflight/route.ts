import { readBackupJson } from "@/server/backup-request";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { preflightBackupRestore } from "@/server/services/backup-restore";

export async function POST(request: Request) {
  return api(async () => preflightBackupRestore(
    await ownerIdForRequest(request),
    await readBackupJson(request),
  ));
}
