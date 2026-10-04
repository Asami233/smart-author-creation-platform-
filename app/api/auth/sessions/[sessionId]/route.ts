import { idSchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { revokeAuthSession } from "@/server/services/auth";

export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return authResponse(async () => {
    assertSameOrigin(request);
    const { sessionId } = await context.params;
    return { data: await revokeAuthSession(request, idSchema.parse(sessionId)) };
  });
}
