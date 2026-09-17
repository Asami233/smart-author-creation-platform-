import { idSchema, updateChapterSchema } from "@/contracts";
import { api, apiEmpty, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { archiveChapter, getChapter, updateChapter } from "@/server/services/chapters";

type Context = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    return getChapter(idSchema.parse(chapterId), ownerIdForRequest(request));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    const input = await parseJson(request, updateChapterSchema);
    return updateChapter(idSchema.parse(chapterId), ownerIdForRequest(request), input);
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiEmpty(async () => {
    const { chapterId } = await params;
    await archiveChapter(idSchema.parse(chapterId), ownerIdForRequest(request));
  });
}
