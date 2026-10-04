import type { UpdateChapterInput } from "@/contracts";

type SavedChapterFields = {
  volume_id: string | null;
  title: string;
  summary: string;
  content: string;
  status: string;
  sort_order: number;
  revision: number;
};

/** A lost response may be acknowledged only while this exact save is still the latest write. */
export function isMatchingSaveReplay(chapter: SavedChapterFields, input: UpdateChapterInput): boolean {
  return input.expectedRevision !== undefined
    && chapter.revision === input.expectedRevision + 1
    && (input.volumeId === undefined || chapter.volume_id === input.volumeId)
    && (input.title === undefined || chapter.title === input.title)
    && (input.summary === undefined || chapter.summary === input.summary)
    && (input.content === undefined || chapter.content === input.content)
    && (input.status === undefined || chapter.status === input.status)
    && (input.sortOrder === undefined || chapter.sort_order === input.sortOrder);
}
