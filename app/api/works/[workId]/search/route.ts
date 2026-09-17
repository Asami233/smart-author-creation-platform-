import { idSchema } from "@/contracts";
import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { searchWork } from "@/server/services/analytics";

type Context = { params: Promise<{ workId: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const { workId } = await params;
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return searchWork(idSchema.parse(workId), ownerIdForRequest(request), query);
  });
}
