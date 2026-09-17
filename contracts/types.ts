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
  createdAt: string;
  updatedAt: string;
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
};
