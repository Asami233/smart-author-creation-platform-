import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countChapterWords, escapeChapterText, plainChapterText } from "../../lib/client/chapter-text";

describe("chapter text shown by the editor", () => {
  it("counts escaped pasted markup as visible text, not entity source bytes", () => {
    const html = "<p>&lt;img src=x&gt;中文&amp;小说</p>";
    assert.equal(plainChapterText(html), "<imgsrc=x>中文&小说");
    assert.equal(countChapterWords(html), 15);
  });

  it("counts supplementary characters once, like the server", () => {
    assert.equal(countChapterWords("<p>山海😀</p>"), 3);
    assert.equal(countChapterWords("<ul><li>甲</li><li>乙</li></ul>"), 4);
  });

  it("escapes restored plain text before converting it to HTML", () => {
    assert.equal(escapeChapterText('<img src="x" onerror=\'bad()\'>'),
      "&lt;img src=&quot;x&quot; onerror=&#39;bad()&#39;&gt;");
  });
});
