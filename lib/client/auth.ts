// MOCK_ONLY: 待 Codex 提供正式 contracts/** 和后端 API 路由后，本模块将替换为真实的 API 请求调用。
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type AuthorUser = {
  id: string;
  penName: string; // 作家笔名
  account: string; // 手机号/邮箱/账号
  avatarText: string;
  avatarBg?: string;
  bio?: string;
  createdWorksCount?: number;
  totalWordsCount?: number;
};

const AUTH_STORAGE_KEY = "smart-author-auth-user";

const DEFAULT_GUEST_USER: AuthorUser = {
  id: "author-default-01",
  penName: "沈砚",
  account: "shenyan@author.studio",
  avatarText: "沈",
  bio: "十年笔耕，唯愿写尽人间清欢与刀光剑影。",
  createdWorksCount: 1,
  totalWordsCount: 28540,
};

// 简单的事件发布订阅器，支持跨组件和多标签页响应登录状态变更
type AuthListener = () => void;
const listeners = new Set<AuthListener>();

function notifyAuthChange() {
  listeners.forEach((listener) => listener());
}

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

let cachedUser: AuthorUser | null | undefined = undefined;

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

export const authService = {
  getCurrentUser(): AuthorUser | null {
    return getSnapshot();
  },

  // 密码登录
  async loginWithPassword(account: string, _password: string): Promise<AuthorUser> {
    await new Promise((resolve) => setTimeout(resolve, 600)); // 模拟网络延迟
    const user: AuthorUser = {
      id: `author-${Date.now()}`,
      penName: account.includes("@") ? account.split("@")[0] : account.slice(-4) ? `作者_${account.slice(-4)}` : "当代文豪",
      account,
      avatarText: account.charAt(0).toUpperCase(),
      bio: "专注写作，落笔生花。",
      createdWorksCount: 1,
      totalWordsCount: 12400,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
    cachedUser = user;
    notifyAuthChange();
    return user;
  },

  // 手机/邮箱验证码登录
  async loginWithCode(phoneOrEmail: string, _code: string): Promise<AuthorUser> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const user: AuthorUser = {
      id: `author-${Date.now()}`,
      penName: phoneOrEmail.includes("@")
        ? phoneOrEmail.split("@")[0]
        : `墨客${phoneOrEmail.slice(-4)}`,
      account: phoneOrEmail,
      avatarText: "墨",
      bio: "落墨成卷，字字珠玑。",
      createdWorksCount: 1,
      totalWordsCount: 5200,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
    cachedUser = user;
    notifyAuthChange();
    return user;
  },

  // 注册新作者
  async register(penName: string, account: string, _password: string): Promise<AuthorUser> {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const user: AuthorUser = {
      id: `author-${Date.now()}`,
      penName: penName.trim() || "新晋作者",
      account,
      avatarText: penName.trim() ? penName.trim().charAt(0) : "作",
      bio: "初入江湖，愿以此笔载山海。",
      createdWorksCount: 0,
      totalWordsCount: 0,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
    cachedUser = user;
    notifyAuthChange();
    return user;
  },

  // 游客/体验账号登录
  async loginAsGuest(): Promise<AuthorUser> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(DEFAULT_GUEST_USER));
    }
    cachedUser = DEFAULT_GUEST_USER;
    notifyAuthChange();
    return DEFAULT_GUEST_USER;
  },

  // 发送验证码 (Mock)
  async sendVerificationCode(target: string): Promise<{ success: boolean; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!target) {
      throw new Error("请输入手机号或邮箱");
    }
    return {
      success: true,
      message: `验证码已发送至 ${target}（演示环境验证码：888888）`,
    };
  },

  // 退出登录
  logout(): void {
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
  }, []);

  return {
    user: mounted ? user : null,
    isAuthenticated: Boolean(mounted && user),
    isLoaded: mounted,
    loginWithPassword: authService.loginWithPassword,
    loginWithCode: authService.loginWithCode,
    register: authService.register,
    loginAsGuest: authService.loginAsGuest,
    sendVerificationCode: authService.sendVerificationCode,
    logout: authService.logout,
  };
}
