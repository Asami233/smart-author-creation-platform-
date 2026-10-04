import { api } from "@/server/http";
import { previewGuestClaim } from "@/server/services/guest-claim";

export async function GET(request: Request) {
  return api(() => previewGuestClaim(request));
}
