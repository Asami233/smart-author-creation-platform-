import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDocx } from "../../server/exports/docx";
import { buildPdf } from "../../server/exports/pdf";

const volumes = [
  {
    title: "卷一 · 雨夜故人",
    chapters: [{ title: "第一章 雨夜来客", text: "雨下到第三更。\n沈砚推开了门。" }],
  },
];

describe("novel exports", () => {
  it("builds an OOXML zip package", () => {
    const bytes = buildDocx("长夜行", volumes);
    assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
    assert.ok(bytes.length > 1000);
  });

  it("builds a PDF with a Simplified Chinese CID font", () => {
    const bytes = buildPdf("长夜行", volumes);
    const text = new TextDecoder().decode(bytes);
    assert.equal(text.startsWith("%PDF-1.4"), true);
    assert.ok(text.includes("/STSong-Light"));
    assert.ok(text.includes("%%EOF"));
  });
});
