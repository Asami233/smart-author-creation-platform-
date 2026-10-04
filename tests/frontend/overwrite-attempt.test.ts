import assert from "node:assert/strict";
import { it } from "node:test";
import { prepareOverwriteAttempt } from "../../lib/client/overwrite-attempt";

it("reuses the exact uncertain overwrite when the draft has not changed", async () => {
  const draft = { chapterId: "chapter-1", title: "标题", content: "<p>草稿</p>", draftSeq: 4 };
  const first = await prepareOverwriteAttempt(null, draft, async () => 8, () => "save-1");
  const replay = await prepareOverwriteAttempt(first, draft,
    async () => { throw new Error("a replay must not fetch a newer revision"); },
    () => { throw new Error("a replay must not allocate a new save ID"); });
  assert.strictEqual(replay, first);
  assert.equal(replay.expectedRevision, 8);
  assert.equal(replay.saveId, "save-1");
});

it("uses a fresh revision and save ID for newer input or another chapter", async () => {
  const first = await prepareOverwriteAttempt(null,
    { chapterId: "chapter-1", title: "标题", content: "<p>草稿</p>", draftSeq: 4 },
    async () => 8, () => "save-1");
  const newer = await prepareOverwriteAttempt(first,
    { chapterId: "chapter-1", title: "标题", content: "<p>较新草稿</p>", draftSeq: 5 },
    async () => 9, () => "save-2");
  assert.equal(newer.expectedRevision, 9);
  assert.equal(newer.saveId, "save-2");
  assert.equal(newer.content, "<p>较新草稿</p>");

  const otherChapter = await prepareOverwriteAttempt(first,
    { chapterId: "chapter-2", title: "标题", content: "<p>草稿</p>", draftSeq: 4 },
    async () => 3, () => "save-3");
  assert.equal(otherChapter.expectedRevision, 3);
  assert.equal(otherChapter.saveId, "save-3");
});
