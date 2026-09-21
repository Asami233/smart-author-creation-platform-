import { workspaceSelectionSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { setActiveWorkspace } from "@/server/services/works";

export async function PUT(request: Request) {
  return api(async () => {
    const ownerId = await ownerIdForRequest(request);
    return setActiveWorkspace(ownerId, await parseJson(request, workspaceSelectionSchema));
  });
}
