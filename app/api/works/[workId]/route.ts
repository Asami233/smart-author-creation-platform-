import { idSchema, updateWorkSchema } from "@/contracts";
import { api, apiEmpty, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { archiveWork, getWorkspace, updateWork } from "@/server/services/works";

type Context = { params: Promise<{ workId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    return getWorkspace(idSchema.parse(workId), ownerIdForRequest(request));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const input = await parseJson(request, updateWorkSchema);
    return updateWork(idSchema.parse(workId), ownerIdForRequest(request), input);
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiEmpty(async () => {
    const { workId } = await params;
    await archiveWork(idSchema.parse(workId), ownerIdForRequest(request));
  });
}
