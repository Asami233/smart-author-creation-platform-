// 前端数据契约层与客户端请求封装
import { withRequestDeadline } from "./request-deadline";
// 引用 Codex 定义的正式 contracts/** 类型，并提供优雅的默认演示数据与本地降级支持
import type {
  Chapter,
  KnowledgeKind,
  Volume,
  Work,
  WorkspaceDashboard,
  AiGenerationResult,
  AiAction,
  WorkStats,
  WritingDayStats,
} from "@/contracts/types";
import type { ReorderChaptersInput } from "@/contracts/schemas";
import type { TrashOverview } from "@/contracts/data-safety";

export type {
  Chapter,
  Volume,
  Work,
  WorkspaceDashboard,
  KnowledgeKind,
  AiGenerationResult,
  AiAction,
  WorkStats,
  WritingDayStats,
  ReorderChaptersInput,
  TrashOverview,
};

export type CharacterItem = {
  id: string;
  name: string;
  role: "主角" | "核心配角" | "反派" | "配角" | "过客";
  aliases: string[];
  description: string;
  personality: string;
  motivation: string;
  characterArc: string;
  appearanceChapter?: string;
  avatarText?: string;
};

export type OutlineItem = {
  id: string;
  scopeType: "work" | "volume" | "chapter";
  scopeId?: string | null;
  title: string;
  content: string;
  status: "draft" | "confirmed";
};

export type WorldItem = {
  id: string;
  category: "location" | "faction" | "system" | "item" | "custom";
  name: string;
  summary: string;
  content: string;
  tags: string[];
};

export type TimelineItem = {
  id: string;
  title: string;
  storyTime: string;
  description: string;
  relatedChapterTitle?: string;
  participants: string[];
};

export type WritingStats = {
  totalWords: number;
  todayWords: number;
  dailyGoal: number;
  streakDays: number;
  completedChapters: number;
  totalChapters: number;
  recentTrends: { date: string; words: number }[];
};

// 素材库基础示范数据（创作素材默认降级展示）
export const initialOutlines: OutlineItem[] = [
  {
    id: "outline-1",
    scopeType: "work",
    title: "作品总纲 · 北山风云",
    content:
      "【核心主线】沈砚隐匿青石巷十年，因一封故人朱砂信卷入北山禁地之争。十年前雪原宗灭门旧案被层层揭开，原来镇守大阵的九枚星枢早已被朝堂重臣暗中替换……",
    status: "confirmed",
  },
  {
    id: "outline-2",
    scopeType: "volume",
    title: "卷一总述 · 雨夜故人",
    content:
      "【卷一主旨】破局。从沈砚隐居旧书铺到被迫启程，展现江湖暗流与旧势力苏醒。第1-3章引出来客，第4-6章暗杀试探，第7章踏入北山边陲。",
    status: "confirmed",
  },
  {
    id: "outline-3",
    scopeType: "chapter",
    title: "第一章梗概 · 雨夜来客",
    content:
      "深夜暴雨，沈砚打烊时门缝塞入朱砂古信‘故人已归’。沈砚内心波澜，十年避世终成泡影。",
    status: "confirmed",
  },
  {
    id: "outline-4",
    scopeType: "chapter",
    title: "第二章梗概 · 无字旧书",
    content:
      "沈砚拆解信物与旧书夹层，发现通往北山雪原的隐秘舆图，同时察觉暗哨窥探。",
    status: "draft",
  },
];

