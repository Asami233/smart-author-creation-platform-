import { chapterLinkSchema, idSchema } from "@/contracts";
import { AppError } from "@/server/errors";
import { api, apiEmpty, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { addChapterLink, listChapterLinks, removeChapterLink } from "@/server/services/knowledge";

type Context = { params: Promise<{ chapterId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    return listChapterLinks(idSchema.parse(chapterId), ownerIdForRequest(request));
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { chapterId } = await params;
    const input = await parseJson(request, chapterLinkSchema);
    return addChapterLink(
      idSchema.parse(chapterId),
      ownerIdForRequest(request),
      input.entityType,
      input.entityId,
    );
  }, 201);
}

export async function DELETE(request: Request, { params }: Context) {
  return apiEmpty(async () => {
    const { chapterId } = await params;
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (!entityType || !entityId) {
      throw new AppError(400, "MISSING_LINK_TARGET", "必须提供 entityType 和 entityId");
    }
    const input = chapterLinkSchema.parse({ entityType, entityId });
    await removeChapterLink(
      idSchema.parse(chapterId),
      ownerIdForRequest(request),
      input.entityType,
      input.entityId,
    );
  });
}
