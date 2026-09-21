import { idSchema } from "@/contracts";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { restoreArchivedWork } from "@/server/services/data-safety";

export async function POST(request: Request, context: { params: Promise<{ workId: string }> }) {
  const { workId } = await context.params;
  return api(async () => restoreArchivedWork(idSchema.parse(workId), await ownerIdForRequest(request)));
}
