export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type Work = {
  id: string;
  title: string;
  description: string;
  genre: string;
  status: "draft" | "completed" | "archived";
  targetWords: number;
  totalWords: number;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDashboard = {
  works: Work[];
  activeWorkId: string | null;
  activeChapterId: string | null;
};

export type AiProviderModel = {
  id: string;
  ownedBy: string | null;
};

export type AiConnectionTestResult = {
  connected: true;
  baseUrl: string;
  model: string;
  latencyMs: number;
  responsePreview: string;
};

export type Volume = {
  id: string;
  workId: string;
  title: string;
  summary: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type WritingDayStats = {
  date: string;
  targetWords: number;
  wordsWritten: number;
};

export type WorkStats = {
  totalWords: number;
  targetWords: number;
  chapterCount: number;
  completedChapterCount: number;
  streakDays: number;
  timeZone: "Asia/Shanghai";
  today: string;
  todayWordsWritten: number;
  /** Null means no daily record; zero is an explicitly unlimited daily goal. */
  todayTargetWords: number | null;
  daily: WritingDayStats[];
};

export type Chapter = {
  id: string;
  workId: string;
  volumeId: string | null;
  title: string;
  summary: string;
  content: string;
  wordCount: number;
  status: "draft" | "completed";
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeKind = "outlines" | "characters" | "world" | "timeline";

export type AiAction =
  | "continue"
  | "rewrite"
  | "polish"
  | "outline"
  | "brainstorm"
  | "consistency";

export type AiGenerationResult = {
  action: AiAction;
  content: string;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
  contextSummary: {
    chapterCount: number;
    outlineCount: number;
    characterCount: number;
    worldEntryCount: number;
    timelineEventCount: number;
  };
  contextBudget?: AiContextBudget;
};

export type AiContextSection = "selectedText" | "chapters" | "outlines" | "characters" | "worldEntries" | "timelineEvents";

export type AiContextBudget = {
  /** Conservative cross-provider estimate, not a tokenizer or a model context-window guarantee. */
  estimatedInputTokens: number;
  inputTokenLimit: number;
  requestedContextTokens: number;
  includedContextTokens: number;
  omittedCharacters: number;
  truncatedSections: AiContextSection[];
  selectedTextTooLong: boolean;
};

/** POST /api/ai/generate/stream 的 SSE data；event 名与 type 相同。 */
export type AiStreamEvent =
  | { type: "start"; requestId: string; action: AiAction; model: string; contextBudget: AiContextBudget }
  | { type: "delta"; text: string }
  | { type: "done"; usage: AiGenerationResult["usage"]; contextSummary: AiGenerationResult["contextSummary"] }
  | { type: "error"; code: string; message: string };
