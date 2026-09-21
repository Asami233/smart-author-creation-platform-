import { authForRequest } from "./auth/context";
import { assertSameOrigin, isLocalRequest } from "./auth/runtime";
import { AppError } from "./errors";

export const LOCAL_OWNER_ID = "local-author";

export async function ownerIdForRequest(request: Request): Promise<string> {
  if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
  const auth = await authForRequest(request);
  if (auth) return auth.user.id;
  // The original single-author workspace remains usable during local frontend
  // integration. Deployed environments always require a valid session.
  if (isLocalRequest(request)) return LOCAL_OWNER_ID;
  throw new AppError(401, "UNAUTHENTICATED", "请先登录");
}
