type PasteClipboard = { getData(type: string): string };
type WriteClipboard = { writeText(text: string): Promise<void> };

/** Empty or non-text clipboard data must not replace the editor selection. */
export function chapterPasteText(clipboard: PasteClipboard | null): string | null {
  const text = clipboard?.getData("text/plain") ?? "";
  return text.length ? text : null;
}

/** Only report success after the browser has accepted the clipboard write. */
export async function copyEditorText(text: string, clipboard: WriteClipboard | undefined): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
