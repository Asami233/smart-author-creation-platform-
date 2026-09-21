import { authResponse } from "@/server/auth/responses";
import { getSession } from "@/server/services/auth";

export async function GET(request: Request) {
  return authResponse(async () => ({ data: await getSession(request) }));
}