export const initialCharacters: CharacterItem[] = [
  {
    id: "char-1",
    name: "沈砚",
    role: "主角",
    aliases: ["砚北生", "孤山剑客"],
    avatarText: "砚",
    description: "青石巷旧书铺掌柜，实为十年前名震北山的雪原宗唯一存活真传。",
    personality: "沉着冷静，深藏不露，表面与世无争，内怀雷霆之意。",
    motivation: "查清十年前宗门被灭真相，替师尊与同门讨还公道。",
    characterArc: "从避世自保、心若死灰，到重拾佩剑、兼济苍生的觉醒。",
    appearanceChapter: "第一章 雨夜来客",
  },
  {
    id: "char-2",
    name: "谢青岚",
    role: "核心配角",
    aliases: ["青岚姑娘", "拂云楼掌事"],
    avatarText: "青",
    description: "江南拂云楼少楼主，情报机关首领，亦是给沈砚送朱砂信的故人之后。",
    personality: "聪敏机警，八面玲珑，亦正亦邪。",
    motivation: "借沈砚之力对抗朝廷东辑司的渗透与绞杀。",
    characterArc: "在家族利益与江湖道义之间的抉择与成长。",
    appearanceChapter: "第一章 雨夜来客（暗线）",
  },
  {
    id: "char-3",
    name: "裴沧溟",
    role: "反派",
    aliases: ["白发提督", "东辑司都统"],
    avatarText: "裴",
    description: "朝廷特务机关掌控者，权倾朝野，当年主导北山大阵破灭的幕后黑手之一。",
    personality: "狠辣阴鸷，谋定后动，视人命如草芥。",
    motivation: "夺取北山星枢核心，逆天改命借大阵飞升。",
    characterArc: "步步为营的野心家，最终在机关算尽中覆灭。",
    appearanceChapter: "第三章 北山旧事（提及）",
  },
];

export const initialWorldEntries: WorldItem[] = [
  {
    id: "world-1",
    category: "location",
    name: "北山禁地",
    summary: "常年暴雪封锁的极北死域，埋葬着上古封魔九星大阵。",
    content:
      "方圆千里不见人烟，终年风雪如刀。传闻十年前一战导致天地崩裂，此地生机断绝，如今异动频发。",
    tags: ["禁地", "极北", "上古遗迹"],
  },
  {
    id: "world-2",
    category: "faction",
    name: "雪原宗",
    summary: "十年前镇守北山的古老隐世宗门，因一夜剧变覆灭。",
    content:
      "以剑法绝学与星枢推衍闻名，门人以守护苍生安宁为己任，十年前被奸人勾结魔道覆灭，唯沈砚携重宝逃出。",
    tags: ["名门", "覆灭", "正道"],
  },
  {
    id: "world-3",
    category: "system",
    name: "九重星枢境界",
    summary: "天元大陆以星辰引力的修道体系划分。",
    content:
      "分为：引星境、凝煞境、观星境、星枢境、化神境、通天境、涅槃境、万象境、无上天境。沈砚如今修为隐于观星巅峰。",
    tags: ["修行境界", "功法体系"],
  },
  {
    id: "world-4",
    category: "item",
    name: "朱砂血玉印",
    summary: "雪原宗代代相传的掌门信物，亦是开启星枢大阵的核心钥匙。",
    content:
      "通体温润透红，刻有‘故人已归’四字真符，唯纯阳剑气方可激发其防御玄光。",
    tags: ["神兵重宝", "信物"],
  },
];

export const initialTimelineEvents: TimelineItem[] = [
  {
    id: "time-1",
    title: "雪原宗浩劫",
    storyTime: "承元三年 · 腊月初七",
    description: "北山大阵被破，雪原宗满门血战，沈砚受师尊托付带信物突围隐姓埋名。",
    participants: ["沈砚", "裴沧溟"],
    relatedChapterTitle: "前传 · 序章",
  },
  {
    id: "time-2",
    title: "雨夜朱砂信",
    storyTime: "天启元年 · 八月十四",
    description: "沈砚在青石巷旧书店收到神秘油纸信，打破十年平静，故事正式拉开序幕。",
    participants: ["沈砚", "谢青岚"],
    relatedChapterTitle: "第一章 雨夜来客",
  },
  {
    id: "time-3",
    title: "暗夜截杀与启程",
    storyTime: "天启元年 · 八月十五",
    description: "东辑司杀手试探书铺，沈砚一剑破敌，携舆图连夜踏上北归雪原之路。",
    participants: ["沈砚"],
    relatedChapterTitle: "第二章 无字旧书",
  },
];

