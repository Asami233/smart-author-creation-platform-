import { idSchema, updateVolumeSchema } from "@/contracts";
import { api, apiEmpty, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { deleteVolume, getVolume, updateVolume } from "@/server/services/works";

type Context = { params: Promise<{ volumeId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { volumeId } = await params;
    return getVolume(idSchema.parse(volumeId), await ownerIdForRequest(request));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    const { volumeId } = await params;
    const input = await parseJson(request, updateVolumeSchema);
    return updateVolume(idSchema.parse(volumeId), await ownerIdForRequest(request), input);
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiEmpty(async () => {
    const { volumeId } = await params;
    await deleteVolume(idSchema.parse(volumeId), await ownerIdForRequest(request));
  });
}
