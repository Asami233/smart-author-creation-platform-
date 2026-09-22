import { createManualVersionSchema, idSchema, listVersionsQuerySchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { toErrorResponse } from "@/server/errors";
import { ownerIdForRequest } from "@/server/identity";
import { createManualVersion, listVersions } from "@/server/services/versions";

type Context = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { chapterId } = await params;
    const url = new URL(request.url);
    const input = listVersionsQuerySchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });
    const page = await listVersions(idSchema.parse(chapterId), await ownerIdForRequest(request), input);
    return Response.json(page);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    const input = await parseJson(request, createManualVersionSchema);
    return createManualVersion(idSchema.parse(chapterId), await ownerIdForRequest(request), input.label);
  }, 201);
}
