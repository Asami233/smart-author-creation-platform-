import { idSchema } from "@/contracts";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { getVersion } from "@/server/services/versions";

type Context = { params: Promise<{ versionId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { versionId } = await params;
    return getVersion(idSchema.parse(versionId), await ownerIdForRequest(request));
  });
}
