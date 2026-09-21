import { getServerSecret } from "@/db";
import { AppError } from "@/server/errors";

export const SESSION_COOKIE_NAME = "smart_author_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function getAuthSecret(): string {
  const secret = getServerSecret("AUTH_SECRET") ?? getServerSecret("APP_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) {
    throw new AppError(503, "AUTH_NOT_CONFIGURED", "认证密钥尚未配置");
  }
  return secret;
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`;
}

export function expiredSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new AppError(403, "CROSS_SITE_REQUEST", "拒绝跨站请求");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new AppError(403, "CROSS_SITE_REQUEST", "拒绝跨站请求");
  }
}
