import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { closeHistory, history, undo, redo } from "@tiptap/pm/history";
import { findEditorMatches, MAX_SEARCH_MATCHES, replaceEditorMatches } from "../../lib/client/editor-search";

const schema = new Schema({
  nodes: { doc: { content: "paragraph+" }, paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" }, hardBreak: { inline: true, group: "inline" } },
  marks: { bold: {} },
});
const paragraph = (text: string) => schema.node("paragraph", null, text ? schema.text(text) : undefined);
const document = (...texts: string[]) => schema.node("doc", null, texts.map(paragraph));

describe("chapter literal search and replace", () => {
  it("handles Chinese, emoji UTF-16 positions and literal regex characters", () => {
    const doc = document("😀甲.*甲.*");
    assert.deepEqual(findEditorMatches(doc, "甲.*").matches, [{ from: 3, to: 6 }, { from: 6, to: 9 }]);
    assert.deepEqual(findEditorMatches(doc, "😀").matches, [{ from: 1, to: 3 }]);
    assert.equal(findEditorMatches(doc, "").matches.length, 0);
  });
  it("crosses formatting boundaries but not paragraphs or hard breaks", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [
      schema.text("青"), schema.text("山", [schema.mark("bold")]), schema.node("hardBreak"), schema.text("云"),
    ]), paragraph("海")]);
    assert.equal(findEditorMatches(doc, "青山").matches.length, 1);
    assert.equal(findEditorMatches(doc, "山云").matches.length, 0);
    assert.equal(findEditorMatches(doc, "云海").matches.length, 0);
  });
  it("supports case-sensitive matching and non-overlapping occurrences", () => {
    assert.equal(findEditorMatches(document("aAaA"), "aa").matches.length, 2);
    assert.equal(findEditorMatches(document("aAaA"), "aa", true).matches.length, 0);
    assert.equal(findEditorMatches(document("aaa"), "aa").matches.length, 1);
  });
  it("caps large result sets and distinguishes exact limit from overflow", () => {
    const full = findEditorMatches(document("字".repeat(MAX_SEARCH_MATCHES)), "字");
    assert.equal(full.truncated, false);
    const overflow = findEditorMatches(document("字".repeat(100000)), "字");
    assert.equal(overflow.matches.length, MAX_SEARCH_MATCHES);
    assert.equal(overflow.truncated, true);
  });
  it("replaces literally in a single undo event, separate from surrounding edits", () => {
    let state = EditorState.create({ schema, doc: document("山和山"), plugins: [history()] });
    const apply = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
    apply(state.tr.insertText("前", 1));
    apply(replaceEditorMatches(state, findEditorMatches(state.doc, "山").matches, "<img>$&"));
    apply(closeHistory(state.tr));
    assert.equal(state.doc.textContent, "前<img>$&和<img>$&");
    apply(state.tr.insertText("后", state.doc.content.size - 1));
    undo(state, apply);
    assert.equal(state.doc.textContent, "前<img>$&和<img>$&");
    undo(state, apply);
    assert.equal(state.doc.textContent, "前山和山");
    redo(state, apply);
    assert.equal(state.doc.textContent, "前<img>$&和<img>$&");
  });
  it("allows deletion and preserves marks for replacement text", () => {
    const doc = schema.node("doc", null, schema.node("paragraph", null, schema.text("山海", [schema.mark("bold")])));
    let state = EditorState.create({ schema, doc });
    state = state.apply(replaceEditorMatches(state, findEditorMatches(state.doc, "山").matches, "云"));
    assert.equal(state.doc.firstChild?.firstChild?.marks[0].type.name, "bold");
    state = state.apply(replaceEditorMatches(state, findEditorMatches(state.doc, "云").matches, ""));
    assert.equal(state.doc.textContent, "海");
  });
});
