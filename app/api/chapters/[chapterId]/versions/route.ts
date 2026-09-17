import { createManualVersionSchema, idSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { createManualVersion, listVersions } from "@/server/services/versions";

type Context = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    return listVersions(idSchema.parse(chapterId), ownerIdForRequest(request));
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    const input = await parseJson(request, createManualVersionSchema);
    return createManualVersion(idSchema.parse(chapterId), ownerIdForRequest(request), input.label);
  }, 201);
}
