import { idSchema, updateWritingGoalSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { getWorkStats, setWritingGoal } from "@/server/services/analytics";

type Context = { params: Promise<{ workId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    return getWorkStats(idSchema.parse(workId), ownerIdForRequest(request));
  });
}

export async function PUT(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const input = await parseJson(request, updateWritingGoalSchema);
    return setWritingGoal(
      idSchema.parse(workId),
      ownerIdForRequest(request),
      input.date,
      input.targetWords,
    );
  });
}
