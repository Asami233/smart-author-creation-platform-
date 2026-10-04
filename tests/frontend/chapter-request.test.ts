import assert from "node:assert/strict";
import { it } from "node:test";
import { fetchChapter, saveChapter, ChapterConflictError } from "../../lib/client/api";

it("chapter requests pass a deadline signal without changing save identity", async (context) => {
  const input = { content: "<p>test</p>", expectedRevision: 2, saveId: "stable-save-id" };
  const calls: RequestInit[] = [];
  context.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    calls.push(init);
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ data: { id: "chapter", revision: 3 } });
  });
  assert.equal((await fetchChapter("chapter")).revision, 3);
  assert.equal((await saveChapter("chapter", input)).revision, 3);
  assert.equal(calls[0].credentials, "include");
  assert.equal(calls[1].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].body as string), input);
});

it("a truncated successful save body is rejected, not treated as a successful save", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response('{"data":', { status: 200 }));
  await assert.rejects(saveChapter("chapter", { content: "draft" }), SyntaxError);
});

it("a malformed error body does not remove the 409 conflict guard", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("not json", { status: 409 }));
  await assert.rejects(saveChapter("chapter", { content: "draft" }), ChapterConflictError);
});
