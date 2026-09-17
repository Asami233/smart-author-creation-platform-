import { idSchema, reorderChaptersSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { reorderChapters } from "@/server/services/chapters";

type Context = { params: Promise<{ workId: string }> };

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const input = await parseJson(request, reorderChaptersSchema);
    return reorderChapters(
      idSchema.parse(workId),
      ownerIdForRequest(request),
      input.volumeId,
      input.chapterIds,
    );
  });
}
