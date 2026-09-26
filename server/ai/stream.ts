import type { AiContextBudget, AiGenerationInput, AiGenerationResult, AiStreamEvent } from "@/contracts";
import { AppError } from "@/server/errors";
import { chatCompletionsUrl } from "./security";

type StreamOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  input: AiGenerationInput;
  messages: Array<{ role: "system" | "user"; content: string }>;
  contextBudget: AiContextBudget;
  requestId: string;
  signal: AbortSignal;
  onDone: (usage: AiGenerationResult["usage"]) => Promise<void>;
  fetcher?: typeof fetch;
};

const STREAM_TIMEOUT_MS = 120_000;
const MAX_FRAME_CHARS = 1_000_000;
const MAX_OUTPUT_CHARS = 200_000;

function encodeEvent(event: AiStreamEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function providerError(status: number): AppError {
  if (status === 401 || status === 403) {
    return new AppError(502, "AI_AUTH_FAILED", "模型服务拒绝了密钥，请重新配置");
  }
  if (status === 429) {
    return new AppError(429, "AI_PROVIDER_RATE_LIMITED", "模型服务请求过于频繁，请稍后再试");
  }
  return new AppError(502, "AI_PROVIDER_ERROR", `模型服务返回错误（${status}）`);
}

function safeStreamError(error: unknown, aborted: boolean): AppError {
  if (aborted) return new AppError(504, "AI_TIMEOUT", "模型流式生成超时");
  if (error instanceof AppError) return error;
  return new AppError(502, "AI_STREAM_INTERRUPTED", "模型流式响应中断，请重试");
}

function contextSummary(input: AiGenerationInput): AiGenerationResult["contextSummary"] {
  return {
    chapterCount: input.context.chapters.length,
    outlineCount: input.context.outlines.length,
    characterCount: input.context.characters.length,
    worldEntryCount: input.context.worldEntries.length,
    timelineEventCount: input.context.timelineEvents.length,
  };
}

/** Extract OpenAI-compatible SSE frames without assuming transport chunk boundaries. */
async function* providerFrames(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<{ data: string; event: string }> {
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    pending = pending.replace(/\r\n/g, "\n").replace(/\r(?=.)/g, "\n");
    if (done) pending = pending.replace(/\r/g, "\n");
    let boundary: number;
    while ((boundary = pending.indexOf("\n\n")) >= 0) {
      const frame = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      if (frame.length > MAX_FRAME_CHARS) {
        throw new AppError(502, "AI_INVALID_RESPONSE", "模型流式响应过大或格式不正确");
      }
      const data = frame.split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) {
        const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
        yield { data, event };
      }
    }
    if (pending.length > MAX_FRAME_CHARS) {
      throw new AppError(502, "AI_INVALID_RESPONSE", "模型流式响应过大或格式不正确");
    }
    if (done) break;
  }
  if (pending.trim()) {
    throw new AppError(502, "AI_STREAM_INTERRUPTED", "模型流式响应未完整结束");
  }
}

function completionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (!part || typeof part !== "object") return "";
    const text = (part as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }).join("");
}

function completionPayload(payload: unknown): {
  text: string;
  finishReason: boolean;
  usage: AiGenerationResult["usage"] | null;
} {
  if (!payload || typeof payload !== "object") {
    throw new AppError(502, "AI_INVALID_RESPONSE", "模型流式响应格式不正确");
  }
  const item = payload as {
    error?: unknown;
    choices?: Array<{
      delta?: { content?: unknown };
      message?: { content?: unknown };
      finish_reason?: unknown;
    }>;
    usage?: {
      prompt_tokens?: unknown; completion_tokens?: unknown;
      input_tokens?: unknown; output_tokens?: unknown;
    };
  };
  if (item.error) throw new AppError(502, "AI_PROVIDER_ERROR", "模型服务在生成过程中返回错误");
  const choice = item.choices?.[0];
  const inputTokens = item.usage?.prompt_tokens ?? item.usage?.input_tokens;
  const outputTokens = item.usage?.completion_tokens ?? item.usage?.output_tokens;
  return {
    text: completionText(choice?.delta?.content ?? choice?.message?.content),
    finishReason: choice?.finish_reason != null,
    usage: item.usage ? {
      inputTokens: typeof inputTokens === "number" && Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? inputTokens : null,
      outputTokens: typeof outputTokens === "number" && Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? outputTokens : null,
    } : null,
  };
}

