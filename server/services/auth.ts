import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type {
  AuthSessionResult,
  AuthUser,
  VerificationDispatchResult,
} from "@/contracts";
import { getDb } from "@/db";
import {
  authChallenges,
  authCredentials,
  authSessions,
  authUsers,
  works,
} from "@/db/schema";
import { AppError } from "@/server/errors";
import { authForRequest, requireAuth } from "@/server/auth/context";
import { sendVerificationEmail } from "@/server/auth/mail";
import {
  expiredSessionCookie,
  getAuthSecret,
  sessionCookie,
  SESSION_DURATION_SECONDS,
} from "@/server/auth/runtime";
import {
  hashChallenge,
  hashPassword,
  randomToken,
  randomVerificationCode,
  sha256,
  timingSafeEqual,
  verifyPassword,
} from "@/server/auth/security";

type ChallengePurpose = "register" | "login" | "reset";
type RegistrationPayload = {
  penName: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

const CHALLENGE_SECONDS = 600;
const CHALLENGE_COOLDOWN_SECONDS = 60;
const MAX_CHALLENGE_ATTEMPTS = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;

function isoAfter(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userView(user: typeof authUsers.$inferSelect): AuthUser {
  return {
    id: user.id,
    email: user.email,
    penName: user.penName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

async function ensureChallengeCooldown(email: string, purpose: ChallengePurpose): Promise<void> {
  const [latest] = await getDb()
    .select({ createdAt: authChallenges.createdAt })
    .from(authChallenges)
    .where(and(eq(authChallenges.email, email), eq(authChallenges.purpose, purpose)))
    .orderBy(desc(authChallenges.createdAt))
    .limit(1);
  if (!latest) return;
  const retryAfter = Math.ceil(
    CHALLENGE_COOLDOWN_SECONDS - (Date.now() - new Date(latest.createdAt).getTime()) / 1000,
  );
  if (retryAfter > 0) {
    throw new AppError(429, "CODE_RATE_LIMITED", `请在 ${retryAfter} 秒后重试`, { retryAfter });
  }
}

async function createChallenge(input: {
  request: Request;
  email: string;
  purpose: ChallengePurpose;
  payload?: object;
}): Promise<VerificationDispatchResult> {
  await ensureChallengeCooldown(input.email, input.purpose);
  const code = randomVerificationCode();
  const now = new Date().toISOString();
  await getDb()
    .update(authChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authChallenges.email, input.email),
        eq(authChallenges.purpose, input.purpose),
        isNull(authChallenges.consumedAt),
      ),
    );
  await getDb().insert(authChallenges).values({
    id: crypto.randomUUID(),
    email: input.email,
    purpose: input.purpose,
    codeHash: await hashChallenge(getAuthSecret(), input.purpose, input.email, code),
    payloadJson: JSON.stringify(input.payload ?? {}),
    expiresAt: isoAfter(CHALLENGE_SECONDS),
    createdAt: now,
  });
  const delivery = await sendVerificationEmail({
    request: input.request,
    email: input.email,
    code,
    purpose: input.purpose,
  });
  return {
    accepted: true,
    expiresInSeconds: CHALLENGE_SECONDS,
    retryAfterSeconds: CHALLENGE_COOLDOWN_SECONDS,
    ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
  };
}

async function consumeChallenge(
  email: string,
  purpose: ChallengePurpose,
  code: string,
): Promise<typeof authChallenges.$inferSelect> {
  const [challenge] = await getDb()
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.email, email),
        eq(authChallenges.purpose, purpose),
        isNull(authChallenges.consumedAt),
      ),
    )
    .orderBy(desc(authChallenges.createdAt))
    .limit(1);
  const invalid = () => new AppError(400, "INVALID_CODE", "验证码无效或已过期");
  if (!challenge || challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) throw invalid();
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) throw invalid();
  const actualHash = await hashChallenge(getAuthSecret(), purpose, email, code);
  if (!timingSafeEqual(actualHash, challenge.codeHash)) {
    await getDb()
      .update(authChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(authChallenges.id, challenge.id));
    throw invalid();
  }
  const consumed = await getDb()
    .update(authChallenges)
    .set({ consumedAt: new Date().toISOString() })
    .where(and(eq(authChallenges.id, challenge.id), isNull(authChallenges.consumedAt)))
    .returning({ id: authChallenges.id });
  if (consumed.length !== 1) throw invalid();
  return challenge;
}

