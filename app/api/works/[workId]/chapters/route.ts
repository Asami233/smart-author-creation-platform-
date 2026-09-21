import { createChapterSchema, idSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { createChapter, listChapters } from "@/server/services/chapters";

type Context = { params: Promise<{ workId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const url = new URL(request.url);
    const includeContent = url.searchParams.get("includeContent") === "true";
    return listChapters(idSchema.parse(workId), await ownerIdForRequest(request), includeContent);
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const input = await parseJson(request, createChapterSchema);
    return createChapter(idSchema.parse(workId), await ownerIdForRequest(request), input);
  }, 201);
}