export async function createAiStreamResponse(options: StreamOptions): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abortUpstream = () => controller.abort();
  options.signal.addEventListener("abort", abortUpstream, { once: true });
  if (options.signal.aborted) controller.abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STREAM_TIMEOUT_MS);
  const cleanup = () => {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", abortUpstream);
  };

  let upstream: Response;
  try {
    upstream = await (options.fetcher ?? fetch)(chatCompletionsUrl(options.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.input.temperature,
        max_tokens: options.input.maxTokens,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch {
    cleanup();
    if (timedOut) throw new AppError(504, "AI_TIMEOUT", "模型服务在规定时间内没有响应");
    if (options.signal.aborted) throw new AppError(499, "AI_CANCELLED", "生成已取消");
    throw new AppError(502, "AI_PROVIDER_UNREACHABLE", "无法连接模型服务，请检查接口地址");
  }

  if (!upstream.ok) {
    cleanup();
    await upstream.body?.cancel().catch(() => {});
    throw providerError(upstream.status);
  }
  const mediaType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  const isSse = mediaType.includes("text/event-stream");
  const isJson = mediaType.includes("application/json");
  if (!upstream.body || (!isSse && !isJson)) {
    cleanup();
    await upstream.body?.cancel().catch(() => {});
    throw new AppError(502, "AI_INVALID_RESPONSE", "模型服务没有返回流式数据");
  }

  const reader = isSse ? upstream.body.getReader() : null;
  let clientClosed = false;
  const body = new ReadableStream<Uint8Array>({
    async start(stream) {
      let finished = false;
      let finishReasonSeen = false;
      let outputChars = 0;
      let usage: AiGenerationResult["usage"] = { inputTokens: null, outputTokens: null };
      try {
        stream.enqueue(encodeEvent({
          type: "start", requestId: options.requestId,
          action: options.input.action, model: options.model, contextBudget: options.contextBudget,
        }));
        if (isJson) {
          let payload: unknown;
          try { payload = await upstream.json(); } catch {
            throw new AppError(502, "AI_INVALID_RESPONSE", "模型服务返回了无法识别的数据");
          }
          const completion = completionPayload(payload);
          if (completion.text) {
            outputChars = completion.text.length;
            if (outputChars > MAX_OUTPUT_CHARS) throw new AppError(502, "AI_OUTPUT_TOO_LARGE", "模型输出超过安全长度限制");
            stream.enqueue(encodeEvent({ type: "delta", text: completion.text }));
          }
          if (completion.usage) usage = completion.usage;
          finished = true;
        } else {
          for await (const frame of providerFrames(reader!)) {
            if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
            if (frame.data === "[DONE]") {
              finished = true;
              break;
            }
            if (frame.event === "error") throw new AppError(502, "AI_PROVIDER_ERROR", "模型服务在生成过程中返回错误");
            let payload: unknown;
            try { payload = JSON.parse(frame.data); } catch {
              throw new AppError(502, "AI_INVALID_RESPONSE", "模型流式响应格式不正确");
            }
            const completion = completionPayload(payload);
            finishReasonSeen ||= completion.finishReason;
            const text = completion.text;
            if (!text) {
              if (completion.usage) usage = completion.usage;
              continue;
            }
            outputChars += text.length;
            if (outputChars > MAX_OUTPUT_CHARS) {
              throw new AppError(502, "AI_OUTPUT_TOO_LARGE", "模型输出超过安全长度限制");
            }
            stream.enqueue(encodeEvent({ type: "delta", text }));
            if (completion.usage) usage = completion.usage;
          }
          finished ||= finishReasonSeen;
        }
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (!finished) throw new AppError(502, "AI_STREAM_INTERRUPTED", "模型流式响应未完整结束");
        if (!outputChars) throw new AppError(502, "AI_EMPTY_RESPONSE", "模型服务没有返回可用内容");
        await options.onDone(usage);
        stream.enqueue(encodeEvent({ type: "done", usage, contextSummary: contextSummary(options.input) }));
      } catch (error) {
        if (!clientClosed && !options.signal.aborted) {
          const safe = safeStreamError(error, timedOut);
          stream.enqueue(encodeEvent({ type: "error", code: safe.code, message: safe.message }));
        }
      } finally {
        cleanup();
        await reader?.cancel().catch(() => {});
        if (!clientClosed) stream.close();
      }
    },
    cancel() {
      clientClosed = true;
      controller.abort();
      cleanup();
      void reader?.cancel().catch(() => {});
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
