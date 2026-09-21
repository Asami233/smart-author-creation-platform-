import { toErrorResponse } from "@/server/errors";

export async function authResponse<T>(
  operation: () => Promise<{ data: T; cookie?: string; status?: number }>,
): Promise<Response> {
  try {
    const result = await operation();
    const headers = result.cookie ? { "Set-Cookie": result.cookie } : undefined;
    return Response.json({ data: result.data }, { status: result.status ?? 200, headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
