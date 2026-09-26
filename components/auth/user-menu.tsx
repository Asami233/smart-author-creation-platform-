"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, Feather, LogIn, LogOut, Settings, Sparkles, User, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/client/auth";

export function UserMenu() {
  const router = useRouter();
  const { user, isAuthenticated, isLoaded, logout } = useAuth();

  if (!isLoaded) {
    return <div className="w-8 h-8 rounded-full bg-[#e8ece9] animate-pulse" />;
  }

  if (!isAuthenticated || !user) {
    return (
      <Link href="/login">
        <Button
          size="sm"
          className="h-8 px-3 rounded-lg bg-[#176b5b] hover:bg-[#13594b] text-white text-xs font-medium gap-1.5 shadow-xs"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>登录 / 注册</span>
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="作者资料与账户菜单"
          className="w-[34px] h-[34px] rounded-full bg-[#dfe9e5] text-[#175b4e] font-serif font-bold text-sm border border-[#cadbd5] flex items-center justify-center hover:shadow-md hover:border-[#176b5b] transition-all cursor-pointer focus:outline-hidden"
        >
          {user.avatarText || "砚"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-2 bg-[#fffefb] border-[#e2e1db] shadow-xl rounded-xl">
        <DropdownMenuLabel className="font-normal p-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#e5eeea] text-[#176b5b] font-serif font-bold text-base flex items-center justify-center border border-[#cfded8] shrink-0">
              {user.avatarText || "砚"}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-[#202923] font-serif truncate">
                {user.penName}
              </span>
              <span className="text-[11px] text-[#78827d] truncate font-mono">
                {user.account}
              </span>
            </div>
          </div>
          {user.bio && (
            <p className="text-[11px] text-[#858e89] mt-2 italic line-clamp-2 bg-[#f6f5f0] p-2 rounded-lg">
              “{user.bio}”
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[#eeece7]" />
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 text-[11px] text-[#6d7671] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <BookMarked className="w-3.5 h-3.5 text-[#176b5b]" />
              在创作品
            </span>
            <span className="font-semibold text-[#202923]">{user.createdWorksCount ?? 1} 部</span>
          </div>
          <div className="px-2 py-1.5 text-[11px] text-[#6d7671] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Feather className="w-3.5 h-3.5 text-[#176b5b]" />
              总创作字数
            </span>
            <span className="font-semibold text-[#202923] font-mono">
              {(user.totalWordsCount ?? 0).toLocaleString()} 字
            </span>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-[#eeece7]" />
        <DropdownMenuItem
          onClick={() => router.push("/profile")}
          className="text-xs text-[#48534e] hover:text-[#176b5b] hover:bg-[#eef3f0] cursor-pointer rounded-lg py-2"
        >
          <Settings className="w-3.5 h-3.5 mr-2 text-[#176b5b]" />
          <span>作者主页与设置</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push("/login")}
          className="text-xs text-[#48534e] hover:text-[#176b5b] hover:bg-[#eef3f0] cursor-pointer rounded-lg py-2"
        >
          <UserCheck className="w-3.5 h-3.5 mr-2" />
          <span>切换作者账号</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => logout()}
          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer rounded-lg py-2"
        >
          <LogOut className="w-3.5 h-3.5 mr-2" />
          <span>退出当前账号</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
