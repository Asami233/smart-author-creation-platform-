import { readBackupJson } from "@/server/backup-request";
import { api } from "@/server/http";
import { validateBackupPayload } from "@/server/services/data-safety";

export async function POST(request: Request) {
  return api(async () => validateBackupPayload(await readBackupJson(request)));
}
