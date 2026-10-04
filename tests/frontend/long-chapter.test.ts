import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { createChapterTextAnalyzer, countChapterWords } from "../../lib/client/chapter-text";
import { findEditorMatches, replaceEditorMatches } from "../../lib/client/editor-search";
import { countWords, htmlToPlainText } from "../../server/text";

describe("long chapter analysis and search", () => {
  it("reuses exactly the last analysis without retaining all earlier drafts", () => {
    const analyze = createChapterTextAnalyzer();
    const first = analyze("<p>甲😀</p>");
    assert.strictEqual(analyze("<p>甲😀</p>"), first);
    assert.ok(Object.isFrozen(first));
    assert.equal(analyze("<p>乙</p>").wordCount, 1);
    assert.notStrictEqual(analyze("<p>甲😀</p>"), first);
    assert.equal(analyze("").wordCount, 0);
  });
  it("isolates analyzer caches between workbench instances", () => {
    const a = createChapterTextAnalyzer();
    const b = createChapterTextAnalyzer();
    assert.notStrictEqual(a("<p>甲</p>"), b("<p>甲</p>"));
  });
  it("keeps code point and HTML counts equal to the server", () => {
    for (const html of ["<p>😀𠮷甲 &amp; &#x1f600; &#128512;</p>",
      "<ul><li>甲</li><li>乙</li></ul>", "<p> \n\t&nbsp;</p>", "<p>\ud800甲\udc00</p>"]) {
      assert.equal(countChapterWords(html), countWords(htmlToPlainText(html)));
    }
  });
  it("counts 100,000 visible characters across 1,000 paragraphs", () => {
    const analyze = createChapterTextAnalyzer();
    const html = `<p>${"山海".repeat(50)}</p>`.repeat(1000);
    assert.equal(analyze(html).wordCount, 100000);
    assert.equal(analyze(html).text.length, 100000);
    assert.equal(analyze(`${html}<p>😀</p>`).wordCount, 100001);
  });
  it("searches and replaces 1,000 paragraphs with a single reversible transaction", () => {
    const schema = new Schema({ nodes: {
      doc: { content: "paragraph+" }, paragraph: { content: "text*" }, text: {},
    } });
    const doc = schema.node("doc", null, Array.from({ length: 1000 }, () =>
      schema.node("paragraph", null, schema.text(`起${"山".repeat(98)}终`))));
    let state = EditorState.create({ schema, doc, plugins: [history()] });
    const result = findEditorMatches(doc, "起");
    assert.equal(result.matches.length, 1000);
    assert.equal(result.truncated, false);
    state = state.apply(replaceEditorMatches(state, result.matches, "始😀"));
    assert.equal(state.doc.childCount, 1000);
    assert.equal(findEditorMatches(state.doc, "始😀").matches.length, 1000);
    undo(state, (tr) => { state = state.apply(tr); });
    assert.ok(state.doc.eq(doc));
  });
});
