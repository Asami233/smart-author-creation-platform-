import { accountDeletionSchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { parseJson } from "@/server/http";
import { permanentlyDeleteAccount } from "@/server/services/account-security";

export async function DELETE(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    const input = await parseJson(request, accountDeletionSchema);
    const result = await permanentlyDeleteAccount(request, input);
    return { data: result.data, cookie: result.cookie };
  });
}
