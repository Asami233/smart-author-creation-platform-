import type {
  CreateVolumeInput,
  CreateWorkInput,
  UpdateVolumeInput,
  UpdateWorkInput,
} from "@/contracts";
import { all, batch, first, run, statement } from "@/server/db";
import { notFound } from "@/server/errors";
import { isoNow, newId } from "@/server/text";

type WorkRow = {
  id: string;
  title: string;
  description: string;
  genre: string;
  status: string;
  target_words: number;
  created_at: string;
  updated_at: string;
  total_words?: number;
  chapter_count?: number;
};

type VolumeRow = {
  id: string;
  work_id: string;
  title: string;
  summary: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ChapterSummaryRow = {
  id: string;
  work_id: string;
  volume_id: string | null;
  title: string;
  summary: string;
  word_count: number;
  status: string;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
};

export function mapWork(row: WorkRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    genre: row.genre,
    status: row.status,
    targetWords: row.target_words,
    totalWords: row.total_words ?? 0,
    chapterCount: row.chapter_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVolume(row: VolumeRow) {
  return {
    id: row.id,
    workId: row.work_id,
    title: row.title,
    summary: row.summary,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChapterSummary(row: ChapterSummaryRow) {
  return {
    id: row.id,
    workId: row.work_id,
    volumeId: row.volume_id,
    title: row.title,
    summary: row.summary,
    wordCount: row.word_count,
    status: row.status,
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function assertWorkOwned(workId: string, ownerId: string): Promise<WorkRow> {
  const row = await first<WorkRow>(
    `SELECT id, title, description, genre, status, target_words, created_at, updated_at
     FROM works WHERE id = ? AND owner_id = ? AND status != 'archived'`,
    workId,
    ownerId,
  );
  if (!row) notFound("作品");
  return row;
}

export async function listWorks(ownerId: string) {
  const rows = await all<WorkRow>(
    `SELECT w.id, w.title, w.description, w.genre, w.status, w.target_words,
            w.created_at, w.updated_at,
            COALESCE(SUM(CASE WHEN c.deleted_at IS NULL THEN c.word_count ELSE 0 END), 0) AS total_words,
            COUNT(CASE WHEN c.deleted_at IS NULL THEN c.id END) AS chapter_count
     FROM works w
     LEFT JOIN chapters c ON c.work_id = w.id
     WHERE w.owner_id = ? AND w.status != 'archived'
     GROUP BY w.id
     ORDER BY w.updated_at DESC`,
    ownerId,
  );
  return rows.map(mapWork);
}

export async function createWork(ownerId: string, input: CreateWorkInput) {
  const workId = newId();
  const volumeId = newId();
  const chapterId = newId();
  const now = isoNow();

  await batch([
    statement(
      `INSERT INTO works
       (id, owner_id, title, description, genre, status, target_words, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      workId,
      ownerId,
      input.title,
      input.description,
      input.genre,
      input.targetWords,
      now,
      now,
    ),
    statement(
      `INSERT INTO volumes (id, work_id, title, summary, sort_order, created_at, updated_at)
       VALUES (?, ?, '第一卷', '', 0, ?, ?)`,
      volumeId,
      workId,
      now,
      now,
    ),
    statement(
      `INSERT INTO chapters
       (id, work_id, volume_id, title, summary, content, plain_text, word_count, status, sort_order, revision, created_at, updated_at)
       VALUES (?, ?, ?, '第一章 未命名章节', '', '', '', 0, 'draft', 0, 1, ?, ?)`,
      chapterId,
      workId,
      volumeId,
      now,
      now,
    ),
  ]);

  return getWorkspace(workId, ownerId);
}

export async function getWorkspace(workId: string, ownerId: string) {
  const work = await assertWorkOwned(workId, ownerId);
  const [volumeRows, chapterRows] = await Promise.all([
    all<VolumeRow>(
      `SELECT id, work_id, title, summary, sort_order, created_at, updated_at
       FROM volumes WHERE work_id = ? ORDER BY sort_order, created_at`,
      workId,
    ),
    all<ChapterSummaryRow>(
      `SELECT id, work_id, volume_id, title, summary, word_count, status,
              sort_order, revision, created_at, updated_at
       FROM chapters
       WHERE work_id = ? AND deleted_at IS NULL
       ORDER BY COALESCE(volume_id, ''), sort_order, created_at`,
      workId,
    ),
  ]);

  return {
    work: mapWork({
      ...work,
      total_words: chapterRows.reduce((sum, chapter) => sum + chapter.word_count, 0),
      chapter_count: chapterRows.length,
    }),
    volumes: volumeRows.map(mapVolume),
    chapters: chapterRows.map(mapChapterSummary),
  };
}

export async function updateWork(workId: string, ownerId: string, input: UpdateWorkInput) {
  await assertWorkOwned(workId, ownerId);
  const columns: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    values.push(value);
  };

  if (input.title !== undefined) add("title", input.title);
  if (input.description !== undefined) add("description", input.description);
  if (input.genre !== undefined) add("genre", input.genre);
  if (input.targetWords !== undefined) add("target_words", input.targetWords);
  if (input.status !== undefined) add("status", input.status);
  add("updated_at", isoNow());

  await run(
    `UPDATE works SET ${columns.join(", ")} WHERE id = ? AND owner_id = ?`,
    ...values,
    workId,
    ownerId,
  );
  return getWorkspace(workId, ownerId);
}

export async function archiveWork(workId: string, ownerId: string): Promise<void> {
  await assertWorkOwned(workId, ownerId);
  await run(
    "UPDATE works SET status = 'archived', updated_at = ? WHERE id = ? AND owner_id = ?",
    isoNow(),
    workId,
    ownerId,
  );
}

export async function listVolumes(workId: string, ownerId: string) {
  await assertWorkOwned(workId, ownerId);
  const rows = await all<VolumeRow>(
    `SELECT id, work_id, title, summary, sort_order, created_at, updated_at
     FROM volumes WHERE work_id = ? ORDER BY sort_order, created_at`,
    workId,
  );
  return rows.map(mapVolume);
}

export async function createVolume(workId: string, ownerId: string, input: CreateVolumeInput) {
  await assertWorkOwned(workId, ownerId);
  const id = newId();
  const now = isoNow();
  const orderRow = await first<{ next_order: number }>(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM volumes WHERE work_id = ?",
    workId,
  );
  const sortOrder = input.sortOrder ?? orderRow?.next_order ?? 0;

  await batch([
    statement(
      `INSERT INTO volumes (id, work_id, title, summary, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      workId,
      input.title,
      input.summary,
      sortOrder,
      now,
      now,
    ),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, workId),
  ]);
  return getVolume(id, ownerId);
}

export async function getVolume(volumeId: string, ownerId: string) {
  const row = await first<VolumeRow>(
    `SELECT v.id, v.work_id, v.title, v.summary, v.sort_order, v.created_at, v.updated_at
     FROM volumes v JOIN works w ON w.id = v.work_id
     WHERE v.id = ? AND w.owner_id = ? AND w.status != 'archived'`,
    volumeId,
    ownerId,
  );
  if (!row) notFound("分卷");
  return mapVolume(row);
}

export async function updateVolume(volumeId: string, ownerId: string, input: UpdateVolumeInput) {
  const volume = await getVolume(volumeId, ownerId);
  const columns: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) {
    columns.push("title = ?");
    values.push(input.title);
  }
  if (input.summary !== undefined) {
    columns.push("summary = ?");
    values.push(input.summary);
  }
  if (input.sortOrder !== undefined) {
    columns.push("sort_order = ?");
    values.push(input.sortOrder);
  }
  columns.push("updated_at = ?");
  values.push(isoNow());
  await run(`UPDATE volumes SET ${columns.join(", ")} WHERE id = ?`, ...values, volumeId);
  await run("UPDATE works SET updated_at = ? WHERE id = ?", isoNow(), volume.workId);
  return getVolume(volumeId, ownerId);
}

export async function deleteVolume(volumeId: string, ownerId: string): Promise<void> {
  const volume = await getVolume(volumeId, ownerId);
  const now = isoNow();
  await batch([
    statement("UPDATE chapters SET volume_id = NULL, updated_at = ? WHERE volume_id = ?", now, volumeId),
    statement("DELETE FROM volumes WHERE id = ?", volumeId),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", now, volume.workId),
  ]);
}
