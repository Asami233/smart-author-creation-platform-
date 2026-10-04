import { claimGuestWorksSchema } from "@/contracts";
import { assertSameOrigin } from "@/server/auth/runtime";
import { api, parseJson } from "@/server/http";
import { claimGuestWorks } from "@/server/services/guest-claim";

export async function POST(request: Request) {
  return api(async () => {
    assertSameOrigin(request);
    return claimGuestWorks(request, await parseJson(request, claimGuestWorksSchema));
  });
}
