import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { getStorageSummary } from "@/server/services/data-safety";

export async function GET(request: Request) {
  return api(async () => getStorageSummary(await ownerIdForRequest(request)));
}
