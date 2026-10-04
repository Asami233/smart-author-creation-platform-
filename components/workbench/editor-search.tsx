"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { findEditorMatches, MAX_SEARCH_MATCHES, replaceEditorMatches } from "@/lib/client/editor-search";
import { canHandleEditorKey } from "@/lib/client/editor-keyboard";

export function EditorSearch({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const subscribe = useCallback((notify: () => void) => {
    editor.on("transaction", notify);
    return () => { editor.off("transaction", notify); };
  }, [editor]);
  const snapshot = useCallback(() => editor.state.doc, [editor]);
  const doc = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { matches, truncated } = useMemo(() => findEditorMatches(doc, query, matchCase), [doc, query, matchCase]);
  const current = Math.min(index, Math.max(0, matches.length - 1));

  function selectMatch(next: number) {
    if (editor.isDestroyed || !matches.length) return;
    const target = (next + matches.length) % matches.length;
    setIndex(target);
    editor.chain().focus().setTextSelection(matches[target]).scrollIntoView().run();
  }

  function replace(all: boolean) {
    if (editor.isDestroyed) return;
    const fresh = findEditorMatches(editor.state.doc, query, matchCase);
    if (!fresh.matches.length || (all && fresh.truncated)) return;
    const targets = all ? fresh.matches : [fresh.matches[Math.min(current, fresh.matches.length - 1)]];
    editor.view.dispatch(replaceEditorMatches(editor.state, targets, replacement));
    // Separate this operation from both earlier and subsequent typing in undo history.
    editor.view.dispatch(closeHistory(editor.state.tr));
    setNotice(`已替换 ${targets.length} 处，可撤销恢复。`);
    setIndex(all ? 0 : current);
  }

  return (
    <section className="editor-search" aria-label="本章查找替换" onKeyDown={(event) => {
      if (event.key === "Escape" && canHandleEditorKey(event.nativeEvent)) {
        event.preventDefault(); event.stopPropagation(); onClose();
      }
    }}>
      <div className="editor-search-row">
        <label>查找<input id="editor-find-query" autoFocus value={query} maxLength={200} placeholder="输入本章文字" onChange={(event) => {
          setQuery(event.target.value); setIndex(0); setNotice("");
        }} onKeyDown={(event) => {
          if (event.key === "Enter" && canHandleEditorKey(event.nativeEvent)) {
            event.preventDefault();
            const match = matches[current];
            const selected = match && editor.state.selection.from === match.from && editor.state.selection.to === match.to;
            selectMatch(current + (event.shiftKey ? -1 : selected ? 1 : 0));
          }
        }} /></label>
        <span className="editor-search-count" role="status">{matches.length ? `${current + 1} / ${matches.length}${truncated ? "+" : ""}` : query ? "无匹配" : "仅当前章节"}</span>
        <button type="button" disabled={!matches.length} aria-label="上一个匹配" onClick={() => selectMatch(current - 1)}><ArrowUp size={16} /></button>
        <button type="button" disabled={!matches.length} aria-label="下一个匹配" onClick={() => selectMatch(current + 1)}><ArrowDown size={16} /></button>
        <button type="button" aria-label="关闭查找替换" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="editor-search-row">
        <label>替换<input value={replacement} maxLength={1000} placeholder="留空表示删除匹配文字" onChange={(event) => setReplacement(event.target.value)} /></label>
        <button type="button" disabled={!matches.length} onClick={() => replace(false)}>替换当前</button>
        <button type="button" disabled={!matches.length || truncated} onClick={() => replace(true)}>全部替换</button>
        <label className="editor-search-case"><input type="checkbox" checked={matchCase} onChange={(event) => { setMatchCase(event.target.checked); setIndex(0); }} />区分大小写</label>
      </div>
      <p role="status">{truncated ? `匹配超过 ${MAX_SEARCH_MATCHES} 处，请缩小查找范围后再全部替换。` : notice || "按文字查找，不跨段落；替换遵循自动保存，可用撤销恢复。"}</p>
    </section>
  );
}
