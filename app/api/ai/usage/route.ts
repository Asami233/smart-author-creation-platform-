import { api } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { getAiUsage } from "@/server/services/ai";

export async function GET(request: Request) {
  return api(() => getAiUsage(ownerIdForRequest(request)));
}
