import { authResponse } from "@/server/auth/responses";
import { listAuthSessions } from "@/server/services/auth";

export async function GET(request: Request) {
  return authResponse(async () => ({ data: await listAuthSessions(request) }));
}
