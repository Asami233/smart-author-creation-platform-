"use client";

import { Feather, ShieldCheck, Sparkles, Zap } from "lucide-react";

export function BrandFeaturePanel() {
  return (
    <div className="relative hidden lg:flex flex-col justify-between p-10 xl:p-12 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b4338] via-[#173a31] to-[#0f2721] text-emerald-50 border border-emerald-900/40 shadow-2xl">
      {/* 典雅的东方水墨光晕装饰 */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl animate-ink-pulse-glow" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-teal-400/15 blur-3xl animate-ink-drift" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 h-64 w-64 rounded-full bg-emerald-600/10 blur-2xl animate-ink-pulse-glow" />

      {/* 顶部品牌与徽章 */}
      <div className="relative z-10">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-b from-emerald-400 to-teal-600 flex items-center justify-center font-serif text-2xl font-bold text-white shadow-lg shadow-emerald-950/40 border border-emerald-300/30 animate-ink-float">
            砚
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-serif">
              智能作者创作平台
            </h1>
            <p className="text-xs text-emerald-300/80 font-mono tracking-wider">
              SMART AUTHOR WORKSPACE
            </p>
          </div>
        </div>

        <div className="mt-12 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 backdrop-blur-sm">
            <Feather className="w-3.5 h-3.5 text-emerald-400" />
            <span>面向中国网络文学个人作者</span>
          </div>
          <h2 className="text-3xl xl:text-4xl font-serif font-bold text-white leading-tight tracking-tight">
            百万字长卷，
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-teal-100 to-emerald-300">
              始于这一笔。
            </span>
          </h2>
          <p className="text-sm text-emerald-100/70 max-w-md leading-relaxed pt-1">
            专注、无扰、本地优先。专为长篇网络文学连载打造的现代桌面写作工作台。
          </p>
        </div>
      </div>

      {/* 中部核心特性卡片 */}
      <div className="relative z-10 my-8 grid gap-3.5">
        <div className="group flex items-start gap-3.5 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/30 backdrop-blur-md transition-all hover:bg-emerald-950/60 hover:border-emerald-700/40">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 mt-0.5">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">本地优先 · 自动保存状态可见</h3>
            <p className="text-xs text-emerald-200/65 mt-0.5 leading-normal">
              编辑后自动保存到本地服务。保存失败时草稿仅在当前窗口，请勿刷新或关闭，恢复连接后可重试。
            </p>
          </div>
        </div>

        <div className="group flex items-start gap-3.5 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/30 backdrop-blur-md transition-all hover:bg-emerald-950/60 hover:border-emerald-700/40">
          <div className="p-2 rounded-lg bg-teal-500/20 text-teal-300 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">受控 AI · 灵感推演与润色</h3>
            <p className="text-xs text-emerald-200/65 mt-0.5 leading-normal">
              支持 OpenAI 兼容模型，严格保护隐私；AI 辅助仅在授权范围内推演，不擅自覆写正文。
            </p>
          </div>
        </div>

        <div className="group flex items-start gap-3.5 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/30 backdrop-blur-md transition-all hover:bg-emerald-950/60 hover:border-emerald-700/40">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">大纲角色世界观 · 灵动贯通</h3>
            <p className="text-xs text-emerald-200/65 mt-0.5 leading-normal">
              分卷章节树、人物小传与设定线索集中管理，配合章节跳转与本章查找，梳理长篇故事。
            </p>
          </div>
        </div>
      </div>

      {/* 底部文人箴言卡片 */}
      <div className="relative z-10 pt-4 border-t border-emerald-800/40 flex items-center justify-between text-xs text-emerald-300/70">
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>今日宜：专注写作 · 灵感泉涌</span>
        </div>
        <span className="font-serif italic text-emerald-400/80">「 行云流水，落笔生花 」</span>
      </div>
    </div>
  );
}
