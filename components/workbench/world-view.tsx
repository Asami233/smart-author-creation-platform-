"use client";

import { useEffect, useState } from "react";
import {
  BookMarked,
  Castle,
  Globe2,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Sword,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  fetchKnowledgeList,
  type WorldItem,
} from "@/lib/client/api";

const CATEGORY_MAP: Record<WorldItem["category"], { label: string; icon: any; color: string }> = {
  location: { label: "地理风貌", icon: MapPin, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  faction: { label: "宗门势力", icon: Castle, color: "text-amber-700 bg-amber-50 border-amber-200" },
  system: { label: "修真体系", icon: Sparkles, color: "text-teal-700 bg-teal-50 border-teal-200" },
  item: { label: "神兵重宝", icon: Sword, color: "text-blue-700 bg-blue-50 border-blue-200" },
  custom: { label: "自定义条目", icon: BookMarked, color: "text-purple-700 bg-purple-50 border-purple-200" },
};

interface WorldViewProps {
  workId?: string | null;
}

export function WorldView({ workId }: WorldViewProps) {
  const [entries, setEntries] = useState<WorldItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 新建弹窗
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState<WorldItem["category"]>("location");
  const [newSummary, setNewSummary] = useState("");
  const [newContent, setNewContent] = useState("");

  const loadWorldEntries = async () => {
    if (!workId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchKnowledgeList<WorldItem>(workId, "world");
      setEntries(data);
      if (data.length > 0) {
        setSelectedEntryId(data[0].id);
      } else {
        setSelectedEntryId(null);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "加载世界观设定失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorldEntries();
  }, [workId]);

  const currentEntry = entries.find((e) => e.id === selectedEntryId) || null;

  const filteredEntries = entries.filter((item) => {
    const matchCategory = activeCategory === "all" || item.category === activeCategory;
    const matchQuery =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchQuery;
  });

  const handleCreate = async () => {
    if (!workId || !newName.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await createKnowledgeItem<WorldItem>(workId, "world", {
        category: newCat,
        name: newName.trim(),
        summary: newSummary.trim() || "一句话概述尚未录入……",
        content: newContent.trim() || "详述设定待补充……",
      });
      setEntries([created, ...entries]);
      setSelectedEntryId(created.id);
      setIsNewOpen(false);
      setNewName("");
      setNewSummary("");
      setNewContent("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "创建设定失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    try {
      await deleteKnowledgeItem("world", id);
      const next = entries.filter((e) => e.id !== id);
      setEntries(next);
      if (selectedEntryId === id) {
        setSelectedEntryId(next.length > 0 ? next[0].id : null);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "删除设定失败");
    }
  };

  if (!workId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#fdfcf9]">
        <Globe2 className="w-12 h-12 text-[#176b5b]/40 mb-3" />
        <h3 className="font-serif text-lg font-bold text-[#202923]">暂未选择作品</h3>
        <p className="text-xs text-[#7d8782] mt-1">请先在顶部创建或切换作品以管理世界观设定</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full min-w-0 bg-[#f4f2ed] overflow-hidden">
      {/* 左侧：分类与条目列表 */}
      <div className="w-80 border-r border-[#dedfd9] bg-[#fbfaf6] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#eeece6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-[#176b5b]" />
            <h3 className="font-serif font-bold text-sm text-[#202923]">世界观知识库</h3>
          </div>

          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 px-3 text-xs bg-[#176b5b] hover:bg-[#12584a] text-white rounded-lg cursor-pointer">
                <Plus size={13} className="mr-1" />
                新增条目
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#fffefb] border-[#dedfd9] rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif font-bold text-lg text-[#202923]">
                  录入世界观新设定
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7d8782]">
                  丰富地理、门派势力、修行等级与重宝信物
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5 py-2 text-xs">
                <div>
                  <Label className="text-sm font-medium text-[#202923]">条目名称 *</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例如：北山禁地"
                    className="mt-1 h-10 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">所属分类</Label>
                  <select
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value as any)}
                    className="w-full h-10 px-3 mt-1 rounded-xl border border-[#dedfd9] bg-white text-sm focus:outline-none focus:border-[#176b5b]"
                  >
                    <option value="location">地理风貌 (Location)</option>
                    <option value="faction">宗门势力 (Faction)</option>
                    <option value="system">修真体系 (System)</option>
                    <option value="item">神兵重宝 (Item)</option>
                    <option value="custom">自定义 (Custom)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">一句话核心梗概</Label>
                  <Input
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    placeholder="常年暴雪封锁的极北死域，埋葬着九星大阵……"
                    className="mt-1 h-10 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">详细设定详述</Label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={4}
                    placeholder="详细描述起源、特征、规则限制与隐秘……"
                    className="w-full mt-1 p-3 rounded-xl border border-[#dedfd9] bg-white text-sm focus:outline-none focus:border-[#176b5b]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  disabled={!newName.trim() || isSubmitting}
                  onClick={handleCreate}
                  className="bg-[#176b5b] hover:bg-[#12584a] text-white text-sm font-medium h-10 px-5 rounded-xl cursor-pointer"
                >
                  {isSubmitting ? <Loader2 size={13} className="animate-spin mr-1" /> : <Plus size={13} className="mr-1" />}
                  确认录入
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {errorMessage && (
          <div className="p-2 mx-3 my-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
            {errorMessage}
          </div>
        )}

        {/* 搜索框 */}
        <div className="px-3 pt-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-[#98a19b]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="快速检索设定…"
              className="pl-8 h-8 text-xs bg-white"
            />
          </div>
        </div>

        {/* 分类筛选器 */}
        <div className="p-2.5 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-[#f0eee6]">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`px-2 py-1 rounded-md text-[11px] font-serif transition-colors whitespace-nowrap cursor-pointer ${
              activeCategory === "all"
                ? "bg-[#176b5b] text-white font-medium shadow-2xs"
                : "bg-[#eeebe3] text-[#55635b] hover:bg-[#e4e1d7]"
            }`}
          >
            全部
          </button>
          {Object.entries(CATEGORY_MAP).map(([key, info]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveCategory(key)}
              className={`px-2 py-1 rounded-md text-[11px] font-serif transition-colors whitespace-nowrap cursor-pointer ${
                activeCategory === key
                  ? "bg-[#176b5b] text-white font-medium shadow-2xs"
                  : "bg-[#eeebe3] text-[#55635b] hover:bg-[#e4e1d7]"
              }`}
            >
              {info.label}
            </button>
          ))}
        </div>

        {/* 设定条目列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && entries.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8a968f]">
              <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#176b5b] mb-1" />
              正在同步世界观设定…
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8a968f] space-y-1">
              <p>暂无符合的设定条目</p>
              <p className="text-[10px] text-[#a4aca6]">点击上方按钮添加第一项世界观定义</p>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isSelected = entry.id === selectedEntryId;
              const catInfo = CATEGORY_MAP[entry.category] || CATEGORY_MAP.custom;
              const Icon = catInfo.icon;
              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntryId(entry.id)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between gap-2 ${
                    isSelected
                      ? "bg-[#edf5f2] border-[#176b5b] shadow-2xs text-[#176b5b]"
                      : "bg-white border-[#e3e2dc] text-[#334038] hover:bg-[#f6f5ef]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.2 rounded border font-mono flex items-center gap-1 ${catInfo.color}`}>
                        <Icon size={10} />
                        <span>{catInfo.label}</span>
                      </span>
                    </div>
                    <h4 className="font-serif font-bold text-xs text-[#202923] truncate">{entry.name}</h4>
                    <p className="text-[11px] text-[#717e76] line-clamp-2 mt-0.5 leading-relaxed">
                      {entry.summary || entry.content || "暂无概述"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id);
                    }}
                    className="text-[#9ea7a1] hover:text-rose-600 p-1 shrink-0"
                    title="删除设定"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右侧：设定大卡片详述 */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto p-8">
        {currentEntry ? (
          <div className="max-w-3xl w-full mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#eeece6] pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif font-bold text-2xl text-[#202923]">
                    {currentEntry.name}
                  </h2>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${CATEGORY_MAP[currentEntry.category]?.color}`}>
                    {CATEGORY_MAP[currentEntry.category]?.label || "设定条目"}
                  </span>
                </div>
                <p className="text-xs text-[#717e76] mt-2 italic font-serif">
                  “{currentEntry.summary || "一句话概述尚未录入"}”
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#faf9f5] border border-[#eeebe3] text-xs font-serif leading-relaxed text-[#2a3630] whitespace-pre-wrap min-h-[300px]">
              {currentEntry.content || "暂无更详尽的规则背景描述。"}
            </div>
          </div>
        ) : (
          <div className="py-24 text-center text-xs text-[#8a968f]">
            请在左侧选择或新建世界观条目
          </div>
        )}
      </div>
    </div>
  );
}
