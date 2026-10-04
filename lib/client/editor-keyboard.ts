type EditorKeyEvent = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  defaultPrevented?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

export function canHandleEditorKey(event: EditorKeyEvent): boolean {
  // Some IMEs report 229 even when isComposing is false on the commit key.
  return !event.defaultPrevented && !event.isComposing && event.keyCode !== 229;
}

export function getEditorShortcut(event: EditorKeyEvent): "find" | "jump" | "save" | "escape" | null {
  if (!canHandleEditorKey(event)) return null;
  if (event.key === "Escape") return "escape";
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  switch (event.key.toLowerCase()) {
    case "f":
    case "h": return "find";
    case "j": return "jump";
    case "s": return "save";
    default: return null;
  }
}
