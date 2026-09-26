import { aiGenerationSchema } from "@/contracts";
import { toErrorResponse } from "@/server/errors";
import { parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { streamWithAi } from "@/server/services/ai";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await parseJson(request, aiGenerationSchema);
    return await streamWithAi(await ownerIdForRequest(request), input, request.signal);
  } catch (error) {
    return toErrorResponse(error);
  }
}
