import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => trimmed(max).min(1);

export const idSchema = z.string().uuid();

export const createWorkSchema = z.object({
  title: requiredText(120),
  description: trimmed(2000).default(""),
  genre: trimmed(60).default("未分类"),
  targetWords: z.number().int().min(0).max(20_000_000).default(0),
});

export const updateWorkSchema = createWorkSchema
  .partial()
  .extend({ status: z.enum(["draft", "completed", "archived"]).optional() })
  .refine((value) => Object.keys(value).length > 0, "至少提供一个要修改的字段");

export const createVolumeSchema = z.object({
  title: requiredText(120),
  summary: trimmed(10_000).default(""),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateVolumeSchema = createVolumeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "至少提供一个要修改的字段");

export const createChapterSchema = z.object({
  volumeId: idSchema.nullable().optional(),
  title: requiredText(160),
  summary: trimmed(10_000).default(""),
  content: z.string().max(2_000_000).default(""),
  status: z.enum(["draft", "completed"]).default("draft"),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateChapterSchema = z
  .object({
    volumeId: idSchema.nullable().optional(),
    title: requiredText(160).optional(),
    summary: trimmed(10_000).optional(),
    content: z.string().max(2_000_000).optional(),
    status: z.enum(["draft", "completed"]).optional(),
    sortOrder: z.number().int().min(0).optional(),
    expectedRevision: z.number().int().min(1).optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "expectedRevision"),
    "至少提供一个要修改的字段",
  );

export const reorderChaptersSchema = z.object({
  volumeId: idSchema.nullable(),
  chapterIds: z.array(idSchema).min(1).max(500),
});

export const createManualVersionSchema = z.object({
  label: requiredText(80),
});

export const listVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(200),
  cursor: z.string().min(1).max(300).optional(),
});

export const restoreVersionSchema = z.object({
  expectedRevision: z.number().int().min(1).optional(),
});

export const knowledgeKindSchema = z.enum(["outlines", "characters", "world", "timeline"]);

export const createOutlineSchema = z.object({
  scopeType: z.enum(["work", "volume", "chapter"]).default("work"),
  scopeId: idSchema.nullable().optional(),
  title: requiredText(160),
  content: z.string().max(200_000).default(""),
  sortOrder: z.number().int().min(0).optional(),
});

export const createCharacterSchema = z.object({
  name: requiredText(80),
  role: trimmed(40).default("配角"),
  aliases: z.array(trimmed(80)).max(30).default([]),
  description: z.string().max(50_000).default(""),
  personality: z.string().max(20_000).default(""),
  motivation: z.string().max(20_000).default(""),
  characterArc: z.string().max(50_000).default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const createWorldEntrySchema = z.object({
  category: z.enum(["location", "faction", "system", "item", "custom"]),
  name: requiredText(100),
  summary: z.string().max(10_000).default(""),
  content: z.string().max(100_000).default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const createTimelineEventSchema = z.object({
  title: requiredText(160),
  description: z.string().max(50_000).default(""),
  storyTime: trimmed(160).default(""),
  sortOrder: z.number().int().min(0).optional(),
  relatedChapterId: idSchema.nullable().optional(),
  participantIds: z.array(idSchema).max(100).default([]),
});

const nonEmptyPartial = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.partial().refine((value) => Object.keys(value).length > 0, "至少提供一个要修改的字段");

export const updateOutlineSchema = nonEmptyPartial(createOutlineSchema);
export const updateCharacterSchema = nonEmptyPartial(createCharacterSchema);
export const updateWorldEntrySchema = nonEmptyPartial(createWorldEntrySchema);
export const updateTimelineEventSchema = nonEmptyPartial(createTimelineEventSchema);

export const chapterLinkSchema = z.object({
  entityType: z.enum(["character", "world", "timeline", "outline"]),
  entityId: idSchema,
});

export const chapterLinksBatchSchema = z.object({
  links: z.array(chapterLinkSchema).min(1).max(100),
}).refine(
  ({ links }) => new Set(links.map((link) => `${link.entityType}:${link.entityId}`)).size === links.length,
  "关联列表不能包含重复对象",
);

export const reorderOutlinesSchema = z.object({
  outlineIds: z.array(idSchema).min(1).max(500),
}).refine(
  ({ outlineIds }) => new Set(outlineIds).size === outlineIds.length,
  "大纲排序列表不能包含重复条目",
);

export const updateWritingGoalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetWords: z.number().int().min(0).max(100_000),
});

export const updateAiSettingsSchema = z.object({
  baseUrl: z.string().url().max(500),
  model: requiredText(160),
  apiKey: z.string().min(8).max(1000).optional(),
});

export const aiProviderConnectionSchema = z.object({
  baseUrl: z.string().url().max(500).optional(),
  apiKey: z.string().min(8).max(1000).optional(),
});

export const aiProviderTestSchema = aiProviderConnectionSchema.extend({
  model: requiredText(160).optional(),
});

export const workspaceSelectionSchema = z.object({
  workId: idSchema,
  chapterId: idSchema.nullable().optional(),
});

const aiContextSchema = z.object({
  chapters: z
    .array(z.object({ id: idSchema.optional(), title: trimmed(160), content: z.string().max(200_000) }))
    .max(20)
    .default([]),
  outlines: z.array(z.object({ title: trimmed(160), content: z.string().max(100_000) })).max(20).default([]),
  characters: z.array(z.object({ name: trimmed(80), description: z.string().max(20_000) })).max(50).default([]),
  worldEntries: z.array(z.object({ name: trimmed(100), content: z.string().max(30_000) })).max(50).default([]),
  timelineEvents: z.array(z.object({ title: trimmed(160), description: z.string().max(20_000) })).max(100).default([]),
});

export const aiGenerationSchema = z.object({
  action: z.enum(["continue", "rewrite", "polish", "outline", "brainstorm", "consistency"]),
  instruction: requiredText(2000),
  selectedText: z.string().max(100_000).default(""),
  context: aiContextSchema.default({}),
  temperature: z.number().min(0).max(1.5).default(0.7),
  maxTokens: z.number().int().min(100).max(8000).default(2000),
});

export type CreateWorkInput = z.infer<typeof createWorkSchema>;
export type UpdateWorkInput = z.infer<typeof updateWorkSchema>;
export type CreateVolumeInput = z.infer<typeof createVolumeSchema>;
export type UpdateVolumeInput = z.infer<typeof updateVolumeSchema>;
export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type CreateOutlineInput = z.infer<typeof createOutlineSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type CreateWorldEntryInput = z.infer<typeof createWorldEntrySchema>;
export type CreateTimelineEventInput = z.infer<typeof createTimelineEventSchema>;
export type AiGenerationInput = z.infer<typeof aiGenerationSchema>;
