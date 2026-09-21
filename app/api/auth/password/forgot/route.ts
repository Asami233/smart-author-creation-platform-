import { passwordResetStartSchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { parseJson } from "@/server/http";
import { startPasswordReset } from "@/server/services/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    const input = await parseJson(request, passwordResetStartSchema);
    return { data: await startPasswordReset(request, input.email), status: 202 };
  });
}
