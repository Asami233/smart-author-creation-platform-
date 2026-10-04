import { z } from "zod";
import type { BackupDocument } from "./data-safety";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(8, "密码至少需要 8 个字符")
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "密码必须同时包含字母和数字",
  });
const code = z.string().trim().regex(/^\d{6}$/, "验证码必须是 6 位数字");

export const ACCOUNT_DELETE_CONFIRMATION = "永久删除我的账号";

export const registerStartSchema = z.object({
  email,
  password,
  penName: z.string().trim().min(1).max(40),
});

export const registerVerifySchema = z.object({ email, code });
export const passwordLoginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const codeStartSchema = z.object({ email });
export const codeVerifySchema = z.object({ email, code });
export const passwordResetStartSchema = z.object({ email });
export const passwordResetSchema = z.object({ email, code, newPassword: password });
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
export const accountDeletionSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码").max(128),
  confirmation: z.literal(ACCOUNT_DELETE_CONFIRMATION, {
    message: `请输入“${ACCOUNT_DELETE_CONFIRMATION}”`,
  }),
});
export const updateProfileSchema = z
  .object({
    penName: z.string().trim().min(1).max(40).optional(),
    bio: z.string().trim().max(500).optional(),
    avatarUrl: z.string().trim().url().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "至少提供一个要修改的字段");

export type AuthUser = {
  id: string;
  email: string;
  penName: string;
  bio: string;
  avatarUrl: string | null;
  emailVerifiedAt: string;
  createdAt: string;
};

export type AuthSessionResult = {
  authenticated: boolean;
  user: AuthUser | null;
};

export type AuthDeviceSession = {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type RevokeAuthSessionResult = {
  sessionId: string;
  revoked: true;
  alreadyRevoked: boolean;
};

export type AccountDataExport = {
  format: "smart-author-account-export";
  schemaVersion: 1;
  exportedAt: string;
  user: AuthUser;
  content: BackupDocument;
  excludedSensitiveData: ["password", "sessions", "verificationCodes", "aiApiKey"];
};

export type AccountDeletionResult = {
  deleted: true;
};

export type VerificationDispatchResult = {
  accepted: true;
  expiresInSeconds: number;
  retryAfterSeconds: number;
  devCode?: string;
};

export type EmailDeliveryReadiness = {
  ready: boolean;
  mode: "email" | "development" | "unavailable";
  provider: "resend" | "none";
  localRequest: boolean;
  devCodeEnabled: boolean;
  missing: Array<"RESEND_API_KEY" | "AUTH_EMAIL_FROM">;
  issues: Array<{
    code: "EMAIL_NOT_CONFIGURED" | "EMAIL_CONFIG_PARTIAL" | "EMAIL_FROM_INVALID";
    message: string;
  }>;
};
