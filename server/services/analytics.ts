import { all, batch, first, statement } from "@/server/db";
import { AppError } from "@/server/errors";
import { isoNow, newId } from "@/server/text";
import { assertWorkOwned } from "./works";

export async function searchWork(workId: string, ownerId: string, rawQuery: string) {
  await assertWorkOwned(workId, ownerId);
  const query = rawQuery.trim();
  if (query.length < 1) return [];
  if (query.length > 100) throw new AppError(400, "QUERY_TOO_LONG", "搜索词不能超过 100 个字符");
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;

  const [chapters, characters, world, outlines] = await Promise.all([
    all<Record<string, unknown>>(
      `SELECT id, 'chapter' AS type, title, summary AS excerpt, updated_at AS updatedAt
       FROM chapters WHERE work_id = ? AND deleted_at IS NULL
         AND (title LIKE ? ESCAPE '\\' OR plain_text LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 30`,
      workId,
      pattern,
      pattern,
    ),
    all<Record<string, unknown>>(
      `SELECT id, 'character' AS type, name AS title, description AS excerpt, updated_at AS updatedAt
       FROM characters WHERE work_id = ?
         AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 20`,
      workId,
      pattern,
      pattern,
    ),
    all<Record<string, unknown>>(
      `SELECT id, 'world' AS type, name AS title, summary AS excerpt, updated_at AS updatedAt
       FROM world_entries WHERE work_id = ?
         AND (name LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 20`,
      workId,
      pattern,
      pattern,
      pattern,
    ),
    all<Record<string, unknown>>(
      `SELECT id, 'outline' AS type, title, content AS excerpt, updated_at AS updatedAt
       FROM outlines WHERE work_id = ?
         AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 20`,
      workId,
      pattern,
      pattern,
    ),
  ]);

  return [...chapters, ...characters, ...world, ...outlines].map((item) => ({
    ...item,
    excerpt: String(item.excerpt ?? "").slice(0, 240),
  }));
}

export async function getWorkStats(workId: string, ownerId: string) {
  const work = await assertWorkOwned(workId, ownerId);
  const [summary, daily] = await Promise.all([
    first<{ total_words: number; chapter_count: number; completed_count: number }>(
      `SELECT COALESCE(SUM(word_count), 0) AS total_words,
              COUNT(*) AS chapter_count,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count
       FROM chapters WHERE work_id = ? AND deleted_at IS NULL`,
      workId,
    ),
    all<{ stat_date: string; target_words: number; words_written: number }>(
      `SELECT stat_date, target_words, words_written
       FROM writing_daily_stats WHERE work_id = ?
       ORDER BY stat_date DESC LIMIT 90`,
      workId,
    ),
  ]);

  let streakDays = 0;
  const activeDates = new Set(daily.filter((item) => item.words_written > 0).map((item) => item.stat_date));
  const cursor = new Date();
  for (let index = 0; index < 366; index += 1) {
    const date = cursor.toISOString().slice(0, 10);
    if (!activeDates.has(date)) break;
    streakDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return {
    totalWords: summary?.total_words ?? 0,
    targetWords: work.target_words,
    chapterCount: summary?.chapter_count ?? 0,
    completedChapterCount: summary?.completed_count ?? 0,
    streakDays,
    daily: daily.map((item) => ({
      date: item.stat_date,
      targetWords: item.target_words,
      wordsWritten: item.words_written,
    })),
  };
}

export async function setWritingGoal(
  workId: string,
  ownerId: string,
  date: string,
  targetWords: number,
) {
  await assertWorkOwned(workId, ownerId);
  const now = isoNow();
  await batch([
    statement(
      `INSERT INTO writing_daily_stats
       (id, work_id, stat_date, target_words, words_written, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(work_id, stat_date) DO UPDATE SET
         target_words = excluded.target_words, updated_at = excluded.updated_at`,
      newId(),
      workId,
      date,
      targetWords,
      now,
      now,
    ),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, workId),
  ]);
  return getWorkStats(workId, ownerId);
}
