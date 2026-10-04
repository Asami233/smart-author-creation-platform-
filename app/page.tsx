"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorSearch } from "@/components/workbench/editor-search";
import { ChapterJumpDialog } from "@/components/workbench/chapter-jump-dialog";
import { EditorDiagnostics } from "@/components/workbench/editor-diagnostics";
import { editorDiagnostics } from "@/lib/client/editor-diagnostics";
import { getEditorShortcut } from "@/lib/client/editor-keyboard";
import { chapterPasteText, copyEditorText } from "@/lib/client/editor-clipboard";
import { prepareOverwriteAttempt, type OverwriteAttempt } from "@/lib/client/overwrite-attempt";
import { canCommitChapterJump } from "@/lib/client/chapter-navigation";
import { countChapterWords, createChapterTextAnalyzer, plainChapterText } from "@/lib/client/chapter-text";
import {
  Archive,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  Bold,
  BookOpen,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Copy,
  FileClock,
  FileDown,
  FilePlus2,
  FolderPlus,
  Focus,
  Globe2,
  Heading2,
  Italic,
  Link2,
  List,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Undo2,
  UserRound,
  UsersRound,
  WandSparkles,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenu } from "@/components/auth/user-menu";
import { OutlineView } from "@/components/workbench/outline-view";
import { CharactersView } from "@/components/workbench/characters-view";
import { WorldView } from "@/components/workbench/world-view";
import { TimelineView } from "@/components/workbench/timeline-view";
import { StatsView } from "@/components/workbench/stats-view";
import { ExportDialog } from "@/components/workbench/export-dialog";
import { VersionHistoryDialog } from "@/components/workbench/version-history-dialog";
import { TrashDialog } from "@/components/workbench/trash-dialog";
import { WorkSwitcher } from "@/components/workbench/work-switcher";
import { CreateWorkDialog } from "@/components/workbench/create-work-dialog";
import { CreateVolumeDialog } from "@/components/workbench/create-volume-dialog";
import { AiSettingsDialog } from "@/components/workbench/ai-settings-dialog";
import { ChapterLinksDialog } from "@/components/workbench/chapter-links-dialog";
import {
  fetchWorkspace,
  switchActiveWorkspace,
  fetchWorkDetails,
  archiveWork,
  deleteVolume,
  reorderVolumes,
  reorderChapters,
  fetchChapter,
  saveChapter,
  createChapter,
  softDeleteChapter,
  fetchKnowledgeList,
  fetchChapterLinks,
  fetchWorkStats,
  updateWorkStats,
  ChapterConflictError,
  type Work,
  type Volume,
  type Chapter,
  type CharacterItem,
  type OutlineItem,
  type WorldItem,
  type ChapterLinkItem,
  type WorkStats,
} from "@/lib/client/api";
import { generateAiContentStream } from "@/lib/client/ai-stream";
import { planAiContext, type AiAction, type AiContextBudget, type AiGenerationInput } from "@/contracts";
import {
  type ChapterReorderSnapshot,
  verifyChapterReorderRevision,
  categorizeMutationError,
  isDraftPendingSaveEquivalent,
  canApplyResyncResponse,
  canSwitchWork,
} from "@/lib/client/chapter-order-guards";

type LocalChapter = {
  id: string;
  workId?: string;
  volumeId?: string | null;
  title: string;
  content: string;
  status: "draft" | "completed" | "done";
  wordCount?: number;
  revision?: number;
  sortOrder?: number;
};

const aiActions = [
  { id: "continue", label: "续写这一段", icon: Sparkles },
  { id: "polish", label: "润色选中内容", icon: WandSparkles },
  { id: "brainstorm", label: "推演后续情节", icon: BrainCircuit },
];

const TODAY_WORDS_STORAGE_KEY = "smart-author-today-words";
const DAILY_GOAL_STORAGE_KEY = "smart-author-daily-goal";

const DEFAULT_DAILY_GOAL = 3000;
const DEFAULT_TODAY_WORDS = 0;

export function getShanghaiDateKey(d: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function saveTodayWordsToStorage(words: number, celebrated?: boolean) {
  if (typeof window === "undefined") return;
  const today = getShanghaiDateKey();
  let oldCelebrated = false;
  try {
    const raw = localStorage.getItem(TODAY_WORDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === today) oldCelebrated = parsed.celebrated || false;
    }
  } catch {}
  localStorage.setItem(
    TODAY_WORDS_STORAGE_KEY,
    JSON.stringify({
      date: today,
      words,
      celebrated: celebrated !== undefined ? celebrated : oldCelebrated,
    }),
  );
  window.dispatchEvent(new Event("today-words-change"));
}

type ActiveMainView = "writing" | "outline" | "characters" | "world" | "timeline" | "stats";

