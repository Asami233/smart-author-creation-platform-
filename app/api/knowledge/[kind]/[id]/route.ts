import { idSchema, knowledgeKindSchema } from "@/contracts";
import { AppError } from "@/server/errors";
import { api, apiEmpty } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { deleteKnowledge, getKnowledge, updateKnowledge } from "@/server/services/knowledge";

type Context = { params: Promise<{ kind: string; id: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { kind, id } = await params;
    return getKnowledge(knowledgeKindSchema.parse(kind), idSchema.parse(id), await ownerIdForRequest(request));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    const { kind, id } = await params;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new AppError(400, "INVALID_JSON", "请求体必须是有效的 JSON");
    }
    return updateKnowledge(
      knowledgeKindSchema.parse(kind),
      idSchema.parse(id),
      await ownerIdForRequest(request),
      payload,
    );
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return apiEmpty(async () => {
    const { kind, id } = await params;
    await deleteKnowledge(knowledgeKindSchema.parse(kind), idSchema.parse(id), await ownerIdForRequest(request));
  });
}
