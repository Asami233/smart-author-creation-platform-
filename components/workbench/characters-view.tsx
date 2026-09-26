"use client";

import { useEffect, useState } from "react";
import {
  Compass,
  Edit3,
  Heart,
  Loader2,
  Plus,
  Save,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trash2,
  UserCheck,
  UsersRound,
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
  updateKnowledgeItem,
  type CharacterItem,
} from "@/lib/client/api";

interface CharactersViewProps {
  workId?: string | null;
  onCharactersChanged?: (chars: CharacterItem[]) => void;
}

export function CharactersView({ workId, onCharactersChanged }: CharactersViewProps) {
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>("全部");
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 对话框表单状态（新建角色）
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<CharacterItem["role"]>("核心配角");
  const [newDesc, setNewDesc] = useState("");
  const [newMotivation, setNewMotivation] = useState("");
  const [newPersonality, setNewPersonality] = useState("");

  const loadCharacters = async () => {
    if (!workId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchKnowledgeList<CharacterItem>(workId, "characters");
      setCharacters(data);
      if (onCharactersChanged) onCharactersChanged(data);
      if (data.length > 0) {
        setSelectedCharId(data[0].id);
      } else {
        setSelectedCharId(null);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "加载角色列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, [workId]);

  const currentChar = characters.find((c) => c.id === selectedCharId) || null;

  const filteredList = characters.filter((c) => {
    if (activeRoleFilter === "全部") return true;
    return c.role === activeRoleFilter;
  });

  const handleCreateCharacter = async () => {
    if (!workId || !newName.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await createKnowledgeItem<CharacterItem>(workId, "characters", {
        name: newName.trim(),
        role: newRole,
        aliases: [],
        avatarText: newName.trim().charAt(0),
        description: newDesc || "身份背景尚未完善……",
        personality: newPersonality || "待补充……",
        motivation: newMotivation || "待补充……",
        characterArc: "人物成长路径推演中……",
      });
      const updatedList = [created, ...characters];
      setCharacters(updatedList);
      setSelectedCharId(created.id);
      if (onCharactersChanged) onCharactersChanged(updatedList);
      setIsNewOpen(false);
      setNewName("");
      setNewDesc("");
      setNewMotivation("");
      setNewPersonality("");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "创建角色失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    try {
      await deleteKnowledgeItem("characters", id);
      const next = characters.filter((c) => c.id !== id);
      setCharacters(next);
      if (onCharactersChanged) onCharactersChanged(next);
      if (selectedCharId === id) {
        setSelectedCharId(next.length > 0 ? next[0].id : null);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "删除角色失败");
    }
  };

  if (!workId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#fdfcf9]">
        <UsersRound className="w-12 h-12 text-[#176b5b]/40 mb-3" />
        <h3 className="font-serif text-lg font-bold text-[#202923]">暂未选择作品</h3>
        <p className="text-xs text-[#7d8782] mt-1">请先在顶部创建或切换作品以管理角色档案</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full min-w-0 bg-[#f4f2ed] overflow-hidden">
      {/* 左栏：角色列表与角色定位筛选 */}
      <div className="w-80 border-r border-[#dedfd9] bg-[#fbfaf6] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#eeece6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersRound className="w-4 h-4 text-[#176b5b]" />
            <h3 className="font-serif font-bold text-sm text-[#202923]">登场人物谱系</h3>
          </div>
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 px-3 text-xs bg-[#176b5b] hover:bg-[#12584a] text-white rounded-lg cursor-pointer">
                <Plus size={13} className="mr-1" />
                新增角色
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#fffefb] border-[#dedfd9] rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif font-bold text-lg text-[#202923]">
                  立绘档案 · 建立新角色
                </DialogTitle>
                <DialogDescription className="text-xs text-[#7d8782]">
                  记录人物设定、阵营、原动力与性格弧光
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5 py-2 text-xs">
                <div>
                  <Label className="text-sm font-medium text-[#202923]">人物姓名 / 代号 *</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例如：沈砚"
                    className="mt-1 h-10 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">角色定位</Label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full h-10 px-3 mt-1 rounded-xl border border-[#dedfd9] bg-white text-sm focus:outline-none focus:border-[#176b5b]"
                  >
                    <option value="主角">主角 (Protagonist)</option>
                    <option value="核心配角">核心配角 (Key Ally)</option>
                    <option value="反派">反派 / 宿敌 (Antagonist)</option>
                    <option value="配角">配角 (Supporting)</option>
                    <option value="过客">过客 (Passerby)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">身世背景简述</Label>
                  <Input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="表面旧书铺掌柜，实为雪原宗唯一真传……"
                    className="mt-1 h-10 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-[#202923]">核心原动力与动机</Label>
                  <Input
                    value={newMotivation}
                    onChange={(e) => setNewMotivation(e.target.value)}
                    placeholder="查明十年前宗门覆灭真相，为师友讨回公道……"
                    className="mt-1 h-10 text-sm rounded-xl"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  disabled={!newName.trim() || isSubmitting}
                  onClick={handleCreateCharacter}
                  className="bg-[#176b5b] hover:bg-[#12584a] text-white text-sm font-medium h-10 px-5 rounded-xl cursor-pointer"
                >
                  {isSubmitting ? <Loader2 size={13} className="animate-spin mr-1" /> : <Plus size={13} className="mr-1" />}
                  确认录入谱系
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

        {/* 角色定位标签 */}
        <div className="p-2.5 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-[#f0eee6]">
          {["全部", "主角", "核心配角", "反派", "配角"].map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setActiveRoleFilter(role)}
              className={`px-2 py-1 rounded-md text-[11px] font-serif transition-colors whitespace-nowrap cursor-pointer ${
                activeRoleFilter === role
                  ? "bg-[#176b5b] text-white font-medium shadow-2xs"
                  : "bg-[#eeebe3] text-[#55635b] hover:bg-[#e4e1d7]"
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        {/* 列表区 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && characters.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8a968f]">
              <Loader2 className="w-4 h-4 animate-spin mx-auto text-[#176b5b] mb-1" />
              正在拉取角色谱系…
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8a968f] space-y-1">
              <p>暂无符合的角色</p>
              <p className="text-[10px] text-[#a4aca6]">点击上方按钮录入第一位登场人物</p>
            </div>
          ) : (
            filteredList.map((char) => {
              const isSelected = char.id === selectedCharId;
              return (
                <div
                  key={char.id}
                  onClick={() => setSelectedCharId(char.id)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start justify-between gap-2 ${
                    isSelected
                      ? "bg-[#edf5f2] border-[#176b5b] shadow-2xs text-[#176b5b]"
                      : "bg-white border-[#e3e2dc] text-[#334038] hover:bg-[#f6f5ef]"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#e4ece8] text-[#176b5b] font-serif font-bold text-xs flex items-center justify-center shrink-0">
                      {char.avatarText || char.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-serif font-bold text-xs text-[#202923] truncate">
                          {char.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e8e6dc] text-[#5f6c64] shrink-0 font-mono">
                          {char.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#717e76] truncate mt-0.5 max-w-[140px]">
                        {char.description || "暂无简介"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(char.id);
                    }}
                    className="text-[#9ea7a1] hover:text-rose-600 p-1 shrink-0"
                    title="删除角色"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右栏：角色全貌档案卡片 */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto p-8">
        {currentChar ? (
          <div className="max-w-3xl w-full mx-auto space-y-6">
            <div className="flex items-center justify-between border-b border-[#eeece6] pb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#edf5f2] border-2 border-[#bad4cb] text-[#176b5b] font-serif font-bold text-2xl flex items-center justify-center shadow-sm">
                  {currentChar.avatarText || currentChar.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif font-bold text-2xl text-[#202923]">
                      {currentChar.name}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#176b5b] text-white font-medium">
                      {currentChar.role}
                    </span>
                  </div>
                  <p className="text-xs text-[#717e76] mt-1">
                    首次登场：{currentChar.appearanceChapter || "全篇贯穿"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-[#faf9f5] border border-[#e8e6dc] space-y-2">
                <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#202923]">
                  <Compass size={14} className="text-[#176b5b]" />
                  <span>核心身世背景</span>
                </div>
                <p className="text-xs text-[#526058] leading-relaxed">
                  {currentChar.description || "尚未录入身世背景"}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#faf9f5] border border-[#e8e6dc] space-y-2">
                <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#202923]">
                  <Target size={14} className="text-[#176b5b]" />
                  <span>行动动机与目标</span>
                </div>
                <p className="text-xs text-[#526058] leading-relaxed">
                  {currentChar.motivation || "尚未录入行动动机"}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#faf9f5] border border-[#e8e6dc] space-y-2">
                <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#202923]">
                  <Shield size={14} className="text-[#176b5b]" />
                  <span>性格特征</span>
                </div>
                <p className="text-xs text-[#526058] leading-relaxed">
                  {currentChar.personality || "尚未录入性格特征"}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#faf9f5] border border-[#e8e6dc] space-y-2">
                <div className="flex items-center gap-1.5 font-serif font-bold text-xs text-[#202923]">
                  <Sparkles size={14} className="text-[#176b5b]" />
                  <span>人物成长轨迹与弧光</span>
                </div>
                <p className="text-xs text-[#526058] leading-relaxed">
                  {currentChar.characterArc || "尚未录入人物弧光"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-24 text-center text-xs text-[#8a968f]">
            请在左侧选择或新建人物档案
          </div>
        )}
      </div>
    </div>
  );
}
