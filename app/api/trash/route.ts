import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { getTrashOverview } from "@/server/services/data-safety";

export async function GET(request: Request) {
  return api(async () => getTrashOverview(await ownerIdForRequest(request)));
}