export default function Home() {
  const [activeView, setActiveView] = useState<ActiveMainView>("writing");
  const [topNavTab, setTopNavTab] = useState<"writing" | "materials" | "stats">("writing");
  const [works, setWorks] = useState<Work[]>([]);
  const [activeWorkId, setActiveWorkId] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [chapters, setChapters] = useState<LocalChapter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateWorkOpen, setIsCreateWorkOpen] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [saveState, setSaveStateValue] = useState<"saved" | "saving" | "conflict" | "error">("saved");
  const [isCreatingChapter, setIsCreatingChapter] = useState(false);
  const isCreatingChapterRef = useRef(false);
  const [conflictChapterId, setConflictChapterId] = useState<string | null>(null);
  // 知识库实体状态（当前作品真实设定）
  const [charactersList, setCharactersList] = useState<CharacterItem[]>([]);
  const [outlinesList, setOutlinesList] = useState<OutlineItem[]>([]);
  const [worldList, setWorldList] = useState<WorldItem[]>([]);
  const [timelineList, setTimelineList] = useState<any[]>([]);

  // 章节与设定关联状态
  const [chapterLinks, setChapterLinks] = useState<ChapterLinkItem[]>([]);
  const [isChapterLinksOpen, setIsChapterLinksOpen] = useState(false);

  // 分卷管理与折叠状态
  const [isCreateVolumeOpen, setIsCreateVolumeOpen] = useState(false);
  const [collapsedVolumeIds, setCollapsedVolumeIds] = useState<Set<string>>(new Set());

  // 右侧辅助检查面板折叠状态（响应式自适应）
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isChapterJumpOpen, setIsChapterJumpOpen] = useState(false);
  const [chapterJumpError, setChapterJumpError] = useState<string | null>(null);
  const chapterJumpBusyRef = useRef(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const resolvingConflictRef = useRef(false);
  const [conflictAction, setConflictAction] = useState<"pull" | "overwrite" | null>(null);

  const [rightTab, setRightTab] = useState("ai");
  const [aiPrompt, setAiPrompt] = useState("保持克制沉稳的语气，续写下一段场景。");
  const [aiResult, setAiResult] = useState("");
  const [aiSourceKey, setAiSourceKey] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiBudget, setAiBudget] = useState<AiContextBudget | null>(null);
  const [aiComplete, setAiComplete] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastAiAction, setLastAiAction] = useState<AiAction>("continue");
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiRunIdRef = useRef(0);
  const [copiedToast, setCopiedToast] = useState<"draft" | "ai" | null>(null);
  const [includeCurrentChapter, setIncludeCurrentChapter] = useState(true);
  const [includeOutline, setIncludeOutline] = useState(true);
  const [includeCharacters, setIncludeCharacters] = useState(false);
  const [includeWorld, setIncludeWorld] = useState(false);
  const [includeTimeline, setIncludeTimeline] = useState(false);
  const onEditorUpdateRef = useRef<() => void>(() => {});
  const [analyzeChapterText] = useState(() => createChapterTextAnalyzer());
  const tiptap = useEditor({
    extensions: [StarterKit],
    content: chapters.find((item) => item.id === selectedId)?.content || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "rich-editor", "aria-label": "章节正文编辑器" },
      handlePaste(view, event) {
        // The browser never inserts clipboard HTML into a novel chapter.
        const text = chapterPasteText(event.clipboardData);
        if (text === null) return true;
        view.dispatch(view.state.tr.insertText(text));
        return true;
      },
    },
    onUpdate: () => editorDiagnostics.measure("update", () => onEditorUpdateRef.current()),
  }, [selectedId]);
  const tiptapRef = useRef(tiptap);
  useEffect(() => {
    tiptapRef.current = tiptap;
  }, [tiptap]);
  useEffect(() => {
    function handleWritingShortcut(event: KeyboardEvent) {
      if (activeView !== "writing" || !selectedId ||
          document.querySelector('[role="dialog"]')) return;
      const shortcut = getEditorShortcut(event);
      if (shortcut === "jump") {
        event.preventDefault(); setIsChapterJumpOpen(true);
      } else if (shortcut === "find") {
        event.preventDefault();
        setIsFindOpen(true);
        if (isFindOpen) document.getElementById("editor-find-query")?.focus();
      } else if (shortcut === "escape") {
        if (isFindOpen) {
          event.preventDefault(); setIsFindOpen(false); tiptapRef.current?.commands.focus();
        } else if (isFocusMode) {
          event.preventDefault(); setIsFocusMode(false);
        }
      }
    }
    // Handle workbench commands before the editor consumes the same key.
    window.addEventListener("keydown", handleWritingShortcut, true);
    return () => window.removeEventListener("keydown", handleWritingShortcut, true);
  }, [activeView, selectedId, isFindOpen, isFocusMode]);
  const paperScrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const aiCurrentSourceKey = `${activeWorkId ?? ""}:${selectedId ?? ""}`;
  const isAiGeneratingHere = isGenerating && aiSourceKey === aiCurrentSourceKey;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function readEditorHtml() {
    const editor = tiptapRef.current;
    return editor && !editor.isDestroyed ? editorDiagnostics.measure("serialize", () => editor.getHTML()) : "";
  }

  function replaceEditorHtml(html: string) {
    const editor = tiptapRef.current;
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(html || "<p></p>", { emitUpdate: false });
    }
  }

  // 串行保存与状态引用追踪（保证保存执行时不依赖过期快照）
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;

  const saveStateRef = useRef<"saved" | "saving" | "conflict" | "error">(saveState);
  saveStateRef.current = saveState;
  const setSaveState = useCallback((next: typeof saveState) => {
    saveStateRef.current = next;
    setSaveStateValue(next);
  }, []);

  const activeSavePromiseRef = useRef<Promise<boolean> | null>(null);

  // 关键 R01：正文草稿基线修订号与目录观察修订号分离
  // 1) contentBaseRevisionsRef: 本地编辑器草稿正文实际所基于的服务端版本
  //    仅在获取完整正文(fetchChapter)、保存正文成功(saveChapter)、恢复历史版本、拉取覆盖、或可核实的同章结构增量成功时推进
  const contentBaseRevisionsRef = useRef<Record<string, number>>({});
  // 2) catalogRevisionsRef: 从服务端目录（fetchWorkDetails, reorderChapters等）观察到的最新版本
  //    用于构造目录重排 expectedRevisions 与检测外部并发修改；绝不默默推进 contentBaseRevisionsRef
  const catalogRevisionsRef = useRef<Record<string, number>>({});
  // 记录每个章节的前端草稿递增序列号，用于精确判断保存在途时是否有更新的输入发生
  const draftSeqRef = useRef<Record<string, number>>({});

  // 知识库加载竞态隔离：防快速切作品时老请求覆盖新作品设定
  const knowledgeRequestIdRef = useRef(0);
  const activeWorkIdRef = useRef<string | null>(null);
  activeWorkIdRef.current = activeWorkId;

  // 关键 F03：工作区、选章、关联及统计加载代次 Token，防快速切换时迟到响应覆盖新页面状态
  const workspaceRequestIdRef = useRef(0);
  const chapterRequestIdRef = useRef(0);
  const linksRequestIdRef = useRef(0);
  const statsRequestIdRef = useRef(0);
  const loadWorkStatsRef = useRef<((workId: string) => Promise<void>) | null>(null);

  // 关键 C02：章节排序与跨卷移动并发保护与请求代次 Token
  const isReorderingRef = useRef(false);
  const activeReorderPromiseRef = useRef<Promise<void> | null>(null);
  const reorderRequestIdRef = useRef(0);

  // 关键 Q02：目录待同步/未知结果持久状态与重同步门禁
  const [needsCatalogResync, setNeedsCatalogResync] = useState(false);
  const needsCatalogResyncRef = useRef(false);
  needsCatalogResyncRef.current = needsCatalogResync;
  // 关键 Q02：按作品记录目录待同步状态集合，确保跨作品切换后原作品门禁持久保留
  const worksNeedingResyncRef = useRef<Set<string>>(new Set());
  const [isResyncingCatalog, setIsResyncingCatalog] = useState(false);
  const resyncRequestIdRef = useRef(0);

  // 服务端已保存的权威写作统计（contracts/types.ts WorkStats）
  const [workStats, setWorkStats] = useState<WorkStats | null>(null);

  type PendingSave = {
    chapterId: string;
    saveId: string;
    title?: string;
    content?: string;
  };
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const uncertainOverwriteRef = useRef<OverwriteAttempt | null>(null);
  const originalVersionPreservedRef = useRef<Set<string>>(new Set());
  const currentEditorChapterIdRef = useRef<string | null>(selectedId);

  // SSR 与初次水合使用确定性的初始值，挂载后通过 useEffect 安全同步 localStorage
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [todayWords, setTodayWords] = useState<number>(DEFAULT_TODAY_WORDS);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [goalInputValue, setGoalInputValue] = useState(DEFAULT_DAILY_GOAL.toString());
  const [showCheerModal, setShowCheerModal] = useState(false);
  const hasCelebratedRef = useRef(false);

  const currentWork = works.find((w) => w.id === activeWorkId) || works[0] || null;
  const selected: LocalChapter =
    chapters.find((chapter) => chapter.id === selectedId) ||
    chapters[0] || {
      id: "placeholder",
      title: "第一章",
      content: "<p></p>",
      status: "draft" as const,
    };
  const selectedMetrics = analyzeChapterText(selected.content || "");
  const getChapterWordCount = (chapter: LocalChapter) => {
    if (chapter.id === selectedId) return selectedMetrics.wordCount;
    return chapter.wordCount ?? (chapter.content ? countChapterWords(chapter.content) : 0);
  };
  const currentVolume = volumes.find((v) => v.id === selected.volumeId) || volumes[0] || null;
  const chapterWords = selectedMetrics.wordCount;
  const totalWords = chapters.reduce((sum, chapter) => sum + getChapterWordCount(chapter), 0);

  const aiContextPayload = useMemo<AiGenerationInput["context"]>(() => {
    const currentChapterText = selectedMetrics.text;
    return {
      chapters: includeCurrentChapter && currentChapterText
        ? [{ id: selected.id, title: selected.title, content: currentChapterText.slice(-3000) }] : [],
      outlines: includeOutline
        ? outlinesList.slice(0, 2).map((item) => ({ title: item.title, content: item.content })) : [],
      characters: includeCharacters
        ? charactersList.slice(0, 3).map((item) => ({ name: item.name, description: `${item.role}: ${item.description}` })) : [],
      worldEntries: includeWorld
        ? worldList.slice(0, 2).map((item) => ({ name: item.name, content: item.summary || item.content || "" })) : [],
      timelineEvents: includeTimeline
        ? timelineList.slice(0, 2).map((item) => ({ title: item.title, description: item.description || "" })) : [],
    };
  }, [includeCurrentChapter, includeOutline, includeCharacters, includeWorld, includeTimeline,
    selected.id, selected.title, selectedMetrics.text, outlinesList, charactersList, worldList, timelineList]);
  const aiPreviewBudget = useMemo(() => planAiContext({
    action: "continue", instruction: aiPrompt || " ", selectedText: "", context: aiContextPayload,
    temperature: 0.7, maxTokens: 2000,
  }).budget, [aiPrompt, aiContextPayload]);

  // 总体每日码字进度：以服务端 workStats 为权威来源，区分 null、0 与具体目标
  const serverTodayWords = workStats ? workStats.todayWordsWritten : todayWords;
  const serverDailyGoal = workStats ? workStats.todayTargetWords : dailyGoal;

  const isUnlimitedDaily = serverDailyGoal === 0;
  const hasDailyTarget = serverDailyGoal !== null && serverDailyGoal > 0;
  const progress = isUnlimitedDaily
    ? 100
    : hasDailyTarget
    ? Math.min(100, Math.round((serverTodayWords / serverDailyGoal) * 100))
    : 0;
  const isGoalReached = hasDailyTarget && serverTodayWords >= serverDailyGoal;

  async function updateDailyGoal(val: number) {
    if (val < 0) return;
    setDailyGoal(val);
    setGoalInputValue(val.toString());
    if (activeWorkId && workStats) {
      try {
        const updated = await updateWorkStats(activeWorkId, {
          date: workStats.today,
          targetWords: val,
        });
        setWorkStats(updated);
      } catch (err) {
        console.error("更新服务端写作目标失败:", err);
      }
    }
    // 如果设置的目标已被今日字数超越，触发欢呼庆祝（0 字自由创作不触发庆祝）
    if (val > 0 && serverTodayWords >= val) {
      hasCelebratedRef.current = true;
      setTimeout(() => {
        setShowCheerModal(true);
      }, 100);
    } else {
      hasCelebratedRef.current = false;
    }
  }

  function addTodayWords(count: number) {
    if (count <= 0) return;
    setTodayWords((prev) => {
      const next = prev + count;
      if (dailyGoal > 0 && next >= dailyGoal && !hasCelebratedRef.current) {
        hasCelebratedRef.current = true;
        saveTodayWordsToStorage(next, true);
        setTimeout(() => {
          setShowCheerModal(true);
        }, 100);
      } else {
        saveTodayWordsToStorage(next);
      }
      return next;
    });
  }

  // 客户端挂载后从 localStorage 安全同步字数与目标，保证 SSR 与初次客户端渲染 DOM 结构严格一致，彻底杜绝水合不匹配
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const storedGoal = localStorage.getItem(DAILY_GOAL_STORAGE_KEY);
        if (storedGoal !== null) {
          const parsed = parseInt(storedGoal, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            setDailyGoal(parsed);
            setGoalInputValue(parsed.toString());
          }
        }

        const today = getShanghaiDateKey();
        const rawWords = localStorage.getItem(TODAY_WORDS_STORAGE_KEY);
        if (rawWords) {
          const parsed = JSON.parse(rawWords);
          if (parsed.date === today && typeof parsed.words === "number") {
            setTodayWords(parsed.words);
            if (parsed.celebrated) {
              hasCelebratedRef.current = true;
            }
          }
        }
      } catch {}
    };

    syncFromStorage();

    window.addEventListener("daily-goal-change", syncFromStorage);
    window.addEventListener("today-words-change", syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("daily-goal-change", syncFromStorage);
      window.removeEventListener("today-words-change", syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  // 串行保存处理器：无论网络如何延迟或用户持续输入，保证保存请求单线串行执行，杜绝过期响应覆盖新草稿与 409
  const performSave = useCallback(async (): Promise<boolean> => {
    if (resolvingConflictRef.current) return false;
    // 关键 C02：若当前已有在途分卷/章节排序请求，等待其完成并同步好版本号，防止并发写入导致版本冲突 409
    if (activeReorderPromiseRef.current) {
      try {
        await activeReorderPromiseRef.current;
      } catch {}
    }

    // 若当前已有在途保存请求，先等待其完成
    if (activeSavePromiseRef.current) {
      try {
        await activeSavePromiseRef.current;
      } catch {}
      // 前一个请求完成后，若在途期间有新输入（pendingSaveRef 仍有内容），继续串行保存
      if (pendingSaveRef.current) {
        return await performSave();
      }
      return saveStateRef.current !== "conflict";
    }

    // 检查是否有待保存的草稿
    const pending = pendingSaveRef.current;
    if (!pending) {
      return saveStateRef.current !== "conflict";
    }

    if (saveStateRef.current === "conflict") {
      return false;
    }

    const runSaveLoop = async (): Promise<boolean> => {
      while (pendingSaveRef.current) {
        const currentPending = pendingSaveRef.current;
        const currentSeq = draftSeqRef.current[currentPending.chapterId] || 0;
        pendingSaveRef.current = null;
        setSaveState("saving");

        try {
          // 关键 Q02：正文草稿的 expectedRevision 必须且只能来自 contentBaseRevisionsRef（本地编辑器草稿实际所基于的服务端版本）
          // 缺失正文基线时不发送无版本保存（防止无锁静默覆写）
          let contentBaseRev = contentBaseRevisionsRef.current[currentPending.chapterId];

          if (contentBaseRev === undefined) {
            console.warn(
              `章节 ${currentPending.chapterId} 缺失本地正文基线版本，从服务端安全拉取最新正文以供比对与冲突保护...`,
            );
            try {
              const latest = await fetchChapter(currentPending.chapterId);
              catalogRevisionsRef.current[currentPending.chapterId] = latest.revision;

              // 检查在 fetchChapter 异步等待期间是否有作者新键入的内容
              const newerPending = pendingSaveRef.current as PendingSave | null;
              const hasNewerSameChapterInput =
                newerPending !== null && newerPending.chapterId === currentPending.chapterId;
              const effectivePending: PendingSave = {
                chapterId: currentPending.chapterId,
                saveId: hasNewerSameChapterInput ? newerPending.saveId : currentPending.saveId,
                title: hasNewerSameChapterInput ? (newerPending.title ?? currentPending.title) : currentPending.title,
                content: hasNewerSameChapterInput ? (newerPending.content ?? currentPending.content) : currentPending.content,
              };

              // 关键 Q02 Boundary ②: 缺失基线时按待保存字段逐项严格比对！
              // 富文本加粗/斜体/空白等可见修改绝不能被忽略，仅改标题时不能用空正文占位判定
              // 只有所有待保存字段（title 和/或 content）确与服务端完全一致时，才可推进基线并跳过 PATCH
              const isEquivalent = isDraftPendingSaveEquivalent(
                effectivePending,
                latest,
              );

              if (isEquivalent) {
                // 待保存修改确与服务端事实完全一致，安全对齐基线，无需重复发 PATCH
                contentBaseRevisionsRef.current[currentPending.chapterId] = latest.revision;
                contentBaseRev = latest.revision;
                if (hasNewerSameChapterInput) {
                  pendingSaveRef.current = null;
                }
                setSaveState("saved");
                continue;
              } else {
                // 待保存字段与服务端存在差异（或无法证明等价）：
                // 坚决阻止旧草稿静默覆盖，保留本地草稿（合并最新输入），进入冲突保护，挂载服务端事实供作者比对或恢复
                console.warn(
                  `章节 ${currentPending.chapterId} 缺失基线且待保存修改与服务端不一致，阻止静默覆盖，转入版本冲突门禁`,
                );
                setSaveState("conflict");
                setConflictChapterId(currentPending.chapterId);
                // 关键修复：保留合并后的最新输入 effectivePending，绝不被旧快照 currentPending 覆盖！
                pendingSaveRef.current = newerPending && !hasNewerSameChapterInput ? newerPending : effectivePending;
                return false;
              }
            } catch (fetchErr) {
              console.error("获取服务端章节正文失败，阻止无基线保存:", fetchErr);
              setSaveState("error");
              const newerPending = pendingSaveRef.current as PendingSave | null;
              const hasNewerSameChapterInput =
                newerPending !== null && newerPending.chapterId === currentPending.chapterId;
              const effectivePending: PendingSave = {
                chapterId: currentPending.chapterId,
                saveId: hasNewerSameChapterInput ? newerPending.saveId : currentPending.saveId,
                title: hasNewerSameChapterInput ? (newerPending.title ?? currentPending.title) : currentPending.title,
                content: hasNewerSameChapterInput ? (newerPending.content ?? currentPending.content) : currentPending.content,
              };
              pendingSaveRef.current = newerPending && !hasNewerSameChapterInput ? newerPending : effectivePending;
              return false;
            }
          }

          const observedCatalogRev = catalogRevisionsRef.current[currentPending.chapterId];

          // 关键门禁：如果在发起保存前，目录观察到的版本已经大于本地正文基线，说明其他端已更新该章正文，立即转入冲突保护，杜绝旧稿写回！
          if (
            observedCatalogRev !== undefined &&
            contentBaseRev !== undefined &&
            observedCatalogRev > contentBaseRev
          ) {
            console.warn(
              `检测到服务端目录存在更新的修订号 (本地基线: ${contentBaseRev}, 目录观察: ${observedCatalogRev})，阻止旧草稿静默覆盖，转入版本冲突门禁`,
            );
            setSaveState("conflict");
            setConflictChapterId(currentPending.chapterId);
            try {
              const latest = await fetchChapter(currentPending.chapterId);
              catalogRevisionsRef.current[currentPending.chapterId] = latest.revision;
            } catch {}
            return false;
          }

          const expectedRevision = contentBaseRev;
          if (expectedRevision === undefined) {
            setSaveState("error");
            return false;
          }

          const payload: { title?: string; content?: string; expectedRevision: number; saveId: string; preservePreviousVersion?: boolean } = {
            expectedRevision,
            saveId: currentPending.saveId,
          };
          if (currentPending.title !== undefined) payload.title = currentPending.title;
          if (currentPending.content !== undefined) {
            payload.content = currentPending.content;
            if (!originalVersionPreservedRef.current.has(currentPending.chapterId)) {
              payload.preservePreviousVersion = true;
            }
          }

          const updated = await saveChapter(currentPending.chapterId, payload);

          // 正文保存成功，权威推进正文基线与目录观察修订号
          contentBaseRevisionsRef.current[currentPending.chapterId] = updated.revision;
          catalogRevisionsRef.current[currentPending.chapterId] = updated.revision;
          if (payload.preservePreviousVersion) originalVersionPreservedRef.current.add(currentPending.chapterId);

          // 更新章节状态：若在在途网络请求期间用户已键入更新内容，保留最新草稿，决不让旧响应覆盖新输入
          const inFlightPending = pendingSaveRef.current as PendingSave | null;
          const latestSeq = draftSeqRef.current[currentPending.chapterId] || 0;
          const hasNewerEdits =
            latestSeq > currentSeq ||
            (inFlightPending?.chapterId === currentPending.chapterId &&
              inFlightPending?.content !== undefined);
          const hasNewerTitle =
            inFlightPending?.chapterId === currentPending.chapterId &&
            inFlightPending?.title !== undefined;

          setChapters((prev) =>
            prev.map((c) => {
              if (c.id !== currentPending.chapterId) return c;
              return {
                ...c,
                revision: updated.revision,
                wordCount: updated.wordCount,
                title: hasNewerTitle ? c.title : updated.title,
                content: hasNewerEdits ? c.content : updated.content,
              };
            }),
          );

          setSaveState("saved");
          setConflictChapterId(null);

          // 保存成功后触发服务端权威统计刷新
          if (activeWorkIdRef.current && loadWorkStatsRef.current) {
            loadWorkStatsRef.current(activeWorkIdRef.current);
          }
        } catch (err: unknown) {
          if (err instanceof ChapterConflictError || (err as any)?.status === 409) {
            console.warn("保存章节版本冲突 (409 CONFLICT):", err);
            setSaveState("conflict");
            setConflictChapterId(currentPending.chapterId);
            try {
              const latest = await fetchChapter(currentPending.chapterId);
              // 关键 R01: 仅更新目录观察版本，绝不推进未决草稿的 contentBaseRevisionsRef!
              catalogRevisionsRef.current[currentPending.chapterId] = latest.revision;
            } catch (fetchErr) {
              console.error("拉取冲突章节服务器版本失败:", fetchErr);
            }
            return false;
          }
          console.error("保存章节失败:", err);
          // 关键 F02：网络失败时将草稿还原回 pendingSaveRef，若在途期间有其他字段修改，执行字段合并防止丢失
          const existingPending = pendingSaveRef.current as PendingSave | null;
          if (!existingPending) {
            pendingSaveRef.current = currentPending;
          } else if (existingPending.chapterId === currentPending.chapterId) {
            pendingSaveRef.current = {
              chapterId: currentPending.chapterId,
              saveId: existingPending.saveId,
              title: existingPending.title !== undefined ? existingPending.title : currentPending.title,
              content: existingPending.content !== undefined ? existingPending.content : currentPending.content,
            };
          }
          setSaveState("error");
          return false;
        }
      }
      return true;
    };

    const promise = runSaveLoop();
    activeSavePromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (activeSavePromiseRef.current === promise) {
        activeSavePromiseRef.current = null;
      }
    }
  }, []);

  // 立即刷盘保存未完成的草稿（防止防抖延迟期间切章/切作品/删除/离开丢稿）
  const flushPendingSave = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    return await performSave();
  }, [performSave]);

  // 快捷键保存与离开防丢稿保护（覆盖在途保存中、未保存防抖与冲突状态）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (getEditorShortcut(e) === "save") {
        e.preventDefault();
        flushPendingSave();
      }
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isDirty =
        pendingSaveRef.current !== null ||
        activeSavePromiseRef.current !== null ||
        saveStateRef.current === "saving" ||
        saveStateRef.current === "conflict" ||
        saveStateRef.current === "error";
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "您有尚未保存、正在保存或处于版本冲突的草稿，确定要离开吗？";
        return "您有尚未保存、正在保存或处于版本冲突的草稿，确定要离开吗？";
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushPendingSave]);

  // 加载当前作品的设定与知识库（请求隔离与版本号防竞态）
  const loadKnowledgeData = useCallback(async (workId: string) => {
    const reqId = ++knowledgeRequestIdRef.current;
    // 切换作品时立即清空上一作品设定，防止残留与串读
    setCharactersList([]);
    setOutlinesList([]);
    setWorldList([]);
    setTimelineList([]);

    try {
      const [c, o, w, t] = await Promise.allSettled([
        fetchKnowledgeList<CharacterItem>(workId, "characters"),
        fetchKnowledgeList<OutlineItem>(workId, "outlines"),
        fetchKnowledgeList<WorldItem>(workId, "world"),
        fetchKnowledgeList<any>(workId, "timeline"),
      ]);

      // 若在加载期间作品已再次切换，丢弃过期响应
      if (reqId !== knowledgeRequestIdRef.current || workId !== activeWorkIdRef.current) {
        return;
      }

      if (c.status === "fulfilled") setCharactersList(c.value);
      if (o.status === "fulfilled") setOutlinesList(o.value);
      if (w.status === "fulfilled") setWorldList(w.value);
      if (t.status === "fulfilled") setTimelineList(t.value);
    } catch (err) {
      if (reqId === knowledgeRequestIdRef.current) {
        console.error("加载设定数据失败:", err);
      }
    }
  }, []);

  // 工作区与作品数据真实加载（F03：请求代次 Token 隔离迟到响应）
  const loadWorkspaceData = useCallback(async (preferredWorkId?: string) => {
    const wsToken = ++workspaceRequestIdRef.current;
    try {
      setIsLoadingWorkspace(true);
      const ws = await fetchWorkspace();
      if (wsToken !== workspaceRequestIdRef.current) return;
      const workList = ws.works || [];

      // 如果当前没有任何作品，显示真实空状态，绝不自动创建虚假样例作品
      if (workList.length === 0) {
        setWorks([]);
        setActiveWorkId(null);
        setVolumes([]);
        setChapters([]);
        setSelectedId(null);
        setCharactersList([]);
        setOutlinesList([]);
        setWorldList([]);
        setTimelineList([]);
        setWorkStats(null);
        replaceEditorHtml("<p></p>");
        return;
      }

      setWorks(workList);
      const targetWorkId = preferredWorkId || ws.activeWorkId || workList[0].id;
      setActiveWorkId(targetWorkId);
      activeWorkIdRef.current = targetWorkId;

      // 关键 Q02：根据目标作品是否在待同步集合中立即决定目录门禁，跨作品切换保留原作品门禁
      const isResyncNeededForThisWork = worksNeedingResyncRef.current.has(targetWorkId);
      setNeedsCatalogResync(isResyncNeededForThisWork);
      needsCatalogResyncRef.current = isResyncNeededForThisWork;

      loadKnowledgeData(targetWorkId);

      // 加载当前作品的卷与章节
      const details = await fetchWorkDetails(targetWorkId);
      if (wsToken !== workspaceRequestIdRef.current) return;
      setVolumes(details.volumes || []);

      // 同步拉取当前作品权威服务端统计
      if (loadWorkStatsRef.current) {
        loadWorkStatsRef.current(targetWorkId);
      }

      // 映射章节，必须保留后端的 revision 与真实 sortOrder，用于乐观锁与精确结构增量计算
      const chapterList: LocalChapter[] = (details.chapters || []).map((c) => ({
        id: c.id,
        workId: c.workId,
        volumeId: c.volumeId,
        title: c.title,
        content: c.content || "<p></p>",
        status: c.status,
        wordCount: c.wordCount,
        revision: c.revision,
        sortOrder: c.sortOrder,
      }));

      // 同步记录目录观察修订号
      chapterList.forEach((c) => {
        if (c.revision !== undefined) {
          catalogRevisionsRef.current[c.id] = c.revision;
        }
      });


      // 如果后端章节列表为空，显示真实空章节状态，不自动创建假章节
      if (chapterList.length === 0) {
        setChapters([]);
        setSelectedId(null);
        replaceEditorHtml("<p></p>");
        return;
      }

      setChapters(chapterList);

      // 确定选中的章节：刷新页面时从 ws.activeChapterId 安全恢复（修复 A04）
      const isValidActiveChapter = ws.activeChapterId && chapterList.some((c) => c.id === ws.activeChapterId);
      const isPreferredMatch = preferredWorkId ? preferredWorkId === targetWorkId : true;
      const targetChapterId =
        (isPreferredMatch && isValidActiveChapter ? ws.activeChapterId : null) ||
        chapterList[0].id;
      setSelectedId(targetChapterId);
      currentEditorChapterIdRef.current = targetChapterId;
      loadChapterLinks(targetChapterId);

      // 加载选中章节的完整正文与最新 revision
      try {
        const fullCh = await fetchChapter(targetChapterId);
        if (wsToken !== workspaceRequestIdRef.current) return;
        if (fullCh.content !== undefined) {
          if (fullCh.revision !== undefined) {
            contentBaseRevisionsRef.current[targetChapterId] = fullCh.revision;
            catalogRevisionsRef.current[targetChapterId] = fullCh.revision;
          }
          setChapters((prev) =>
            prev.map((c) =>
              c.id === targetChapterId
                ? {
                    ...c,
                    content: fullCh.content,
                    revision: fullCh.revision,
                    wordCount: fullCh.wordCount,
                    sortOrder: fullCh.sortOrder !== undefined ? fullCh.sortOrder : c.sortOrder,
                  }
                : c,
            ),
          );
          if (currentEditorChapterIdRef.current === targetChapterId) {
            replaceEditorHtml(fullCh.content || "<p></p>");
          }
        }
      } catch (err) {
        console.error("获取章节正文失败:", err);
      }
    } catch (err) {
      console.error("加载工作区失败:", err);
    } finally {
      if (wsToken === workspaceRequestIdRef.current) {
        setIsLoadingWorkspace(false);
      }
    }
  }, [loadKnowledgeData]);

  // 加载当前章节关联设定（F03：请求代次 Token 隔离迟到响应）
  const loadChapterLinks = useCallback(async (chapterId: string) => {
    if (!chapterId || chapterId === "placeholder") {
      setChapterLinks([]);
      return;
    }
    const token = ++linksRequestIdRef.current;
    try {
      const links = await fetchChapterLinks(chapterId);
      if (token !== linksRequestIdRef.current || currentEditorChapterIdRef.current !== chapterId) {
        return;
      }
      setChapterLinks(links);
    } catch (err) {
      console.warn("加载章节关联设定失败:", err);
      if (token === linksRequestIdRef.current && currentEditorChapterIdRef.current === chapterId) {
        setChapterLinks([]);
      }
    }
  }, []);

  // 加载作品权威统计数据（F03：代次保护）
  const loadWorkStats = useCallback(async (workId: string) => {
    if (!workId) {
      setWorkStats(null);
      return;
    }
    const token = ++statsRequestIdRef.current;
    try {
      const data = await fetchWorkStats(workId);
      if (token !== statsRequestIdRef.current || activeWorkIdRef.current !== workId) {
        return;
      }
      setWorkStats(data);
    } catch (err) {
      console.error("加载作品写作统计失败:", err);
    }
  }, []);

  useEffect(() => {
    loadWorkStatsRef.current = loadWorkStats;
  }, [loadWorkStats]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // 仅在编辑器初始化或显式切章时装载正文；保存响应不能覆写在途草稿。
  useEffect(() => {
    if (!tiptap || !selectedId) return;
    currentEditorChapterIdRef.current = selectedId;
    const chapter = chaptersRef.current.find((item) => item.id === selectedId);
    replaceEditorHtml(chapter?.content || "<p></p>");
  }, [tiptap, selectedId]);

  // 章节目录分组：支持作品下包含【未分卷】分组展示，按权威真实 sortOrder 严格排序
  const groupedChapters = useMemo(() => {
    if (!volumes.length) {
      return [{ id: "default", title: "正文章节", items: [...chapters].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) }];
    }
    const volumeIdSet = new Set(volumes.map((v) => v.id));
    const groups = volumes.map((vol, idx) => ({
      id: vol.id,
      title: vol.title || `第${idx + 1}卷`,
      summary: vol.summary || "",
      items: chapters.filter((c) => c.volumeId === vol.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }));

    // 未关联分卷或所属分卷已被删除的章节，统一归入【未分卷】分组
    const unassigned = chapters.filter((c) => !c.volumeId || !volumeIdSet.has(c.volumeId)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (unassigned.length > 0) {
      groups.push({
        id: "unassigned",
        title: "未分卷",
        summary: "",
        items: unassigned,
      });
    }

    return groups;
  }, [volumes, chapters]);
  const chapterJumpItems = useMemo(() => groupedChapters.flatMap((group) =>
    group.items.map((chapter) => ({ id: chapter.id, title: chapter.title, volumeTitle: group.title }))
  ).map((chapter, index) => ({ ...chapter, ordinal: index + 1 })), [groupedChapters]);

  // 切换分卷折叠/展开
  function toggleVolumeCollapse(volumeId: string) {
    setCollapsedVolumeIds((prev) => {
      const next = new Set(prev);
      if (next.has(volumeId)) {
        next.delete(volumeId);
      } else {
        next.add(volumeId);
      }
      return next;
    });
  }

  // 删除分卷（优雅移除并自动保留章节到【未分卷】）
  async function handleDeleteVolume(volumeId: string, volumeTitle: string) {
    if (needsCatalogResyncRef.current) {
      alert("当前作品目录状态待确认，请先点击【重新同步目录】获取最新事实后再删除分卷。");
      return;
    }
    const confirmed = window.confirm(
      `确定要删除分卷《${volumeTitle}》吗？\n\n系统将执行安全移除：\n• 本卷中的所有章节将完整保留，并转入【未分卷】列表；\n• 卷级大纲将自动保留为作品级大纲；\n• 分卷记录本身将被移除（不会随卷删除任何正文内容）。`,
    );
    if (!confirmed) return;

    try {
      await deleteVolume(volumeId);
      setVolumes((prev) => prev.filter((v) => v.id !== volumeId));
      // 将原属于该卷的章节 volumeId 置空，在前端自动并入未分卷
      setChapters((prev) =>
        prev.map((c) => (c.volumeId === volumeId ? { ...c, volumeId: null } : c)),
      );
    } catch (err: any) {
      console.error("删除分卷失败:", err);
      const { isConflict, message } = categorizeMutationError(err);
      if (activeWorkIdRef.current) {
        worksNeedingResyncRef.current.add(activeWorkIdRef.current);
      }
      setNeedsCatalogResync(true);
      needsCatalogResyncRef.current = true;

      if (isConflict) {
        alert(`删除分卷被服务端拒绝（409 冲突）：${message}。已锁定目录并尝试重新同步服务端最新事实。`);
      } else {
        alert(`删除分卷网络结果未知（${message}）。已锁定目录以防依据过期目录重复操作，正在尝试核实服务端事实...`);
      }

      // 尝试自动核对最新事实以恢复一致性
      try {
        const currentWork = activeWorkIdRef.current;
        if (currentWork) {
          const details = await fetchWorkDetails(currentWork);
          if (activeWorkIdRef.current === currentWork && details.chapters) {
            setVolumes(details.volumes || []);
            reconcileChapterCatalog(details.chapters);
            worksNeedingResyncRef.current.delete(currentWork);
            setNeedsCatalogResync(false);
            needsCatalogResyncRef.current = false;
          }
        }
      } catch {}
    }
  }

  // 新建分卷成功回调
  function handleVolumeCreated(newVolume: Volume) {
    setVolumes((prev) => [...prev, newVolume]);
    // 新建的分卷默认展开
    setCollapsedVolumeIds((prev) => {
      const next = new Set(prev);
      next.delete(newVolume.id);
      return next;
    });
  }

  /**
   * R01 / R03 / Q01: 统一目录重同步与增删协调
   * @param serverChapters 服务端返回的权威全书章节列表
   * @param reorderSnapshotMap 本次排序请求前捕获的目标章节快照 Map (chapterId -> ChapterReorderSnapshot)
   */
  const reconcileChapterCatalog = useCallback(
    (
      serverChapters: Chapter[],
      reorderSnapshotMap?: Map<string, ChapterReorderSnapshot>,
    ) => {
      // 1. 更新全量目录观察版本 catalogRevisionsRef
      serverChapters.forEach((sc) => {
        if (sc.revision !== undefined) {
          catalogRevisionsRef.current[sc.id] = sc.revision;
        }
      });

      // 2. Q01: 基于提交前请求版本、正文基线快照核验响应 revision
      const confirmedTargetRevisions = new Set<string>();

      if (reorderSnapshotMap) {
        reorderSnapshotMap.forEach((snap, chId) => {
          const sc = serverChapters.find((c) => c.id === chId);
          if (!sc || sc.revision === undefined) return;

          const verification = verifyChapterReorderRevision(snap, sc.revision);
          if (verification.isMatch) {
            // 目录版本匹配，允许在列表展示上确认本次结构修订
            confirmedTargetRevisions.add(chId);
            if (verification.shouldAdvanceContentBase) {
              // 关键 Boundary ③: 仅当该章已实际加载正文且基线匹配时，才推进正文基线！未加载章节不建立虚假正文基线
              contentBaseRevisionsRef.current[chId] = sc.revision;
            }
          } else {
            // 响应 revision 与预期结构增量不符，或请求前基线已失真，判定为并发外部修改，绝不推进正文基线
            console.warn(
              `章节 ${chId} 响应核验未通过（${verification.reason}），阻止推进正文基线`,
            );
            if (currentEditorChapterIdRef.current === chId) {
              setSaveState("conflict");
              setConflictChapterId(chId);
            }
          }
        });
      }

      // 3. R03 / Q01: 按权威服务器章节集合协调增删与移动，保留真实 sortOrder 与反映自身修订
      const serverMap = new Map(serverChapters.map((c) => [c.id, c]));

      setChapters((prev) => {
        const result: LocalChapter[] = [];
        const seenIds = new Set<string>();

        // 处理本地现有章节
        for (const local of prev) {
          seenIds.add(local.id);
          const serverCh = serverMap.get(local.id);
          if (serverCh) {
            // 服务端仍存在，更新目录元数据
            // 若为本次核验通过的目标章节，更新 revision；否则保留 local.revision 防止未加载正文时展示跳变
            const isConfirmedTarget = confirmedTargetRevisions.has(local.id);
            result.push({
              ...local,
              volumeId: serverCh.volumeId,
              sortOrder: serverCh.sortOrder,
              status: serverCh.status,
              wordCount: serverCh.wordCount ?? local.wordCount,
              revision: isConfirmedTarget ? serverCh.revision : local.revision,
            });
          } else {
            // 服务端已删除该章：检查是否有未保存草稿
            const hasDirtyDraft =
              pendingSaveRef.current?.chapterId === local.id ||
              (selectedId === local.id && (draftSeqRef.current[local.id] || 0) > 0);
            if (hasDirtyDraft) {
              // 保护未保存草稿，标记冲突与草稿保留状态，停止静默保存
              console.warn(`章节 ${local.id} 已在服务端被删除，保留未保存草稿`);
              setSaveState("conflict");
              setConflictChapterId(local.id);
              result.push({
                ...local,
                title: local.title.includes("【已在服务端删除】")
                  ? local.title
                  : `${local.title} 【已在服务端删除】`,
              });
            }
            // 无脏草稿的章节被自然清除
          }
        }

        // 处理服务端新出现的章节（其他窗口新增）
        for (const serverCh of serverChapters) {
          if (!seenIds.has(serverCh.id)) {
            result.push({
              id: serverCh.id,
              workId: serverCh.workId,
              volumeId: serverCh.volumeId,
              title: serverCh.title,
              content: serverCh.content || "<p></p>",
              status: serverCh.status,
              wordCount: serverCh.wordCount ?? 0,
              revision: serverCh.revision,
              sortOrder: serverCh.sortOrder,
            });
          }
        }

        // 按权威 sortOrder 排序
        return result.sort((a, b) => {
          const sA = a.sortOrder ?? serverMap.get(a.id)?.sortOrder ?? 99999;
          const sB = b.sortOrder ?? serverMap.get(b.id)?.sortOrder ?? 99999;
          return sA - sB;
        });
      });
    },
    [selectedId],
  );

  // 分卷排序：上移/下移（Batch 2 / R02：生命周期互斥 + 串行保护）
  async function handleMoveVolume(volumeId: string, direction: "up" | "down") {
    // 关键 Q02：目录待同步时拦截结构写入
    if (needsCatalogResyncRef.current) {
      alert("当前作品目录状态待确认，请先点击【重新同步目录】获取最新事实后再执行分卷排序。");
      return;
    }

    // 1. 同步获取互斥锁，防止任何并发连点穿透
    if (!activeWorkId || isReorderingRef.current) return;
    isReorderingRef.current = true;
    const targetWorkId = activeWorkId;
    const reqToken = ++reorderRequestIdRef.current;

    // 2. 等待已有未决草稿保存完毕（此时 activeReorderPromiseRef 尚未挂载，避免循环等待）
    let ok = false;
    try {
      ok = await flushPendingSave();
    } catch {}

    if (!ok || saveStateRef.current === "conflict" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      isReorderingRef.current = false;
      alert("当前章节有未保存草稿、正在保存中或处于版本冲突状态，已阻止排序分卷以防丢稿。请解决后再试。");
      return;
    }

    // 检查刷盘期间作品是否发生切换
    if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
      isReorderingRef.current = false;
      return;
    }

    const realVolumes = [...volumes];
    const currentIndex = realVolumes.findIndex((v) => v.id === volumeId);
    if (currentIndex === -1) {
      isReorderingRef.current = false;
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= realVolumes.length) {
      isReorderingRef.current = false;
      return;
    }

    const newVolumes = [...realVolumes];
    const [movedVolume] = newVolumes.splice(currentIndex, 1);
    newVolumes.splice(targetIndex, 0, movedVolume);

    const volumeIds = newVolumes.map((v) => v.id);

    // 乐观更新分卷列表
    setVolumes(newVolumes);

    const task = (async () => {
      try {
        const updatedVolumes = await reorderVolumes(targetWorkId, volumeIds);
        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }
        setVolumes(updatedVolumes);
      } catch (err: unknown) {
        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }
        console.error("分卷排序失败:", err);
        let resynced = false;
        try {
          const details = await fetchWorkDetails(targetWorkId);
          if (reqToken === reorderRequestIdRef.current && activeWorkIdRef.current === targetWorkId) {
            setVolumes(details.volumes || []);
            if (details.chapters) {
              reconcileChapterCatalog(details.chapters);
            }
            resynced = true;
          }
        } catch {}

        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }

        if (resynced) {
          if (activeWorkIdRef.current) worksNeedingResyncRef.current.delete(activeWorkIdRef.current);
          alert("分卷排序未能生效，已重新同步服务端最新分卷列表。");
        } else {
          if (activeWorkIdRef.current) worksNeedingResyncRef.current.add(activeWorkIdRef.current);
          setNeedsCatalogResync(true);
          needsCatalogResyncRef.current = true;
          alert("分卷排序遇到未知网络结果且未能重新同步分卷列表，已进入待同步状态。请检查网络后点击【重新同步目录】。");
        }
      } finally {
        if (reqToken === reorderRequestIdRef.current) {
          isReorderingRef.current = false;
          activeReorderPromiseRef.current = null;
        }
      }
    })();

    activeReorderPromiseRef.current = task;
    await task;

    if (reqToken === reorderRequestIdRef.current && activeWorkIdRef.current === targetWorkId) {
      if (pendingSaveRef.current && (saveStateRef.current as string) !== "conflict") {
        performSave();
      }
    }
  }

  // 章节卷内排序：上移 / 下移（C01 / R01 / R02 / R03 / Q01 / Q02）
  async function handleMoveChapter(chapterId: string, direction: "up" | "down") {
    // 关键 Q02：目录待同步时拦截结构写入
    if (needsCatalogResyncRef.current) {
      alert("当前作品目录状态待确认，请先点击【重新同步目录】获取最新事实后再执行章节排序。");
      return;
    }

    // 1. 同步获取互斥锁，防止连点穿透
    if (!activeWorkId || isReorderingRef.current) return;
    isReorderingRef.current = true;
    const targetWorkId = activeWorkId;
    const reqToken = ++reorderRequestIdRef.current;

    // 2. 等待已有未决草稿保存完毕（此时 activeReorderPromiseRef 尚未挂载，避免循环等待）
    let ok = false;
    try {
      ok = await flushPendingSave();
    } catch {}

    if (!ok || saveStateRef.current === "conflict" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      isReorderingRef.current = false;
      alert("当前章节有未保存草稿、正在保存中或处于版本冲突状态，已阻止排序以防丢稿。请解决后再试。");
      return;
    }

    if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
      isReorderingRef.current = false;
      return;
    }

    const currentChList = [...chaptersRef.current];
    const ch = currentChList.find((c) => c.id === chapterId);
    if (!ch) {
      isReorderingRef.current = false;
      return;
    }

    const currentVolId = ch.volumeId || null;
    const groupItems = currentChList
      .filter((c) => (c.volumeId || null) === currentVolId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const currentIndex = groupItems.findIndex((c) => c.id === chapterId);
    if (currentIndex === -1) {
      isReorderingRef.current = false;
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= groupItems.length) {
      isReorderingRef.current = false;
      return;
    }

    const newGroupItems = [...groupItems];
    const [moved] = newGroupItems.splice(currentIndex, 1);
    newGroupItems.splice(targetIndex, 0, moved);

    if (newGroupItems.length > 500) {
      isReorderingRef.current = false;
      alert("目标分组章节数超过 500 章限制，无法执行排序");
      return;
    }

    // Q01: 校验目标列表每章的真实 sortOrder，缺失时先重新获取目录，不默认 0
    const hasMissingSortOrder = newGroupItems.some((item) => item.sortOrder === undefined);
    if (hasMissingSortOrder) {
      isReorderingRef.current = false;
      alert("目录排序元数据不完整，正在重新同步目录事实...");
      try {
        const details = await fetchWorkDetails(targetWorkId);
        if (details.chapters) {
          reconcileChapterCatalog(details.chapters);
        }
      } catch {}
      return;
    }

    const completeTargetOrder = newGroupItems.map((c) => c.id);

    // Q01: 提交前捕获目标列表每章的 request revision、volumeId、sortOrder、正文基线快照
    const expectedRevisions: { chapterId: string; revision: number }[] = [];
    const reorderSnapshotMap = new Map<string, ChapterReorderSnapshot>();

    for (let pos = 0; pos < newGroupItems.length; pos++) {
      const item = newGroupItems[pos];
      const rev = catalogRevisionsRef.current[item.id] ?? item.revision;
      if (rev === undefined) {
        isReorderingRef.current = false;
        alert("目录版本不完整，请先刷新目录后再试");
        return;
      }
      expectedRevisions.push({ chapterId: item.id, revision: rev });

      const oldVolumeId = item.volumeId ?? null;
      const targetVolId = currentVolId ?? null;
      const oldSortOrder = item.sortOrder!;
      const targetPos = pos;
      // 准则: const delta = old.volumeId !== targetVolumeId || old.sortOrder !== newPosition ? 1 : 0;
      const delta = (oldVolumeId !== targetVolId || oldSortOrder !== targetPos) ? 1 : 0;

      reorderSnapshotMap.set(item.id, {
        chapterId: item.id,
        requestRevision: rev,
        contentBaseRevision: contentBaseRevisionsRef.current[item.id],
        oldVolumeId,
        oldSortOrder,
        targetVolumeId: targetVolId,
        targetPosition: targetPos,
        expectedDelta: delta,
      });
    }

    // 3. 挂载异步任务并协调 performSave
    const task = (async () => {
      try {
        const updatedCatalog = await reorderChapters(targetWorkId, {
          volumeId: currentVolId,
          chapterIds: completeTargetOrder,
          expectedRevisions,
        });

        // 迟到响应隔离
        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }

        // Q01 / R01 / R03: 基于快照核验响应 revision，精准推进正文基线与视图修订
        reconcileChapterCatalog(updatedCatalog, reorderSnapshotMap);

      } catch (err: any) {
        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }
        console.error("章节排序失败:", err);

        // 409 或网络未知：暂停当前草稿自动保存，保留旧基线和本地输入
        let resynced = false;
        try {
          const details = await fetchWorkDetails(targetWorkId);
          if (reqToken === reorderRequestIdRef.current && activeWorkIdRef.current === targetWorkId) {
            if (details.chapters) {
              // 失败回拉绝不传入 reorderSnapshotMap，绝不推进任何章节的正文基线！
              reconcileChapterCatalog(details.chapters);
              resynced = true;
            }
          }
        } catch (fetchErr) {
          console.error("刷新目录元数据失败:", fetchErr);
        }

        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }

        if (!resynced) {
          if (activeWorkIdRef.current) worksNeedingResyncRef.current.add(activeWorkIdRef.current);
          setNeedsCatalogResync(true);
          needsCatalogResyncRef.current = true;
        } else {
          if (activeWorkIdRef.current) worksNeedingResyncRef.current.delete(activeWorkIdRef.current);
        }

        if (err?.status === 409) {
          if (resynced) {
            alert("章节排序冲突 (409)：目录已更新为服务端最新排序与增删事实。本地草稿已完整保留，已停止自动保存，请核对后重试。");
          } else {
            alert("章节排序冲突 (409)，且未能重新同步目录事实。已进入待同步状态，本地草稿已妥善保留，请检查网络后点击【重新同步目录】。");
          }
        } else {
          if (resynced) {
            alert(`章节排序遇到未知网络结果 (${err?.message || "网络异常"})：本地草稿已妥善保留，目录已重新同步，请核对后再试。`);
          } else {
            alert(`章节排序结果待确认 (${err?.message || "网络断开"})：本地草稿已保留，未能同步完成。已进入待同步状态，请在网络恢复后点击【重新同步目录】。`);
          }
        }
      } finally {
        if (reqToken === reorderRequestIdRef.current) {
          isReorderingRef.current = false;
          activeReorderPromiseRef.current = null;
        }
      }
    })();

    activeReorderPromiseRef.current = task;
    await task;

    if (reqToken === reorderRequestIdRef.current && activeWorkIdRef.current === targetWorkId) {
      if (pendingSaveRef.current && (saveStateRef.current as string) !== "conflict") {
        performSave();
      }
    }
  }

  // 章节跨卷移动（C01 / R01 / R02 / R03 / Q01 / Q02）
  async function handleMoveChapterToVolume(chapterId: string, targetVolumeId: string | null) {
    // 关键 Q02：目录待同步时拦截结构写入
    if (needsCatalogResyncRef.current) {
      alert("当前作品目录状态待确认，请先点击【重新同步目录】获取最新事实后再执行跨卷移动。");
      return;
    }

    // 1. 同步获取互斥锁
    if (!activeWorkId || isReorderingRef.current) return;
    isReorderingRef.current = true;
    const targetWorkId = activeWorkId;
    const reqToken = ++reorderRequestIdRef.current;

    // 2. 等待已有未决草稿保存完毕
    let ok = false;
    try {
      ok = await flushPendingSave();
    } catch {}

    if (!ok || saveStateRef.current === "conflict" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      isReorderingRef.current = false;
      alert("当前章节有未保存草稿、正在保存中或处于版本冲突状态，已阻止移动分卷以防丢稿。请解决后再试。");
      return;
    }

    if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
      isReorderingRef.current = false;
      return;
    }

    const currentChList = [...chaptersRef.current];
    const ch = currentChList.find((c) => c.id === chapterId);
    if (!ch) {
      isReorderingRef.current = false;
      return;
    }

    const sourceVolId = ch.volumeId || null;
    if (sourceVolId === targetVolumeId) {
      isReorderingRef.current = false;
      return;
    }

    const targetGroupExisting = currentChList
      .filter((c) => (c.volumeId || null) === targetVolumeId && c.id !== chapterId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const newGroupItems = [...targetGroupExisting, ch];

    if (newGroupItems.length > 500) {
      isReorderingRef.current = false;
      alert("目标分卷章节数超过 500 章限制，无法移入该卷");
      return;
    }

    // Q01: 校验目标列表每章的真实 sortOrder，缺失时先重新获取目录，不默认 0
    const hasMissingSortOrder = newGroupItems.some((item) => item.sortOrder === undefined);
    if (hasMissingSortOrder) {
      isReorderingRef.current = false;
      alert("目录排序元数据不完整，正在重新同步目录事实...");
      try {
        const details = await fetchWorkDetails(targetWorkId);
        if (details.chapters) {
          reconcileChapterCatalog(details.chapters);
        }
      } catch {}
      return;
    }

    const completeTargetOrder = newGroupItems.map((c) => c.id);

    // Q01: 提交前捕获目标列表每章的 request revision、volumeId、sortOrder、正文基线快照
    const expectedRevisions: { chapterId: string; revision: number }[] = [];
    const reorderSnapshotMap = new Map<string, ChapterReorderSnapshot>();

    for (let pos = 0; pos < newGroupItems.length; pos++) {
      const item = newGroupItems[pos];
      const rev = catalogRevisionsRef.current[item.id] ?? item.revision;
      if (rev === undefined) {
        isReorderingRef.current = false;
        alert("目录版本不完整，请先刷新目录后再试");
        return;
      }
      expectedRevisions.push({ chapterId: item.id, revision: rev });

      const oldVolumeId = item.volumeId ?? null;
      const targetVolId = targetVolumeId ?? null;
      const oldSortOrder = item.sortOrder!;
      const targetPos = pos;
      // 准则: const delta = old.volumeId !== targetVolumeId || old.sortOrder !== newPosition ? 1 : 0;
      const delta = (oldVolumeId !== targetVolId || oldSortOrder !== targetPos) ? 1 : 0;

      reorderSnapshotMap.set(item.id, {
        chapterId: item.id,
        requestRevision: rev,
        contentBaseRevision: contentBaseRevisionsRef.current[item.id],
        oldVolumeId,
        oldSortOrder,
        targetVolumeId: targetVolId,
        targetPosition: targetPos,
        expectedDelta: delta,
      });
    }

    // 3. 挂载异步任务
    const task = (async () => {
      try {
        const updatedCatalog = await reorderChapters(targetWorkId, {
          volumeId: targetVolumeId,
          chapterIds: completeTargetOrder,
          expectedRevisions,
        });

        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }

        // 跨卷后自动展开目标卷
        if (targetVolumeId) {
          setCollapsedVolumeIds((prev) => {
            if (prev.has(targetVolumeId)) {
              const next = new Set(prev);
              next.delete(targetVolumeId);
              return next;
            }
            return prev;
          });
        }

        // Q01 / R01 / R03: 基于快照核验响应 revision，精准推进正文基线与视图修订
        reconcileChapterCatalog(updatedCatalog, reorderSnapshotMap);

      } catch (err: any) {
        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }
        console.error("跨卷移动章节失败:", err);

        let resynced = false;
        try {
          const details = await fetchWorkDetails(targetWorkId);
          if (reqToken === reorderRequestIdRef.current && activeWorkIdRef.current === targetWorkId) {
            if (details.chapters) {
              reconcileChapterCatalog(details.chapters);
              resynced = true;
            }
          }
        } catch (fetchErr) {
          console.error("刷新目录元数据失败:", fetchErr);
        }

        if (reqToken !== reorderRequestIdRef.current || activeWorkIdRef.current !== targetWorkId) {
          return;
        }

        if (!resynced) {
          if (activeWorkIdRef.current) worksNeedingResyncRef.current.add(activeWorkIdRef.current);
          setNeedsCatalogResync(true);
          needsCatalogResyncRef.current = true;
        } else {
          if (activeWorkIdRef.current) worksNeedingResyncRef.current.delete(activeWorkIdRef.current);
        }

        if (err?.status === 409) {
          if (resynced) {
            alert("跨卷移动冲突 (409)：目标卷或章节已被其他端更新，已重新同步最新目录与增删事实。本地草稿已保留，请核对后重试。");
          } else {
            alert("跨卷移动冲突 (409)，且未能重新同步服务端目录。已进入待同步状态，本地草稿已保留，请检查网络后点击【重新同步目录】。");
          }
        } else {
          if (resynced) {
            alert(`跨卷移动结果待确认 (${err?.message || "网络异常"})：本地草稿已妥善保留，目录已重新同步，请核对后再试。`);
          } else {
            alert(`跨卷移动结果待确认 (${err?.message || "网络断开"})：本地草稿已妥善保留，未能同步完成。已进入待同步状态，请在网络恢复后点击【重新同步目录】。`);
          }
        }
      } finally {
        if (reqToken === reorderRequestIdRef.current) {
          isReorderingRef.current = false;
          activeReorderPromiseRef.current = null;
        }
      }
    })();

    activeReorderPromiseRef.current = task;
    await task;

    if (reqToken === reorderRequestIdRef.current && activeWorkIdRef.current === targetWorkId) {
      if (pendingSaveRef.current && (saveStateRef.current as string) !== "conflict") {
        performSave();
      }
    }
  }

  // 切换作品
  async function handleSelectWork(workId: string) {
    if (workId === activeWorkId) return;
    // 切换作品前立即刷盘保存未完成的防抖草稿，杜绝静默丢稿
    const ok = await flushPendingSave();
    const hasPending = pendingSaveRef.current !== null;
    const isSaving = activeSavePromiseRef.current !== null || saveStateRef.current === "saving";
    const isConflict = saveStateRef.current === "conflict";
    const switchCheck = canSwitchWork(hasPending, isSaving, isConflict);
    if (!switchCheck.allowed || (!ok && hasPending)) {
      alert(switchCheck.errorMessage || "当前章节有尚未保存的内容，请先解决后再切换作品。");
      return;
    }
    try {
      resyncRequestIdRef.current++;
      await switchActiveWorkspace({ workId });
      setActiveWorkId(workId);
      await loadWorkspaceData(workId);
    } catch (err) {
      console.error("切换作品失败:", err);
    }
  }

  // 归档作品（增加草稿防丢保护）
  async function handleArchiveWork(workId: string) {
    const ok = await flushPendingSave();
    const hasPending = pendingSaveRef.current !== null;
    const isSaving = activeSavePromiseRef.current !== null || saveStateRef.current === "saving";
    const isConflict = saveStateRef.current === "conflict";
    const switchCheck = canSwitchWork(hasPending, isSaving, isConflict);
    if (!switchCheck.allowed || (!ok && hasPending)) {
      alert(switchCheck.errorMessage || "当前章节有尚未保存的内容，已阻止归档以防丢稿。");
      return;
    }
    try {
      await archiveWork(workId);
      await loadWorkspaceData();
    } catch (err) {
      console.error("归档作品失败:", err);
    }
  }

  // 新建作品前置拦截钩子（F01：提交创建前强制刷盘并检查是否发生保存失败/冲突）
  const handleBeforeCreateWork = async (): Promise<boolean> => {
    const ok = await flushPendingSave();
    const hasPending = pendingSaveRef.current !== null;
    const isSaving = activeSavePromiseRef.current !== null || saveStateRef.current === "saving";
    const isConflict = saveStateRef.current === "conflict";
    const switchCheck = canSwitchWork(hasPending, isSaving, isConflict);
    if (!switchCheck.allowed || (!ok && hasPending)) {
      alert(switchCheck.errorMessage || "当前章节有未保存草稿，请先解决保存问题后再创建新作品，以防草稿丢失。");
      return false;
    }
    return true;
  };

  // 新建作品成功回调（F01：严格校验保存状态，阻断脏数据切走）
  async function handleWorkCreated(newWork: Work) {
    const ok = await flushPendingSave();
    const hasPending = pendingSaveRef.current !== null;
    const isSaving = activeSavePromiseRef.current !== null || saveStateRef.current === "saving";
    const isConflict = saveStateRef.current === "conflict";
    const switchCheck = canSwitchWork(hasPending, isSaving, isConflict);
    if (!switchCheck.allowed || (!ok && hasPending)) {
      alert(switchCheck.errorMessage || "当前章节有未保存草稿，已阻止自动切换至新作品。");
      return;
    }
    await switchActiveWorkspace({ workId: newWork.id });
    await loadWorkspaceData(newWork.id);
  }

  // 切换章节（F03：请求代次 Token 隔离迟到响应）
  async function selectChapter(id: string): Promise<boolean> {
    if (id === currentEditorChapterIdRef.current) return true;
    if (chapterJumpBusyRef.current || resolvingConflictRef.current) return false;
    chapterJumpBusyRef.current = true;
    setChapterJumpError(null);
    const sourceWork = activeWorkIdRef.current;
    const sourceChapter = currentEditorChapterIdRef.current;
    try {
    // 切换章节前立即刷盘保存当前未完成的草稿，防止静默丢稿
    const ok = await flushPendingSave();
    if (!ok || saveStateRef.current === "conflict" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      setChapterJumpError("当前草稿尚未安全保存或存在冲突，已阻止跳转。请先重试保存或处理冲突。");
      return false;
    }

    const chReqToken = ++chapterRequestIdRef.current;
    const start = { workId: sourceWork, chapterId: sourceChapter, seq: sourceChapter ? draftSeqRef.current[sourceChapter] || 0 : 0 };
      const fullCh = await fetchChapter(id);
      if (chReqToken !== chapterRequestIdRef.current || !canCommitChapterJump(start, {
        workId: activeWorkIdRef.current, chapterId: currentEditorChapterIdRef.current,
        seq: sourceChapter ? draftSeqRef.current[sourceChapter] || 0 : 0,
        dirty: !!pendingSaveRef.current || !!activeSavePromiseRef.current || saveStateRef.current !== "saved",
      })) {
        setChapterJumpError("加载期间当前稿件或作品发生变化，本次跳转已取消；请保存后重新选择。");
        return false;
      }
      if (fullCh.revision !== undefined) {
        contentBaseRevisionsRef.current[id] = fullCh.revision;
        catalogRevisionsRef.current[id] = fullCh.revision;
      }
      const nextChapters = chaptersRef.current.map((c) =>
          c.id === id
            ? {
                ...c,
                title: fullCh.title,
                content: fullCh.content,
                revision: fullCh.revision,
                wordCount: fullCh.wordCount,
                sortOrder: fullCh.sortOrder !== undefined ? fullCh.sortOrder : c.sortOrder,
              }
            : c,
        );
      chaptersRef.current = nextChapters;
      setChapters(nextChapters);
      setSelectedId(id);
      currentEditorChapterIdRef.current = id;
      setConflictChapterId(null);
      loadChapterLinks(id);
      if (sourceWork) {
        switchActiveWorkspace({ workId: sourceWork, chapterId: id }).catch(() => {});
      }
      return true;
    } catch {
      setChapterJumpError("章节加载失败，当前稿件保持不变。请检查网络后重新跳转。");
      return false;
    } finally {
      chapterJumpBusyRef.current = false;
    }
  }

  // 新建章节（支持指定目标分卷）
  async function addChapter(targetVolumeId?: string) {
    if (!activeWorkId || isCreatingChapterRef.current) return;

    // 关键 Q02：目录待同步时拦截结构写入
    if (needsCatalogResyncRef.current) {
      alert("当前作品目录状态待确认，请先点击【重新同步目录】获取最新事实后再新建章节。");
      return;
    }

    // 新增章节前立即刷盘当前草稿
    const ok = await flushPendingSave();
    if (!ok || saveStateRef.current === "conflict" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      alert("当前草稿未保存、正在保存中或处于版本冲突，已阻止新建章节以防丢稿。");
      return;
    }

    // 结构操作使用独立进度状态，绝不写入正文 saveState
    isCreatingChapterRef.current = true;
    setIsCreatingChapter(true);

    try {
      const nextTitle = `第${chapters.length + 1}章 未命名章节`;
      // 如果指定了目标卷，使用指定卷；否则优先使用当前选中章节所在的卷，或第一个卷
      const currentCh = chapters.find((c) => c.id === selectedId);
      const chosenVolId =
        targetVolumeId !== undefined
          ? targetVolumeId
          : currentCh?.volumeId || volumes[0]?.id || null;

      const newCh = await createChapter(activeWorkId, {
        title: nextTitle,
        volumeId: chosenVolId,
        content: "<p></p>",
      });

      const formatted: LocalChapter = {
        id: newCh.id,
        workId: newCh.workId,
        volumeId: newCh.volumeId,
        title: newCh.title,
        content: newCh.content || "<p></p>",
        status: newCh.status,
        wordCount: newCh.wordCount ?? 0,
        revision: newCh.revision,
        sortOrder: newCh.sortOrder,
      };

      if (newCh.revision !== undefined) {
        contentBaseRevisionsRef.current[newCh.id] = newCh.revision;
        catalogRevisionsRef.current[newCh.id] = newCh.revision;
      }

      setChapters((prev) => [...prev, formatted]);
      setSelectedId(newCh.id);
      currentEditorChapterIdRef.current = newCh.id;
      setConflictChapterId(null);
      setChapterLinks([]);

      // 新建成功后新章与服务端一致，草稿状态重置为 saved
      pendingSaveRef.current = null;
      setSaveState("saved");

      // 若所属分卷当前处于折叠状态，新建章节后自动展开该卷
      if (chosenVolId && collapsedVolumeIds.has(chosenVolId)) {
        setCollapsedVolumeIds((prev) => {
          const next = new Set(prev);
          next.delete(chosenVolId);
          return next;
        });
      }

      replaceEditorHtml(formatted.content);
    } catch (err: any) {
      console.error("新建章节失败:", err);
      // 关键修复：结构操作异常与正文草稿保存状态彻底解耦，绝不写入正文 saveState
      // 将当前作品加入待同步集合，锁定目录结构写入
      const { isConflict, message } = categorizeMutationError(err);
      if (activeWorkIdRef.current) {
        worksNeedingResyncRef.current.add(activeWorkIdRef.current);
      }
      setNeedsCatalogResync(true);
      needsCatalogResyncRef.current = true;

      if (isConflict) {
        alert(`新建章节被服务端拒绝（409 冲突）：${message}。已锁定目录并尝试重新同步服务端最新事实。`);
      } else {
        alert(`新建章节网络结果未知（${message}）。已锁定目录以防重复创建，正在尝试核实是否已在服务端创建...`);
      }

      // 尝试自动核对最新事实以恢复一致性
      try {
        const currentWork = activeWorkIdRef.current;
        if (currentWork) {
          const details = await fetchWorkDetails(currentWork);
          if (activeWorkIdRef.current === currentWork && details.chapters) {
            setVolumes(details.volumes || []);
            reconcileChapterCatalog(details.chapters);
            worksNeedingResyncRef.current.delete(currentWork);
            setNeedsCatalogResync(false);
            needsCatalogResyncRef.current = false;
          }
        }
      } catch {}
    } finally {
      isCreatingChapterRef.current = false;
      setIsCreatingChapter(false);
    }
  }

  // 编辑器正文变动保存（带版本号防冲突与串行队列）
  function handleEditorInput() {
    const content = readEditorHtml();
    const oldWords = analyzeChapterText(selected?.content || "").wordCount;
    const newWords = analyzeChapterText(content).wordCount;
    const diff = newWords - oldWords;
    if (diff > 0) {
      addTodayWords(diff);
    }

    if (!selectedId) return;
    draftSeqRef.current[selectedId] = (draftSeqRef.current[selectedId] || 0) + 1;

    setChapters((prev) =>
      prev.map((chapter) =>
        chapter.id === selectedId
          ? { ...chapter, content, wordCount: newWords }
          : chapter,
      ),
    );
    if (saveStateRef.current !== "conflict") setSaveState("saving");

    pendingSaveRef.current = {
      chapterId: selectedId,
      saveId: crypto.randomUUID(),
      title: pendingSaveRef.current?.chapterId === selectedId ? pendingSaveRef.current.title : undefined,
      content,
    };

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await performSave();
    }, 650);
  }

  useEffect(() => {
    onEditorUpdateRef.current = handleEditorInput;
  });

  // 章节标题变动保存
  function handleTitleChange(newTitle: string) {
    if (!selectedId) return;
    draftSeqRef.current[selectedId] = (draftSeqRef.current[selectedId] || 0) + 1;

    setChapters((prev) =>
      prev.map((chapter) =>
        chapter.id === selectedId ? { ...chapter, title: newTitle } : chapter,
      ),
    );
    if (saveStateRef.current !== "conflict") setSaveState("saving");

    pendingSaveRef.current = {
      chapterId: selectedId,
      saveId: crypto.randomUUID(),
      title: newTitle,
      content: pendingSaveRef.current?.chapterId === selectedId ? pendingSaveRef.current.content : undefined,
    };

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await performSave();
    }, 650);
  }

  function format(command: string, value?: string) {
    if (!tiptap) return;
    switch (command) {
      case "undo": tiptap.chain().focus().undo().run(); break;
      case "redo": tiptap.chain().focus().redo().run(); break;
      case "bold": tiptap.chain().focus().toggleBold().run(); break;
      case "italic": tiptap.chain().focus().toggleItalic().run(); break;
      case "insertUnorderedList": tiptap.chain().focus().toggleBulletList().run(); break;
      case "formatBlock": if (value === "blockquote") tiptap.chain().focus().toggleBlockquote().run(); break;
    }
  }

  function toggleBlockquote() {
    tiptap?.chain().focus().toggleBlockquote().run();
  }

  function toggleHeading(tag: string = "h2") {
    if (tag === "h2") tiptap?.chain().focus().toggleHeading({ level: 2 }).run();
  }

  // 历史版本恢复完成回调：用服务端返回的全新 revision 和正文同步状态与编辑器（F02 / R01）
  function handleVersionRestored(restoredChapter: Chapter) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSaveRef.current = null;
    contentBaseRevisionsRef.current[restoredChapter.id] = restoredChapter.revision;
    catalogRevisionsRef.current[restoredChapter.id] = restoredChapter.revision;
    draftSeqRef.current[restoredChapter.id] = (draftSeqRef.current[restoredChapter.id] || 0) + 1;

    setChapters((prev) =>
      prev.map((c) =>
        c.id === restoredChapter.id
          ? {
              ...c,
              title: restoredChapter.title,
              content: restoredChapter.content || "<p></p>",
              revision: restoredChapter.revision,
              wordCount: restoredChapter.wordCount,
            }
          : c,
      ),
    );
    if (selectedId === restoredChapter.id) replaceEditorHtml(restoredChapter.content || "<p></p>");
    setSaveState("saved");
    setConflictChapterId(null);

    if (activeWorkIdRef.current && loadWorkStatsRef.current) {
      loadWorkStatsRef.current(activeWorkIdRef.current);
    }
  }

  // 章节软删除移入回收站（可随时一键恢复）
  async function handleSoftDeleteChapter(chapterId: string, e: React.MouseEvent) {
    e.stopPropagation();

    // 关键 Q02：目录待同步时拦截结构写入
    if (needsCatalogResyncRef.current) {
      alert("当前作品目录状态待确认，请先点击【重新同步目录】获取最新事实后再删除章节。");
      return;
    }

    // 软删除前必须先等待待保存草稿串行保存完毕，若失败或冲突则阻止危险操作
    const ok = await flushPendingSave();
    if (!ok || saveStateRef.current === "conflict" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      alert("当前章节有未保存草稿、正在保存中或处于版本冲突状态，已阻止移入回收站以防丢稿。请解决后再试。");
      return;
    }

    const ch = chapters.find((c) => c.id === chapterId);
    const chTitle = ch?.title || "该章节";
    if (!confirm(`确定将《${chTitle}》移入回收站吗？\n章节内容将被妥善保留，可在顶部回收站随时一键恢复。`)) {
      return;
    }
    try {
      await softDeleteChapter(chapterId);
      const remaining = chapters.filter((c) => c.id !== chapterId);
      setChapters(remaining);
      if (selectedId === chapterId) {
        const next = remaining[0]?.id || null;
        if (next) {
          selectChapter(next);
        } else {
          setSelectedId(null);
          currentEditorChapterIdRef.current = null;
          setChapterLinks([]);
          replaceEditorHtml("<p></p>");
        }
      }
    } catch (err: unknown) {
      console.error("移入回收站失败:", err);
      const { isConflict, message } = categorizeMutationError(err);
      if (activeWorkIdRef.current) {
        worksNeedingResyncRef.current.add(activeWorkIdRef.current);
      }
      setNeedsCatalogResync(true);
      needsCatalogResyncRef.current = true;

      if (isConflict) {
        alert(`移入回收站被服务端拒绝（409 冲突）：${message}。已锁定目录并尝试重新同步服务端最新事实。`);
      } else {
        alert(`移入回收站网络结果未知（${message}）。已锁定目录以防依据过期目录重复操作，正在尝试核实服务端事实...`);
      }

      // 尝试自动核对最新事实以恢复一致性
      try {
        const currentWork = activeWorkIdRef.current;
        if (currentWork) {
          const details = await fetchWorkDetails(currentWork);
          if (activeWorkIdRef.current === currentWork && details.chapters) {
            setVolumes(details.volumes || []);
            reconcileChapterCatalog(details.chapters);
            worksNeedingResyncRef.current.delete(currentWork);
            setNeedsCatalogResync(false);
            needsCatalogResyncRef.current = false;
          }
        }
      } catch {}
    }
  }

  // 冲突解决：拉取服务器最新版本覆盖本地（R01: 同步基线与观察版本）
  async function handlePullServerVersion() {
    if (!selectedId || resolvingConflictRef.current) return;
    resolvingConflictRef.current = true;
    setIsResolvingConflict(true);
    const seq = draftSeqRef.current[selectedId] || 0;
    try {
      const latest = await fetchChapter(selectedId);
      if ((draftSeqRef.current[selectedId] || 0) !== seq) {
        setChapterJumpError("拉取期间你继续编辑了草稿，已取消覆盖。请复制最新草稿后重新选择。");
        return;
      }
      contentBaseRevisionsRef.current[selectedId] = latest.revision;
      catalogRevisionsRef.current[selectedId] = latest.revision;
      draftSeqRef.current[selectedId] = (draftSeqRef.current[selectedId] || 0) + 1;
      if (pendingSaveRef.current?.chapterId === selectedId) {
        pendingSaveRef.current = null;
      }
      if (uncertainOverwriteRef.current?.chapterId === selectedId) {
        uncertainOverwriteRef.current = null;
      }
      setChapters((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                title: latest.title,
                content: latest.content,
                revision: latest.revision,
                wordCount: latest.wordCount,
              }
            : c,
        ),
      );
      replaceEditorHtml(latest.content || "<p></p>");
      setSaveState("saved");
      setConflictChapterId(null);
    } catch (err) {
      console.error("拉取服务器版本失败:", err);
      setChapterJumpError("拉取服务端版本失败，草稿仍保留在当前窗口，请检查网络后重试。");
    } finally {
      resolvingConflictRef.current = false;
      setIsResolvingConflict(false);
    }
  }

  // 冲突解决：以当前草稿强制覆盖服务端版本（R01: 推进基线与观察版本）
  async function handleForceOverwrite() {
    if (!selectedId || resolvingConflictRef.current) return;
    resolvingConflictRef.current = true;
    setIsResolvingConflict(true);
    try {
      const pending = pendingSaveRef.current;
      const currentContent =
        pending?.chapterId === selectedId && pending.content !== undefined
          ? pending.content
          : (readEditorHtml() || selected.content);
      const currentTitle =
        pending?.chapterId === selectedId && pending.title !== undefined
          ? pending.title
          : selected.title;
      const seq = draftSeqRef.current[selectedId] || 0;
      // An unknown response must be checked with the exact original request.
      // Fetching a fresh revision and issuing a new save would duplicate a
      // committed overwrite and its pre-overwrite snapshot.
      const attempt = await prepareOverwriteAttempt(uncertainOverwriteRef.current, {
        chapterId: selectedId,
        title: currentTitle,
        content: currentContent,
        draftSeq: seq,
      }, async () => (await fetchChapter(selectedId)).revision, () => crypto.randomUUID());
      uncertainOverwriteRef.current = attempt;
      const updated = await saveChapter(selectedId, {
        title: attempt.title,
        content: attempt.content,
        expectedRevision: attempt.expectedRevision,
        saveId: attempt.saveId,
        preservePreviousVersion: true,
      });
      uncertainOverwriteRef.current = null;
      const hasNewerInput = (draftSeqRef.current[selectedId] || 0) !== seq;
      originalVersionPreservedRef.current.add(selectedId);
      contentBaseRevisionsRef.current[selectedId] = updated.revision;
      catalogRevisionsRef.current[selectedId] = updated.revision;
      draftSeqRef.current[selectedId] = (draftSeqRef.current[selectedId] || 0) + 1;
      if (!hasNewerInput && pendingSaveRef.current?.chapterId === selectedId) {
        pendingSaveRef.current = null;
      }
      setChapters((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                title: hasNewerInput ? c.title : updated.title,
                content: hasNewerInput ? c.content : updated.content,
                revision: updated.revision,
                wordCount: updated.wordCount,
              }
            : c,
        ),
      );
      setSaveState("saved");
      setConflictChapterId(null);

      if (activeWorkIdRef.current && loadWorkStatsRef.current) {
        loadWorkStatsRef.current(activeWorkIdRef.current);
      }
    } catch (err) {
      console.error("强制覆盖保存失败:", err);
      if (err instanceof ChapterConflictError) uncertainOverwriteRef.current = null;
      setSaveState("conflict");
      setChapterJumpError("覆盖未确认成功，冲突保护仍开启。请检查网络并核对服务端版本后重试。");
    } finally {
      resolvingConflictRef.current = false;
      setIsResolvingConflict(false);
      if (saveStateRef.current === "saved" && pendingSaveRef.current) void performSave();
    }
  }

  // 冲突解决：安全复制草稿至剪贴板
  async function handleCopyDraft() {
    setCopiedToast(null);
    const pending = pendingSaveRef.current;
    const rawContent =
      pending?.chapterId === selectedId && pending.content !== undefined
        ? pending.content
        : (readEditorHtml() || selected.content);
    const editor = tiptapRef.current;
    const textToCopy = editor && !editor.isDestroyed
      ? editor.getText({ blockSeparator: "\n\n" }) : plainChapterText(rawContent);
    if (await copyEditorText(textToCopy, navigator.clipboard)) {
      setCopiedToast("draft");
      setTimeout(() => setCopiedToast(null), 2000);
    } else {
      setChapterJumpError("复制草稿失败，请在编辑器中手动选中并复制；确认保存副本前不要拉取服务端版本。");
    }
  }

  async function handleCopyAiResult() {
    setCopiedToast(null);
    if (await copyEditorText(aiResult, navigator.clipboard)) {
      setCopiedToast("ai");
      setTimeout(() => setCopiedToast(null), 2000);
    } else {
      setChapterJumpError("复制建议失败，请手动选中建议文本并复制。");
    }
  }

  // Q02 Boundary ④: 显式重新同步目录入口（固定作品 ID 与请求代次，迟到响应不得污染切换后的作品）
  async function handleManualResyncCatalog() {
    if (!activeWorkId || isResyncingCatalog) return;
    setIsResyncingCatalog(true);
    const targetWorkId = activeWorkId;
    const reqToken = ++resyncRequestIdRef.current;

    try {
      const details = await fetchWorkDetails(targetWorkId);
      const check = canApplyResyncResponse(
        targetWorkId,
        activeWorkIdRef.current,
        reqToken,
        resyncRequestIdRef.current,
        details?.chapters,
      );

      if (!check.canApply) {
        console.warn(`忽略失效或迟到的目录重同步响应 (${check.rejectReason})`);
        return;
      }

      if (details.volumes) {
        setVolumes(details.volumes);
      }
      if (check.canClearGate && details.chapters) {
        reconcileChapterCatalog(details.chapters);
        worksNeedingResyncRef.current.delete(targetWorkId);
        setNeedsCatalogResync(false);
        needsCatalogResyncRef.current = false;
        alert("目录已成功重新同步至服务端最新事实。");
      } else {
        alert("重新同步未能获取有效章节列表，已保留目录待同步门禁。");
      }
    } catch (err: any) {
      if (reqToken === resyncRequestIdRef.current && activeWorkIdRef.current === targetWorkId) {
        alert(`重新同步目录失败 (${err?.message || "网络异常"})，请检查网络后重试。`);
      }
    } finally {
      if (reqToken === resyncRequestIdRef.current) {
        setIsResyncingCatalog(false);
      }
    }
  }

  // Q02: 对已在服务端被删除但保留了未保存草稿的章节，支持一键恢复为新章节继续创作
  async function handleRestoreAsNewChapter() {
    if (!activeWorkId || !selected) return;
    try {
      const rawTitle = selected.title.replace(/【已在服务端删除】/g, "").trim() || "未命名章节";
      const currentContent = readEditorHtml() || selected.content;
      const newCh = await createChapter(activeWorkId, {
        title: rawTitle,
        volumeId: selected.volumeId || null,
        content: currentContent,
      });
      setChapters((prev) =>
        prev
          .filter((c) => c.id !== selected.id)
          .concat({
            id: newCh.id,
            workId: newCh.workId,
            volumeId: newCh.volumeId,
            title: newCh.title,
            content: newCh.content || "<p></p>",
            status: newCh.status,
            wordCount: newCh.wordCount ?? 0,
            revision: newCh.revision,
            sortOrder: newCh.sortOrder,
          }),
      );
      if (newCh.revision !== undefined) {
        contentBaseRevisionsRef.current[newCh.id] = newCh.revision;
        catalogRevisionsRef.current[newCh.id] = newCh.revision;
      }
      delete contentBaseRevisionsRef.current[selected.id];
      delete catalogRevisionsRef.current[selected.id];
      delete draftSeqRef.current[selected.id];
      setSelectedId(newCh.id);
      currentEditorChapterIdRef.current = newCh.id;
      setSaveState("saved");
      setConflictChapterId(null);
      alert(`草稿已成功恢复并保存为新章节《${newCh.title}》！`);
    } catch (err: any) {
      alert(`恢复为新章节失败: ${err?.message || "网络异常"}`);
    }
  }

  function handlePaperScroll() {
    const el = paperScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) {
      setScrollProgress(0);
    } else {
      const p = Math.min(100, Math.max(0, Math.round((el.scrollTop / maxScroll) * 100)));
      setScrollProgress(p);
    }
  }

  function scrollToTop() {
    paperScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scrollToBottom() {
    if (paperScrollRef.current) {
      paperScrollRef.current.scrollTo({
        top: paperScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  function handlePaperClick(e: React.MouseEvent<HTMLElement>) {
    if (e.target === e.currentTarget) tiptap?.chain().focus("end").run();
  }

  // 真实 AI 流式接口；正文与设定仅按用户勾选的范围发送。
  async function runAiPreview(action: AiAction) {
    if (!aiPrompt.trim()) {
      setAiSourceKey(aiCurrentSourceKey);
      setAiError("请先填写具体创作指令");
      return;
    }
    const selection = tiptap?.state.selection;
    const selectedText = tiptap && selection && !selection.empty
      ? tiptap.state.doc.textBetween(selection.from, selection.to, "\n").trim() : "";
    const input: AiGenerationInput = {
      action, instruction: aiPrompt, selectedText,
      context: aiContextPayload, temperature: 0.7, maxTokens: 2000,
    };
    const preflight = planAiContext(input).budget;
    if (preflight.selectedTextTooLong) {
      setAiSourceKey(aiCurrentSourceKey);
      setAiError("选中的文本超出本次输入预算，请缩短选区后重试");
      return;
    }
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const runId = ++aiRunIdRef.current;
    setIsGenerating(true);
    setAiSourceKey(aiCurrentSourceKey);
    setAiResult("");
    setAiError(null);
    setAiBudget(preflight);
    setAiComplete(false);
    setLastAiAction(action);
    try {
      await generateAiContentStream(input, {
        signal: controller.signal,
        onEvent: (event) => {
          if (runId !== aiRunIdRef.current || controller.signal.aborted) return;
          if (event.type === "start") setAiBudget(event.contextBudget);
          if (event.type === "delta") setAiResult((current) => current + event.text);
          if (event.type === "done") setAiComplete(true);
        },
      });
    } catch (err: unknown) {
      if (runId === aiRunIdRef.current && !controller.signal.aborted) {
        setAiError(err instanceof Error ? err.message : "AI 服务请求失败");
      }
    } finally {
      if (runId === aiRunIdRef.current) {
        aiAbortRef.current = null;
        setIsGenerating(false);
      }
    }
  }

  function stopAiPreview() {
    aiRunIdRef.current += 1;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setIsGenerating(false);
    setAiComplete(false);
    setAiError("已停止生成；未完成的片段不会写入正文。");
  }

  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
    };
  }, [activeWorkId, selectedId]);

  return (
    <main className="app-shell">
      <EditorDiagnostics />
      {isChapterJumpOpen && <ChapterJumpDialog key={activeWorkId} open={isChapterJumpOpen} onOpenChange={setIsChapterJumpOpen}
        selectedId={selectedId} onJump={selectChapter} items={chapterJumpItems} />}
      <Dialog open={conflictAction !== null} onOpenChange={(open) => { if (!open) setConflictAction(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{conflictAction === "pull" ? "确认拉取服务端版本" : "确认覆盖服务端正文"}</DialogTitle>
          <DialogDescription>{conflictAction === "pull"
            ? "此操作会替换本窗口未保存的草稿。请先取消并复制草稿，确认已保留需要的内容后再继续。"
            : "将用本窗口草稿覆盖服务端正文，覆盖前会保留服务端旧稿的历史快照。其他窗口的未保存内容不会自动合并。"}</DialogDescription>
        </DialogHeader><DialogFooter>
          <Button variant="outline" onClick={() => setConflictAction(null)}>取消</Button>
          <Button onClick={() => { const action = conflictAction; setConflictAction(null); setChapterJumpError(null);
            if (action === "pull") void handlePullServerVersion(); else if (action === "overwrite") void handleForceOverwrite();
          }}>确认{conflictAction === "pull" ? "拉取" : "覆盖"}</Button>
        </DialogFooter></DialogContent>
      </Dialog>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">墨</div>
          <div>
            <p className="brand-name">智能作者创作平台</p>
            <WorkSwitcher
              works={works}
              activeWorkId={activeWorkId}
              onSelectWork={handleSelectWork}
              onCreateWorkClick={() => setIsCreateWorkOpen(true)}
              onArchiveWork={handleArchiveWork}
            />
          </div>
        </div>

        <nav className="topnav" aria-label="工作区导航">
          <button
            className={topNavTab === "writing" ? "is-active" : ""}
            onClick={() => {
              setTopNavTab("writing");
              setActiveView("writing");
            }}
            type="button"
          >
            写作
          </button>
          <button
            className={topNavTab === "materials" ? "is-active" : ""}
            onClick={() => {
              setTopNavTab("materials");
              setActiveView("world");
            }}
            type="button"
          >
            素材库
          </button>
          <button
            className={topNavTab === "stats" ? "is-active" : ""}
            onClick={() => {
              setTopNavTab("stats");
              setActiveView("stats");
            }}
            type="button"
          >
            统计
          </button>
        </nav>

        <div className="top-actions">
          <span className="local-badge">
            {saveState === "saving" ? (
              <>
                <RefreshCw size={12} className="animate-spin mr-1" />
                <span>正在保存…</span>
              </>
            ) : saveState === "conflict" ? (
              <span className="text-amber-700 font-bold flex items-center gap-1">
                <AlertTriangle size={12} /> 版本冲突
              </span>
            ) : saveState === "error" ? (
              <span className="text-rose-700 font-bold flex items-center gap-1">
                <AlertTriangle size={12} /> 保存失败
              </span>
            ) : (
              <>
                <Check size={13} className="mr-1 text-[#176b5b]" />
                <span>已自动同步</span>
              </>
            )}
          </span>
          <TrashDialog
            onRestored={async () => {
              const ok = await flushPendingSave();
              const hasPending = pendingSaveRef.current !== null;
              const isSaving = activeSavePromiseRef.current !== null || saveStateRef.current === "saving";
              const isConflict = saveStateRef.current === "conflict";
              const switchCheck = canSwitchWork(hasPending, isSaving, isConflict);
              if (!switchCheck.allowed || (!ok && hasPending)) {
                alert("当前章节有未保存草稿、正在保存中或处于版本冲突状态，请先解决保存问题后再刷新工作区。");
                return;
              }
              await loadWorkspaceData(activeWorkId || undefined);
            }}
          />
          <ExportDialog
            workId={currentWork?.id}
            workTitle={currentWork?.title || "我的作品"}
            chaptersCount={chapters.length}
            totalWords={totalWords}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="AI 接口设置"
            onClick={() => setIsAiSettingsOpen(true)}
            title="配置大模型服务与密钥"
          >
            <Settings2 />
          </Button>
          <UserMenu />
        </div>
      </header>

      <div className={`workspace ${activeView === "writing" ? "is-writing" : "is-full-view"} ${isFocusMode && activeView === "writing" ? "is-focused" : ""} ${isInspectorCollapsed ? "inspector-hidden" : ""}`}>
        <aside className="tool-rail shrink-0" aria-label="作品工具">
          <button
            className={activeView === "writing" ? "rail-item is-active" : "rail-item"}
            onClick={() => {
              setActiveView("writing");
              setTopNavTab("writing");
            }}
            type="button"
          >
            <BookOpen size={19} strokeWidth={1.8} />
            <span>正文</span>
          </button>
          <button
            className={activeView === "outline" ? "rail-item is-active" : "rail-item"}
            onClick={() => {
              setActiveView("outline");
              setTopNavTab("writing");
            }}
            type="button"
          >
            <Archive size={19} strokeWidth={1.8} />
            <span>大纲</span>
          </button>
          <button
            className={activeView === "characters" ? "rail-item is-active" : "rail-item"}
            onClick={() => {
              setActiveView("characters");
              setTopNavTab("writing");
            }}
            type="button"
          >
            <UsersRound size={19} strokeWidth={1.8} />
            <span>角色</span>
          </button>
          <button
            className={activeView === "world" ? "rail-item is-active" : "rail-item"}
            onClick={() => {
              setActiveView("world");
              setTopNavTab("materials");
            }}
            type="button"
          >
            <Globe2 size={19} strokeWidth={1.8} />
            <span>设定</span>
          </button>
          <button
            className={activeView === "timeline" ? "rail-item is-active" : "rail-item"}
            onClick={() => {
              setActiveView("timeline");
              setTopNavTab("writing");
            }}
            type="button"
          >
            <Clock3 size={19} strokeWidth={1.8} />
            <span>时间线</span>
          </button>
        </aside>

        {activeView === "writing" ? (
          !currentWork ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#fdfcf9] min-h-[65vh]">
              <div className="w-20 h-20 rounded-3xl bg-[#edf5f2] border border-[#bad4cb] text-[#176b5b] flex items-center justify-center mb-6 shadow-sm">
                <BookOpen className="w-10 h-10" />
              </div>
              <h2 className="font-serif text-2xl font-bold text-[#1f2a24] mb-2">
                墨海初启 · 暂无长篇作品
              </h2>
              <p className="text-xs text-[#6e7b74] max-w-md mb-6 leading-relaxed">
                执笔山海，落墨万卷。您可以创建属于您的第一部作品，开启专属长篇创作之旅。
              </p>
              <Button
                onClick={() => setIsCreateWorkOpen(true)}
                className="h-10 px-6 bg-[#176b5b] hover:bg-[#12584a] text-white font-serif text-sm rounded-xl shadow-md cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>新建第一部作品</span>
              </Button>
            </div>
          ) : (
            <>
              <aside className="chapter-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">作品目录</p>
                    <h2>章节</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setIsCreateVolumeOpen(true)}
                      title="新建分卷"
                      aria-label="新建分卷"
                    >
                      <FolderPlus className="w-4 h-4 text-[#54625a]" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="搜索章节" onClick={() => setIsChapterJumpOpen(true)}><Search className="w-4 h-4 text-[#54625a]" /></Button>
                  </div>
                </div>

                {/* 关键 Q02：目录待同步/未知结果持久状态与显式重同步入口 */}
                {needsCatalogResync && (
                  <div className="mx-3 my-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-[#523e1b] flex flex-col gap-1.5 animate-fadeIn">
                    <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>目录状态待确认</span>
                    </div>
                    <p className="text-[11px] text-[#786134] leading-relaxed">
                      由于此前网络中断或操作异常，当前目录可能与服务端不同步。结构写入已锁定以保护草稿。
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleManualResyncCatalog}
                      disabled={isResyncingCatalog}
                      className="h-7 text-xs border-amber-400 hover:bg-amber-100 text-amber-900 cursor-pointer self-start mt-0.5"
                    >
                      <RotateCcw className={`w-3 h-3 mr-1 ${isResyncingCatalog ? "animate-spin" : ""}`} />
                      {isResyncingCatalog ? "同步中..." : "重新同步目录"}
                    </Button>
                  </div>
                )}

                <div className="chapter-scroll">
                  {chapters.length === 0 && volumes.length === 0 ? (
                    <div className="py-12 px-4 text-center text-xs text-[#828f87] space-y-2">
                      <p>作品暂无正文章节</p>
                      <p className="text-[11px] text-[#9baa9f]">点击下方按钮开启新篇章或新建分卷</p>
                    </div>
                  ) : (
                    groupedChapters.map((group) => {
                      const isCollapsed = collapsedVolumeIds.has(group.id);
                      return (
                        <section className="volume" key={group.id}>
                          <div className="volume-header">
                            <button
                              className="volume-title"
                              type="button"
                              onClick={() => toggleVolumeCollapse(group.id)}
                              title={isCollapsed ? "点击展开分卷" : "点击折叠分卷"}
                              aria-expanded={!isCollapsed}
                            >
                              {isCollapsed ? (
                                <ChevronRight size={14} className="text-[#88928b] shrink-0" />
                              ) : (
                                <ChevronDown size={14} className="text-[#88928b] shrink-0" />
                              )}
                              <span>{group.title}</span>
                              <span className="volume-count">{group.items.length} 章</span>
                            </button>
                            <div className="flex items-center gap-0.5">
                              {group.id !== "default" && group.id !== "unassigned" && (
                                <>
                                  <button
                                    type="button"
                                    className="volume-action-btn disabled:opacity-30 disabled:cursor-not-allowed"
                                    disabled={volumes.findIndex((v) => v.id === group.id) <= 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveVolume(group.id, "up");
                                    }}
                                    title="上移分卷"
                                    aria-label={`上移分卷《${group.title}》`}
                                  >
                                    <ArrowUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="volume-action-btn disabled:opacity-30 disabled:cursor-not-allowed"
                                    disabled={
                                      volumes.findIndex((v) => v.id === group.id) === -1 ||
                                      volumes.findIndex((v) => v.id === group.id) >= volumes.length - 1
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveVolume(group.id, "down");
                                    }}
                                    title="下移分卷"
                                    aria-label={`下移分卷《${group.title}》`}
                                  >
                                    <ArrowDown size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="volume-action-btn hover:text-rose-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteVolume(group.id, group.title);
                                    }}
                                    title={`删除分卷《${group.title}》（章节将转入【未分卷】）`}
                                    aria-label={`删除分卷《${group.title}》`}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="volume-action-btn"
                                disabled={isCreatingChapter || needsCatalogResync}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addChapter(group.id === "default" || group.id === "unassigned" ? undefined : group.id);
                                }}
                                title={
                                  group.id === "unassigned"
                                    ? "新建未分卷章节"
                                    : `在《${group.title}》内新建章节`
                                }
                                aria-label="在此卷新建章节"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>

                          {!isCollapsed && (
                            <div className="chapter-list">
                              {group.items.length === 0 ? (
                                <div className="px-3 py-2.5 my-1 text-center bg-[#fbfcfb] rounded-lg border border-dashed border-[#d8e0db]">
                                  <p className="text-[11px] text-[#86928b] mb-1.5">
                                    {group.id === "unassigned" ? "暂无未分卷章节" : "本卷暂无章节"}
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isCreatingChapter || needsCatalogResync}
                                    className="h-7 text-[12px] px-2.5 text-[#176b5b] border-[#bed4ca] hover:bg-[#edf5f1]"
                                    onClick={() => addChapter(group.id === "default" || group.id === "unassigned" ? undefined : group.id)}
                                  >
                                    <Plus size={12} className="mr-1" /> 在此新建章节
                                  </Button>
                                </div>
                              ) : (
                                group.items.map((chapter, groupIndex) => {
                                  const number = chapterJumpItems.find((item) => item.id === chapter.id)?.ordinal ?? 0;
                                  const isDone = chapter.status === "completed" || chapter.status === "done";
                                  const isFirstInGroup = groupIndex === 0;
                                  const isLastInGroup = groupIndex === group.items.length - 1;
                                  const currentChapterVolId = chapter.volumeId || null;

                                  // 可移入的目标分卷列表（排除自身所在卷）
                                  const availableDestinations: { id: string | null; title: string }[] = [];
                                  if (currentChapterVolId !== null) {
                                    availableDestinations.push({ id: null, title: "【未分卷】" });
                                  }
                                  volumes.forEach((v) => {
                                    if (v.id !== currentChapterVolId) {
                                      availableDestinations.push({ id: v.id, title: `《${v.title}》` });
                                    }
                                  });

                                  return (
                                    <div key={chapter.id} className="relative group/chap">
                                      <button
                                        className={chapter.id === selectedId ? "chapter-item is-active pr-12" : "chapter-item pr-12"}
                                        onClick={() => selectChapter(chapter.id)}
                                        type="button"
                                      >
                                        <span className="chapter-number">{String(number).padStart(2, "0")}</span>
                                        <span className="chapter-copy">
                                          <strong>{chapter.title.replace(/^第[零一二三四五六七八九十百千万\d]+章\s*/, "")}</strong>
                                          <small>{getChapterWordCount(chapter)} 字 · {isDone ? "已完成" : "草稿"}</small>
                                        </span>
                                        {isDone && <Check className="chapter-check" size={14} />}
                                      </button>

                                      {/* 章节操作下拉菜单（C01：上移、下移、移动到卷、移入回收站） */}
                                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover/chap:opacity-100 focus-within:opacity-100 transition-opacity z-10">
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button
                                              type="button"
                                              onClick={(e) => e.stopPropagation()}
                                              className="p-1 rounded text-[#808d85] hover:text-[#202923] hover:bg-[#edf5f2] cursor-pointer transition-colors"
                                              title="章节操作"
                                              aria-label={`章节《${chapter.title}》操作菜单`}
                                            >
                                              <MoreHorizontal size={14} />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-44 bg-white border border-[#dedcd4] shadow-lg rounded-xl p-1 text-sm z-50">
                                            <DropdownMenuItem
                                              disabled={isFirstInGroup}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleMoveChapter(chapter.id, "up");
                                              }}
                                              className="cursor-pointer text-sm"
                                            >
                                              <ArrowUp size={14} className="mr-2 text-[#56615b]" />
                                              <span>上移章节</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              disabled={isLastInGroup}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleMoveChapter(chapter.id, "down");
                                              }}
                                              className="cursor-pointer text-sm"
                                            >
                                              <ArrowDown size={14} className="mr-2 text-[#56615b]" />
                                              <span>下移章节</span>
                                            </DropdownMenuItem>

                                            <DropdownMenuSub>
                                              <DropdownMenuSubTrigger className="cursor-pointer text-sm">
                                                <FolderPlus size={14} className="mr-2 text-[#56615b]" />
                                                <span>移动到…</span>
                                              </DropdownMenuSubTrigger>
                                              <DropdownMenuSubContent className="w-48 bg-white border border-[#dedcd4] shadow-lg rounded-xl p-1 text-sm z-50">
                                                {availableDestinations.length === 0 ? (
                                                  <DropdownMenuItem disabled className="text-xs text-[#8d9892]">
                                                    暂无可移动目标卷
                                                  </DropdownMenuItem>
                                                ) : (
                                                  availableDestinations.map((dest) => (
                                                    <DropdownMenuItem
                                                      key={dest.id || "unassigned"}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleMoveChapterToVolume(chapter.id, dest.id);
                                                      }}
                                                      className="cursor-pointer text-sm"
                                                    >
                                                      <span className="truncate">{dest.title}</span>
                                                    </DropdownMenuItem>
                                                  ))
                                                )}
                                              </DropdownMenuSubContent>
                                            </DropdownMenuSub>

                                            <DropdownMenuSeparator className="my-1 bg-[#eeece6]" />

                                            <DropdownMenuItem
                                              onClick={(e) => handleSoftDeleteChapter(chapter.id, e as any)}
                                              className="cursor-pointer text-sm text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                                            >
                                              <Trash2 size={14} className="mr-2" />
                                              <span>移入回收站</span>
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })
                  )}
                </div>

                <div className="sidebar-footer">
                  <button
                    className="add-chapter"
                    type="button"
                    disabled={isCreatingChapter || needsCatalogResync}
                    onClick={() => addChapter()}
                  >
                    <Plus size={15} /> {isCreatingChapter ? "创建中..." : "新建章节"}
                  </button>
                  <button
                    className="add-volume-btn"
                    type="button"
                    onClick={() => setIsCreateVolumeOpen(true)}
                    title="新建作品分卷"
                  >
                    <FolderPlus size={14} className="text-[#176b5b]" />
                    <span>新建卷</span>
                  </button>
                </div>
              </aside>

              <section className="editor-stage">
                {chapters.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
                    <div className="w-14 h-14 rounded-2xl bg-[#edf5f2] border border-[#c4ded4] text-[#176b5b] flex items-center justify-center mb-4 shadow-2xs">
                      <FilePlus2 className="w-7 h-7" />
                    </div>
                    <h3 className="font-serif text-lg font-bold text-[#202b25] mb-1.5">
                      《{currentWork.title}》尚未创建章节
                    </h3>
                    <p className="text-xs text-[#717e76] mb-5 max-w-sm">
                      作品已设立，点击下方新建章节即可开始落笔，并享受实时乐观锁并发安全保障。
                    </p>
                    <Button
                      disabled={isCreatingChapter || needsCatalogResync}
                      onClick={() => addChapter()}
                      className="h-9 px-5 bg-[#176b5b] hover:bg-[#12584a] text-white text-xs rounded-xl shadow-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isCreatingChapter ? "创建中..." : "新建第一章"}</span>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="editor-toolbar" role="toolbar" aria-label="富文本工具栏">
                      <div className="toolbar-group">
                        <button type="button" aria-label="撤销" onClick={() => format("undo")}><Undo2 /></button>
                        <button type="button" aria-label="重做" onClick={() => format("redo")}><Redo2 /></button>
                      </div>
                      <span className="toolbar-divider" />
                      <div className="toolbar-group">
                        <button type="button" aria-label="二级标题" onClick={() => toggleHeading("h2")}><Heading2 /></button>
                        <button type="button" aria-label="加粗" onClick={() => format("bold")}><Bold /></button>
                        <button type="button" aria-label="斜体" onClick={() => format("italic")}><Italic /></button>
                        <button type="button" aria-label="引用" onClick={toggleBlockquote}><Quote /></button>
                        <button type="button" aria-label="列表" onClick={() => format("insertUnorderedList")}><List /></button>
                      </div>
                      <VersionHistoryDialog
                        chapterId={selected.id}
                        chapterTitle={selected.title}
                        currentRevision={selected.revision}
                        onBeforeOpen={flushPendingSave}
                        onRestored={handleVersionRestored}
                        trigger={<Button variant="ghost" size="sm"><FileClock /> 版本</Button>}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsChapterLinksOpen(true)}
                        title="查看与管理本章关联设定"
                      >
                        <Link2 className="w-3.5 h-3.5 mr-1" />
                        <span>关联{chapterLinks.length > 0 ? ` (${chapterLinks.length})` : ""}</span>
                      </Button>
                      <ExportDialog
                        workId={currentWork?.id}
                        workTitle={currentWork?.title || "我的作品"}
                        chaptersCount={chapters.length}
                        totalWords={totalWords}
                        trigger={<Button variant="ghost" size="sm"><FileDown /> 导出</Button>}
                      />
                      <div className="ml-auto flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setIsChapterJumpOpen(true)} title="跳转章节（Ctrl/Cmd+J）">
                          <BookOpen /> 跳转章节
                        </Button>
                        <Button type="button" variant="ghost" size="sm" aria-expanded={isFindOpen}
                          onClick={() => setIsFindOpen((open) => !open)} title="查找替换（Ctrl/Cmd+F）">
                          <Search /> 查找替换
                        </Button>
                        <Button type="button" variant="ghost" size="sm" aria-pressed={isFocusMode}
                          onClick={() => setIsFocusMode((focused) => !focused)} title="专注时按 Esc 退出">
                          <Focus /> {isFocusMode ? "退出专注" : "专注写作"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isFocusMode}
                          onClick={() => setIsInspectorCollapsed((prev) => !prev)}
                          title={isInspectorCollapsed ? "展开右侧面板" : "折叠右侧面板"}
                          aria-label={isInspectorCollapsed ? "展开右侧面板" : "折叠右侧面板"}
                          aria-expanded={!isInspectorCollapsed}
                        >
                          {isInspectorCollapsed ? (
                            <PanelRightOpen className="w-4 h-4 text-[#54625a]" />
                          ) : (
                            <PanelRightClose className="w-4 h-4 text-[#54625a]" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {isFindOpen && tiptap && !tiptap.isDestroyed && (
                      <EditorSearch key={selected.id} editor={tiptap} onClose={() => {
                        setIsFindOpen(false); tiptap.commands.focus();
                      }} />
                    )}

                    {/* 冲突提示 Banner */}
                    {chapterJumpError && <div role="alert" className="px-4 py-2 text-sm text-amber-900 bg-amber-50 flex items-center gap-2">
                      <span className="flex-1">{chapterJumpError}</span><button type="button" aria-label="关闭跳转提示" onClick={() => setChapterJumpError(null)}><X size={16} /></button>
                    </div>}
                    {saveState === "conflict" && conflictChapterId === selectedId && (
                      <div className="mx-6 mt-4 p-4 rounded-2xl bg-[#fff8f0] border-2 border-amber-500/40 shadow-md text-xs text-[#523e1b] flex flex-col gap-3 animate-fadeIn">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="font-serif font-bold text-sm text-[#3b2b10] flex items-center gap-1.5">
                              <span>
                                {selected?.title.includes("【已在服务端删除】")
                                  ? "本章已在服务端被删除（草稿已安全保留）"
                                  : "版本冲突：本章已在其他窗口或设备更新"}
                              </span>
                              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                {selected?.title.includes("【已在服务端删除】") ? "DELETED" : "HTTP 409"}
                              </span>
                            </h4>
                            <p className="text-[11px] text-[#786134] mt-0.5">
                              {selected?.title.includes("【已在服务端删除】")
                                ? "本地未保存草稿已完整保留在编辑器中，已阻止保存以防丢稿。您可以复制草稿文本，或将其恢复为新章节继续创作。"
                                : "本地草稿已完整保留在编辑器中，系统已停止自动重试。请选择拉取服务端最新版本，或以此草稿强制覆盖。"}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCopyDraft}
                            className="h-8 text-xs border-amber-300 hover:bg-amber-50 text-amber-900 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5 mr-1" />
                            {copiedToast === "draft" ? "已复制草稿" : "复制草稿"}
                          </Button>
                          {selected?.title.includes("【已在服务端删除】") ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleRestoreAsNewChapter}
                              className="h-8 text-xs bg-amber-700 hover:bg-amber-800 text-white cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              恢复为新章节
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setConflictAction("pull")}
                                disabled={isResolvingConflict}
                                className="h-8 text-xs border-amber-300 hover:bg-amber-50 text-amber-900 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                拉取服务端版本
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setConflictAction("overwrite")}
                                disabled={isResolvingConflict}
                                className="h-8 text-xs bg-amber-700 hover:bg-amber-800 text-white cursor-pointer"
                              >
                                强制覆盖保存
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <div
                      ref={paperScrollRef}
                      onScroll={handlePaperScroll}
                      className="paper-scroll"
                    >
                      <article className="writing-paper" onClick={handlePaperClick}>
                        <div className="chapter-kicker">
                          {currentWork ? currentWork.title : "长篇创作"} · {currentVolume ? currentVolume.title : "第一卷"}
                        </div>
                        <input
                          className="chapter-title-input"
                          aria-label="章节标题"
                          value={selected.title}
                          onChange={(event) => handleTitleChange(event.target.value)}
                        />
                        <div className="chapter-meta">
                          <span>版本 v{selected.revision ?? 1}</span>
                          <span>·</span>
                          <span>{chapterWords} 字</span>
                        </div>
                        <EditorContent editor={tiptap} />
                      </article>
                    </div>

                    <div className="paper-scroll-controls" aria-label="快捷滚动控制">
                      <button
                        type="button"
                        className="scroll-btn"
                        onClick={scrollToTop}
                        title="回到顶部"
                        aria-label="回到顶部"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <div className="scroll-indicator" title={`当前滚动进度 ${scrollProgress}%`}>
                        {scrollProgress}%
                      </div>
                      <button
                        type="button"
                        className="scroll-btn"
                        onClick={scrollToBottom}
                        title="滚到底部"
                        aria-label="滚到底部"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>

                    <footer className="editor-statusbar">
                      <span
                        className={
                          saveState === "saving"
                            ? "save-status is-saving"
                            : saveState === "conflict"
                            ? "save-status is-conflict text-amber-700 font-bold"
                            : saveState === "error"
                            ? "save-status is-error text-rose-700 font-bold"
                            : "save-status"
                        }
                      >
                        {saveState === "saving" ? (
                          <>
                            <RefreshCw size={12} className="animate-spin mr-1" />
                            <span>正在保存…</span>
                          </>
                        ) : saveState === "conflict" ? (
                          <>
                            <AlertTriangle size={12} className="mr-1 text-amber-600" />
                            <span>版本冲突 (409)</span>
                          </>
                        ) : saveState === "error" ? (
                          <div className="flex items-center gap-1.5 text-rose-700">
                            <AlertTriangle size={12} className="shrink-0" />
                            <span>保存失败（草稿仅在当前窗口，请勿关闭）</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                performSave();
                              }}
                              className="px-1.5 py-0.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-medium underline cursor-pointer"
                            >
                              重试保存
                            </button>
                          </div>
                        ) : (
                          <>
                            <Check size={13} className="mr-1 text-[#176b5b]" />
                            <span>已自动保存（v{selected.revision ?? 1}）</span>
                          </>
                        )}
                      </span>
                      <div className="status-spacer" />
                      <span>本章 {chapterWords} 字</span>
                      <span>全书 {totalWords.toLocaleString("zh-CN")} 字</span>
                    </footer>
                  </>
                )}
              </section>

        <aside className={`inspector-panel ${isInspectorCollapsed ? "is-collapsed" : ""}`}>
          <Tabs value={rightTab} onValueChange={setRightTab} className="inspector-tabs">
            <TabsList variant="line" className="inspector-tab-list">
              <TabsTrigger value="ai"><Bot /> AI 助手</TabsTrigger>
              <TabsTrigger value="notes"><UserRound /> 本章信息</TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="inspector-content">
              <div className="ai-identity">
                <div className="ai-orb"><Sparkles size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <strong>灵感创作助手</strong>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100/90 text-emerald-800 font-mono">
                      加密代理
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6b7770]">由真实大模型生成，仅进入预览区</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAiSettingsOpen(true)}
                  className="h-7 px-2 text-xs text-[#176b5b] hover:bg-[#edf5f2] cursor-pointer shrink-0"
                  title="配置大模型服务与密钥"
                >
                  <Settings2 size={13} className="mr-1" />
                  配置
                </Button>
              </div>

              {/* 上下文参考范围（用户可勾选控制） */}
              <div className="p-3 rounded-2xl bg-[#faf9f5] border border-[#e4e2da] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-serif font-bold text-[#202b25] flex items-center gap-1">
                    <BookOpen size={13} className="text-[#176b5b]" />
                    <span>选择参考上下文</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#78847d] bg-[#f0eee6] px-1.5 py-0.5 rounded">
                    输入约 {aiPreviewBudget.estimatedInputTokens}/{aiPreviewBudget.inputTokenLimit} Tokens
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#69766e]">
                  仅发送勾选的材料；Token 为保守估算，实际用量以模型返回为准。
                </p>
                {aiPreviewBudget.omittedCharacters > 0 && (
                  <p role="status" className="text-[11px] leading-relaxed text-amber-700">
                    预计省略约 {aiPreviewBudget.omittedCharacters} 字；章节保留末尾，其他设定保留开头。
                  </p>
                )}

                <div className="grid grid-cols-2 gap-1.5 text-xs text-[#39463f] pt-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#176b5b]">
                    <input
                      type="checkbox"
                      checked={includeCurrentChapter}
                      onChange={(e) => setIncludeCurrentChapter(e.target.checked)}
                      className="rounded accent-[#176b5b]"
                    />
                    <span className="truncate">当前正文（末尾 3000 字）</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#176b5b]">
                    <input
                      type="checkbox"
                      checked={includeOutline}
                      onChange={(e) => setIncludeOutline(e.target.checked)}
                      className="rounded accent-[#176b5b]"
                    />
                    <span className="truncate">卷章大纲（前 2 项）</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#176b5b]">
                    <input
                      type="checkbox"
                      checked={includeCharacters}
                      onChange={(e) => setIncludeCharacters(e.target.checked)}
                      className="rounded accent-[#176b5b]"
                    />
                    <span className="truncate">核心角色（前 3 项）</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#176b5b]">
                    <input
                      type="checkbox"
                      checked={includeWorld}
                      onChange={(e) => setIncludeWorld(e.target.checked)}
                      className="rounded accent-[#176b5b]"
                    />
                    <span className="truncate">世界观设定（前 2 项）</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-[#176b5b] col-span-2">
                    <input
                      type="checkbox"
                      checked={includeTimeline}
                      onChange={(e) => setIncludeTimeline(e.target.checked)}
                      className="rounded accent-[#176b5b]"
                    />
                    <span className="truncate">历史时间线（前 2 项）</span>
                  </label>
                </div>
              </div>

              <div className="quick-actions">
                {aiActions.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={isAiGeneratingHere}
                    onClick={() => runAiPreview(id as AiAction)}
                    className="cursor-pointer"
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>

              <label className="prompt-box">
                <span className="text-xs font-serif font-bold text-[#202b25]">向 AI 提出具体创作指令</span>
                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  maxLength={2000}
                  placeholder="例如：着重描写夜晚暴雨敲打古旧窗棂的萧瑟氛围，突出主角沈砚眉宇间的沧桑……"
                  rows={3}
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-[#86918a] font-mono">{aiPrompt.length}/2000</span>
                  <Button
                    size="sm"
                    onClick={() => runAiPreview("continue")}
                    disabled={isAiGeneratingHere}
                    className="h-8 px-3 bg-[#176b5b] hover:bg-[#12594b] text-white text-xs cursor-pointer rounded-lg shadow-xs"
                  >
                    {isAiGeneratingHere ? (
                      <>
                        <RefreshCw size={13} className="animate-spin mr-1" />
                        <span>模型构思中…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} className="mr-1" />
                        <span>生成建议</span>
                      </>
                    )}
                  </Button>
                </div>
              </label>

              {isAiGeneratingHere && (
                <button
                  type="button"
                  onClick={stopAiPreview}
                  className="w-full rounded-lg border border-rose-200 px-3 py-2 text-xs text-rose-700 hover:bg-rose-50 cursor-pointer"
                >
                  停止生成
                </button>
              )}
              {aiSourceKey === aiCurrentSourceKey && aiError && <p role="alert" className="text-xs text-rose-700 leading-relaxed">{aiError}</p>}
              {aiSourceKey === aiCurrentSourceKey && aiBudget && aiBudget.omittedCharacters > 0 && (
                <p role="status" className="text-xs text-amber-700 leading-relaxed">
                  本次已按预算省略约 {aiBudget.omittedCharacters} 字，生成建议仅依据实际发送的片段。
                </p>
              )}

              {aiSourceKey === aiCurrentSourceKey && aiResult && (
                <div className="p-3.5 rounded-2xl bg-[#fbfaf6] border border-[#d6d4c9] shadow-sm space-y-2.5 animate-fadeIn text-xs">
                  <div className="flex items-center justify-between text-[#1f2b25]">
                    <div className="flex items-center gap-1.5 font-serif font-bold text-xs">
                      <Sparkles size={14} className="text-[#176b5b]" />
                      <span>AI 建议片段（{isAiGeneratingHere ? "生成中" : aiComplete ? "预览" : "未完成"}）</span>
                    </div>
                    {copiedToast === "ai" && (
                      <span className="text-[10px] text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded font-mono">
                        已复制
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-white/95 border border-[#e6e4dc] font-serif text-[#2a3630] leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap selection:bg-[#bad4cb]">
                    {aiResult}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyAiResult}
                        className="px-2 py-1 rounded-md text-[11px] text-[#55635b] hover:bg-[#eae8e0] cursor-pointer flex items-center gap-1 transition-colors"
                        title="复制建议文本"
                      >
                        <Copy size={12} />
                        <span>复制</span>
                      </button>
                      <button
                        type="button"
                        disabled={isAiGeneratingHere}
                        onClick={() => runAiPreview(lastAiAction)}
                        className="px-2 py-1 rounded-md text-[11px] text-[#176b5b] hover:bg-[#edf5f2] cursor-pointer flex items-center gap-1 transition-colors"
                        title="按相同指令再次构思"
                      >
                        <RefreshCw size={12} className={isAiGeneratingHere ? "animate-spin" : ""} />
                        <span>重试</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiResult("")}
                        className="px-2 py-1 rounded-md text-[11px] text-[#86918a] hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                      >
                        舍弃
                      </button>
                    </div>

                    <Button
                      size="sm"
                      disabled={!aiComplete || isAiGeneratingHere}
                      onClick={() => {
                        if (!tiptap) return;
                        // 模型输出构造成纯文本节点，不把 AI 文本作为 HTML 解析。
                        const paragraphs = aiResult.split(/\n\n+/).filter(Boolean).map((paragraph) => ({
                          type: "paragraph",
                          content: paragraph.split("\n").flatMap((line, index) => [
                            ...(index > 0 ? [{ type: "hardBreak" }] : []),
                            ...(line ? [{ type: "text", text: line }] : []),
                          ]),
                        }));
                        tiptap.chain().focus("end").insertContent(paragraphs).run();
                        setAiResult("");
                        setAiComplete(false);
                      }}
                      className="h-7 px-3 bg-[#176b5b] hover:bg-[#12594b] text-white text-xs font-medium rounded-lg cursor-pointer shadow-xs"
                    >
                      <Check size={12} className="mr-1" />
                      <span>采纳并写入</span>
                    </Button>
                  </div>
                </div>
              )}

              <div className="goal-card">
                <div className="goal-heading">
                  <div>
                    <Target size={15} className={isGoalReached ? "text-emerald-600 animate-pulse" : "text-[#176b5b]"} />
                    <span className="font-semibold">今日总目标</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <strong>
                      {isUnlimitedDaily
                        ? `${serverTodayWords} 字 (不设限)`
                        : hasDailyTarget
                        ? `${serverTodayWords} / ${serverDailyGoal} 字`
                        : `${serverTodayWords} 字 (未设目标)`}
                    </strong>
                    <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          className="text-caption text-[#176b5b] hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                          title="调整每日码字目标"
                        >
                          <Settings2 size={12} />
                          <span>设置</span>
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md bg-[#fffefb] border-[#dedcd4]">
                        <DialogHeader>
                          <DialogTitle className="font-serif text-lg text-[#202923] flex items-center gap-2">
                            <Target className="w-5 h-5 text-[#176b5b]" />
                            <span>设定全书每日码字总目标</span>
                          </DialogTitle>
                          <DialogDescription className="text-xs text-[#717b75]">
                            面向全书所有章节的每日总产出规划，量力而行，达成即获奖励欢呼。
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                          <div className="space-y-1.5">
                            <span className="text-xs text-[#526058] font-medium">快捷预设：</span>
                            <div className="grid grid-cols-3 gap-2">
                              {[
                                { words: 1000, label: "轻松练笔" },
                                { words: 2000, label: "稳健日更" },
                                { words: 3000, label: "黄金篇幅" },
                                { words: 5000, label: "爆发冲刺" },
                                { words: 10000, label: "万字长卷" },
                              ].map((preset) => (
                                <button
                                  key={preset.words}
                                  type="button"
                                  onClick={() => {
                                    updateDailyGoal(preset.words);
                                    setIsGoalDialogOpen(false);
                                  }}
                                  className={`p-2 rounded-xl text-left border transition-all text-xs cursor-pointer ${
                                    serverDailyGoal === preset.words
                                      ? "bg-[#edf5f2] border-[#176b5b] text-[#176b5b] font-bold shadow-xs"
                                      : "bg-white border-[#dedcd4] text-[#4d5a53] hover:border-[#176b5b]"
                                  }`}
                                >
                                  <div className="font-mono font-bold text-sm">{preset.words} 字</div>
                                  <div className="text-xs text-[#828c86]">{preset.label}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-[#eeece6]">
                            <span className="text-xs text-[#526058] font-medium">自定义每日目标：</span>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100000"
                                step="100"
                                value={goalInputValue}
                                onChange={(e) => setGoalInputValue(e.target.value)}
                                className="flex-1 h-9 px-3 text-xs font-mono rounded-lg border border-[#dedcd4] bg-white focus:outline-none focus:border-[#176b5b]"
                                placeholder="输入目标字数（0 为不设限）"
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  const parsed = parseInt(goalInputValue, 10);
                                  if (!isNaN(parsed) && parsed >= 0) {
                                    updateDailyGoal(parsed);
                                    setIsGoalDialogOpen(false);
                                  }
                                }}
                                className="h-9 px-4 text-xs bg-[#176b5b] hover:bg-[#12584a] text-white cursor-pointer"
                              >
                                确认保存
                              </Button>
                            </div>
                          </div>
                        </div>

                        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsGoalDialogOpen(false);
                                setTimeout(() => {
                                  setShowCheerModal(true);
                                }, 100);
                              }}
                              className="text-xs text-[#176b5b] border-[#bad4cb] hover:bg-[#edf5f2] cursor-pointer"
                            >
                              🎉 预览达标欢呼动效
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsGoalDialogOpen(false)}
                            className="text-xs text-[#717b75] cursor-pointer"
                          >
                            关闭
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <div className="progress-track">
                  <span
                    style={{ width: `${progress}%` }}
                    className={isGoalReached ? "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm" : "bg-[#4a9b87]"}
                  />
                </div>

                {isGoalReached ? (
                  <>
                    <div className="mt-2 p-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/90 flex items-center justify-between animate-fadeIn">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                        <span className="text-base animate-bounce">🏆</span>
                        <span>今日总目标已达成！</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCheerModal(true)}
                        className="text-caption font-bold text-[#176b5b] hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>查看欢呼奖励</span>
                        <span>→</span>
                      </button>
                    </div>
                    <p className="text-caption text-emerald-700 font-medium flex items-center justify-between mt-1.5">
                      <span>已完成 {progress}%</span>
                      <span>今日已产出 {serverTodayWords} 字（超额 {serverTodayWords - (serverDailyGoal || 0)} 字）</span>
                    </p>
                  </>
                ) : hasDailyTarget ? (
                  <p className="text-caption text-[#86918a] mt-1.5 flex items-center justify-between">
                    <span>已完成 {progress}%</span>
                    <span>今日还需创作 {Math.max(0, (serverDailyGoal || 0) - serverTodayWords)} 字达成目标</span>
                  </p>
                ) : (
                  <p className="text-caption text-[#86918a] mt-1.5 flex items-center justify-between">
                    <span>{isUnlimitedDaily ? "自由创作模式，不设字数上限" : "今日尚未设置具体码字目标"}</span>
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="inspector-content">
              {/* 本章关联设定 */}
              <section className="note-section">
                <div className="flex items-center justify-between mb-2">
                  <p className="eyebrow mb-0">本章关联设定 ({chapterLinks.length})</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2 border-[#cfd6d1] text-[#2c3d33] hover:bg-[#ebf0ec]"
                    onClick={() => setIsChapterLinksOpen(true)}
                  >
                    <Link2 size={12} className="mr-1" /> 管理关联
                  </Button>
                </div>
                {chapterLinks.length === 0 ? (
                  <p className="text-xs text-[#8a968f] py-1 leading-relaxed">
                    本章尚未关联特定人物、大纲或设定。点击上方「管理关联」可建立实体绑定，创作时随时参考。
                  </p>
                ) : (
                  <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto pr-1">
                    {chapterLinks.map((link) => {
                      let label = "";
                      let badge = "";
                      let tagClass = "bg-gray-100 text-gray-700 border-gray-200";
                      if (link.entityType === "character") {
                        const char = charactersList.find((c) => c.id === link.entityId);
                        label = char ? char.name : `角色 (#${link.entityId.slice(0, 5)})`;
                        badge = "角色";
                        tagClass = "bg-purple-50 text-purple-800 border-purple-200";
                      } else if (link.entityType === "outline") {
                        const o = outlinesList.find((item) => item.id === link.entityId);
                        label = o ? o.title : `大纲 (#${link.entityId.slice(0, 5)})`;
                        badge = "大纲";
                        tagClass = "bg-blue-50 text-blue-800 border-blue-200";
                      } else if (link.entityType === "world") {
                        const w = worldList.find((item) => item.id === link.entityId);
                        label = w ? w.name : `设定 (#${link.entityId.slice(0, 5)})`;
                        badge = "设定";
                        tagClass = "bg-amber-50 text-amber-800 border-amber-200";
                      } else if (link.entityType === "timeline") {
                        const t = timelineList.find((item) => item.id === link.entityId);
                        label = t ? (t.title || t.name) : `事件 (#${link.entityId.slice(0, 5)})`;
                        badge = "事件";
                        tagClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
                      }
                      return (
                        <div
                          key={`${link.entityType}:${link.entityId}`}
                          className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[#fffefb] border border-[#e8ebe7]"
                        >
                          <span className="font-medium text-[#202923] truncate mr-2">{label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium ${tagClass}`}>
                            {badge}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="note-section">
                <p className="eyebrow">作品设定角色 ({charactersList.length})</p>
                {charactersList.length === 0 ? (
                  <p className="text-xs text-[#8a968f] py-2">暂无角色设定，可在侧边栏「角色」面板添加</p>
                ) : (
                  <div className="space-y-2">
                    {charactersList.slice(0, 4).map((c) => (
                      <div key={c.id} className="character-card">
                        <div className="character-avatar">{c.name.slice(0, 1)}</div>
                        <div>
                          <strong>{c.name}</strong>
                          <p>{c.role} · {c.description.slice(0, 24)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="note-section">
                <p className="eyebrow">世界观与线索 ({worldList.length})</p>
                {worldList.length === 0 ? (
                  <p className="text-xs text-[#8a968f] py-2">暂无世界观条目，可在「设定」面板沉淀世界背景</p>
                ) : (
                  <ul className="clue-list">
                    {worldList.slice(0, 3).map((w) => (
                      <li key={w.id}>
                        <span className="font-semibold text-[#1f2b25]">{w.name}</span>
                        {w.summary ? `：${w.summary}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="note-section">
                <p className="eyebrow">当前章节信息</p>
                <div className="info-row"><FileClock size={15} /><span>修订版本：v{selected.revision ?? 1}</span></div>
                <div className="info-row"><Check size={15} /><span>状态：{selected.status === "completed" || selected.status === "done" ? "已完成" : "草稿中"}</span></div>
                <div className="info-row"><Globe2 size={15} /><span>所属作品：{currentWork?.title || "未命名作品"}</span></div>
              </section>
            </TabsContent>
          </Tabs>
        </aside>
      </>
    )
  ) : activeView === "outline" ? (
      <OutlineView
        workId={activeWorkId}
        volumes={volumes}
        chapters={chapters}
      />
    ) : activeView === "characters" ? (
      <CharactersView
        workId={activeWorkId}
        onCharactersChanged={setCharactersList}
      />
    ) : activeView === "world" ? (
      <WorldView
        workId={activeWorkId}
      />
    ) : activeView === "timeline" ? (
      <TimelineView
        workId={activeWorkId}
        characters={charactersList}
        chapters={chapters}
      />
    ) : activeView === "stats" ? (
      <StatsView
        workId={activeWorkId}
        workTitle={currentWork?.title}
        stats={workStats}
        isLoading={isLoadingWorkspace}
        onGoalUpdated={(updated) => setWorkStats(updated)}
        onRefresh={() => {
          if (activeWorkId) {
            loadWorkStats(activeWorkId);
          }
        }}
      />
    ) : null}
  </div>

      <div className="desktop-notice">
        <BookOpen />
        <strong>请使用桌面浏览器打开</strong>
        <span>第一版专为桌面写作场景设计。</span>
      </div>

      {/* 达成今日总目标专属奖励欢呼动态提示 */}
      {showCheerModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          {/* 礼花与彩带飘落动效 */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <span
                key={i}
                className="absolute text-xl sm:text-3xl animate-confetti select-none"
                style={{
                  left: `${(i * 5) + 1.5}%`,
                  top: `-${20 + (i % 5) * 16}px`,
                  animationDelay: `${(i * 0.14) % 2.0}s`,
                  animationDuration: `${2.6 + (i % 4) * 0.4}s`,
                }}
              >
                {["🎉", "✨", "🎊", "🌟", "🏆", "📜", "💫"][i % 7]}
              </span>
            ))}
          </div>

          {/* 欢呼庆祝卡片 */}
          <div className="relative w-full max-w-md bg-gradient-to-b from-[#fffefb] via-[#f7fbf9] to-[#edf6f2] border-2 border-[#176b5b]/30 rounded-3xl shadow-2xl p-6 sm:p-8 text-center space-y-4 animate-cheer-bounce">
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={() => setShowCheerModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-[#7d8c85] hover:text-[#202923] hover:bg-[#e4ede8] transition-colors cursor-pointer"
              title="关闭"
            >
              <X size={18} />
            </button>

            {/* 水墨光晕 */}
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-emerald-400/25 blur-2xl pointer-events-none animate-ink-pulse-glow" />
            <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-[#176b5b]/20 blur-2xl pointer-events-none" />

            {/* 黄金奖杯徽章 */}
            <div className="relative inline-block mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#176b5b] via-[#22806e] to-[#36a891] flex items-center justify-center text-white shadow-xl shadow-[#176b5b]/30">
                <Trophy className="w-10 h-10 text-amber-300 animate-cheer-sparkle" />
              </div>
              <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 font-bold text-[11px] shadow-sm animate-pulse">
                今日达标
              </span>
            </div>

            <div className="space-y-1.5 relative z-10">
              <h3 className="font-serif text-2xl font-bold text-[#182620]">
                🎉 翰墨生辉 · 今日目标圆满达成！
              </h3>
              <p className="text-xs text-[#52645c] leading-relaxed max-w-xs mx-auto">
                笔力雄健，落墨千言！您今日全书已累计创作{" "}
                <strong className="text-[#176b5b] font-mono text-sm">{todayWords}</strong> 字，顺利达成每日总目标（{dailyGoal} 字）！
              </p>
            </div>

            {/* 荣誉表彰卡片 */}
            <div className="relative z-10 p-4 rounded-2xl bg-white/95 border border-[#bad4cb] shadow-xs text-left space-y-2 backdrop-blur-xs">
              <div className="flex items-center justify-between text-xs text-[#202923]">
                <span className="font-semibold flex items-center gap-1.5 text-[#1b2b24]">
                  <Award className="w-4 h-4 text-amber-600" />
                  【今日全勤文宗】荣誉称号已授予
                </span>
                <span className="font-mono font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full text-[11px]">
                  达成率 {Math.round((todayWords / dailyGoal) * 100)}%
                </span>
              </div>
              <p className="text-xs text-[#63736c] italic font-serif leading-relaxed">
                “行云流水，落墨成卷；日拱一卒，功不唐捐。”
              </p>
              <div className="pt-2 border-t border-[#ecebe6] flex items-center justify-between text-[11px] text-[#7d8c85]">
                <span>🔥 连续连载创作：<strong>12 天</strong></span>
                <span>超越全站 88% 的签约作者</span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="relative z-10 pt-2 flex items-center justify-center gap-3">
              <Button
                onClick={() => setShowCheerModal(false)}
                className="h-10 px-6 bg-[#176b5b] hover:bg-[#12594b] text-white font-medium rounded-xl shadow-md shadow-[#176b5b]/25 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>收下奖励 · 继续挥毫</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 新建长篇作品弹窗 */}
      <CreateWorkDialog
        open={isCreateWorkOpen}
        onOpenChange={setIsCreateWorkOpen}
        onCreated={handleWorkCreated}
        onBeforeCreate={handleBeforeCreateWork}
      />

      {/* 新建分卷弹窗 */}
      <CreateVolumeDialog
        open={isCreateVolumeOpen}
        onOpenChange={setIsCreateVolumeOpen}
        workId={activeWorkId}
        workTitle={currentWork?.title}
        volumeCount={volumes.length}
        onCreated={handleVolumeCreated}
      />

      {/* 服务端加密 AI 模型配置弹窗 */}
      <AiSettingsDialog
        open={isAiSettingsOpen}
        onOpenChange={setIsAiSettingsOpen}
      />

      {/* 章节关联设定管理弹窗 */}
      {selected && selected.id !== "placeholder" && (
        <ChapterLinksDialog
          open={isChapterLinksOpen}
          onOpenChange={setIsChapterLinksOpen}
          chapterId={selected.id}
          chapterTitle={selected.title}
          characters={charactersList}
          worldEntries={worldList}
          outlines={outlinesList}
          timelineEvents={timelineList}
          linkedItems={chapterLinks}
          onLinksChanged={(updated) => setChapterLinks(updated)}
        />
      )}
    </main>
  );
}
