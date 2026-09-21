import { passwordChangeSchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { parseJson } from "@/server/http";
import { changePassword } from "@/server/services/auth";

export async function POST(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    return { data: await changePassword(request, await parseJson(request, passwordChangeSchema)) };
  });
}
