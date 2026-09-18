"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { BrandFeaturePanel } from "@/components/auth/brand-feature-panel";

export default function LoginPage() {
  return (
    <main className="min-h-screen w-full bg-[#f4f2ed] flex flex-col justify-between p-4 sm:p-6 md:p-8 lg:p-10 font-sans selection:bg-[#176b5b]/15 selection:text-[#176b5b]">
      {/* 顶部极简导航 */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#65716b] hover:text-[#176b5b] transition-colors py-1.5 px-3 rounded-lg hover:bg-[#eceae4]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回写作工作台</span>
        </Link>
        <span className="text-xs text-[#9aa29e] hidden sm:inline">
          智能作者创作平台 · M1 交互体验版
        </span>
      </header>

      {/* 核心卡片容器：双栏展示 */}
      <section className="flex-1 flex items-center justify-center my-4 sm:my-6">
        <div className="w-full max-w-5xl grid lg:grid-cols-12 gap-6 xl:gap-8 items-stretch">
          {/* 左侧品牌与特性体验展示（占7列） */}
          <div className="hidden lg:flex lg:col-span-7 h-full min-h-[580px]">
            <BrandFeaturePanel />
          </div>

          {/* 右侧登录/注册卡片（占5列） */}
          <div className="col-span-12 lg:col-span-5 flex items-center justify-center">
            <Suspense
              fallback={
                <div className="w-full h-96 flex flex-col items-center justify-center gap-3 bg-[#fffefb] rounded-3xl border border-[#e5e4de]">
                  <Loader2 className="w-6 h-6 text-[#176b5b] animate-spin" />
                  <span className="text-xs text-[#737b76]">正在加载登录模块...</span>
                </div>
              }
            >
              <AuthCard />
            </Suspense>
          </div>
        </div>
      </section>

      {/* 底部版权与说明 */}
      <footer className="max-w-6xl w-full mx-auto text-center py-3 text-[11px] text-[#9ba29d]">
        <p>
          © 智能作者创作平台 · 专注中国网络文学个人创作 · 本地优先与隐私安全保护
        </p>
      </footer>
    </main>
  );
}