async function createSession(userId: string, request: Request) {
  const token = randomToken();
  const now = new Date().toISOString();
  const expiresAt = isoAfter(SESSION_DURATION_SECONDS);
  await getDb().insert(authSessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await sha256(token),
    expiresAt,
    lastSeenAt: now,
  });
  return { cookie: sessionCookie(token, request), expiresAt };
}

export async function startRegistration(
  request: Request,
  input: { email: string; password: string; penName: string },
): Promise<VerificationDispatchResult> {
  const email = normalizeEmail(input.email);
  const [existing] = await getDb().select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (existing) throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "该邮箱已注册");
  const password = await hashPassword(input.password);
  return createChallenge({
    request,
    email,
    purpose: "register",
    payload: {
      penName: input.penName.trim(),
      passwordHash: password.hash,
      passwordSalt: password.salt,
      passwordIterations: password.iterations,
    } satisfies RegistrationPayload,
  });
}

export async function verifyRegistration(request: Request, input: { email: string; code: string }) {
  const email = normalizeEmail(input.email);
  const challenge = await consumeChallenge(email, "register", input.code);
  const payload = JSON.parse(challenge.payloadJson) as Partial<RegistrationPayload>;
  if (!payload.penName || !payload.passwordHash || !payload.passwordSalt || !payload.passwordIterations) {
    throw new AppError(400, "INVALID_REGISTRATION", "注册请求无效，请重新获取验证码");
  }
  const [existing] = await getDb().select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (existing) throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "该邮箱已注册");
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDb().insert(authUsers).values({
    id: userId,
    email,
    emailVerifiedAt: now,
    penName: payload.penName,
  });
  await getDb().insert(authCredentials).values({
    userId,
    passwordHash: payload.passwordHash,
    passwordSalt: payload.passwordSalt,
    passwordIterations: payload.passwordIterations,
    passwordChangedAt: now,
  });
  const [user] = await getDb().select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);
  const session = await createSession(userId, request);
  return { user: userView(user), ...session };
}

export async function loginWithPassword(
  request: Request,
  input: { email: string; password: string },
) {
  const email = normalizeEmail(input.email);
  const [row] = await getDb()
    .select({ user: authUsers, credential: authCredentials })
    .from(authUsers)
    .innerJoin(authCredentials, eq(authUsers.id, authCredentials.userId))
    .where(eq(authUsers.email, email))
    .limit(1);
  if (!row) {
    await hashPassword(input.password, "AAAAAAAAAAAAAAAAAAAAAA", 310_000);
    throw new AppError(401, "INVALID_CREDENTIALS", "邮箱或密码错误");
  }
  if (row.user.status !== "active") throw new AppError(403, "ACCOUNT_DISABLED", "账号已停用");
  if (row.user.lockedUntil && new Date(row.user.lockedUntil).getTime() > Date.now()) {
    throw new AppError(429, "ACCOUNT_LOCKED", "登录尝试过多，请稍后再试");
  }
  const valid = await verifyPassword(
    input.password,
    row.credential.passwordHash,
    row.credential.passwordSalt,
    row.credential.passwordIterations,
  );
  if (!valid) {
    const failedLoginCount = row.user.failedLoginCount + 1;
    await getDb()
      .update(authUsers)
      .set({
        failedLoginCount: failedLoginCount >= MAX_LOGIN_ATTEMPTS ? 0 : failedLoginCount,
        lockedUntil: failedLoginCount >= MAX_LOGIN_ATTEMPTS ? isoAfter(LOGIN_LOCK_SECONDS) : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(authUsers.id, row.user.id));
    throw new AppError(401, "INVALID_CREDENTIALS", "邮箱或密码错误");
  }
  await getDb()
    .update(authUsers)
    .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date().toISOString() })
    .where(eq(authUsers.id, row.user.id));
  const session = await createSession(row.user.id, request);
  return { user: userView(row.user), ...session };
}

