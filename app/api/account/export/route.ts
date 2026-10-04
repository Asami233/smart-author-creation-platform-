import { toErrorResponse } from "@/server/errors";
import { createAccountDataExport } from "@/server/services/account-security";

export async function GET(request: Request) {
  try {
    const data = await createAccountDataExport(request);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="smart-author-account-${data.exportedAt.slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
