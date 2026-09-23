import { idSchema, reorderVolumesSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { reorderVolumes } from "@/server/services/works";

type Context = { params: Promise<{ workId: string }> };

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const input = await parseJson(request, reorderVolumesSchema);
    return reorderVolumes(idSchema.parse(workId), await ownerIdForRequest(request), input.volumeIds);
  });
}
