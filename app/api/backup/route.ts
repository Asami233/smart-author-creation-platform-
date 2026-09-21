import { ownerIdForRequest } from "@/server/identity";
import { toErrorResponse } from "@/server/errors";
import { createFullBackup } from "@/server/services/data-safety";

export async function GET(request: Request) {
  try {
    const backup = await createFullBackup(await ownerIdForRequest(request));
    const date = backup.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="smart-author-backup-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
