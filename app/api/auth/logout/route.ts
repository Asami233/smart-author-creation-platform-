import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { logout } from "@/server/services/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    const result = await logout(request);
    return { data: { loggedOut: result.loggedOut }, cookie: result.cookie };
  });
}
