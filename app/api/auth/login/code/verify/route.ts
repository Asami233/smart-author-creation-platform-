import { codeVerifySchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { parseJson } from "@/server/http";
import { verifyCodeLogin } from "@/server/services/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    const result = await verifyCodeLogin(request, await parseJson(request, codeVerifySchema));
    return { data: { user: result.user, expiresAt: result.expiresAt }, cookie: result.cookie };
  });
}
