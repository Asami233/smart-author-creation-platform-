"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { filterChapterJumpItems, type ChapterJumpItem } from "@/lib/client/chapter-navigation";
import { canHandleEditorKey } from "@/lib/client/editor-keyboard";

export function ChapterJumpDialog({ open, onOpenChange, items, selectedId, onJump }: {
  open: boolean; onOpenChange: (open: boolean) => void; items: ChapterJumpItem[];
  selectedId: string | null; onJump: (id: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = useMemo(() => filterChapterJumpItems(items, query), [items, query]);
  async function jump(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (await onJump(id)) onOpenChange(false);
      else setError("未切换章节。请检查网络或处理当前草稿的保存/冲突，再重试。");
    } catch {
      setError("跳转失败，当前稿件未被替换，请重试。");
    } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="sm:max-w-xl" onEscapeKeyDown={(event) => {
      if (!canHandleEditorKey(event)) event.preventDefault();
    }}>
      <DialogHeader><DialogTitle>跳转章节</DialogTitle><DialogDescription>
        输入章节标题、卷名或目录序号。只搜索当前作品目录，不检索正文。
      </DialogDescription></DialogHeader>
      <label className="field-label">查找章节
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：重逢、第一卷、3" maxLength={160}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canHandleEditorKey(event.nativeEvent) && matches.length === 1) {
              event.preventDefault(); void jump(matches[0].id);
            }
          }} />
      </label>
      <p className="text-sm text-muted-foreground" role="status">{busy ? "正在安全加载章节…" : `共 ${matches.length} 章${matches.length > 100 ? "，显示前 100 项，请细化搜索" : ""}`}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="max-h-[45vh] overflow-y-auto space-y-1" aria-label="章节跳转结果">
        {!matches.length && <p className="text-sm py-6 text-center text-muted-foreground">没有匹配的章节</p>}
        {matches.slice(0, 100).map((item) => <button key={item.id} type="button" disabled={busy}
          aria-current={item.id === selectedId ? "true" : undefined} onClick={() => void jump(item.id)}
          className="w-full text-left rounded-lg border px-3 py-3 hover:bg-[#e5eeea] focus-visible:outline-2 focus-visible:outline-[#176b5b] disabled:opacity-50">
          <span className="block text-sm font-medium">{item.ordinal}. {item.title}{item.id === selectedId ? "（当前）" : ""}</span>
          <span className="block text-xs text-muted-foreground mt-1">{item.volumeTitle}</span>
        </button>)}
      </div>
    </DialogContent>
  </Dialog>;
}
