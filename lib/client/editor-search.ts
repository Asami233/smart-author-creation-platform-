import type { Node } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

export const MAX_SEARCH_MATCHES = 2000;
export type TextMatch = { from: number; to: number };

/** Literal, non-overlapping matches. Positions use ProseMirror's UTF-16 offsets. */
export function findEditorMatches(doc: Node, query: string, matchCase = false) {
  const matches: TextMatch[] = [];
  let truncated = false;
  if (!query) return { matches, truncated };
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "gu" : "giu");
  const search = (text: string, start: number) => {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (matches.length === MAX_SEARCH_MATCHES) {
        truncated = true;
        break;
      }
      matches.push({ from: start + match.index, to: start + match.index + match[0].length });
    }
  };
  doc.descendants((node, pos) => {
    if (truncated) return false;
    if (!node.isTextblock) return;
    let text = "";
    let start = pos + 1;
    node.forEach((child, offset) => {
      if (truncated) return;
      if (child.isText) {
        if (!text) start = pos + 1 + offset;
        text += child.text;
      } else {
        search(text, start);
        text = "";
      }
    });
    if (!truncated) search(text, start);
    return false;
  });
  return { matches, truncated };
}

/** Caller supplies freshly computed matches; reverse order keeps earlier offsets valid. */
export function replaceEditorMatches(state: EditorState, matches: TextMatch[], replacement: string) {
  const tr = closeHistory(state.tr);
  for (const match of [...matches].reverse()) {
    // insertText never parses replacement as HTML and retains marks at the match start.
    tr.insertText(replacement, match.from, match.to);
  }
  return tr;
}
