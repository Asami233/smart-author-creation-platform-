"use client";

import { useEffect, useState } from "react";
import {
  Clock3,
  Loader2,
  Plus,
  Trash2,
  Users,
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
  type CharacterItem,
} from "@/lib/client/api";

type BackendTimelineEvent = {
  id: string;
  workId: string;
  title: string;
  description: string;
  storyTime: string;
  sortOrder: number;
  relatedChapterId?: string | null;
  participantIds: string[];
  createdAt: string;
};

interface TimelineViewProps {
  workId?: string | null;
  characters?: CharacterItem[];
  chapters?: { id: string; title: string }[];
}

export function TimelineView({ workId, characters = [], chapters = [] }: TimelineViewProps) {
  const [events, setEvents] = useState<BackendTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newStoryTime, setNewStoryTime] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newChapterId, setNewChapterId] = useState<string>("");
  const [newSelectedParticipantIds, setNewSelectedParticipantIds] = useState<string[]>([]);

  const loadTimeline = async () => {
    if (!workId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchKnowledgeList<BackendTimelineEvent>(workId, "timeline");
      setEvents(data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "加载时间线失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, [workId]);

  const toggleParticipant = (charId: string) => {
    setNewSelectedParticipantIds((prev) =>
      prev.includes(charId) ? prev.filter((id) => id !== charId) : [...prev, charId]
    );
  };

  const handleCreate = async () => {
    if (!workId || !newTitle.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await createKnowledgeItem<BackendTimelineEvent>(workId, "timeline", {
        title: newTitle.trim(),
        storyTime: newStoryTime.trim() || "某年某月",
        description: newDesc.trim() || "情节要点记录……",
        relatedChapterId: newChapterId || null,
        participantIds: newSelectedParticipantIds,
      });
      setEvents([...events, created]);
      setIsNewOpen(false);
      setNewTitle("");
      setNewStoryTime("");
      setNewDesc("");
      setNewChapterId("");
      setNewSelectedParticipantIds([]);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "创建时间线事件失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    try {
      await deleteKnowledgeItem("timeline", id);
      setEvents(events.filter((e) => e.id !== id));
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "删除时间线事件失败");
    }
  };

  if (!workId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#fdfcf9]">
        <Clock3 className="w-12 h-12 text-[#176b5b]/40 mb-3" />
        <h3 className="font-serif text-lg font-bold text-[#202923]">暂未选择作品</h3>
        <p className="text-xs text-[#7d8782] mt-1">请先在顶部创建或切换作品以排布故事时间线</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-[#f4f2ed] overflow-y-auto p-6 md:p-10">
      <div className="max-w-4xl w-full mx-auto">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#dedfd9]">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 className="w-5 h-5 text-[#176b5b]" />
              <h2 className="font-serif font-bold text-xl text-[#202923]">重大历史与情节时间轴</h2>
            </div>
            <p className="text-xs text-[#738078] mt-1 font-serif">
              纵贯天元纪年 · 标注前史伏笔与正文关键时刻
            </p>
          </div>

          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#176b5b] hover:bg-[#12584a] text-white text-xs h-8 px-3 rounded-lg cursor-pointer">
                <Plus size={13} className="mr-1" />
                标记新事件
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#fffefb] border-[#dedfd9] rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif font-bold text-lg text-[#202923]">
                  记录时间线新事件
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7d8782]">
                  设定故事纪年、关联章节与登场参与人物
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5 py-2 text-xs">
                <div>
                  <Label className="text-sm font-medium text-[#202923]">事件名称 *</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="例如：雪原宗浩劫"
                    className="mt-1 h-10 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">故事内时间标记</Label>
                  <Input
                    value={newStoryTime}
                    onChange={(e) => setNewStoryTime(e.target.value)}
                    placeholder="例如：承元三年 · 腊月初七"
                    className="mt-1 h-10 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">关联章节（可选）</Label>
                  <select
                    value={newChapterId}
                    onChange={(e) => setNewChapterId(e.target.value)}
                    className="w-full h-10 px-3 mt-1 rounded-xl border border-[#dedfd9] bg-white text-sm focus:outline-none focus:border-[#176b5b]"
                  >
                    <option value="">暂不关联章节</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923] block mb-1">参与角色（从当前作品谱系中选取）</Label>
                  {characters.length === 0 ? (
                    <p className="text-[11px] text-[#8e9891] italic">作品暂无角色档案，请先在「角色」栏中录入</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl border border-[#dedfd9] bg-[#fbfaf6] max-h-32 overflow-y-auto">
                      {characters.map((c) => {
                        const isChecked = newSelectedParticipantIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleParticipant(c.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-serif border transition-all cursor-pointer ${
                              isChecked
                                ? "bg-[#176b5b] text-white border-[#176b5b]"
                                : "bg-white text-[#45524a] border-[#dedfd9] hover:bg-[#f2efe6]"
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">事件始末描写</Label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    rows={3}
                    placeholder="简述起因、冲突过程与留下的一手悬念……"
                    className="w-full mt-1 p-3 rounded-xl border border-[#dedfd9] bg-white text-sm focus:outline-none focus:border-[#176b5b]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  disabled={!newTitle.trim() || isSubmitting}
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
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            {errorMessage}
          </div>
        )}

        {/* 时间线主体列表 */}
        {loading && events.length === 0 ? (
          <div className="py-24 text-center text-xs text-[#8a968f]">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#176b5b] mb-1.5" />
            正在拉取时间线事件…
          </div>
        ) : events.length === 0 ? (
          <div className="py-24 text-center text-xs text-[#8a968f] space-y-1">
            <p>暂未设立时间线事件</p>
            <p className="text-[11px] text-[#a4aca6]">点击右上角「标记新事件」开启时空脉络</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#d8dad2]">
            {events.map((evt) => {
              const relatedCh = chapters.find((c) => c.id === evt.relatedChapterId);
              const participantNames = (evt.participantIds || [])
                .map((pid) => characters.find((c) => c.id === pid)?.name || pid);

              return (
                <div key={evt.id} className="relative group">
                  {/* 时间节点圆点 */}
                  <div className="absolute -left-6 top-1.5 w-5 h-5 rounded-full bg-[#fbfaf6] border-2 border-[#176b5b] flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#176b5b]" />
                  </div>

                  {/* 事件卡片 */}
                  <div className="bg-[#fffefb] p-5 rounded-2xl border border-[#dedfd8] shadow-2xs group-hover:border-[#176b5b]/50 group-hover:shadow-xs transition-all space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-[#176b5b] bg-[#edf5f2] px-2 py-0.5 rounded-md">
                            {evt.storyTime || "纪年待定"}
                          </span>
                          {relatedCh && (
                            <span className="text-[10px] text-[#69756f] bg-[#eeebe3] px-2 py-0.5 rounded-md font-serif">
                              📖 {relatedCh.title}
                            </span>
                          )}
                        </div>
                        <h3 className="font-serif font-bold text-base text-[#202923] mt-1.5">
                          {evt.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(evt.id)}
                        className="text-[#9ea7a1] hover:text-rose-600 p-1 cursor-pointer"
                        title="删除此事件"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <p className="text-xs text-[#526058] font-serif leading-relaxed">
                      {evt.description || "暂无描写"}
                    </p>

                    {participantNames.length > 0 && (
                      <div className="pt-2 border-t border-[#f0eee6] flex items-center gap-1.5 text-[11px] text-[#717e76]">
                        <Users size={12} className="text-[#176b5b]" />
                        <span>参与人物：</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {participantNames.map((name) => (
                            <span
                              key={name}
                              className="px-1.5 py-0.2 rounded bg-[#f2efe6] text-[#47544d] font-serif"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
