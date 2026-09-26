"use client";

import React, { useState } from "react";
import { BookPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createWork, type Work } from "@/lib/client/api";

interface CreateWorkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (newWork: Work) => void;
  onBeforeCreate?: () => Promise<boolean>;
}

const GENRE_PRESETS = [
  "仙侠玄幻",
  "悬疑惊悚",
  "科幻未来",
  "都市生活",
  "历史架空",
  "奇幻史诗",
];

export function CreateWorkDialog({
  open,
  onOpenChange,
  onCreated,
  onBeforeCreate,
}: CreateWorkDialogProps) {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("仙侠玄幻");
  const [targetWords, setTargetWords] = useState("1000000");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("请输入作品名称");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      // 关键 F01：在创建作品并切走工作区前，拦截待保存草稿，若保存失败或处于版本冲突则阻止创建
      if (onBeforeCreate) {
        const canProceed = await onBeforeCreate();
        if (!canProceed) {
          setIsSubmitting(false);
          return;
        }
      }

      const trimmed = targetWords.trim();
      let parsedWords = 0;
      if (trimmed !== "") {
        if (!/^\d+$/.test(trimmed)) {
          setErrorMsg("目标字数必须为非负整数（不可输入小数、负数或特殊字符）");
          return;
        }
        const val = Number(trimmed);
        if (!Number.isSafeInteger(val) || val < 0) {
          setErrorMsg("目标字数必须为有效的非负整数");
          return;
        }
        if (val > 20000000) {
          setErrorMsg("目标字数最大支持 20,000,000 字");
          return;
        }
        parsedWords = val;
      }

      const res = await createWork({
        title: title.trim(),
        genre: genre.trim() || "未分类",
        targetWords: parsedWords,
        description: description.trim(),
      });

      // 重置并关闭
      setTitle("");
      setDescription("");
      setTargetWords("1000000");
      onOpenChange(false);
      onCreated(res.work);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "创建作品失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#fffefb] border border-[#dedfd9] rounded-2xl p-6 shadow-2xl">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="w-10 h-10 rounded-xl bg-[#edf5f2] border border-[#bad4cb] flex items-center justify-center text-[#176b5b] mb-1">
            <BookPlus size={20} />
          </div>
          <DialogTitle className="font-serif text-xl font-bold text-[#202923]">
            新建长篇作品
          </DialogTitle>
          <DialogDescription className="text-sm text-[#56615b]">
            建立新的作品档案。系统将自动初始化卷首与第一章，方便您立即落墨开篇。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#202923] block">
              作品名称 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：《大荒问剑录》、《雾港旧事》"
              className="w-full h-10 px-3 text-[15px] rounded-lg border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b] shadow-2xs font-serif"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#202923] block">
              作品题材
            </label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {GENRE_PRESETS.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setGenre(item)}
                  className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer ${
                    genre === item
                      ? "bg-[#176b5b] text-white border-[#176b5b] font-medium"
                      : "bg-white text-[#56615b] border-[#dedcd4] hover:border-[#176b5b]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="自定义题材分类"
              className="w-full h-9 px-3 text-sm rounded-lg border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#202923] block">
              预期完结总字数
            </label>
            <input
              type="number"
              min="0"
              max="20000000"
              step="1"
              placeholder="例如：0（不限）或 300000"
              value={targetWords}
              onChange={(e) => setTargetWords(e.target.value)}
              className="w-full h-10 px-3 text-[15px] rounded-lg border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b] font-mono"
            />
            <p className="text-[13px] text-[#56615b]">
              可设任意合法整数（输入 0 代表不设限，亦可设为 1、12345、300000、20000000 等）
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#202923] block">
              故事简介 / 核心梗概
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简述故事核心矛盾、世界观与主角动机…"
              className="w-full p-3 text-[15px] rounded-lg border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b] resize-none leading-relaxed"
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-10 px-4 text-sm text-[#56615b] hover:text-[#202923] cursor-pointer"
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="h-10 px-5 bg-[#176b5b] hover:bg-[#12584a] text-white text-sm font-medium rounded-lg cursor-pointer shadow-md shadow-[#176b5b]/20"
            >
              {isSubmitting ? "正在创建..." : "立即创建开篇"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
