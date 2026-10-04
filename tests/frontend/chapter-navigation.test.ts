import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { canCommitChapterJump, filterChapterJumpItems } from "../../lib/client/chapter-navigation";

describe("chapter jump safety", () => {
  const items = [
    { id: "a", title: "雨夜重逢", volumeTitle: "第一卷", ordinal: 1 },
    { id: "b", title: "ALPHA", volumeTitle: "第二卷", ordinal: 2 },
  ];
  it("finds titles, volume names and exact displayed ordinals", () => {
    assert.deepEqual(filterChapterJumpItems(items, " 重逢 "), [items[0]]);
    assert.deepEqual(filterChapterJumpItems(items, "alpha"), [items[1]]);
    assert.deepEqual(filterChapterJumpItems(items, "第二卷"), [items[1]]);
    assert.deepEqual(filterChapterJumpItems(items, "2"), [items[1]]);
    assert.deepEqual(filterChapterJumpItems(items, "3"), []);
    assert.deepEqual(filterChapterJumpItems(items, ""), items);
  });
  const start = { workId: "work", chapterId: "a", seq: 4 };
  it("accepts a loaded chapter only while source and saved draft stay unchanged", () => {
    assert.equal(canCommitChapterJump(start, { ...start, dirty: false }), true);
    assert.equal(canCommitChapterJump(start, { ...start, dirty: true }), false);
    assert.equal(canCommitChapterJump(start, { ...start, seq: 5, dirty: false }), false);
  });
  it("rejects delayed results after switching works or chapters", () => {
    assert.equal(canCommitChapterJump(start, { ...start, workId: "other", dirty: false }), false);
    assert.equal(canCommitChapterJump(start, { ...start, chapterId: "b", dirty: false }), false);
  });
  it("keeps the fetch-before-switch gate wired to the workbench", () => {
    const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("async function selectChapter("), source.indexOf("async function addChapter("));
    assert.ok(body.indexOf("await fetchChapter(id)") < body.indexOf("setSelectedId(id)"));
    assert.ok(body.indexOf("canCommitChapterJump(start") < body.indexOf("setSelectedId(id)"));
    assert.ok(!body.includes("replaceEditorHtml(found.content)"));
  });
  it("keeps conflict latched on both title and body input", () => {
    const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    for (const [start, end] of [["function handleEditorInput()", "useEffect(() => {\n    onEditorUpdateRef"],
      ["function handleTitleChange(", "function format("]]) {
      const body = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
      assert.match(body, /if \(saveStateRef.current !== "conflict"\) setSaveState\("saving"\)/);
    }
  });
  it("reports clipboard success only after the write resolves and keeps paragraph breaks", () => {
    const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("async function handleCopyDraft()"), source.indexOf("async function handleManualResyncCatalog()"));
    const write = body.indexOf("await copyEditorText");
    const success = body.indexOf('setCopiedToast("draft")');
    assert.ok(write >= 0 && success > write);
    assert.match(body, /getText\(\{ blockSeparator: "\\n\\n" \}\)/);
    assert.ok(body.includes("复制草稿失败"));
  });
});
