import { aiProviderConnectionSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { listAvailableModels } from "@/server/services/ai";

export async function POST(request: Request) {
  return api(async () => {
    const input = await parseJson(request, aiProviderConnectionSchema);
    return listAvailableModels(await ownerIdForRequest(request), input);
  });
}
