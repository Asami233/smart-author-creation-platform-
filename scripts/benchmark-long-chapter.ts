/** CPU microbenchmark only: no database, browser automation, or timing assertions. */
import { performance } from "node:perf_hooks";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { createChapterTextAnalyzer, plainChapterText } from "../lib/client/chapter-text";
import { findEditorMatches, replaceEditorMatches } from "../lib/client/editor-search";

const paragraph = `起${"山海".repeat(49)}终`;
const html = `<p>${paragraph}</p>`.repeat(1000);
const schema = new Schema({ nodes: {
  doc: { content: "paragraph+" }, paragraph: { content: "text*" }, text: {},
} });
const doc = schema.node("doc", null, Array.from({ length: 1000 }, () =>
  schema.node("paragraph", null, schema.text(paragraph))));
const state = EditorState.create({ schema, doc });
const matches = findEditorMatches(doc, "起").matches;
function measure(name: string, operation: (iteration: number) => void) {
  for (let i = 0; i < 10; i++) operation(i);
  const samples = Array.from({ length: 60 }, (_, i) => {
    const start = performance.now();
    operation(i);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return { name, samples: samples.length, p50Ms: +samples[29].toFixed(3),
    p95Ms: +samples[56].toFixed(3), maxMs: +samples[59].toFixed(3) };
}
const analyze = createChapterTextAnalyzer();
const results = [
  measure("previous-count-and-context-pattern (5 counts + text)", (i) => {
    const input = `${html}<p>${i}</p>`;
    for (let n = 0; n < 5; n++) Array.from(plainChapterText(input));
    plainChapterText(input);
  }),
  measure("one-analysis-and-5-cache-hits", (i) => {
    const input = `${html}<p>${i}</p>`;
    for (let n = 0; n < 6; n++) analyze(input);
  }),
  measure("literal-search-1000-matches", () => { findEditorMatches(doc, "起"); }),
  measure("replace-1000-matches-and-apply", () => {
    state.apply(replaceEditorMatches(state, matches, "始"));
  }),
];
console.log(JSON.stringify({ node: process.version, paragraphs: 1000, visibleCharacters: 100000,
  note: "Warm Node CPU measurements, not browser input latency, rendering, saving, or memory metrics.", results }, null, 2));
