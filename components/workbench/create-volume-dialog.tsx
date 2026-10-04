"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Layers, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createVolume, type Volume } from "@/lib/client/api";

interface CreateVolumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string | null;
  workTitle?: string;
  volumeCount: number;
  onCreated: (newVolume: Volume) => void;
}

export function CreateVolumeDialog({
  open,
  onOpenChange,
  workId,
  workTitle = "当前作品",
  volumeCount,
  onCreated,
}: CreateVolumeDialogProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const defaultTitle = `第${volumeCount + 1}卷 `;
      setTitle(defaultTitle);
      setSummary("");
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [open, volumeCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workId) {
      setErrorMessage("作品上下文无效，请稍后重试");
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage("请输入分卷名称");
      return;
    }
    if (trimmedTitle.length > 120) {
      setErrorMessage("分卷名称不能超过 120 个字符");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const created = await createVolume(workId, {
        title: trimmedTitle,
        summary: summary.trim(),
      });
      onCreated(created);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建分卷失败，请重试";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-[#fffefb] border border-[#dedfd9] rounded-2xl shadow-xl p-0 overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* 头部区 */}
          <div className="p-6 bg-[#f4f2ec] border-b border-[#dedfd9]">
            <DialogHeader className="space-y-1.5 text-left">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#e7efe9] text-[#176b5b] flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="font-serif text-xl font-bold text-[#202923]">
                    新建作品分卷
                  </DialogTitle>
                  <p className="text-sm text-[#56615b] mt-0.5">
                    为《{workTitle}》设立新的卷册结构
                  </p>
                </div>
              </div>
              <DialogDescription className="text-sm text-[#56615b] pt-1">
                分卷用于规划宏观长篇情节阶段（如：第一卷 潜龙在渊、第二卷 鱼跃龙门等），可独立收纳对应章节。
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* 表单内容 */}
          <div className="p-6 space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#202923] flex items-center justify-between">
                <span>分卷名称 <span className="text-rose-500">*</span></span>
                <span className="text-xs text-[#8e9892] font-mono">{title.length}/120</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：第一卷 少年行 / 第二卷 踏天阙"
                className="bg-white border-[#dedcd4] focus-visible:ring-[#176b5b] text-[15px] h-10 rounded-lg"
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#202923] flex items-center justify-between">
                <span>分卷梗概与主线看点 <span className="text-xs font-normal text-[#68716c]">（选填）</span></span>
                <span className="text-xs text-[#8e9892] font-mono">{summary.length}/10000</span>
              </label>
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="简述本卷的核心冲突、关键转折点及预定结局高潮，方便创作时理清脉络……"
                className="bg-white border-[#dedcd4] focus-visible:ring-[#176b5b] text-[15px] min-h-[96px] leading-relaxed resize-y rounded-lg"
                maxLength={10000}
              />
            </div>
          </div>

          {/* 底部按钮 */}
          <DialogFooter className="p-4 bg-[#f8f7f2] border-t border-[#dedfd9] flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-10 px-4 text-sm rounded-lg border-[#dedcd4] text-[#56615b] hover:text-[#202923] hover:bg-white"
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !title.trim()}
              className="h-10 px-5 text-sm rounded-lg bg-[#176b5b] hover:bg-[#13584a] text-white flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在创建…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>确认新建分卷</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
