import { createVolumeSchema, idSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { createVolume, listVolumes } from "@/server/services/works";

type Context = { params: Promise<{ workId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    return listVolumes(idSchema.parse(workId), ownerIdForRequest(request));
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const input = await parseJson(request, createVolumeSchema);
    return createVolume(idSchema.parse(workId), ownerIdForRequest(request), input);
  }, 201);
}
