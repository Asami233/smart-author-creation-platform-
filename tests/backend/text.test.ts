import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countWords, htmlToPlainText } from "../../server/text";

describe("text utilities", () => {
  it("converts rich text into exportable paragraphs", () => {
    assert.equal(
      htmlToPlainText("<p>第一段&nbsp;文字</p><p><strong>第二段</strong></p>"),
      "第一段 文字\n第二段",
    );
  });

  it("counts Chinese characters and Latin letters without whitespace", () => {
    assert.equal(countWords("青山 ABC\n123"), 8);
  });
});
