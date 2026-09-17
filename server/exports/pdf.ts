const encoder = new TextEncoder();

function utf16beHex(value: string): string {
  let hex = "feff";
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0xffff) {
      hex += codePoint.toString(16).padStart(4, "0");
    } else {
      const adjusted = codePoint - 0x10000;
      const high = 0xd800 + (adjusted >>> 10);
      const low = 0xdc00 + (adjusted & 0x3ff);
      hex += high.toString(16).padStart(4, "0") + low.toString(16).padStart(4, "0");
    }
  }
  return hex;
}

function splitVisualLines(value: string, maxChars: number): string[] {
  const output: string[] = [];
  for (const paragraph of value.split(/\n+/)) {
    const chars = Array.from(paragraph.trim());
    if (chars.length === 0) {
      output.push("");
      continue;
    }
    for (let index = 0; index < chars.length; index += maxChars) {
      output.push(chars.slice(index, index + maxChars).join(""));
    }
  }
  return output;
}

export function buildPdf(title: string, volumes: Array<{ title: string; chapters: Array<{ title: string; text: string }> }>): Uint8Array {
  const lines: Array<{ text: string; size: number; gapAfter?: number }> = [
    { text: title, size: 22, gapAfter: 22 },
  ];
  for (const volume of volumes) {
    lines.push({ text: volume.title, size: 18, gapAfter: 14 });
    for (const chapter of volume.chapters) {
      lines.push({ text: chapter.title, size: 16, gapAfter: 12 });
      for (const line of splitVisualLines(chapter.text, 32)) {
        lines.push({ text: line ? `　　${line}` : "", size: 12, gapAfter: line ? 5 : 10 });
      }
      lines.push({ text: "", size: 12, gapAfter: 18 });
    }
  }

  const pages: Array<Array<{ text: string; size: number; y: number }>> = [];
  let page: Array<{ text: string; size: number; y: number }> = [];
  let y = 790;
  for (const line of lines) {
    const lineHeight = line.size * 1.75 + (line.gapAfter ?? 0);
    if (y - lineHeight < 55 && page.length > 0) {
      pages.push(page);
      page = [];
      y = 790;
    }
    if (line.text) page.push({ text: line.text, size: line.size, y });
    y -= lineHeight;
  }
  if (page.length || pages.length === 0) pages.push(page);

  const objects: string[] = [];
  const addObject = (value: string) => {
    objects.push(value);
    return objects.length;
  };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontId = addObject("");
  const cidFontId = addObject("");
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const commands = pageLines
      .map((line) => `BT /F1 ${line.size} Tf 66 ${line.y.toFixed(1)} Td <${utf16beHex(line.text)}> Tj ET`)
      .join("\n");
    const contentId = addObject(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[fontId - 1] = `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${cidFontId} 0 R] >>`;
  objects[cidFontId - 1] = `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> >>`;

  let output = "%PDF-1.4\n%----\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(output);
}
