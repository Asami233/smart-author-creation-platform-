import { aiGenerationSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { generateWithAi } from "@/server/services/ai";

export async function POST(request: Request) {
  return api(async () => {
    const input = await parseJson(request, aiGenerationSchema);
    return generateWithAi(ownerIdForRequest(request), input);
  });
}
