"use client";

import { useEffect, useState } from "react";
import { BookOpen, FileText, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchTrash,
  restoreTrashChapter,
  restoreTrashWork,
  type TrashOverview,
} from "@/lib/client/api";
import { formatLocalDateTime } from "@/lib/client/date-format";

interface TrashDialogProps {
  onRestored?: () => void | Promise<void>;
  trigger?: React.ReactNode;
}

export function TrashDialog({ onRestored, trigger }: TrashDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [trashData, setTrashData] = useState<TrashOverview>({ chapters: [], works: [] });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTrash = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchTrash();
      setTrashData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "拉取回收站失败";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadTrash();
    }
  }, [open]);

  const handleRestoreChapter = async (chapterId: string) => {
    setRestoringId(chapterId);
    try {
      await restoreTrashChapter(chapterId);
      setTrashData((prev) => ({
        ...prev,
        chapters: prev.chapters.filter((c) => c.id !== chapterId),
      }));
      await onRestored?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "恢复章节失败");
    } finally {
      setRestoringId(null);
    }
  };

  const handleRestoreWork = async (workId: string) => {
    setRestoringId(workId);
    try {
      await restoreTrashWork(workId);
      setTrashData((prev) => ({
        ...prev,
        works: prev.works.filter((w) => w.id !== workId),
      }));
      await onRestored?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "恢复作品失败");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="icon"
            className="text-[#68756e] hover:text-[#176b5b] hover:bg-[#edf5f2] cursor-pointer"
            title="查看回收站与历史软删"
            aria-label="回收站"
          >
            <Trash2 size={16} />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-[#fffefb] border-[#e2e1dc] sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b border-[#eeece7] pb-3 shrink-0">
          <div className="flex items-center justify-between pr-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#edf5f2] text-[#176b5b] flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="font-serif font-bold text-base text-[#202923]">
                  创作回收站
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7d8782]">
                  误删章节与已归档作品均可安全一键复原
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadTrash}
              disabled={loading}
              className="h-7 px-2 text-xs text-[#176b5b] cursor-pointer"
            >
              <RefreshCw size={12} className={loading ? "animate-spin mr-1" : "mr-1"} />
              刷新
            </Button>
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 my-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            {errorMessage}
          </div>
        )}

        <Tabs defaultValue="chapters" className="flex-1 flex flex-col min-h-0 pt-2">
          <TabsList className="grid grid-cols-2 bg-[#f0eee6] rounded-xl p-1 mb-3">
            <TabsTrigger value="chapters" className="text-xs data-[state=active]:bg-white">
              已删除章节 ({trashData.chapters.length})
            </TabsTrigger>
            <TabsTrigger value="works" className="text-xs data-[state=active]:bg-white">
              已归档作品 ({trashData.works.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chapters" className="flex-1 overflow-y-auto min-h-[220px] pr-1 space-y-2">
            {loading && trashData.chapters.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-[#8a968f] gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#176b5b]" />
                <span>加载回收站中…</span>
              </div>
            ) : trashData.chapters.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f] space-y-1">
                <p>回收站暂无被删除的章节</p>
                <p className="text-[11px] text-[#a4aca6]">删除的章节将在此安全保全，支持随时复原</p>
              </div>
            ) : (
              trashData.chapters.map((ch) => (
                <div
                  key={ch.id}
                  className="p-3 rounded-xl bg-[#faf9f5] border border-[#e8e6dc] flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-1.5 font-serif font-bold text-[#233128] truncate">
                      <FileText size={14} className="text-[#176b5b] shrink-0" />
                      <span className="truncate">{ch.title}</span>
                    </div>
                    <div className="text-[10px] text-[#7f8b84] font-mono mt-0.5">
                      <span>{ch.wordCount || 0} 字</span>
                      <span className="mx-1.5">·</span>
                      <span>删除于 {formatLocalDateTime(ch.deletedAt)}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoringId === ch.id}
                    onClick={() => handleRestoreChapter(ch.id)}
                    className="h-8 px-3 text-xs rounded-lg border-[#bad4cb] text-[#176b5b] hover:bg-[#edf5f2] cursor-pointer shrink-0"
                  >
                    {restoringId === ch.id ? (
                      <Loader2 size={12} className="animate-spin mr-1" />
                    ) : (
                      <RotateCcw size={12} className="mr-1" />
                    )}
                    恢复章节
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="works" className="flex-1 overflow-y-auto min-h-[220px] pr-1 space-y-2">
            {loading && trashData.works.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-[#8a968f] gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#176b5b]" />
                <span>加载回收站中…</span>
              </div>
            ) : trashData.works.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f] space-y-1">
                <p>回收站暂无归档作品</p>
                <p className="text-[11px] text-[#a4aca6]">归档作品在此存放，可随时恢复至工作台</p>
              </div>
            ) : (
              trashData.works.map((w) => (
                <div
                  key={w.id}
                  className="p-3 rounded-xl bg-[#faf9f5] border border-[#e8e6dc] flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-1.5 font-serif font-bold text-[#233128] truncate">
                      <BookOpen size={14} className="text-[#176b5b] shrink-0" />
                      <span className="truncate">{w.title}</span>
                      {w.genre && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e8f1ed] text-[#176b5b] shrink-0 font-normal">
                          {w.genre}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#7f8b84] font-mono mt-0.5">
                      <span>{(w.totalWords || 0).toLocaleString()} 字</span>
                      <span className="mx-1.5">·</span>
                      <span>归档于 {formatLocalDateTime(w.archivedAt)}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoringId === w.id}
                    onClick={() => handleRestoreWork(w.id)}
                    className="h-8 px-3 text-xs rounded-lg border-[#bad4cb] text-[#176b5b] hover:bg-[#edf5f2] cursor-pointer shrink-0"
                  >
                    {restoringId === w.id ? (
                      <Loader2 size={12} className="animate-spin mr-1" />
                    ) : (
                      <RotateCcw size={12} className="mr-1" />
                    )}
                    恢复作品
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
