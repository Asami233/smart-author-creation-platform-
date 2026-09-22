import {
  createCharacterSchema,
  createOutlineSchema,
  createTimelineEventSchema,
  createWorldEntrySchema,
  type KnowledgeKind,
  updateCharacterSchema,
  updateOutlineSchema,
  updateTimelineEventSchema,
  updateWorldEntrySchema,
} from "@/contracts";
import { all, batch, first, run, statement } from "@/server/db";
import { conflict, notFound } from "@/server/errors";
import { isoNow, newId, safeJsonParse } from "@/server/text";
import { getChapterRow } from "./chapters";
import { assertWorkOwned } from "./works";

type GenericRow = Record<string, unknown> & {
  id: string;
  work_id: string;
  created_at: string;
  updated_at: string;
};

const tableByKind: Record<KnowledgeKind, string> = {
  outlines: "outlines",
  characters: "characters",
  world: "world_entries",
  timeline: "timeline_events",
};

function mapRow(kind: KnowledgeKind, row: GenericRow) {
  const base = {
    id: row.id,
    workId: row.work_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (kind === "outlines") {
    return {
      ...base,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      title: row.title,
      content: row.content,
      sortOrder: row.sort_order,
    };
  }
  if (kind === "characters") {
    return {
      ...base,
      name: row.name,
      role: row.role,
      aliases: safeJsonParse(String(row.aliases_json ?? "[]"), []),
      description: row.description,
      personality: row.personality,
      motivation: row.motivation,
      characterArc: row.character_arc,
      metadata: safeJsonParse(String(row.metadata_json ?? "{}"), {}),
    };
  }
  if (kind === "world") {
    return {
      ...base,
      category: row.category,
      name: row.name,
      summary: row.summary,
      content: row.content,
      metadata: safeJsonParse(String(row.metadata_json ?? "{}"), {}),
    };
  }
  return {
    ...base,
    title: row.title,
    description: row.description,
    storyTime: row.story_time,
    sortOrder: row.sort_order,
    relatedChapterId: row.related_chapter_id,
    participantIds: safeJsonParse(String(row.participants_json ?? "[]"), []),
  };
}

function selectColumns(kind: KnowledgeKind): string {
  switch (kind) {
    case "outlines":
      return "id, work_id, scope_type, scope_id, title, content, sort_order, created_at, updated_at";
    case "characters":
      return "id, work_id, name, role, aliases_json, description, personality, motivation, character_arc, metadata_json, created_at, updated_at";
    case "world":
      return "id, work_id, category, name, summary, content, metadata_json, created_at, updated_at";
    case "timeline":
      return "id, work_id, title, description, story_time, sort_order, related_chapter_id, participants_json, created_at, updated_at";
  }
}

function orderBy(kind: KnowledgeKind): string {
  if (kind === "characters") return "name, created_at";
  if (kind === "world") return "category, name, created_at";
  return "sort_order, created_at";
}

async function assertOutlineScope(
  workId: string,
  scopeType: "work" | "volume" | "chapter",
  scopeId: string | null | undefined,
): Promise<void> {
  if (scopeType === "work") {
    if (scopeId && scopeId !== workId) conflict("作品级大纲不能关联其他作品");
    return;
  }
  if (!scopeId) conflict("分卷或章节大纲必须指定关联对象");
  const table = scopeType === "volume" ? "volumes" : "chapters";
  const row = await first<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ? AND work_id = ?${scopeType === "chapter" ? " AND deleted_at IS NULL" : ""}`,
    scopeId,
    workId,
  );
  if (!row) conflict("大纲关联对象不属于当前作品");
}

async function assertTimelineParticipants(workId: string, participantIds: string[]): Promise<void> {
  if (participantIds.length === 0) return;
  const uniqueIds = [...new Set(participantIds)];
  if (uniqueIds.length !== participantIds.length) conflict("参与角色列表包含重复对象");
  const rows = await all<{ id: string }>(
    `SELECT id FROM characters WHERE work_id = ? AND id IN (${uniqueIds.map(() => "?").join(",")})`,
    workId,
    ...uniqueIds,
  );
  if (rows.length !== uniqueIds.length) conflict("参与角色不属于当前作品");
}

export async function listKnowledge(workId: string, ownerId: string, kind: KnowledgeKind) {
  await assertWorkOwned(workId, ownerId);
  const rows = await all<GenericRow>(
    `SELECT ${selectColumns(kind)} FROM ${tableByKind[kind]}
     WHERE work_id = ? ORDER BY ${orderBy(kind)}`,
    workId,
  );
  return rows.map((row) => mapRow(kind, row));
}

export async function getKnowledge(kind: KnowledgeKind, id: string, ownerId: string) {
  const row = await first<GenericRow>(
    `SELECT item.* FROM ${tableByKind[kind]} item
     JOIN works w ON w.id = item.work_id
     WHERE item.id = ? AND w.owner_id = ? AND w.status != 'archived'`,
    id,
    ownerId,
  );
  if (!row) notFound("设定条目");
  return mapRow(kind, row);
}

export async function createKnowledge(
  workId: string,
  ownerId: string,
  kind: KnowledgeKind,
  payload: unknown,
) {
  await assertWorkOwned(workId, ownerId);
  const id = newId();
  const now = isoNow();

  if (kind === "outlines") {
    const input = createOutlineSchema.parse(payload);
    await assertOutlineScope(workId, input.scopeType, input.scopeId);
    await run(
      `INSERT INTO outlines
       (id, work_id, scope_type, scope_id, title, content, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      workId,
      input.scopeType,
      input.scopeId ?? null,
      input.title,
      input.content,
      input.sortOrder ?? 0,
      now,
      now,
    );
  } else if (kind === "characters") {
    const input = createCharacterSchema.parse(payload);
    await run(
      `INSERT INTO characters
       (id, work_id, name, role, aliases_json, description, personality, motivation,
        character_arc, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      workId,
      input.name,
      input.role,
      JSON.stringify(input.aliases),
      input.description,
      input.personality,
      input.motivation,
      input.characterArc,
      JSON.stringify(input.metadata),
      now,
      now,
    );
  } else if (kind === "world") {
    const input = createWorldEntrySchema.parse(payload);
    await run(
      `INSERT INTO world_entries
       (id, work_id, category, name, summary, content, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      workId,
      input.category,
      input.name,
      input.summary,
      input.content,
      JSON.stringify(input.metadata),
      now,
      now,
    );
  } else {
    const input = createTimelineEventSchema.parse(payload);
    await assertTimelineParticipants(workId, input.participantIds);
    if (input.relatedChapterId) {
      const chapter = await first<{ id: string }>(
        "SELECT id FROM chapters WHERE id = ? AND work_id = ? AND deleted_at IS NULL",
        input.relatedChapterId,
        workId,
      );
      if (!chapter) conflict("关联章节不属于当前作品");
    }
    await run(
      `INSERT INTO timeline_events
       (id, work_id, title, description, story_time, sort_order, related_chapter_id,
        participants_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      workId,
      input.title,
      input.description,
      input.storyTime,
      input.sortOrder ?? 0,
      input.relatedChapterId ?? null,
      JSON.stringify(input.participantIds),
      now,
      now,
    );
  }
  await run("UPDATE works SET updated_at = ? WHERE id = ?", now, workId);
  return getKnowledge(kind, id, ownerId);
}

export async function updateKnowledge(
  kind: KnowledgeKind,
  id: string,
  ownerId: string,
  payload: unknown,
) {
  const current = await getKnowledge(kind, id, ownerId);
  const columns = ["updated_at = ?"];
  const values: unknown[] = [isoNow()];
  const add = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    values.push(value);
  };

  if (kind === "outlines") {
    const input = updateOutlineSchema.parse(payload);
    const previous = await first<{ scope_type: "work" | "volume" | "chapter"; scope_id: string | null }>(
      "SELECT scope_type, scope_id FROM outlines WHERE id = ?",
      id,
    );
    if (!previous) notFound("设定条目");
    await assertOutlineScope(
      current.workId,
      input.scopeType ?? previous.scope_type,
      input.scopeId === undefined ? previous.scope_id : input.scopeId,
    );
    if (input.scopeType !== undefined) add("scope_type", input.scopeType);
    if (input.scopeId !== undefined) add("scope_id", input.scopeId);
    if (input.title !== undefined) add("title", input.title);
    if (input.content !== undefined) add("content", input.content);
    if (input.sortOrder !== undefined) add("sort_order", input.sortOrder);
  } else if (kind === "characters") {
    const input = updateCharacterSchema.parse(payload);
    if (input.name !== undefined) add("name", input.name);
    if (input.role !== undefined) add("role", input.role);
    if (input.aliases !== undefined) add("aliases_json", JSON.stringify(input.aliases));
    if (input.description !== undefined) add("description", input.description);
    if (input.personality !== undefined) add("personality", input.personality);
    if (input.motivation !== undefined) add("motivation", input.motivation);
    if (input.characterArc !== undefined) add("character_arc", input.characterArc);
    if (input.metadata !== undefined) add("metadata_json", JSON.stringify(input.metadata));
  } else if (kind === "world") {
    const input = updateWorldEntrySchema.parse(payload);
    if (input.category !== undefined) add("category", input.category);
    if (input.name !== undefined) add("name", input.name);
    if (input.summary !== undefined) add("summary", input.summary);
    if (input.content !== undefined) add("content", input.content);
    if (input.metadata !== undefined) add("metadata_json", JSON.stringify(input.metadata));
  } else {
    const input = updateTimelineEventSchema.parse(payload);
    if (input.participantIds !== undefined) {
      await assertTimelineParticipants(current.workId, input.participantIds);
    }
    if (input.relatedChapterId) {
      const chapter = await first<{ id: string }>(
        "SELECT id FROM chapters WHERE id = ? AND work_id = ? AND deleted_at IS NULL",
        input.relatedChapterId,
        current.workId,
      );
      if (!chapter) conflict("关联章节不属于当前作品");
    }
    if (input.title !== undefined) add("title", input.title);
    if (input.description !== undefined) add("description", input.description);
    if (input.storyTime !== undefined) add("story_time", input.storyTime);
    if (input.sortOrder !== undefined) add("sort_order", input.sortOrder);
    if (input.relatedChapterId !== undefined) add("related_chapter_id", input.relatedChapterId);
    if (input.participantIds !== undefined) add("participants_json", JSON.stringify(input.participantIds));
  }

  await batch([
    statement(`UPDATE ${tableByKind[kind]} SET ${columns.join(", ")} WHERE id = ?`, ...values, id),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", isoNow(), current.workId),
  ]);
  return getKnowledge(kind, id, ownerId);
}

export async function deleteKnowledge(kind: KnowledgeKind, id: string, ownerId: string): Promise<void> {
  const current = await getKnowledge(kind, id, ownerId);
  await batch([
    statement("DELETE FROM chapter_links WHERE entity_type = ? AND entity_id = ?", kindToLinkType(kind), id),
    ...(kind === "characters" ? [statement(
      `UPDATE timeline_events
       SET participants_json = COALESCE((
         SELECT json_group_array(value) FROM json_each(timeline_events.participants_json)
         WHERE value != ?
       ), '[]'), updated_at = ?
       WHERE work_id = ? AND EXISTS (
         SELECT 1 FROM json_each(timeline_events.participants_json) WHERE value = ?
       )`,
      id,
      isoNow(),
      current.workId,
      id,
    )] : []),
    statement(`DELETE FROM ${tableByKind[kind]} WHERE id = ?`, id),
    statement("UPDATE works SET updated_at = ? WHERE id = ?", isoNow(), current.workId),
  ]);
}

function kindToLinkType(kind: KnowledgeKind): string {
  return kind === "outlines" ? "outline" : kind === "characters" ? "character" : kind;
}

const entityTable: Record<string, { table: string; expectedKind: KnowledgeKind }> = {
  outline: { table: "outlines", expectedKind: "outlines" },
  character: { table: "characters", expectedKind: "characters" },
  world: { table: "world_entries", expectedKind: "world" },
  timeline: { table: "timeline_events", expectedKind: "timeline" },
};

export async function listChapterLinks(chapterId: string, ownerId: string) {
  await getChapterRow(chapterId, ownerId);
  return all<{ entityType: string; entityId: string; createdAt: string }>(
    `SELECT entity_type AS entityType, entity_id AS entityId, created_at AS createdAt
     FROM chapter_links WHERE chapter_id = ? ORDER BY created_at`,
    chapterId,
  );
}

export async function addChapterLink(
  chapterId: string,
  ownerId: string,
  entityType: string,
  entityId: string,
) {
  const chapter = await getChapterRow(chapterId, ownerId);
  const entity = entityTable[entityType];
  if (!entity) conflict("不支持的关联类型");
  const target = await first<{ id: string }>(
    `SELECT id FROM ${entity.table} WHERE id = ? AND work_id = ?`,
    entityId,
    chapter.work_id,
  );
  if (!target) conflict("关联对象不属于当前作品");
  await run(
    `INSERT INTO chapter_links (chapter_id, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(chapter_id, entity_type, entity_id) DO NOTHING`,
    chapterId,
    entityType,
    entityId,
    isoNow(),
  );
  return listChapterLinks(chapterId, ownerId);
}

export async function removeChapterLink(
  chapterId: string,
  ownerId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  await getChapterRow(chapterId, ownerId);
  await run(
    "DELETE FROM chapter_links WHERE chapter_id = ? AND entity_type = ? AND entity_id = ?",
    chapterId,
    entityType,
    entityId,
  );
}
