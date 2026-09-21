import { updateAiSettingsSchema } from "@/contracts";
import { api, apiEmpty, parseJson } from "@/server/http";
import { ownerIdForRequest } from "@/server/identity";
import { deleteAiSettings, getAiSettings, saveAiSettings } from "@/server/services/ai";

export async function GET(request: Request) {
  return api(async () => getAiSettings(await ownerIdForRequest(request)));
}

export async function PUT(request: Request) {
  return api(async () => {
    const input = await parseJson(request, updateAiSettingsSchema);
    return saveAiSettings(await ownerIdForRequest(request), input);
  });
}

export async function DELETE(request: Request) {
  return apiEmpty(async () => deleteAiSettings(await ownerIdForRequest(request)));
}
