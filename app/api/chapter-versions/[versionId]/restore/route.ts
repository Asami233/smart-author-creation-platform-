import { idSchema } from "@/contracts";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { restoreVersion } from "@/server/services/versions";

type Context = { params: Promise<{ versionId: string }> };

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { versionId } = await params;
    return restoreVersion(idSchema.parse(versionId), await ownerIdForRequest(request));
  });
}
