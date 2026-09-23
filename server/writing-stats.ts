import type { WritingDayStats } from "../contracts/types";
import { localDateKey } from "./text";

/** Counts a streak ending today, using Shanghai calendar days, not UTC dates. */
export function summarizeWritingDays(rows: WritingDayStats[], now = new Date()) {
  const today = localDateKey(now);
  const todayRow = rows.find((row) => row.date === today);
  const activeDates = new Set(rows.filter((row) => row.wordsWritten > 0).map((row) => row.date));
  // UTC arithmetic here operates on an already-resolved calendar date, so the
  // host timezone and daylight-saving offsets cannot alter the previous day.
  const cursor = new Date(`${today}T00:00:00.000Z`);
  let streakDays = 0;
  while (activeDates.has(cursor.toISOString().slice(0, 10))) {
    streakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return {
    timeZone: "Asia/Shanghai" as const,
    today,
    todayWordsWritten: todayRow?.wordsWritten ?? 0,
    todayTargetWords: todayRow?.targetWords ?? null,
    streakDays,
    // Preserve the existing response bound without truncating streak counting.
    daily: [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 90),
  };
}
