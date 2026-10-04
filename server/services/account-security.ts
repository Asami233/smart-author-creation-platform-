import type { AccountDataExport, AccountDeletionResult } from "@/contracts";
import { authCredentials } from "@/db/schema";
import { getDb } from "@/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/server/auth/context";
import { expiredSessionCookie } from "@/server/auth/runtime";
import { verifyPassword } from "@/server/auth/security";
import { ACCOUNT_DELETION_SQL } from "@/server/account-deletion";
import { batch, statement } from "@/server/db";
import { AppError } from "@/server/errors";
import { createFullBackup } from "./data-safety";

export async function createAccountDataExport(request: Request): Promise<AccountDataExport> {
  const auth = await requireAuth(request);
  return {
    format: "smart-author-account-export",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    user: auth.user,
    content: await createFullBackup(auth.user.id),
    excludedSensitiveData: ["password", "sessions", "verificationCodes", "aiApiKey"],
  };
}

export async function permanentlyDeleteAccount(
  request: Request,
  input: { currentPassword: string; confirmation: string },
): Promise<{ data: AccountDeletionResult; cookie: string }> {
  const auth = await requireAuth(request);
  const [credential] = await getDb()
    .select()
    .from(authCredentials)
    .where(eq(authCredentials.userId, auth.user.id))
    .limit(1);
  const passwordMatches = credential
    ? await verifyPassword(
        input.currentPassword,
        credential.passwordHash,
        credential.passwordSalt,
        credential.passwordIterations,
      )
    : false;
  if (!passwordMatches) {
    throw new AppError(401, "INVALID_CURRENT_PASSWORD", "当前密码错误，账号未删除");
  }

  const ownerId = auth.user.id;
  const email = auth.user.email;
  await batch([
    statement(ACCOUNT_DELETION_SQL[0], ownerId),
    statement(ACCOUNT_DELETION_SQL[1], ownerId),
    statement(ACCOUNT_DELETION_SQL[2], ownerId),
    statement(ACCOUNT_DELETION_SQL[3], ownerId),
    statement(ACCOUNT_DELETION_SQL[4], ownerId),
    statement(ACCOUNT_DELETION_SQL[5], email),
    statement(ACCOUNT_DELETION_SQL[6], ownerId),
    statement(ACCOUNT_DELETION_SQL[7], ownerId),
    statement(ACCOUNT_DELETION_SQL[8], ownerId, email),
  ]);

  return {
    data: { deleted: true },
    cookie: expiredSessionCookie(request),
  };
}
