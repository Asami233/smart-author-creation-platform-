import { registerStartSchema } from "@/contracts";
import { assertSameOrigin } from "@/server/auth/runtime";
import { authResponse } from "@/server/auth/responses";
import { parseJson } from "@/server/http";
import { startRegistration } from "@/server/services/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    return { data: await startRegistration(request, await parseJson(request, registerStartSchema)), status: 202 };
  });
}
