import { idSchema, restoreVersionSchema } from "@/contracts";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { AppError } from "@/server/errors";
import { restoreVersion } from "@/server/services/versions";

type Context = { params: Promise<{ versionId: string }> };

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { versionId } = await params;
    const raw = await request.text();
    let payload: unknown = {};
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new AppError(400, "INVALID_JSON", "请求体必须是有效的 JSON");
      }
    }
    const input = restoreVersionSchema.parse(payload);
    return restoreVersion(idSchema.parse(versionId), await ownerIdForRequest(request), input.expectedRevision);
  });
}
