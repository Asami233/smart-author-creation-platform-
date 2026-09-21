import { idSchema } from "@/contracts";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { restoreDeletedChapter } from "@/server/services/data-safety";

export async function POST(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  return api(async () => restoreDeletedChapter(idSchema.parse(chapterId), await ownerIdForRequest(request)));
}
