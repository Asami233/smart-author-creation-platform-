import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatLocalDateTime } from "../../lib/client/date-format";

describe("trash timestamp formatting", () => {
  it("formats a valid archive timestamp instead of showing Invalid Date", () => {
    const formatted = formatLocalDateTime("2026-09-26T02:30:00.000Z");

    assert.notEqual(formatted, "Invalid Date");
    assert.match(formatted, /2026/);
  });

  it("uses a readable fallback for missing or invalid timestamps", () => {
    assert.equal(formatLocalDateTime(undefined), "时间未知");
    assert.equal(formatLocalDateTime("not-a-date"), "时间未知");
    assert.equal(formatLocalDateTime(null, "未知"), "未知");
  });
});
