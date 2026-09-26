import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiGenerationSchema } from "../../contracts/schemas";
import { AiStreamRequestError, generateAiContentStream } from "../../lib/client/ai-stream";

const input = aiGenerationSchema.parse({ action: "continue", instruction: "续写" });
const encoder = new TextEncoder();

function streamed(parts: string[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(stream) {
      for (const part of parts) stream.enqueue(encoder.encode(part));
      stream.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

describe("browser AI stream reader", () => {
  it("parses split events and preserves text without HTML interpretation", async () => {
    const frame = 'event: start\ndata: {"type":"start","requestId":"one","action":"continue","model":"m"}\n\n'
      + 'event: delta\ndata: {"type":"delta","text":"<script>青石"}\n\n'
      + 'event: done\ndata: {"type":"done","usage":{"inputTokens":null,"outputTokens":null},"contextSummary":{"chapterCount":0,"outlineCount":0,"characterCount":0,"worldEntryCount":0,"timelineEventCount":0}}\n\n';
    const seen: string[] = [];
    await generateAiContentStream(input, {
      signal: new AbortController().signal,
      fetcher: async () => streamed([frame.slice(0, 17), frame.slice(17, 105), frame.slice(105)]),
      onEvent: (event) => seen.push(event.type === "delta" ? event.text : event.type),
    });
    assert.deepEqual(seen, ["start", "<script>青石", "done"]);
  });

  it("rejects partial streams without done", async () => {
    await assert.rejects(generateAiContentStream(input, {
      signal: new AbortController().signal,
      fetcher: async () => streamed(['event: delta\ndata: {"type":"delta","text":"半句"}\n\n']),
      onEvent: () => {},
    }), (error: unknown) => error instanceof AiStreamRequestError && error.code === "AI_STREAM_INTERRUPTED");
  });

  it("reports structured preflight errors", async () => {
    await assert.rejects(generateAiContentStream(input, {
      signal: new AbortController().signal,
      fetcher: async () => Response.json({ error: { code: "AI_CONFIG_INCOMPLETE", message: "请配置模型" } }, { status: 400 }),
      onEvent: () => {},
    }), (error: unknown) => error instanceof AiStreamRequestError && error.code === "AI_CONFIG_INCOMPLETE");
  });
});