export const initialStats: WritingStats = {
  totalWords: 38520,
  todayWords: 2430,
  dailyGoal: 3000,
  streakDays: 12,
  completedChapters: 14,
  totalChapters: 18,
  recentTrends: [
    { date: "09-12", words: 2800 },
    { date: "09-13", words: 3200 },
    { date: "09-14", words: 3050 },
    { date: "09-15", words: 1980 },
    { date: "09-16", words: 2600 },
    { date: "09-17", words: 3450 },
    { date: "09-18", words: 2430 },
  ],
};

// ==========================================
// 真实后端交互 API 客户端方法
// ==========================================

export async function fetchWorkspace(): Promise<WorkspaceDashboard> {
  const res = await fetch("/api/workspace", { credentials: "include" });
  if (!res.ok) throw new Error("获取工作区失败");
  const json = (await res.json()) as any;
  return json.data;
}

export async function switchActiveWorkspace(input: { workId: string; chapterId?: string | null }) {
  const res = await fetch("/api/workspace/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("切换作品失败");
  const json = (await res.json()) as any;
  return json.data;
}

export async function fetchWorkDetails(
  workId: string,
): Promise<{ work: Work; volumes: Volume[]; chapters: Chapter[] }> {
  const res = await fetch(`/api/works/${workId}`, { credentials: "include" });
  if (!res.ok) throw new Error("获取作品详情失败");
  const json = (await res.json()) as any;
  return json.data;
}

export async function createWork(input: {
  title: string;
  description?: string;
  genre?: string;
  targetWords?: number;
}): Promise<{ work: Work; volumes: Volume[]; chapters: Chapter[] }> {
  const res = await fetch("/api/works", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("创建作品失败");
  const json = (await res.json()) as any;
  return json.data;
}

export async function archiveWork(workId: string): Promise<void> {
  const res = await fetch(`/api/works/${workId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("归档作品失败");
}

export async function createVolume(
  workId: string,
  input: { title: string; summary?: string; sortOrder?: number },
): Promise<Volume> {
  const res = await fetch(`/api/works/${workId}/volumes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errorJson = (await res.json().catch(() => ({}))) as any;
    throw new Error(errorJson.message || errorJson.error || "创建分卷失败");
  }
  const json = (await res.json()) as any;
  return json.data;
}

export async function updateVolume(
  volumeId: string,
  input: { title?: string; summary?: string; sortOrder?: number },
): Promise<Volume> {
  const res = await fetch(`/api/volumes/${volumeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errorJson = (await res.json().catch(() => ({}))) as any;
    throw new Error(errorJson.message || errorJson.error || "更新分卷失败");
  }
  const json = (await res.json()) as any;
  return json.data;
}

export async function deleteVolume(volumeId: string): Promise<void> {
  const res = await fetch(`/api/volumes/${volumeId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const errorJson = (await res.json().catch(() => ({}))) as any;
    throw new Error(errorJson.message || errorJson.error || "删除分卷失败");
  }
}

export async function reorderVolumes(
  workId: string,
  volumeIds: string[],
): Promise<Volume[]> {
  const res = await fetch(`/api/works/${workId}/volumes/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ volumeIds }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const err = new Error(json.message || json.error?.message || json.error || `分卷排序失败 (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return json.data;
}

export async function fetchChapter(chapterId: string): Promise<Chapter> {
  return withRequestDeadline(async (signal) => {
    const res = await fetch(`/api/chapters/${chapterId}`, { credentials: "include", signal });
    if (!res.ok) throw new Error("获取章节内容失败");
    const json = (await res.json()) as { data: Chapter };
    return json.data;
  });
}

export class ChapterConflictError extends Error {
  status = 409;
  constructor(message = "章节已被其他端更新，请刷新对比或选择覆盖") {
    super(message);
    this.name = "ChapterConflictError";
  }
}

export async function saveChapter(
  chapterId: string,
  input: { title?: string; content?: string; summary?: string; expectedRevision?: number; saveId?: string; preservePreviousVersion?: boolean },
): Promise<Chapter> {
  return withRequestDeadline(async (signal) => {
    const res = await fetch(`/api/chapters/${chapterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
      signal,
    });
    const json = (await res.json().catch((error) => {
      if (res.ok) throw error; // Truncated success bodies must keep the draft pending.
      return {};
    })) as any;
    if (!res.ok) {
      if (res.status === 409) {
        throw new ChapterConflictError(json.error?.message || "章节已被其他端更新，请刷新或选择覆盖");
      }
      throw new Error(json.error?.message || `保存章节失败 (${res.status})`);
    }
    return json.data;
  });
}

export async function createChapter(
  workId: string,
  input: { title: string; volumeId?: string | null; content?: string; summary?: string },
): Promise<Chapter> {
  const res = await fetch(`/api/works/${workId}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("新增章节失败");
  const json = (await res.json()) as any;
  return json.data;
}

export async function reorderChapters(
  workId: string,
  input: ReorderChaptersInput,
): Promise<Chapter[]> {
  const res = await fetch(`/api/works/${workId}/chapters/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const err = new Error(json.error?.message || json.message || `章节排序/移动失败 (${res.status})`);
    (err as any).status = res.status;
    (err as any).code = json.error?.code;
    throw err;
  }
  return json.data;
}

export type AiSettingsResponse =
  | { configured: false }
  | {
      configured: true;
      baseUrl: string;
      model: string;
      apiKeyHint: string;
      apiKeyConfigured: true;
      updatedAt: string;
    };

export type AiSettingsData = {
  baseUrl: string;
  model: string;
  apiKeyHint?: string;
  apiKeyConfigured?: boolean;
  updatedAt?: string;
};

export async function fetchAiSettings(): Promise<AiSettingsData | null> {
  const res = await fetch("/api/settings/ai", { credentials: "include" });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: AiSettingsResponse };
  const data = json.data;
  if (!data || !data.configured) {
    return null;
  }
  return {
    baseUrl: data.baseUrl,
    model: data.model,
    apiKeyHint: data.apiKeyHint,
    apiKeyConfigured: data.apiKeyConfigured,
    updatedAt: data.updatedAt,
  };
}

export async function saveAiSettings(input: {
  baseUrl: string;
  model: string;
  apiKey?: string;
}): Promise<AiSettingsData> {
  const res = await fetch("/api/settings/ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || "保存 AI 配置失败");
  return json.data;
}

export async function deleteAiSettings(): Promise<void> {
  const res = await fetch("/api/settings/ai", {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("清除 AI 配置失败");
}

export async function fetchProviderModels(input: {
  baseUrl?: string;
  apiKey?: string;
}): Promise<{ baseUrl: string; models: { id: string; ownedBy: string | null }[] }> {
  const res = await fetch("/api/settings/ai/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || "拉取模型列表失败");
  return json.data;
}

export async function testAiConnection(input: {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}): Promise<{
  connected: true;
  baseUrl: string;
  model: string;
  latencyMs: number;
  responsePreview: string;
}> {
  const res = await fetch("/api/settings/ai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || "AI 连接测试失败");
  return json.data;
}

export type AiContextPayload = {
  chapters?: { id?: string; title: string; content: string }[];
  outlines?: { title: string; content: string }[];
  characters?: { name: string; description: string }[];
  worldEntries?: { name: string; content: string }[];
  timelineEvents?: { title: string; description: string }[];
};

export async function generateAiContent(input: {
  action: AiAction;
  instruction: string;
  selectedText?: string;
  context?: AiContextPayload;
  temperature?: number;
  maxTokens?: number;
}): Promise<AiGenerationResult> {
  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(json.error?.message || "AI 生成请求失败");
  }
  return json.data;
}

// ==========================================
// 设定与知识库 CRUD 真实接口调用
// ==========================================

export async function fetchKnowledgeList<T>(workId: string, kind: KnowledgeKind): Promise<T[]> {
  const res = await fetch(`/api/works/${workId}/knowledge/${kind}`, { credentials: "include" });
  if (!res.ok) throw new Error(`获取${kind}列表失败 (${res.status})`);
  const json = (await res.json()) as any;
  return json.data;
}

export async function createKnowledgeItem<T>(
  workId: string,
  kind: KnowledgeKind,
  data: any,
): Promise<T> {
  const res = await fetch(`/api/works/${workId}/knowledge/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || `创建${kind}失败 (${res.status})`);
  return json.data;
}

export async function updateKnowledgeItem<T>(
  kind: KnowledgeKind,
  id: string,
  data: any,
): Promise<T> {
  const res = await fetch(`/api/knowledge/${kind}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || `更新${kind}失败 (${res.status})`);
  return json.data;
}

export async function deleteKnowledgeItem(kind: KnowledgeKind, id: string): Promise<void> {
  const res = await fetch(`/api/knowledge/${kind}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) {
    const json = (await res.json().catch(() => ({}))) as any;
    throw new Error(json.error?.message || `删除${kind}失败 (${res.status})`);
  }
}

// ==========================================
// 历史版本快照、摘要列表与真实恢复
// ==========================================

export type ChapterVersionSummary = {
  id: string;
  chapterId: string;
  sourceRevision: number;
  kind: "auto" | "manual" | "restore";
  label: string;
  wordCount: number;
  createdAt: string;
};

export type ChapterVersionDetail = ChapterVersionSummary & {
  content: string;
  plainText: string;
};

export type VersionPagination = {
  hasMore: boolean;
  nextCursor: string | null;
};

export type VersionListResponse = {
  data: ChapterVersionSummary[];
  pagination?: VersionPagination;
};

export async function fetchChapterVersions(
  chapterId: string,
  query?: { limit?: number; cursor?: string },
): Promise<VersionListResponse> {
  const params = new URLSearchParams();
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.cursor) params.set("cursor", query.cursor);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`/api/chapters/${chapterId}/versions${qs}`, { credentials: "include" });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as any;
    throw new Error(json.error?.message || `获取历史版本列表失败 (${res.status})`);
  }
  const json = (await res.json()) as any;
  return {
    data: json.data || [],
    pagination: json.pagination,
  };
}

export async function createManualVersion(
  chapterId: string,
  label: string,
): Promise<ChapterVersionSummary> {
  const res = await fetch(`/api/chapters/${chapterId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ label }),
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || `创建手动快照失败 (${res.status})`);
  return json.data;
}

export async function fetchVersionDetail(versionId: string): Promise<ChapterVersionDetail> {
  const res = await fetch(`/api/chapter-versions/${versionId}`, { credentials: "include" });
  if (!res.ok) throw new Error(`获取版本正文失败 (${res.status})`);
  const json = (await res.json()) as any;
  return json.data;
}

export async function restoreChapterVersion(
  versionId: string,
  input?: { expectedRevision?: number },
): Promise<Chapter> {
  const res = await fetch(`/api/chapter-versions/${versionId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input || {}),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    if (res.status === 409) {
      throw new ChapterConflictError(json.error?.message || "章节在恢复前已被其他端更新，请刷新对比");
    }
    throw new Error(json.error?.message || `恢复版本失败 (${res.status})`);
  }
  return json.data;
}

// ==========================================
// 真实作品导出（TXT / DOCX / PDF）
// ==========================================

export async function downloadWorkExport(
  workId: string,
  format: "txt" | "docx" | "pdf",
  defaultFilename?: string,
): Promise<void> {
  const res = await fetch(`/api/works/${workId}/export?format=${format}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as any;
    throw new Error(json.error?.message || `导出作品失败 (${res.status})`);
  }
  const blob = await res.blob();
  let filename = defaultFilename || `作品导出.${format}`;
  const disposition = res.headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
    if (match?.[1]) {
      filename = decodeURIComponent(match[1]);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==========================================
// 回收站与章节软删除
// ==========================================

export async function fetchTrash(): Promise<TrashOverview> {
  const res = await fetch("/api/trash", { credentials: "include" });
  if (!res.ok) throw new Error("获取回收站概览失败");
  const json = (await res.json()) as any;
  return json.data;
}

export async function restoreTrashChapter(chapterId: string): Promise<{ restored: true }> {
  const res = await fetch(`/api/trash/chapters/${chapterId}/restore`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || "恢复章节失败");
  return json.data;
}

export async function restoreTrashWork(workId: string): Promise<{ restored: true }> {
  const res = await fetch(`/api/trash/works/${workId}/restore`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(json.error?.message || "恢复作品失败");
  return json.data;
}

export async function softDeleteChapter(chapterId: string): Promise<void> {
  const res = await fetch(`/api/chapters/${chapterId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) {
    const json = (await res.json().catch(() => ({}))) as any;
    throw new Error(json.error?.message || "删除章节失败");
  }
}

// ==========================================
// 章节与设定原子批量关联（Batch Chapter Links）
// ==========================================

export type ChapterLinkEntityType = "character" | "world" | "timeline" | "outline";

export type ChapterLinkItem = {
  id: string;
  chapterId: string;
  entityType: ChapterLinkEntityType;
  entityId: string;
  createdAt: string;
};

export type ChapterLinkInput = {
  entityType: ChapterLinkEntityType;
  entityId: string;
};

export async function fetchChapterLinks(chapterId: string): Promise<ChapterLinkItem[]> {
  const res = await fetch(`/api/chapters/${chapterId}/links`, { credentials: "include" });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as any;
    throw new Error(json.error?.message || `获取章节关联失败 (${res.status})`);
  }
  const json = (await res.json()) as any;
  return json.data || [];
}

export async function batchAddChapterLinks(
  chapterId: string,
  links: ChapterLinkInput[],
): Promise<ChapterLinkItem[]> {
  if (links.length === 0) return fetchChapterLinks(chapterId);
  const res = await fetch(`/api/chapters/${chapterId}/links/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ links }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error(json.error?.message || "【关联冲突 409】包含不属于当前作品的实体或关联已失效，请刷新重试");
    }
    throw new Error(json.error?.message || `批量添加章节关联失败 (${res.status})`);
  }
  return json.data || [];
}

export async function batchRemoveChapterLinks(
  chapterId: string,
  links: ChapterLinkInput[],
): Promise<ChapterLinkItem[]> {
  if (links.length === 0) return fetchChapterLinks(chapterId);
  const res = await fetch(`/api/chapters/${chapterId}/links/batch`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ links }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(json.error?.message || `批量删除章节关联失败 (${res.status})`);
  }
  return json.data || [];
}

// ==========================================
// 大纲整作品排序（Outline Reorder）
// ==========================================

export async function reorderOutlines(
  workId: string,
  outlineIds: string[],
): Promise<OutlineItem[]> {
  const res = await fetch(`/api/works/${workId}/knowledge/outlines/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ outlineIds }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error(json.error?.message || "【大纲排序冲突 409】大纲列表已在其他终端更新或包含跨作品数据，已重新加载最新大纲。");
    }
    throw new Error(json.error?.message || `大纲排序失败 (${res.status})`);
  }
  return json.data || [];
}

// ==========================================
// 作品写作统计（Work Analytics / Stats）
// ==========================================

export async function fetchWorkStats(workId: string): Promise<WorkStats> {
  const res = await fetch(`/api/works/${workId}/stats`, {
    credentials: "include",
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const err = new Error(json.message || json.error?.message || json.error || `获取作品统计失败 (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return json.data;
}

export async function updateWorkStats(
  workId: string,
  input: { date: string; targetWords: number },
): Promise<WorkStats> {
  const res = await fetch(`/api/works/${workId}/stats`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const err = new Error(json.message || json.error?.message || json.error || `更新写作目标失败 (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return json.data;
}

