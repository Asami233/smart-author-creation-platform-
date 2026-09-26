"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit3,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  fetchKnowledgeList,
  reorderOutlines,
  updateKnowledgeItem,
  type OutlineItem,
  type Volume,
} from "@/lib/client/api";

interface OutlineViewProps {
  workId?: string | null;
  volumes?: Volume[];
  chapters?: { id: string; title: string; volumeId?: string | null }[];
}

export function OutlineView({ workId, volumes = [], chapters = [] }: OutlineViewProps) {
  const [outlines, setOutlines] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [activeScope, setActiveScope] = useState<"all" | "work" | "volume" | "chapter">("all");
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editScopeType, setEditScopeType] = useState<"work" | "volume" | "chapter">("work");
  const [editScopeId, setEditScopeId] = useState<string>("");

  const loadOutlines = async () => {
    if (!workId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchKnowledgeList<OutlineItem>(workId, "outlines");
      setOutlines(data);
      if (data.length > 0) {
        const first = data[0];
        setSelectedOutlineId(first.id);
        setEditTitle(first.title);
        setEditContent(first.content);
        setEditScopeType(first.scopeType);
        setEditScopeId(first.scopeId || "");
      } else {
        setSelectedOutlineId(null);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "加载大纲失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutlines();
  }, [workId]);

  const currentOutline = outlines.find((o) => o.id === selectedOutlineId) || null;

  const filteredOutlines = outlines.filter((o) => {
    if (activeScope === "all") return true;
    return o.scopeType === activeScope;
  });

  const handleSelect = (outline: OutlineItem) => {
    setSelectedOutlineId(outline.id);
    setEditTitle(outline.title);
    setEditContent(outline.content);
    setEditScopeType(outline.scopeType);
    setEditScopeId(outline.scopeId || "");
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!selectedOutlineId) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await updateKnowledgeItem<OutlineItem>("outlines", selectedOutlineId, {
        title: editTitle,
        content: editContent,
        scopeType: editScopeType,
        scopeId: editScopeType === "work" ? null : editScopeId || null,
      });
      setOutlines((prev) => prev.map((item) => (item.id === selectedOutlineId ? updated : item)));
      setIsEditing(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "保存大纲失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!workId) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const scopeType: "work" | "volume" | "chapter" = activeScope === "all" ? "work" : activeScope;
      let scopeId: string | null = null;
      if (scopeType === "volume" && volumes.length > 0) scopeId = volumes[0].id;
      if (scopeType === "chapter" && chapters.length > 0) scopeId = chapters[0].id;

      const created = await createKnowledgeItem<OutlineItem>(workId, "outlines", {
        scopeType,
        scopeId,
        title: "新大纲条目 · 点击编辑",
        content: "记录该节点的核心伏笔、主要冲突与情节转折……",
      });
      setOutlines([created, ...outlines]);
      setSelectedOutlineId(created.id);
      setEditTitle(created.title);
      setEditContent(created.content);
      setEditScopeType(created.scopeType);
      setEditScopeId(created.scopeId || "");
      setIsEditing(true);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "新建大纲失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    try {
      await deleteKnowledgeItem("outlines", id);
      const next = outlines.filter((o) => o.id !== id);
      setOutlines(next);
      if (selectedOutlineId === id) {
        if (next.length > 0) {
          handleSelect(next[0]);
        } else {
          setSelectedOutlineId(null);
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "删除大纲失败");
    }
  };

  // 调整大纲顺序：发送全作品完整 ID 列表，遇到 409 重新拉取
  const handleMoveOutline = async (outlineId: string, direction: "up" | "down") => {
    if (!workId || isReordering) return;
    const currentIndex = outlines.findIndex((o) => o.id === outlineId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= outlines.length) return;

    // 调整完整大纲数组
    const newOutlines = [...outlines];
    const [moved] = newOutlines.splice(currentIndex, 1);
    newOutlines.splice(targetIndex, 0, moved);

    // 必须发送当前作品全部大纲 ID 的完整顺序
    const fullIds = newOutlines.map((o) => o.id);
    setOutlines(newOutlines);
    setIsReordering(true);
    setErrorMessage(null);

    try {
      const updated = await reorderOutlines(workId, fullIds);
      setOutlines(updated);
    } catch (err: unknown) {
      console.warn("大纲排序失败，回滚并重新拉取最新大纲:", err);
      // 遇到 409 或其它错误时重新加载并提示作者
      await loadOutlines();
      setErrorMessage(err instanceof Error ? err.message : "大纲排序失败，已同步最新数据");
    } finally {
      setIsReordering(false);
    }
  };

  if (!workId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#fdfcf9]">
        <Archive className="w-12 h-12 text-[#176b5b]/40 mb-3" />
        <h3 className="font-serif text-lg font-bold text-[#202923]">暂未选择作品</h3>
        <p className="text-xs text-[#7d8782] mt-1">请先在顶部创建或切换作品以管理分卷大纲</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full min-w-0 bg-[#f4f2ed] overflow-hidden">
      {/* 左栏：大纲树结构与分类 */}
      <div className="w-80 border-r border-[#dedfd9] bg-[#fbfaf6] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#eeece6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-[#176b5b]" />
            <h3 className="font-serif font-bold text-sm text-[#202923]">作品总纲与分卷</h3>
          </div>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isSaving}
            className="h-7 px-2 text-xs bg-[#176b5b] hover:bg-[#12584a] text-white cursor-pointer"
          >
            <Plus size={12} className="mr-1" />
            新建节点
          </Button>
        </div>

        {errorMessage && (
          <div className="p-2 mx-3 my-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
            {errorMessage}
          </div>
        )}

        {/* 作用域筛选 Tab */}
        <div className="px-3 pt-3">
          <Tabs value={activeScope} onValueChange={(val: any) => setActiveScope(val)}>
            <TabsList className="grid grid-cols-4 bg-[#ecebe4] h-8 p-0.5 rounded-lg text-xs">
              <TabsTrigger value="all" className="text-[11px]">全部</TabsTrigger>
              <TabsTrigger value="work" className="text-[11px]">全书</TabsTrigger>
              <TabsTrigger value="volume" className="text-[11px]">分卷</TabsTrigger>
              <TabsTrigger value="chapter" className="text-[11px]">单章</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* 列表区 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading && outlines.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8a968f]">
              <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#176b5b] mb-1" />
              正在同步服务端大纲…
            </div>
          ) : filteredOutlines.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8a968f] space-y-1">
              <p>暂无符合条件的大纲</p>
              <p className="text-[10px] text-[#a4aca6]">点击上方按钮添加第一条主线</p>
            </div>
          ) : (
            filteredOutlines.map((item) => {
              const isSelected = item.id === selectedOutlineId;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[#edf5f2] border-[#176b5b] shadow-2xs text-[#176b5b]"
                      : "bg-white border-[#e3e2dc] text-[#334038] hover:bg-[#f6f5ef]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="px-1.5 py-0.2 rounded font-mono bg-[#e9e8e0] text-[#637068]">
                      {item.scopeType === "work"
                        ? "作品主线"
                        : item.scopeType === "volume"
                        ? "分卷大纲"
                        : "单章细纲"}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isReordering || outlines.findIndex((o) => o.id === item.id) === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveOutline(item.id, "up");
                        }}
                        className="text-[#9ea7a1] hover:text-[#176b5b] disabled:opacity-20 p-1 cursor-pointer"
                        title="上移大纲"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={isReordering || outlines.findIndex((o) => o.id === item.id) === outlines.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveOutline(item.id, "down");
                        }}
                        className="text-[#9ea7a1] hover:text-[#176b5b] disabled:opacity-20 p-1 cursor-pointer"
                        title="下移大纲"
                      >
                        <ChevronDown size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="text-[#9ea7a1] hover:text-rose-600 p-1 cursor-pointer"
                        title="删除大纲"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <h4 className="font-serif font-bold text-xs truncate">{item.title}</h4>
                  <p className="text-[11px] text-[#717e76] line-clamp-2 mt-1 leading-relaxed">
                    {item.content || "（暂无纲要详细内容）"}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右栏：大纲详情与富文本修改 */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto">
        {currentOutline ? (
          <div className="max-w-3xl w-full mx-auto p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-[#eeece6] pb-4">
              <div>
                <span className="text-[11px] font-mono text-[#176b5b] bg-[#edf5f2] px-2 py-0.5 rounded-full">
                  {currentOutline.scopeType === "work"
                    ? "作品全书总纲"
                    : currentOutline.scopeType === "volume"
                    ? "分卷级梗概"
                    : "单章级梗概"}
                </span>
                {isEditing ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="font-serif font-bold text-lg text-[#202923] mt-2 h-10 rounded-xl"
                  />
                ) : (
                  <h2 className="font-serif font-bold text-xl text-[#202923] mt-2">
                    {currentOutline.title}
                  </h2>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-8 px-4 bg-[#176b5b] hover:bg-[#12584a] text-white text-xs font-medium rounded-lg cursor-pointer"
                  >
                    {isSaving ? <Loader2 size={13} className="animate-spin mr-1" /> : <Save size={13} className="mr-1" />}
                    保存大纲
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="h-8 px-3.5 border-[#cfd6d1] text-xs font-medium rounded-lg cursor-pointer hover:bg-[#edf5f2]"
                  >
                    <Edit3 size={13} className="mr-1" />
                    编辑纲要
                  </Button>
                )}
              </div>
            </div>

            {/* 作用范围选择 */}
            {isEditing && (
              <div className="p-3.5 rounded-xl bg-[#faf9f5] border border-[#dedfd9] grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-xs font-medium text-[#202923] mb-1">
                    作用范围层级：
                  </label>
                  <select
                    value={editScopeType}
                    onChange={(e) => setEditScopeType(e.target.value as any)}
                    className="w-full h-9 px-2 rounded-lg border border-[#dedfd9] bg-white text-xs focus:outline-none focus:border-[#176b5b]"
                  >
                    <option value="work">全书主线 (Work)</option>
                    <option value="volume">分卷级 (Volume)</option>
                    <option value="chapter">章节级 (Chapter)</option>
                  </select>
                </div>

                {editScopeType === "volume" && (
                  <div>
                    <label className="block text-xs font-medium text-[#202923] mb-1">
                      所属分卷：
                    </label>
                    <select
                      value={editScopeId}
                      onChange={(e) => setEditScopeId(e.target.value)}
                      className="w-full h-9 px-2 rounded-lg border border-[#dedfd9] bg-white text-xs focus:outline-none focus:border-[#176b5b]"
                    >
                      <option value="">未指定分卷</option>
                      {volumes.map((v) => (
                        <option key={v.id} value={v.id}>{v.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                {editScopeType === "chapter" && (
                  <div>
                    <label className="block text-xs font-medium text-[#202923] mb-1">
                      所属章节：
                    </label>
                    <select
                      value={editScopeId}
                      onChange={(e) => setEditScopeId(e.target.value)}
                      className="w-full h-9 px-2 rounded-lg border border-[#dedfd9] bg-white text-xs focus:outline-none focus:border-[#176b5b]"
                    >
                      <option value="">未指定章节</option>
                      {chapters.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* 内容区 */}
            <div className="space-y-2">
              <span className="text-sm font-serif font-bold text-[#202923] flex items-center gap-1.5">
                <BookOpen size={15} className="text-[#176b5b]" />
                <span>纲要详述与伏笔脉络</span>
              </span>
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={14}
                  className="w-full p-4 rounded-xl border border-[#dedfd9] bg-[#fbfaf6] text-sm font-serif leading-relaxed text-[#202923] focus:outline-none focus:border-[#176b5b]"
                  placeholder="在此梳理冲突起伏、关键线索与人物动机变化……"
                />
              ) : (
                <div className="p-5 rounded-2xl bg-[#faf9f5] border border-[#dedfd9] text-sm font-serif leading-relaxed text-[#202923] whitespace-pre-wrap min-h-[300px]">
                  {currentOutline.content || "（暂无纲要详细内容，点击右上角「编辑纲要」添加）"}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-24 text-center text-xs text-[#8a968f]">
            请在左侧选择或新建大纲条目
          </div>
        )}
      </div>
    </div>
  );
}
