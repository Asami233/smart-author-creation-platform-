import { registerVerifySchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { parseJson } from "@/server/http";
import { verifyRegistration } from "@/server/services/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    const result = await verifyRegistration(request, await parseJson(request, registerVerifySchema));
    return { data: { user: result.user, expiresAt: result.expiresAt }, cookie: result.cookie, status: 201 };
  });
}
