import { chapterLinksBatchSchema, idSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { addChapterLinks, removeChapterLinks } from "@/server/services/knowledge";

type Context = { params: Promise<{ chapterId: string }> };

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    const input = await parseJson(request, chapterLinksBatchSchema);
    return addChapterLinks(idSchema.parse(chapterId), await ownerIdForRequest(request), input.links);
  }, 201);
}

export async function DELETE(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    const input = await parseJson(request, chapterLinksBatchSchema);
    return removeChapterLinks(idSchema.parse(chapterId), await ownerIdForRequest(request), input.links);
  });
}
