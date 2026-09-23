import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reorderVolumesSchema, updateWritingGoalSchema } from "../../contracts/schemas";
import { summarizeWritingDays } from "../../server/writing-stats";

describe("Shanghai writing statistics", () => {
  const rows = [
    { date: "2026-09-22", targetWords: 3000, wordsWritten: 10 },
    { date: "2026-09-23", targetWords: 0, wordsWritten: 20 },
  ];
  it("changes day at Shanghai midnight and preserves zero goals", () => {
    const before = summarizeWritingDays(rows, new Date("2026-09-22T15:59:59Z"));
    const after = summarizeWritingDays(rows, new Date("2026-09-22T16:00:00Z"));
    assert.equal(before.today, "2026-09-22");
    assert.equal(before.streakDays, 1);
    assert.equal(after.today, "2026-09-23");
    assert.equal(after.timeZone, "Asia/Shanghai");
    assert.equal(after.streakDays, 2);
    assert.equal(after.todayWordsWritten, 20);
    assert.equal(after.todayTargetWords, 0);
  });
  it("distinguishes missing daily goals from explicit zero and ends streaks on gaps", () => {
    const missing = summarizeWritingDays(rows, new Date("2026-09-23T16:00:00Z"));
    assert.equal(missing.todayTargetWords, null);
    assert.equal(missing.todayWordsWritten, 0);
    assert.equal(missing.streakDays, 0);
    const gap = summarizeWritingDays([
      { date: "2026-03-01", targetWords: 0, wordsWritten: 1 },
      { date: "2026-02-28", targetWords: 3000, wordsWritten: 0 },
      { date: "2026-02-27", targetWords: 3000, wordsWritten: 1 },
    ], new Date("2026-02-28T16:00:00Z"));
    assert.equal(gap.streakDays, 1);
  });
  it("does not cap the streak at the 90-row response limit", () => {
    const cursor = new Date("2026-03-15T00:00:00Z");
    const history = Array.from({ length: 100 }, () => {
      const row = { date: cursor.toISOString().slice(0, 10), targetWords: 3000, wordsWritten: 1 };
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      return row;
    });
    const result = summarizeWritingDays(history.reverse(), new Date("2026-03-15T03:00:00Z"));
    assert.equal(result.streakDays, 100);
    assert.equal(result.daily.length, 90);
    assert.equal(result.daily[0].date, "2026-03-15");
  });
});

describe("volume order and daily goal contracts", () => {
  it("requires a nonempty bounded unique UUID list", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    assert.equal(reorderVolumesSchema.safeParse({ volumeIds: [id] }).success, true);
    for (const volumeIds of [[], [id, id], ["bad-id"], Array(501).fill(id)]) {
      assert.equal(reorderVolumesSchema.safeParse({ volumeIds }).success, false);
    }
  });
  it("rejects impossible dates and invalid goal values", () => {
    for (const date of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-01", "bad"]) {
      assert.equal(updateWritingGoalSchema.safeParse({ date, targetWords: 0 }).success, false);
    }
    assert.equal(updateWritingGoalSchema.safeParse({ date: "2024-02-29", targetWords: 0 }).success, true);
    for (const targetWords of [-1, 0.5, 100001]) {
      assert.equal(updateWritingGoalSchema.safeParse({ date: "2026-09-23", targetWords }).success, false);
    }
  });
});
