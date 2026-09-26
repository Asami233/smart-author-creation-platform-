import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { RESERVE_AI_REQUEST_SQL, reportedTokens } from "../../server/ai/usage";

describe("AI daily attempt accounting", () => {
  it("counts cancelled attempts toward the daily limit without inventing provider tokens", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE ai_usage_daily (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, usage_date TEXT NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(owner_id, usage_date));`);
      const reserve = (id: number, limit: number) => db.prepare(RESERVE_AI_REQUEST_SQL)
        .get(String(id), "owner", "2026-09-26", "now", "now", limit);
      assert.equal(reserve(1, 2)?.request_count, 1);
      // A cancelled provider call has no completion token report, but still consumes a slot.
      assert.equal(reserve(2, 2)?.request_count, 2);
      assert.equal(reserve(3, 2), undefined);
      assert.deepEqual({ ...db.prepare("SELECT request_count, input_tokens, output_tokens FROM ai_usage_daily").get() }, {
        request_count: 2, input_tokens: 0, output_tokens: 0,
      });
    } finally { db.close(); }
  });

  it("ignores invalid or negative provider token reports", () => {
    assert.equal(reportedTokens(-1), 0);
    assert.equal(reportedTokens(Number.NaN), 0);
    assert.equal(reportedTokens(1.5), 0);
    assert.equal(reportedTokens(12), 12);
  });
});
