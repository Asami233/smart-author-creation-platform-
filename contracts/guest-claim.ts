import { z } from "zod";
import { idSchema } from "./schemas";

export const claimGuestWorksSchema = z.object({
  workIds: z.array(idSchema).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, "作品 ID 不得重复"),
  previewToken: z.string().regex(/^v1:[A-Za-z0-9_-]{43}$/),
  confirm: z.literal(true),
});

export type GuestClaimWork = {
  id: string;
  title: string;
  status: "draft" | "completed" | "archived";
  chapterCount: number;
  totalWords: number;
  updatedAt: string;
};

export type GuestClaimPreview = {
  localOnly: true;
  works: GuestClaimWork[];
  previewToken: string | null;
  accountEmail: string;
};

export type GuestClaimResult = {
  claimedWorkIds: string[];
  alreadyClaimed: boolean;
  remainingGuestWorkCount: number;
};
