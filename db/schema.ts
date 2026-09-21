import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const works = sqliteTable(
  "works",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    genre: text("genre").notNull().default("未分类"),
    status: text("status").notNull().default("draft"),
    targetWords: integer("target_words").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("idx_works_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_works_owner_status").on(table.ownerId, table.status),
  ],
);

export const volumes = sqliteTable(
  "volumes",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("idx_volumes_work_order").on(table.workId, table.sortOrder),
  ],
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    volumeId: text("volume_id").references(() => volumes.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    content: text("content").notNull().default(""),
    plainText: text("plain_text").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    status: text("status").notNull().default("draft"),
    sortOrder: integer("sort_order").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_chapters_work_order").on(table.workId, table.sortOrder),
    index("idx_chapters_volume_order").on(table.volumeId, table.sortOrder),
    index("idx_chapters_work_updated").on(table.workId, table.updatedAt),
  ],
);

export const outlines = sqliteTable(
  "outlines",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull().default("work"),
    scopeId: text("scope_id"),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("idx_outlines_work_scope").on(table.workId, table.scopeType, table.sortOrder),
  ],
);

export const characters = sqliteTable(
  "characters",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default("配角"),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    description: text("description").notNull().default(""),
    personality: text("personality").notNull().default(""),
    motivation: text("motivation").notNull().default(""),
    characterArc: text("character_arc").notNull().default(""),
    metadataJson: text("metadata_json").notNull().default("{}"),
    ...timestamps,
  },
  (table) => [
    index("idx_characters_work_name").on(table.workId, table.name),
  ],
);

export const worldEntries = sqliteTable(
  "world_entries",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    content: text("content").notNull().default(""),
    metadataJson: text("metadata_json").notNull().default("{}"),
    ...timestamps,
  },
  (table) => [
    index("idx_world_entries_work_category").on(table.workId, table.category, table.name),
  ],
);

export const timelineEvents = sqliteTable(
  "timeline_events",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    storyTime: text("story_time").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    relatedChapterId: text("related_chapter_id").references(() => chapters.id, {
      onDelete: "set null",
    }),
    participantsJson: text("participants_json").notNull().default("[]"),
    ...timestamps,
  },
  (table) => [
    index("idx_timeline_work_order").on(table.workId, table.sortOrder),
  ],
);

export const chapterLinks = sqliteTable(
  "chapter_links",
  {
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.chapterId, table.entityType, table.entityId] }),
    index("idx_chapter_links_entity").on(table.entityType, table.entityId),
  ],
);

export const chapterVersions = sqliteTable(
  "chapter_versions",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label").notNull().default(""),
    content: text("content").notNull(),
    plainText: text("plain_text").notNull(),
    wordCount: integer("word_count").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_chapter_versions_chapter_created").on(table.chapterId, table.createdAt),
  ],
);

export const writingDailyStats = sqliteTable(
  "writing_daily_stats",
  {
    id: text("id").primaryKey(),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    statDate: text("stat_date").notNull(),
    targetWords: integer("target_words").notNull().default(3000),
    wordsWritten: integer("words_written").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_writing_stats_work_date").on(table.workId, table.statDate),
    index("idx_writing_stats_work_date").on(table.workId, table.statDate),
  ],
);

export const aiProviderConfigs = sqliteTable(
  "ai_provider_configs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    keyIv: text("key_iv").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("uq_ai_provider_owner").on(table.ownerId)],
);

export const aiUsageDaily = sqliteTable(
  "ai_usage_daily",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    usageDate: text("usage_date").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    ...timestamps,
  },
  (table) => [uniqueIndex("uq_ai_usage_owner_date").on(table.ownerId, table.usageDate)],
);

export const authUsers = sqliteTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailVerifiedAt: text("email_verified_at").notNull(),
    penName: text("pen_name").notNull(),
    bio: text("bio").notNull().default(""),
    avatarUrl: text("avatar_url"),
    status: text("status").notNull().default("active"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: text("locked_until"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("uq_auth_users_email").on(table.email),
    index("idx_auth_users_status").on(table.status),
  ],
);

export const authCredentials = sqliteTable("auth_credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  passwordChangedAt: text("password_changed_at").notNull(),
  ...timestamps,
});

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_auth_sessions_token_hash").on(table.tokenHash),
    index("idx_auth_sessions_user_expires").on(table.userId, table.expiresAt),
  ],
);

export const authChallenges = sqliteTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    purpose: text("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_auth_challenges_lookup").on(
      table.email,
      table.purpose,
      table.createdAt,
    ),
  ],
);
