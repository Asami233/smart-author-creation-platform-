"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  History,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ChapterConflictError,
  createManualVersion,
  fetchChapterVersions,
  fetchVersionDetail,
  restoreChapterVersion,
  type Chapter,
  type ChapterVersionDetail,
  type ChapterVersionSummary,
  type VersionPagination,
} from "@/lib/client/api";

interface VersionHistoryDialogProps {
  chapterId?: string;
  chapterTitle?: string;
  currentRevision?: number;
  onBeforeOpen?: () => Promise<boolean> | boolean;
  onRestored?: (restoredChapter: Chapter) => void;
  trigger?: React.ReactNode;
}

export function VersionHistoryDialog({
  chapterId,
  chapterTitle = "当前章节",
  currentRevision,
  onBeforeOpen,
  onRestored,
  trigger,
}: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ChapterVersionSummary[]>([]);
  const [pagination, setPagination] = useState<VersionPagination | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ChapterVersionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [manualLabel, setManualLabel] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const [restoreConfirmationOpen, setRestoreConfirmationOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 加载版本列表
  const loadVersions = async (preferredId?: string) => {
    if (!chapterId) return;
    setLoadingList(true);
    setErrorMessage(null);
    try {
      const res = await fetchChapterVersions(chapterId, { limit: 30 });
      setVersions(res.data);
      setPagination(res.pagination || null);
      const targetId = preferredId || (res.data.length > 0 ? res.data[0].id : null);
      setSelectedId(targetId);
      if (targetId) {
        loadDetail(targetId);
      } else {
        setSelectedDetail(null);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "获取版本列表失败");
    } finally {
      setLoadingList(false);
    }
  };

  // 加载更早版本（分页追加）
  const handleLoadMore = async () => {
    if (!chapterId || !pagination?.hasMore || !pagination.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErrorMessage(null);
    try {
      const res = await fetchChapterVersions(chapterId, {
        limit: 30,
        cursor: pagination.nextCursor,
      });
      setVersions((prev) => {
        const existingIds = new Set(prev.map((v) => v.id));
        const filteredNew = res.data.filter((v) => !existingIds.has(v.id));
        return [...prev, ...filteredNew];
      });
      setPagination(res.pagination || null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "加载更早版本失败");
    } finally {
      setLoadingMore(false);
    }
  };

  // 加载版本详情（包含正文）
  const loadDetail = async (versionId: string) => {
    setLoadingDetail(true);
    setErrorMessage(null);
    try {
      const detail = await fetchVersionDetail(versionId);
      setSelectedDetail(detail);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "获取版本正文失败");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (open && chapterId) {
      loadVersions();
    }
  }, [open, chapterId]);

  const handleSelect = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    loadDetail(id);
  };

  // 创建手动快照
  const handleCreateManual = async () => {
    if (!chapterId || !manualLabel.trim()) return;
    setIsCreatingManual(true);
    setErrorMessage(null);
    try {
      const created = await createManualVersion(chapterId, manualLabel.trim());
      setManualLabel("");
      await loadVersions(created.id);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "创建快照失败");
    } finally {
      setIsCreatingManual(false);
    }
  };

  // 用户确认后才恢复至此版本
  const handleRestore = async () => {
    if (!selectedId) return;
    setIsRestoring(true);
    setErrorMessage(null);

    // 恢复前先尝试刷盘当前待保存草稿，杜绝在恢复前丢弃最新输入
    if (onBeforeOpen) {
      try {
        const ok = await onBeforeOpen();
        if (!ok) {
          setErrorMessage("当前草稿存在未决保存或版本冲突，已阻止恢复以防丢稿");
          setIsRestoring(false);
          return;
        }
      } catch {
        setErrorMessage("草稿保存失败，已中止恢复");
        setIsRestoring(false);
        return;
      }
    }

    try {
      const restored = await restoreChapterVersion(selectedId, {
        expectedRevision: currentRevision,
      });
      setIsRestored(true);
      if (onRestored) {
        onRestored(restored);
      }
      setTimeout(() => {
        setIsRestored(false);
        setOpen(false);
      }, 700);
    } catch (err: unknown) {
      if (err instanceof ChapterConflictError || (err as any)?.status === 409) {
        setErrorMessage("【版本冲突 409】章节在恢复前已被其他设备更新，请刷新对比后再尝试。");
      } else {
        setErrorMessage(err instanceof Error ? err.message : "恢复版本失败");
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    if (!nextOpen) {
      setRestoreConfirmationOpen(false);
    }
    if (nextOpen && onBeforeOpen) {
      try {
        const ok = await onBeforeOpen();
        if (!ok) return;
      } catch {
        return;
      }
    }
    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[#6e7672] hover:text-[#176b5b] hover:bg-[#eef3f0] gap-1 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>历史版本</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-[#fffefb] border-[#e2e1dc] sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b border-[#eeece7] pb-3 shrink-0">
          <div className="flex items-center justify-between pr-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#e4eeea] text-[#176b5b] flex items-center justify-center">
                <History className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="font-serif font-bold text-base text-[#202923]">
                  章节历史快照与版本回溯
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7d8782]">
                  《{chapterTitle}》· 自动保存快照与手动里程碑
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadVersions(selectedId || undefined)}
              disabled={loadingList}
              className="h-7 px-2 text-xs text-[#176b5b] cursor-pointer"
            >
              <RefreshCw size={12} className={loadingList ? "animate-spin mr-1" : "mr-1"} />
              刷新
            </Button>
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 my-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 手动快照创建条 */}
        <div className="flex items-center gap-2 p-2 bg-[#f6f5f0] rounded-xl border border-[#dedcd4] text-xs">
          <span className="font-medium text-[#46534c] shrink-0">创建手动里程碑快照：</span>
          <input
            type="text"
            value={manualLabel}
            onChange={(e) => setManualLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateManual()}
            placeholder="输入快照说明，如「重写第三段对白」…"
            className="flex-1 h-7 px-2.5 rounded-lg border border-[#d6d4ca] bg-white text-xs focus:outline-none focus:border-[#176b5b]"
            disabled={isCreatingManual}
          />
          <Button
            size="sm"
            onClick={handleCreateManual}
            disabled={isCreatingManual || !manualLabel.trim()}
            className="h-7 px-3 bg-[#176b5b] hover:bg-[#12584a] text-white text-xs rounded-lg cursor-pointer shrink-0"
          >
            {isCreatingManual ? <Loader2 size={12} className="animate-spin mr-1" /> : <Plus size={12} className="mr-1" />}
            创建快照
          </Button>
        </div>

        {/* 双栏对比区 */}
        <div className="grid grid-cols-12 gap-4 my-2 flex-1 min-h-[360px] overflow-hidden">
          {/* 左栏：快照版本轴 */}
          <div className="col-span-5 border-r border-[#eeece7] pr-3 space-y-2 overflow-y-auto scrollbar-thin">
            <span className="text-[10px] font-mono text-[#989e9a] tracking-wider block mb-1">
              VERSIONS ({versions.length})
            </span>
            {loadingList && versions.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f]">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#176b5b] mb-1.5" />
                正在加载快照历史…
              </div>
            ) : versions.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f] space-y-1">
                <p>暂无版本快照</p>
                <p className="text-[11px] text-[#a4aca6]">正文跨越 200 字保存时会自动记录快照</p>
              </div>
            ) : (
              versions.map((ver, idx) => {
                const isSelected = ver.id === selectedId;
                const isCurrent = idx === 0;
                return (
                  <div
                    key={ver.id}
                    onClick={() => handleSelect(ver.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#eef3f0] border-[#176b5b] text-[#176b5b] shadow-2xs"
                        : "bg-white border-[#e6e5e0] hover:bg-[#f8f9f8]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-[#8a928e]">
                        {new Date(ver.createdAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div className="flex items-center gap-1">
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">
                            最新
                          </span>
                        )}
                        <span className="px-1.5 py-0.2 rounded bg-[#eee] text-[#555] font-mono">
                          v{ver.sourceRevision}
                        </span>
                      </div>
                    </div>
                    <h5 className="text-xs font-serif font-bold text-[#202923] mt-1 truncate">
                      {ver.label || (ver.kind === "manual" ? "手动快照" : ver.kind === "restore" ? "恢复备份" : "自动快照")}
                    </h5>
                    <span className="text-[11px] text-[#717b75] font-mono">
                      约 {ver.wordCount} 字
                    </span>
                  </div>
                );
              })
            )}

            {/* 分页加载更多 */}
            {pagination?.hasMore && (
              <div className="pt-2 pb-1 text-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full text-xs text-[#526058] border-[#dedcd4] hover:bg-[#f4f3ee] cursor-pointer"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-[#176b5b]" />
                      <span>正在加载更早版本…</span>
                    </>
                  ) : (
                    <span>加载更早历史版本</span>
                  )}
                </Button>
              </div>
            )}
            {!pagination?.hasMore && versions.length > 0 && !loadingList && (
              <div className="py-2 text-center text-[10px] text-[#9baa9f]">
                已显示全部历史版本
              </div>
            )}
          </div>

          {/* 右栏：正文内容预览 */}
          <div className="col-span-7 flex flex-col justify-between overflow-y-auto pl-1 pr-2 scrollbar-thin">
            <div>
              {selectedDetail ? (
                <>
                  <div className="flex items-center justify-between bg-[#f6f8f7] p-2.5 rounded-xl border border-[#dce8e3] mb-3 text-xs">
                    <span className="text-[#176b5b] font-medium flex items-center gap-1.5 truncate">
                      <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">选定版本：{selectedDetail.label || "自动快照"}</span>
                    </span>
                    <span className="font-mono text-[#717b75] shrink-0">{selectedDetail.wordCount} 字</span>
                  </div>

                  {loadingDetail ? (
                    <div className="py-16 text-center text-xs text-[#8a968f]">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#176b5b] mb-1.5" />
                      加载快照正文中…
                    </div>
                  ) : (
                    <div className="p-4 bg-[#fbfbfa] rounded-xl border border-[#e8e7e1] text-xs font-serif leading-relaxed text-[#2c3731] whitespace-pre-wrap min-h-[220px] max-h-[300px] overflow-y-auto selection:bg-[#bad4cb]">
                      {selectedDetail.plainText || selectedDetail.content?.replace(/<[^>]+>/g, "")}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-20 text-center text-xs text-[#8a968f]">
                  请在左侧选择一个版本进行查看与对比
                </div>
              )}
            </div>

            <div className="p-3 bg-[#fdfaf3] border border-[#f3ecd9] rounded-xl mt-4 flex items-start gap-2 text-xs text-[#826a35]">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                回滚恢复操作将自动在服务端为当前正文生成紧急备份快照，绝不遗失现有创作字句。
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-[#eeece7] pt-3 shrink-0 flex items-center justify-between">
          <span className="text-xs text-[#9aa29e] hidden sm:inline">
            服务端条件更新保全 · 恢复不虚增每日新字数
          </span>
          <Button
            disabled={!selectedDetail || isRestoring || isRestored}
            onClick={() => setRestoreConfirmationOpen(true)}
            className="bg-[#176b5b] hover:bg-[#13594b] text-white text-sm font-medium h-10 px-5 rounded-xl shadow-xs cursor-pointer"
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                正在安全恢复…
              </>
            ) : isRestored ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                已恢复至该版本
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                恢复至此版本
              </>
            )}
          </Button>
        </DialogFooter>

        <AlertDialog open={restoreConfirmationOpen} onOpenChange={setRestoreConfirmationOpen}>
          <AlertDialogContent className="bg-[#fffefb] border-[#dedcd4]">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-serif text-[#202923]">
                确认恢复这个历史版本？
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[#68756e] leading-6">
                将把《{chapterTitle}》恢复为“{selectedDetail?.label || (selectedDetail?.kind === "manual" ? "手动快照" : selectedDetail?.kind === "restore" ? "恢复备份" : "自动快照")}”
                {selectedDetail ? `（v${selectedDetail.sourceRevision}，约 ${selectedDetail.wordCount} 字）` : ""}。
                当前正文会先保存并由服务端生成紧急备份，之后仍可从历史版本找回。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRestoring} className="cursor-pointer">
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!selectedDetail || isRestoring}
                onClick={() => {
                  setRestoreConfirmationOpen(false);
                  void handleRestore();
                }}
                className="bg-[#176b5b] hover:bg-[#13594b] text-white cursor-pointer"
              >
                确认并安全恢复
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
