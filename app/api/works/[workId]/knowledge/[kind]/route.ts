import { idSchema, knowledgeKindSchema } from "@/contracts";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { createKnowledge, listKnowledge } from "@/server/services/knowledge";

type Context = { params: Promise<{ workId: string; kind: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { workId, kind } = await params;
    return listKnowledge(idSchema.parse(workId), ownerIdForRequest(request), knowledgeKindSchema.parse(kind));
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    const { workId, kind } = await params;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      payload = null;
    }
    return createKnowledge(
      idSchema.parse(workId),
      ownerIdForRequest(request),
      knowledgeKindSchema.parse(kind),
      payload,
    );
  }, 201);
}
