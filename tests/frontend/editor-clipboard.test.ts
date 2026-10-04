import assert from "node:assert/strict";
import { it } from "node:test";
import { chapterPasteText, copyEditorText } from "../../lib/client/editor-clipboard";

it("ignores missing, empty, HTML-only and file-only clipboard data", () => {
  assert.equal(chapterPasteText(null), null);
  for (const data of [{}, { "text/plain": "" }, { "text/html": "<b>正文</b>" }, { Files: "image.png" }]) {
    assert.equal(chapterPasteText({ getData: type => data[type as keyof typeof data] ?? "" }), null);
  }
});

it("preserves literal text, whitespace and newlines without parsing clipboard HTML", () => {
  const text = "  中文\n\n<b>普通文本</b>\t";
  assert.equal(chapterPasteText({ getData: type => type === "text/plain" ? text : "<script>bad</script>" }), text);
  assert.equal(chapterPasteText({ getData: () => " \n\t" }), " \n\t");
});

it("does not report a clipboard write as complete while permission is pending", async () => {
  let finish!: () => void;
  let reported = false;
  const result = copyEditorText("建议正文", { writeText: text => {
    assert.equal(text, "建议正文");
    return new Promise<void>(resolve => { finish = resolve; });
  } }).then(success => { reported = true; return success; });
  await Promise.resolve();
  assert.equal(reported, false);
  finish();
  assert.equal(await result, true);
});

it("handles permission rejection and unavailable clipboard without claiming success", async () => {
  assert.equal(await copyEditorText("正文", undefined), false);
  assert.equal(await copyEditorText("正文", { writeText: async () => { throw new Error("NotAllowedError"); } }), false);
});
