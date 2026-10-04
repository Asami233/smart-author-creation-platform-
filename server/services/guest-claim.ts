import type { GuestClaimPreview, GuestClaimResult, GuestClaimWork } from "@/contracts";
import type { z } from "zod";
import type { claimGuestWorksSchema } from "@/contracts";
import { getAuthSecret, isLocalRequest, readCookie } from "@/server/auth/runtime";
import { requireAuth } from "@/server/auth/context";
import { all, first, run } from "@/server/db";
import { AppError } from "@/server/errors";
import { LOCAL_OWNER_ID } from "@/server/identity";
import {
  CLAIM_ALL_GUEST_WORKS_SQL, createGuestBackupTicket, GUEST_BACKUP_COOKIE,
  GUEST_BACKUP_TICKET_SECONDS, guestSnapshotToken, verifyGuestBackupTicket,
} from "@/server/guest-claim";
import { createFullBackup } from "./data-safety";

function assertLocal(request: Request): void {
  if (!isLocalRequest(request)) {
    throw new AppError(403, "GUEST_CLAIM_LOCAL_ONLY", "访客作品认领只在本机开发环境开放");
  }
}

async function guestSnapshot() {
  const backup = await createFullBackup(LOCAL_OWNER_ID);
  const workIds = backup.data.works.map((work) => work.id).sort();
  const chapterStats = new Map<string, { count: number; words: number }>();
  for (const chapter of backup.data.chapters) {
    if (chapter.deletedAt) continue;
    const previous = chapterStats.get(chapter.workId) ?? { count: 0, words: 0 };
    chapterStats.set(chapter.workId, {
      count: previous.count + 1, words: previous.words + chapter.wordCount,
    });
  }
  const works: GuestClaimWork[] = backup.data.works.map((work) => ({
    id: work.id, title: work.title, status: work.status,
    chapterCount: chapterStats.get(work.id)?.count ?? 0,
    totalWords: chapterStats.get(work.id)?.words ?? 0,
    updatedAt: work.updatedAt,
  }));
  return { backup, workIds, works, previewToken: await guestSnapshotToken(backup) };
}

export async function previewGuestClaim(request: Request): Promise<GuestClaimPreview> {
  assertLocal(request);
  const auth = await requireAuth(request);
  const snapshot = await guestSnapshot();
  return {
    localOnly: true,
    works: snapshot.works,
    previewToken: snapshot.workIds.length ? snapshot.previewToken : null,
    accountEmail: auth.user.email,
  };
}

export async function downloadGuestClaimBackup(request: Request): Promise<Response> {
  assertLocal(request);
  const auth = await requireAuth(request);
  const snapshot = await guestSnapshot();
  if (!snapshot.workIds.length) {
    throw new AppError(404, "NO_GUEST_WORKS", "本机暂无可认领的访客作品");
  }
  const ticket = await createGuestBackupTicket(
    getAuthSecret(), auth.user.id, snapshot.previewToken, snapshot.workIds,
  );
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(JSON.stringify(snapshot.backup, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="smart-author-guest-backup-${snapshot.backup.exportedAt.slice(0, 10)}.json"`,
      "cache-control": "no-store",
      "x-guest-claim-preview-token": snapshot.previewToken,
      "set-cookie": `${GUEST_BACKUP_COOKIE}=${ticket}; Path=/api/guest-claim; HttpOnly; SameSite=Strict; Max-Age=${GUEST_BACKUP_TICKET_SECONDS}${secure}`,
    },
  });
}

export async function claimGuestWorks(
  request: Request, input: z.infer<typeof claimGuestWorksSchema>,
): Promise<GuestClaimResult> {
  assertLocal(request);
  const auth = await requireAuth(request);
  const workIds = [...input.workIds].sort();
  const validTicket = await verifyGuestBackupTicket(
    readCookie(request, GUEST_BACKUP_COOKIE), getAuthSecret(), auth.user.id,
    input.previewToken, workIds,
  );
  if (!validTicket) {
    throw new AppError(412, "GUEST_BACKUP_REQUIRED", "请先下载当前访客作品备份，再确认认领");
  }

  const owners = await all<{ id: string; owner_id: string }>(
    "SELECT id, owner_id FROM works WHERE id IN (SELECT value FROM json_each(?))",
    JSON.stringify(workIds),
  );
  if (owners.length === workIds.length && owners.every((row) => row.owner_id === auth.user.id)) {
    const remaining = await first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM works WHERE owner_id = ?", LOCAL_OWNER_ID,
    );
    return { claimedWorkIds: workIds, alreadyClaimed: true, remainingGuestWorkCount: remaining?.count ?? 0 };
  }

  const snapshot = await guestSnapshot();
  if (snapshot.previewToken !== input.previewToken ||
      snapshot.workIds.length !== workIds.length ||
      snapshot.workIds.some((id, index) => id !== workIds[index])) {
    throw new AppError(409, "GUEST_CLAIM_STALE", "访客作品在预览或备份后发生变化，请重新检查并下载备份");
  }

  const result = await run(
    CLAIM_ALL_GUEST_WORKS_SQL,
    auth.user.id, LOCAL_OWNER_ID, JSON.stringify(workIds),
    LOCAL_OWNER_ID, workIds.length,
    LOCAL_OWNER_ID, JSON.stringify(workIds), workIds.length,
  );
  const claimedIds = (result.results as Array<{ id: string }>).map((row) => row.id).sort();
  if (claimedIds.length !== workIds.length) {
    // A competing write/claim must never turn this into a partial migration.
    throw new AppError(409, "GUEST_CLAIM_STALE", "认领时作品发生变化，请刷新预览后重试");
  }
  return { claimedWorkIds: claimedIds, alreadyClaimed: false, remainingGuestWorkCount: 0 };
}
