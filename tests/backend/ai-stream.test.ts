import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiGenerationSchema } from "../../contracts/schemas";
import { planAiContext } from "../../contracts/ai-context";
import { createAiStreamResponse } from "../../server/ai/stream";

const input = aiGenerationSchema.parse({
  action: "continue",
  instruction: "续写雨夜",
  context: { chapters: [{ title: "第一章", content: "雨落青石巷" }] },
});

function providerResponse(parts: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(stream) {
      for (const part of parts) stream.enqueue(encoder.encode(part));
      stream.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

function options(fetcher: typeof fetch, onDone: (usage: unknown) => Promise<void> = async () => {}) {
  const plan = planAiContext(input);
  return {
    baseUrl: "https://provider.example/v1",
    apiKey: "super-secret",
    model: "novel-model",
    input,
    messages: plan.messages,
    contextBudget: plan.budget,
    requestId: "request-1",
    signal: new AbortController().signal,
    fetcher,
    onDone,
  };
}

function events(text: string): Array<Record<string, unknown>> {
  return text.split("\n\n").filter(Boolean).map((frame) =>
    JSON.parse(frame.split("\n").find((line) => line.startsWith("data: "))!.slice(6)));
}

describe("AI streaming proxy", () => {
  it("forwards split provider frames as start/delta/done without exposing the key", async () => {
    const body = JSON.stringify({ choices: [{ delta: { content: "青石" } }] });
    const encoded = `data: ${body}\r\n\r\ndata: {"choices":[{"delta":{"content":"巷"}}]}\n\n`;
    const fetcher: typeof fetch = async (url, init) => {
      assert.equal(String(url), "https://provider.example/v1/chat/completions");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer super-secret");
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.stream, true);
      assert.equal(sent.messages[1].content.includes("雨落青石巷"), true);
      return providerResponse([encoded.slice(0, 13), encoded.slice(13, 28), encoded.slice(28),
        "data: {\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":3}}\n\n", "data: [DONE]\n\n"]);
    };
    let recorded: unknown;
    const response = await createAiStreamResponse(options(fetcher, async (usage) => { recorded = usage; }));
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const result = events(await response.text());
    assert.deepEqual(result.map((event) => event.type), ["start", "delta", "delta", "done"]);
    assert.equal(result[1].text, "青石");
    assert.equal(result[2].text, "巷");
    assert.deepEqual(recorded, { inputTokens: 12, outputTokens: 3 });
    assert.equal(result[3].contextSummary && (result[3].contextSummary as { chapterCount: number }).chapterCount, 1);
    assert.equal(JSON.stringify(result).includes("super-secret"), false);
  });

  it("maps provider authentication errors before opening a stream", async () => {
    const fetcher: typeof fetch = async () => new Response("sensitive vendor detail", { status: 401 });
    await assert.rejects(createAiStreamResponse(options(fetcher)),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "AI_AUTH_FAILED"
        && !error.message.includes("sensitive"));
  });

  it("emits a safe error after a partial response and never records success", async () => {
    const fetcher: typeof fetch = async () => providerResponse([
      'data: {"choices":[{"delta":{"content":"开头"}}]}\n\n',
      'data: {"error":{"message":"secret provider detail"}}\n\n',
    ]);
    let recorded = false;
    const response = await createAiStreamResponse(options(fetcher, async () => { recorded = true; }));
    const result = events(await response.text());
    assert.deepEqual(result.map((event) => event.type), ["start", "delta", "error"]);
    assert.equal(result[2].code, "AI_PROVIDER_ERROR");
    assert.equal(JSON.stringify(result).includes("secret provider detail"), false);
    assert.equal(recorded, false);
  });

  it("requires an explicit DONE marker", async () => {
    const fetcher: typeof fetch = async () => providerResponse([
      'data: {"choices":[{"delta":{"content":"未完"}}]}\n\n',
    ]);
    const response = await createAiStreamResponse(options(fetcher));
    const result = events(await response.text());
    assert.equal(result.at(-1)?.code, "AI_STREAM_INTERRUPTED");
  });

  it("accepts a finish_reason terminal frame and array text parts", async () => {
    const fetcher: typeof fetch = async () => providerResponse([
      'event: message\r\ndata: {"choices":[{"delta":{"content":[{"type":"text","text":"古"},{"type":"text","text":"风"}]}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"input_tokens":7,"output_tokens":2}}\n\n',
    ]);
    const response = await createAiStreamResponse(options(fetcher));
    const result = events(await response.text());
    assert.deepEqual(result.map((event) => event.type), ["start", "delta", "done"]);
    assert.equal(result[1].text, "古风");
    assert.deepEqual(result[2].usage, { inputTokens: 7, outputTokens: 2 });
  });

  it("accepts an OpenAI-compatible JSON completion when streaming is unavailable", async () => {
    const fetcher: typeof fetch = async () => Response.json({
      choices: [{ message: { content: "回退文本" } }],
      usage: { prompt_tokens: 9, completion_tokens: 3 },
    });
    const response = await createAiStreamResponse(options(fetcher));
    const result = events(await response.text());
    assert.deepEqual(result.map((event) => event.type), ["start", "delta", "done"]);
    assert.equal(result[1].text, "回退文本");
  });

  it("does not expose an event:error provider message", async () => {
    const fetcher: typeof fetch = async () => providerResponse([
      'event: error\ndata: {"message":"private provider diagnostic"}\n\n',
    ]);
    const response = await createAiStreamResponse(options(fetcher));
    const result = events(await response.text());
    assert.equal(result.at(-1)?.code, "AI_PROVIDER_ERROR");
    assert.equal(JSON.stringify(result).includes("private provider diagnostic"), false);
  });

  it("aborts the upstream request when the caller cancels", async () => {
    const caller = new AbortController();
    let upstreamAborted = false;
    let recorded = false;
    const fetcher: typeof fetch = async (_url, init) => new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          init!.signal!.addEventListener("abort", () => {
            upstreamAborted = true;
            stream.error(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    const response = await createAiStreamResponse({
      ...options(fetcher, async () => { recorded = true; }), signal: caller.signal,
    });
    const reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false); // start event
    caller.abort();
    await reader.read().catch(() => null);
    assert.equal(upstreamAborted, true);
    assert.equal(recorded, false);
  });
});
