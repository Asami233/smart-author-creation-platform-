import { and, eq, gt, isNull } from "drizzle-orm";
import type { AuthUser } from "@/contracts";
import { getDb } from "@/db";
import { authSessions, authUsers } from "@/db/schema";
import { AppError } from "@/server/errors";
import { readCookie, SESSION_COOKIE_NAME } from "./runtime";
import { sha256 } from "./security";

export type RequestAuth = { user: AuthUser; sessionId: string };

function publicUser(row: typeof authUsers.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    penName: row.penName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
  };
}

export async function authForRequest(request: Request): Promise<RequestAuth | null> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;
  const now = new Date().toISOString();
  const [row] = await getDb()
    .select({ session: authSessions, user: authUsers })
    .from(authSessions)
    .innerJoin(authUsers, eq(authSessions.userId, authUsers.id))
    .where(
      and(
        eq(authSessions.tokenHash, await sha256(token)),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        eq(authUsers.status, "active"),
      ),
    )
    .limit(1);
  return row ? { sessionId: row.session.id, user: publicUser(row.user) } : null;
}

export async function requireAuth(request: Request): Promise<RequestAuth> {
  const auth = await authForRequest(request);
  if (!auth) throw new AppError(401, "UNAUTHENTICATED", "请先登录");
  return auth;
}
