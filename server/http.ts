import { type ZodType, type output } from "zod";
import { AppError, toErrorResponse } from "./errors";

export async function parseJson<Schema extends ZodType>(
  request: Request,
  schema: Schema,
): Promise<output<Schema>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "请求体必须是有效的 JSON");
  }
  return schema.parse(payload);
}

export async function api<T>(operation: () => Promise<T>, status = 200): Promise<Response> {
  try {
    const data = await operation();
    return Response.json({ data }, { status });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function apiEmpty(operation: () => Promise<void>): Promise<Response> {
  try {
    await operation();
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export function queryInt(url: URL, name: string, fallback: number, max: number): number {
  const value = Number.parseInt(url.searchParams.get(name) ?? "", 10);
  return Number.isFinite(value) ? Math.max(0, Math.min(value, max)) : fallback;
}