async function startExistingUserChallenge(
  request: Request,
  emailInput: string,
  purpose: "login" | "reset",
): Promise<VerificationDispatchResult> {
  const email = normalizeEmail(emailInput);
  const [user] = await getDb().select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (!user || user.status !== "active") {
    return { accepted: true, expiresInSeconds: CHALLENGE_SECONDS, retryAfterSeconds: CHALLENGE_COOLDOWN_SECONDS };
  }
  return createChallenge({ request, email, purpose });
}

export const startCodeLogin = (request: Request, email: string) =>
  startExistingUserChallenge(request, email, "login");

export async function verifyCodeLogin(request: Request, input: { email: string; code: string }) {
  const email = normalizeEmail(input.email);
  await consumeChallenge(email, "login", input.code);
  const [user] = await getDb().select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (!user || user.status !== "active") throw new AppError(400, "INVALID_CODE", "验证码无效或已过期");
  const session = await createSession(user.id, request);
  return { user: userView(user), ...session };
}

export const startPasswordReset = (request: Request, email: string) =>
  startExistingUserChallenge(request, email, "reset");

export async function resetPassword(input: { email: string; code: string; newPassword: string }) {
  const email = normalizeEmail(input.email);
  await consumeChallenge(email, "reset", input.code);
  const [user] = await getDb().select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (!user) throw new AppError(400, "INVALID_CODE", "验证码无效或已过期");
  const password = await hashPassword(input.newPassword);
  const now = new Date().toISOString();
  await getDb()
    .update(authCredentials)
    .set({
      passwordHash: password.hash,
      passwordSalt: password.salt,
      passwordIterations: password.iterations,
      passwordChangedAt: now,
      updatedAt: now,
    })
    .where(eq(authCredentials.userId, user.id));
  await getDb().update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
  return { changed: true as const };
}

export async function getSession(request: Request): Promise<AuthSessionResult> {
  const auth = await authForRequest(request);
  return { authenticated: Boolean(auth), user: auth?.user ?? null };
}

export async function logout(request: Request) {
  const auth = await authForRequest(request);
  if (auth) {
    await getDb().update(authSessions).set({ revokedAt: new Date().toISOString() }).where(eq(authSessions.id, auth.sessionId));
  }
  return { cookie: expiredSessionCookie(request), loggedOut: true as const };
}

export async function logoutAll(request: Request) {
  const auth = await requireAuth(request);
  await getDb().update(authSessions).set({ revokedAt: new Date().toISOString() }).where(and(eq(authSessions.userId, auth.user.id), isNull(authSessions.revokedAt)));
  return { cookie: expiredSessionCookie(request), loggedOut: true as const };
}

export async function changePassword(
  request: Request,
  input: { currentPassword: string; newPassword: string },
) {
  const auth = await requireAuth(request);
  const [credential] = await getDb().select().from(authCredentials).where(eq(authCredentials.userId, auth.user.id)).limit(1);
  if (!credential || !(await verifyPassword(input.currentPassword, credential.passwordHash, credential.passwordSalt, credential.passwordIterations))) {
    throw new AppError(401, "INVALID_CURRENT_PASSWORD", "当前密码错误");
  }
  const password = await hashPassword(input.newPassword);
  const now = new Date().toISOString();
  await getDb().update(authCredentials).set({
    passwordHash: password.hash,
    passwordSalt: password.salt,
    passwordIterations: password.iterations,
    passwordChangedAt: now,
    updatedAt: now,
  }).where(eq(authCredentials.userId, auth.user.id));
  await getDb().update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, auth.user.id), ne(authSessions.id, auth.sessionId), isNull(authSessions.revokedAt)));
  return { changed: true as const };
}

export async function getProfile(request: Request) {
  const auth = await requireAuth(request);
  const [stats] = await getDb()
    .select({ workCount: sql<number>`count(*)` })
    .from(works)
    .where(eq(works.ownerId, auth.user.id));
  return { ...auth.user, workCount: Number(stats?.workCount ?? 0) };
}

export async function updateProfile(
  request: Request,
  input: { penName?: string; bio?: string; avatarUrl?: string | null },
) {
  const auth = await requireAuth(request);
  await getDb().update(authUsers).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(authUsers.id, auth.user.id));
  const [user] = await getDb().select().from(authUsers).where(eq(authUsers.id, auth.user.id)).limit(1);
  return userView(user);
}
