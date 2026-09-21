import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { getWorkspaceDashboard } from "@/server/services/works";

export async function GET(request: Request) {
  return api(async () => getWorkspaceDashboard(await ownerIdForRequest(request)));
}
