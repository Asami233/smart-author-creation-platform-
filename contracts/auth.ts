import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(8, "密码至少需要 8 个字符")
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "密码必须同时包含字母和数字",
  });
const code = z.string().trim().regex(/^\d{6}$/, "验证码必须是 6 位数字");

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

export type VerificationDispatchResult = {
  accepted: true;
  expiresInSeconds: number;
  retryAfterSeconds: number;
  devCode?: string;
};
