import { createWorkSchema } from "@/contracts";
import { api, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { createWork, listWorks } from "@/server/services/works";

export async function GET(request: Request) {
  return api(async () => listWorks(await ownerIdForRequest(request)));
}

export async function POST(request: Request) {
  return api(async () => {
    const input = await parseJson(request, createWorkSchema);
    return createWork(await ownerIdForRequest(request), input);
  }, 201);
}
