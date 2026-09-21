import { passwordLoginSchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { parseJson } from "@/server/http";
import { loginWithPassword } from "@/server/services/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    const result = await loginWithPassword(request, await parseJson(request, passwordLoginSchema));
    return { data: { user: result.user, expiresAt: result.expiresAt }, cookie: result.cookie };
  });
}
