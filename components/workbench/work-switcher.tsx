"use client";

import React from "react";
import { BookOpen, Check, ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Work } from "@/lib/client/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkSwitcherProps {
  works: Work[];
  activeWorkId: string | null;
  onSelectWork: (workId: string) => void;
  onCreateWorkClick: () => void;
  onArchiveWork?: (workId: string) => void;
}

export function WorkSwitcher({
  works,
  activeWorkId,
  onSelectWork,
  onCreateWorkClick,
  onArchiveWork,
}: WorkSwitcherProps) {
  const currentWork = works.find((w) => w.id === activeWorkId) || works[0] || null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="project-switcher group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#e4e2da] bg-white/80 hover:bg-[#edf5f2] hover:border-[#176b5b]/40 text-[#1b2b24] text-xs font-serif font-bold transition-all shadow-2xs cursor-pointer"
          type="button"
          title="点击切换当前创作作品或新建作品"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#176b5b] shrink-0" />
          <span className="truncate max-w-[140px] sm:max-w-[200px]">
            {currentWork ? currentWork.title : "选择或创建作品"}
          </span>
          <ChevronDown
            size={13}
            className="text-[#717b75] group-hover:text-[#176b5b] transition-transform group-data-[state=open]:rotate-180"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-72 bg-[#fffefb] border border-[#d9d7ce] rounded-2xl shadow-xl p-1.5 text-xs text-[#202923] animate-fadeIn"
      >
        <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-mono text-[#79857e] flex items-center justify-between">
          <span>我的长篇作品库</span>
          <span className="bg-[#edf3f0] text-[#176b5b] px-1.5 py-0.5 rounded-full font-bold">
            {works.length} 部
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1 bg-[#eeece6]" />

        <div className="max-h-64 overflow-y-auto space-y-0.5 pr-0.5">
          {works.length === 0 ? (
            <div className="py-4 text-center text-[#86918a] text-xs">
              暂无作品，立即创建第一部开启笔耕！
            </div>
          ) : (
            works.map((work) => {
              const isActive = work.id === (activeWorkId || currentWork?.id);
              return (
                <DropdownMenuItem
                  key={work.id}
                  onClick={() => onSelectWork(work.id)}
                  className={`flex items-start justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[#edf5f2] text-[#176b5b] font-medium border border-[#bad4cb]/60"
                      : "hover:bg-[#f6f5f0] text-[#2b3831]"
                  }`}
                >
                  <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-serif font-bold text-xs truncate">
                        {work.title}
                      </span>
                      {work.genre && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e8f1ed] text-[#176b5b] shrink-0">
                          {work.genre}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#717b75] font-mono flex items-center gap-2">
                      <span>{work.chapterCount || 0} 章节</span>
                      <span>·</span>
                      <span>{(work.totalWords || 0).toLocaleString()} 字</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive ? (
                      <Check className="w-4 h-4 text-[#176b5b] shrink-0" />
                    ) : onArchiveWork ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`确定要将作品《${work.title}》移入归档吗？`)) {
                            onArchiveWork(work.id);
                          }
                        }}
                        className="p-1 text-[#8c9791] hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="归档此作品"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <DropdownMenuSeparator className="my-1 bg-[#eeece6]" />

        <DropdownMenuItem
          onClick={onCreateWorkClick}
          className="flex items-center gap-2 p-2 rounded-xl text-xs text-[#176b5b] font-semibold hover:bg-[#edf5f2] cursor-pointer"
        >
          <div className="w-5 h-5 rounded-md bg-[#176b5b] text-white flex items-center justify-center shadow-2xs">
            <Plus size={13} />
          </div>
          <span>新建一部新作品…</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
