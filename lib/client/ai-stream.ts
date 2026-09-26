import type { AiGenerationInput, AiStreamEvent } from "@/contracts";

const MAX_EVENT_CHARS = 1_000_000;

export class AiStreamRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AiStreamRequestError";
  }
}

function parseEvent(frame: string): AiStreamEvent | null {
  const lines = frame.split("\n");
  const name = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines.filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart()).join("\n");
  if (!data) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(data); } catch {
    throw new AiStreamRequestError("AI_INVALID_STREAM", "AI 响应格式不正确");
  }
  if (!parsed || typeof parsed !== "object" || !("type" in parsed) ||
    (parsed as { type: unknown }).type !== name) {
    throw new AiStreamRequestError("AI_INVALID_STREAM", "AI 响应事件不一致");
  }
  const event = parsed as AiStreamEvent;
  if (event.type === "delta" && typeof event.text === "string") return event;
  if (event.type === "start" && typeof event.requestId === "string") return event;
  if (event.type === "done" && event.usage && event.contextSummary) return event;
  if (event.type === "error" && typeof event.code === "string" && typeof event.message === "string") return event;
  throw new AiStreamRequestError("AI_INVALID_STREAM", "AI 响应事件格式不正确");
}

/** POST + fetch ReadableStream; AbortSignal is the cancellation contract. */
export async function generateAiContentStream(
  input: AiGenerationInput,
  options: {
    signal: AbortSignal;
    onEvent: (event: Exclude<AiStreamEvent, { type: "error" }>) => void;
    fetcher?: typeof fetch;
  },
): Promise<void> {
  const response = await (options.fetcher ?? fetch)("/api/ai/generate/stream", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    credentials: "include",
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as
      | { error?: { code?: string; message?: string } } | null;
    throw new AiStreamRequestError(
      payload?.error?.code ?? "AI_REQUEST_FAILED",
      payload?.error?.message ?? `AI 请求失败（${response.status}）`,
    );
  }
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new AiStreamRequestError("AI_INVALID_STREAM", "AI 服务未返回流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let doneSeen = false;
  try {
    while (true) {
      const part = await reader.read();
      if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
      pending += decoder.decode(part.value, { stream: !part.done });
      pending = pending.replace(/\r\n/g, "\n").replace(/\r(?=.)/g, "\n");
      if (part.done) pending = pending.replace(/\r/g, "\n");
      let boundary: number;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        const frame = pending.slice(0, boundary);
        if (frame.length > MAX_EVENT_CHARS) {
          throw new AiStreamRequestError("AI_INVALID_STREAM", "AI 响应事件过大");
        }
        const event = parseEvent(frame);
        pending = pending.slice(boundary + 2);
        if (!event) continue;
        if (event.type === "error") throw new AiStreamRequestError(event.code, event.message);
        if (event.type === "done") doneSeen = true;
        options.onEvent(event);
      }
      if (pending.length > MAX_EVENT_CHARS) {
        throw new AiStreamRequestError("AI_INVALID_STREAM", "AI 响应事件过大");
      }
      if (part.done) break;
    }
    if (!doneSeen) throw new AiStreamRequestError("AI_STREAM_INTERRUPTED", "AI 响应意外中断，可重试生成");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
