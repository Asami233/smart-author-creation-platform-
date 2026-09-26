"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  Clock3,
  Globe2,
  Link2,
  Loader2,
  UsersRound,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  batchAddChapterLinks,
  batchRemoveChapterLinks,
  fetchChapterLinks,
  type ChapterLinkInput,
  type ChapterLinkItem,
  type CharacterItem,
  type OutlineItem,
  type WorldItem,
} from "@/lib/client/api";

interface ChapterLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterId: string;
  chapterTitle: string;
  characters: CharacterItem[];
  worldEntries: WorldItem[];
  outlines: OutlineItem[];
  timelineEvents: any[];
  linkedItems: ChapterLinkItem[];
  onLinksChanged: (updatedLinks: ChapterLinkItem[]) => void;
}

export function ChapterLinksDialog({
  open,
  onOpenChange,
  chapterId,
  chapterTitle,
  characters,
  worldEntries,
  outlines,
  timelineEvents,
  linkedItems,
  onLinksChanged,
}: ChapterLinksDialogProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"characters" | "world" | "outlines" | "timeline">("characters");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsResync, setNeedsResync] = useState(false);

  const prevOpenRef = useRef(false);
  const prevChapterIdRef = useRef(chapterId);
  const serverFactsRef = useRef<Set<string>>(new Set());

  // 关键 F04：仅在打开对话框或切换章节时，从传入的 linkedItems 初始化勾选；
  // 坚决不在 linkedItems 变化时自动重设 selectedKeys，彻底避免批量失败回拉事实时覆盖用户的期望勾选与错误提示！
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    const chapterChanged = chapterId !== prevChapterIdRef.current;
    if (justOpened || chapterChanged) {
      const facts = new Set(linkedItems.map((item) => `${item.entityType}:${item.entityId}`));
      serverFactsRef.current = facts;
      setSelectedKeys(new Set(facts));
      setErrorMessage(null);
      setNeedsResync(false);
    }
    prevOpenRef.current = open;
    prevChapterIdRef.current = chapterId;
  }, [open, chapterId]);

  const toggleKey = (entityType: ChapterLinkInput["entityType"], entityId: string) => {
    const key = `${entityType}:${entityId}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!chapterId) return;
    setIsSaving(true);
    setErrorMessage(null);

    // C03：若事实重拉曾失败，需先重同步成功再允许计算差量与提交，绝不以不确定事实认定无变化
    if (needsResync) {
      try {
        const freshFacts = await fetchChapterLinks(chapterId);
        serverFactsRef.current = new Set(freshFacts.map((item) => `${item.entityType}:${item.entityId}`));
        onLinksChanged(freshFacts);
        setNeedsResync(false);
      } catch (syncErr) {
        setIsSaving(false);
        const syncMsg = syncErr instanceof Error ? syncErr.message : "网络同步失败";
        setErrorMessage(`无法与服务端同步当前真实关联事实（${syncMsg}），已阻止提交以防状态错乱。请检查网络后重试。`);
        return;
      }
    }

    const currentFacts = serverFactsRef.current;

    const toAdd: ChapterLinkInput[] = [];
    const toRemove: ChapterLinkInput[] = [];

    // 计算待新增项（在用户期望勾选中，但服务端尚未建立关联）
    for (const key of selectedKeys) {
      if (!currentFacts.has(key)) {
        const [entityType, entityId] = key.split(":") as [ChapterLinkInput["entityType"], string];
        toAdd.push({ entityType, entityId });
      }
    }

    // 计算待删除项（在服务端已有事实中，但已被用户取消勾选）
    for (const key of currentFacts) {
      if (!selectedKeys.has(key)) {
        const [entityType, entityId] = key.split(":") as [ChapterLinkInput["entityType"], string];
        toRemove.push({ entityType, entityId });
      }
    }

    // 如果没有任何变更，直接关闭
    if (toAdd.length === 0 && toRemove.length === 0) {
      setIsSaving(false);
      onOpenChange(false);
      return;
    }

    let addedSuccess = false;
    try {
      // 批量新增
      if (toAdd.length > 0) {
        await batchAddChapterLinks(chapterId, toAdd);
        addedSuccess = true;
        toAdd.forEach((item) => {
          serverFactsRef.current.add(`${item.entityType}:${item.entityId}`);
        });
      }
      // 批量删除
      if (toRemove.length > 0) {
        await batchRemoveChapterLinks(chapterId, toRemove);
        toRemove.forEach((item) => {
          serverFactsRef.current.delete(`${item.entityType}:${item.entityId}`);
        });
      }

      // 重新获取全量最新关联列表
      const latest = await fetchChapterLinks(chapterId);
      serverFactsRef.current = new Set(latest.map((item) => `${item.entityType}:${item.entityId}`));
      onLinksChanged(latest);
      onOpenChange(false);
    } catch (err: unknown) {
      // 关键 F04 / C03：失败时保留用户当前期望勾选状态，重新获取服务端事实并同步差量
      const msg = err instanceof Error ? err.message : "批量关联更新失败";
      let intermediate: ChapterLinkItem[] | null = null;
      try {
        intermediate = await fetchChapterLinks(chapterId);
        serverFactsRef.current = new Set(intermediate.map((item) => `${item.entityType}:${item.entityId}`));
        onLinksChanged(intermediate);
      } catch (syncErr) {
        console.error("同步服务端关联事实失败:", syncErr);
      }

      if (!intermediate) {
        setNeedsResync(true);
        setErrorMessage(`批量关联更新失败：${msg}。且无法获取服务端最新事实，已标记需重新同步。当前勾选已保留，点击将先重同步再提交。`);
      } else if (addedSuccess) {
        setErrorMessage(`新增关联已成功保存，但移除关联失败：${msg}。当前勾选已保留，点击保存仅重试剩余变更。`);
      } else {
        setErrorMessage(`批量关联更新失败：${msg}。当前勾选已保留，请重试。`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#fffefb] border border-[#dedfd9] rounded-2xl sm:max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl">
        <DialogHeader className="border-b border-[#dedfd9] pb-3 shrink-0">
          <DialogTitle className="font-serif text-xl font-bold text-[#202923] flex items-center gap-2">
            <Link2 className="w-5 h-5 text-[#176b5b]" />
            <span>管理本章设定关联 · 《{chapterTitle}》</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-[#56615b]">
            勾选当前章节出场的角色、涉及的世界观地点/体系与对应大纲，方便沉淀创作脉络与大模型精准辅助。
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 my-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-amber-700 hover:text-amber-900 p-0.5 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(val: any) => setActiveTab(val)}
          className="flex-1 flex flex-col min-h-0 pt-2"
        >
          <TabsList className="grid grid-cols-4 bg-[#f0eee8] h-10 p-0.5 rounded-lg text-sm shrink-0">
            <TabsTrigger value="characters" className="flex items-center gap-1.5 text-sm font-medium">
              <UsersRound size={14} />
              <span>出场角色</span>
              <span className="text-[10px] font-mono opacity-80">({characters.length})</span>
            </TabsTrigger>
            <TabsTrigger value="world" className="flex items-center gap-1.5 text-xs">
              <Globe2 size={13} />
              <span>世界设定</span>
              <span className="text-[10px] font-mono opacity-80">({worldEntries.length})</span>
            </TabsTrigger>
            <TabsTrigger value="outlines" className="flex items-center gap-1.5 text-xs">
              <Archive size={13} />
              <span>对应大纲</span>
              <span className="text-[10px] font-mono opacity-80">({outlines.length})</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-1.5 text-xs">
              <Clock3 size={13} />
              <span>时间线事件</span>
              <span className="text-[10px] font-mono opacity-80">({timelineEvents.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* 角色选择 */}
          <TabsContent value="characters" className="flex-1 overflow-y-auto p-2 space-y-1.5 mt-2">
            {characters.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f]">
                作品暂未录入角色，可在侧边栏「角色」面板中创建
              </div>
            ) : (
              characters.map((char) => {
                const isChecked = selectedKeys.has(`character:${char.id}`);
                return (
                  <label
                    key={char.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isChecked
                        ? "bg-[#edf5f2] border-[#176b5b] text-[#176b5b]"
                        : "bg-white border-[#e5e4de] text-[#334038] hover:bg-[#fbfaf6]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleKey("character", char.id)}
                      className="rounded accent-[#176b5b] w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="font-serif text-xs text-[#1e2a23]">{char.name}</strong>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e9e8e0] text-[#616e66] font-mono">
                          {char.role}
                        </span>
                      </div>
                      {char.description && (
                        <p className="text-[11px] text-[#78847d] truncate mt-0.5">{char.description}</p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </TabsContent>

          {/* 设定选择 */}
          <TabsContent value="world" className="flex-1 overflow-y-auto p-2 space-y-1.5 mt-2">
            {worldEntries.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f]">
                作品暂未录入世界观条目，可在侧边栏「设定」面板中创建
              </div>
            ) : (
              worldEntries.map((entry) => {
                const isChecked = selectedKeys.has(`world:${entry.id}`);
                return (
                  <label
                    key={entry.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isChecked
                        ? "bg-[#edf5f2] border-[#176b5b] text-[#176b5b]"
                        : "bg-white border-[#e5e4de] text-[#334038] hover:bg-[#fbfaf6]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleKey("world", entry.id)}
                      className="rounded accent-[#176b5b] w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="font-serif text-xs text-[#1e2a23]">{entry.name}</strong>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e9e8e0] text-[#616e66] font-mono">
                          {entry.category}
                        </span>
                      </div>
                      {entry.summary && (
                        <p className="text-[11px] text-[#78847d] truncate mt-0.5">{entry.summary}</p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </TabsContent>

          {/* 大纲选择 */}
          <TabsContent value="outlines" className="flex-1 overflow-y-auto p-2 space-y-1.5 mt-2">
            {outlines.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f]">
                作品暂未录入大纲，可在侧边栏「大纲」面板中创建
              </div>
            ) : (
              outlines.map((otl) => {
                const isChecked = selectedKeys.has(`outline:${otl.id}`);
                return (
                  <label
                    key={otl.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isChecked
                        ? "bg-[#edf5f2] border-[#176b5b] text-[#176b5b]"
                        : "bg-white border-[#e5e4de] text-[#334038] hover:bg-[#fbfaf6]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleKey("outline", otl.id)}
                      className="rounded accent-[#176b5b] w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="font-serif text-xs text-[#1e2a23]">{otl.title}</strong>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e9e8e0] text-[#616e66] font-mono">
                          {otl.scopeType === "work" ? "作品主线" : otl.scopeType === "volume" ? "分卷大纲" : "单章细纲"}
                        </span>
                      </div>
                      {otl.content && (
                        <p className="text-[11px] text-[#78847d] truncate mt-0.5">{otl.content}</p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </TabsContent>

          {/* 时间线事件 */}
          <TabsContent value="timeline" className="flex-1 overflow-y-auto p-2 space-y-1.5 mt-2">
            {timelineEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8a968f]">
                作品暂未录入时间线事件，可在侧边栏「时间线」面板中创建
              </div>
            ) : (
              timelineEvents.map((evt) => {
                const isChecked = selectedKeys.has(`timeline:${evt.id}`);
                return (
                  <label
                    key={evt.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isChecked
                        ? "bg-[#edf5f2] border-[#176b5b] text-[#176b5b]"
                        : "bg-white border-[#e5e4de] text-[#334038] hover:bg-[#fbfaf6]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleKey("timeline", evt.id)}
                      className="rounded accent-[#176b5b] w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="font-serif text-xs text-[#1e2a23]">{evt.title}</strong>
                        {evt.storyTime && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e9e8e0] text-[#616e66] font-mono">
                            {evt.storyTime}
                          </span>
                        )}
                      </div>
                      {evt.description && (
                        <p className="text-[11px] text-[#78847d] truncate mt-0.5">{evt.description}</p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-[#dedfd9] pt-4 shrink-0 flex items-center justify-between sm:justify-between">
          <span className="text-sm text-[#56615b]">
            已选择 <strong className="font-mono text-[#176b5b] font-bold">{selectedKeys.size}</strong> 个关联实体
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="h-10 px-4 text-sm rounded-lg border-[#dedcd4] text-[#56615b] hover:text-[#202923]"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="h-10 px-5 text-sm rounded-lg bg-[#176b5b] hover:bg-[#12584a] text-white cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  <span>{needsResync ? "正在同步并保存…" : "正在保存关联…"}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  <span>{needsResync ? "重新同步并保存" : "保存关联变更"}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
