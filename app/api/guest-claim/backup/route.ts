import { toErrorResponse } from "@/server/errors";
import { downloadGuestClaimBackup } from "@/server/services/guest-claim";

export async function GET(request: Request) {
  try {
    return await downloadGuestClaimBackup(request);
  } catch (error) {
    return toErrorResponse(error);
  }
}
