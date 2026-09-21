import { updateProfileSchema } from "@/contracts";
import { authResponse } from "@/server/auth/responses";
import { assertSameOrigin } from "@/server/auth/runtime";
import { parseJson } from "@/server/http";
import { getProfile, updateProfile } from "@/server/services/auth";

export async function GET(request: Request) {
  return authResponse(async () => ({ data: await getProfile(request) }));
}

export async function PATCH(request: Request) {
  return authResponse(async () => {
    assertSameOrigin(request);
    return { data: await updateProfile(request, await parseJson(request, updateProfileSchema)) };
  });
}
