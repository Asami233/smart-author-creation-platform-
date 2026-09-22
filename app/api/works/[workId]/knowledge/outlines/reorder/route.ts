import { idSchema, reorderOutlinesSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { reorderOutlines } from "@/server/services/knowledge";

type Context = { params: Promise<{ workId: string }> };

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const input = await parseJson(request, reorderOutlinesSchema);
    return reorderOutlines(idSchema.parse(workId), await ownerIdForRequest(request), input.outlineIds);
  });
}
