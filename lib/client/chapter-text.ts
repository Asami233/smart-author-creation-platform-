const namedEntities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

/** Mirrors the server's entity decoding before counting visible chapter characters. */
export function plainChapterText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|blockquote|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized.startsWith("#")) {
        const codepoint = normalized.startsWith("#x")
          ? Number.parseInt(normalized.slice(2), 16)
          : Number.parseInt(normalized.slice(1), 10);
        return Number.isInteger(codepoint) && codepoint >= 0 && codepoint <= 0x10ffff
          ? String.fromCodePoint(codepoint) : match;
      }
      return namedEntities[normalized] ?? match;
    })
    .replace(/\s+/g, "")
    .trim();
}

export function countChapterWords(html: string): number {
  return countVisibleCharacters(plainChapterText(html));
}

function countVisibleCharacters(text: string): number {
  let count = 0;
  // Iterate code points without allocating a 100,000-element temporary array.
  for (let offset = 0; offset < text.length; offset += 1) {
    if (text.codePointAt(offset)! > 0xffff) offset += 1;
    count += 1;
  }
  return count;
}

/** Per-workbench single-entry cache; never retains every chapter or every edit. */
export function createChapterTextAnalyzer() {
  let previousHtml: string | undefined;
  let previousResult: Readonly<{ text: string; wordCount: number }> | undefined;
  return (html: string) => {
    if (html === previousHtml && previousResult) return previousResult;
    const text = plainChapterText(html);
    previousHtml = html;
    previousResult = Object.freeze({ text, wordCount: countVisibleCharacters(text) });
    return previousResult;
  };
}

export function escapeChapterText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
