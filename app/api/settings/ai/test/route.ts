import { aiProviderTestSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { testAiConnection } from "@/server/services/ai";

export async function POST(request: Request) {
  return api(async () => {
    const input = await parseJson(request, aiProviderTestSchema);
    return testAiConnection(await ownerIdForRequest(request), input);
  });
}
