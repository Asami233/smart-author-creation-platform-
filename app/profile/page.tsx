"use client";

import Link from "next/link";
import { ArrowLeft, Feather } from "lucide-react";

import { ProfileView } from "@/components/profile/profile-view";

export default function ProfilePage() {
  return (
    <main className="min-h-screen w-full bg-[#f4f2ed] flex flex-col justify-between p-4 sm:p-6 md:p-8 font-sans selection:bg-[#176b5b]/15 selection:text-[#176b5b]">
      {/* 顶部极简导航 */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#65716b] hover:text-[#176b5b] transition-colors py-1.5 px-3 rounded-lg hover:bg-[#eceae4]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回写作工作台</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#176b5b] text-white text-[11px] font-serif font-bold flex items-center justify-center">
            砚
          </div>
          <span className="text-xs text-[#78827d] font-serif font-bold">
            智能作者创作平台 · 个人主页与设置
          </span>
        </div>
      </header>

      {/* 主设置卡片容器 */}
      <section className="flex-1 flex items-center justify-center my-4">
        <ProfileView />
      </section>

      {/* 底部信息 */}
      <footer className="max-w-5xl w-full mx-auto text-center py-2 text-[11px] text-[#9ba29d]">
        <p>© 智能作者创作平台 · 专为网络文学创作者定制 · 离线保全与自主可控</p>
      </footer>
    </main>
  );
}
