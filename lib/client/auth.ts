"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { AuthUser } from "@/contracts/auth";

export type AuthorUser = {
  id: string;
  email: string;
  penName: string;
  account: string; // 兼容原有组件显示
  avatarText: string;
  avatarUrl?: string | null;
  bio?: string;
  createdWorksCount?: number;
  totalWordsCount?: number;
};

export type VerificationResult = {
  accepted: true;
  expiresInSeconds: number;
  retryAfterSeconds: number;
  devCode?: string;
};

const AUTH_STORAGE_KEY = "smart-author-auth-user";

const DEFAULT_GUEST_USER: AuthorUser = {
  id: "guest-author-01",
  email: "shenyan@author.studio",
  penName: "沈砚",
  account: "shenyan@author.studio",
  avatarText: "沈",
  bio: "十年笔耕，唯愿写尽人间清欢与刀光剑影。",
  createdWorksCount: 1,
  totalWordsCount: 28540,
};

type AuthListener = () => void;
const listeners = new Set<AuthListener>();

function notifyAuthChange() {
  listeners.forEach((listener) => listener());
}

function normalizeUser(user: AuthUser, extra?: { worksCount?: number }): AuthorUser {
  return {
    id: user.id,
    email: user.email,
    penName: user.penName,
    account: user.email,
    avatarText: user.penName ? user.penName.charAt(0).toUpperCase() : "墨",
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdWorksCount: extra?.worksCount ?? 1,
    totalWordsCount: 28540,
  };
}

let cachedUser: AuthorUser | null | undefined = undefined;
let isSessionChecked = false;

function getStoredUser(): AuthorUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthorUser;
  } catch {
    return null;
  }
}

function getSnapshot(): AuthorUser | null {
  if (cachedUser === undefined) {
    cachedUser = getStoredUser();
  }
  return cachedUser;
}

function subscribe(listener: AuthListener) {
  listeners.add(listener);
  const handleStorage = (e: StorageEvent) => {
    if (e.key === AUTH_STORAGE_KEY) {
      cachedUser = getStoredUser();
      listener();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

async function handleApiResponse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
    data?: T;
  };
  if (!res.ok) {
    const errorMsg = json?.error?.message || `请求失败 (${res.status})`;
    const err = new Error(errorMsg);
    (err as unknown as { code?: string }).code = json?.error?.code;
    throw err;
  }
  return json.data as T;
}

export const authService = {
  getCurrentUser(): AuthorUser | null {
    return getSnapshot();
  },

  async checkSession(): Promise<AuthorUser | null> {
    if (typeof window === "undefined") return null;
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
      });
      const data = await handleApiResponse<{ authenticated: boolean; user: AuthUser | null }>(res);
      if (data.authenticated && data.user) {
        const normalized = normalizeUser(data.user);
        cachedUser = normalized;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalized));
        notifyAuthChange();
        return normalized;
      }
      // 如果服务端未登录且不是离线游客，则清理本地缓存
      const current = getStoredUser();
      if (current && !current.id.startsWith("guest-")) {
        cachedUser = null;
        localStorage.removeItem(AUTH_STORAGE_KEY);
        notifyAuthChange();
      }
      return cachedUser ?? null;
    } catch {
      return getSnapshot();
    } finally {
      isSessionChecked = true;
    }
  },

  // 1. 邮箱密码登录
  async loginWithPassword(email: string, password: string): Promise<AuthorUser> {
    const res = await fetch("/api/auth/login/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await handleApiResponse<{ authenticated: boolean; user: AuthUser }>(res);
    const authorUser = normalizeUser(data.user);
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authorUser));
    }
    cachedUser = authorUser;
    notifyAuthChange();
    return authorUser;
  },

  // 2. 邮箱验证码登录 - 发送验证码
  async startEmailLoginCode(email: string): Promise<VerificationResult> {
    const res = await fetch("/api/auth/login/code/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim() }),
    });
    return handleApiResponse<VerificationResult>(res);
  },

  // 3. 邮箱验证码登录 - 验证并登录
  async verifyEmailLoginCode(email: string, code: string): Promise<AuthorUser> {
    const res = await fetch("/api/auth/login/code/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim(), code: code.trim() }),
    });
    const data = await handleApiResponse<{ authenticated: boolean; user: AuthUser }>(res);
    const authorUser = normalizeUser(data.user);
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authorUser));
    }
    cachedUser = authorUser;
    notifyAuthChange();
    return authorUser;
  },

  // 4. 邮箱注册 - 发送验证码
  async startEmailRegister(email: string, password: string, penName: string): Promise<VerificationResult> {
    const res = await fetch("/api/auth/register/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: email.trim(),
        password,
        penName: penName.trim(),
      }),
    });
    return handleApiResponse<VerificationResult>(res);
  },

  // 5. 邮箱注册 - 验证并完成注册
  async verifyEmailRegister(email: string, code: string): Promise<AuthorUser> {
    const res = await fetch("/api/auth/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim(), code: code.trim() }),
    });
    const data = await handleApiResponse<{ authenticated: boolean; user: AuthUser }>(res);
    const authorUser = normalizeUser(data.user);
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authorUser));
    }
    cachedUser = authorUser;
    notifyAuthChange();
    return authorUser;
  },

  // 6. 忘记密码 - 发送重置码
  async startPasswordReset(email: string): Promise<VerificationResult> {
    const res = await fetch("/api/auth/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim() }),
    });
    return handleApiResponse<VerificationResult>(res);
  },

  // 7. 忘记密码 - 确认重置密码
  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ reset: boolean }> {
    const res = await fetch("/api/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim(), code: code.trim(), newPassword }),
    });
    return handleApiResponse<{ reset: boolean }>(res);
  },

  // 8. 游客/快捷体验账号登录
  async loginAsGuest(): Promise<AuthorUser> {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(DEFAULT_GUEST_USER));
    }
    cachedUser = DEFAULT_GUEST_USER;
    notifyAuthChange();
    return DEFAULT_GUEST_USER;
  },

  // 9. 退出登录
  async logout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // 离线亦清理本地
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    cachedUser = null;
    notifyAuthChange();
  },
};

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isSessionChecked) {
      authService.checkSession();
    }
  }, []);

  return {
    user: mounted ? user : null,
    isAuthenticated: Boolean(mounted && user),
    isLoaded: mounted,
    loginWithPassword: authService.loginWithPassword,
    startEmailLoginCode: authService.startEmailLoginCode,
    verifyEmailLoginCode: authService.verifyEmailLoginCode,
    startEmailRegister: authService.startEmailRegister,
    verifyEmailRegister: authService.verifyEmailRegister,
    startPasswordReset: authService.startPasswordReset,
    confirmPasswordReset: authService.confirmPasswordReset,
    loginAsGuest: authService.loginAsGuest,
    logout: authService.logout,
  };
}
