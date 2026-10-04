import type { BackupDocument } from "@/contracts/data-safety";
import { hashChallenge, sha256, timingSafeEqual } from "@/server/auth/security";

export const GUEST_BACKUP_COOKIE = "smart_author_guest_backup";
export const GUEST_BACKUP_TICKET_SECONDS = 60 * 60;

function stableKey(item: Record<string, unknown>): string {
  return String(item.id ?? `${item.chapterId}:${item.entityType}:${item.entityId}`);
}

/** Hash the full, canonical guest data, not the volatile export timestamp or the excluded AI key. */
export async function guestSnapshotToken(backup: BackupDocument): Promise<string> {
  const canonical = Object.fromEntries(Object.entries(backup.data)
    .filter(([key]) => key !== "aiSettings")
    .map(([key, value]) => [key, Array.isArray(value)
      ? [...value].sort((left, right) => stableKey(left).localeCompare(stableKey(right)))
      : value]));
  return `v1:${await sha256(JSON.stringify(canonical))}`;
}

function ticketMessage(previewToken: string, workIds: string[], expiresAt: number): string {
  return `${previewToken}:${[...workIds].sort().join(",")}:${expiresAt}`;
}

export async function createGuestBackupTicket(
  secret: string, accountId: string, previewToken: string, workIds: string[], now = Date.now(),
): Promise<string> {
  const expiresAt = now + GUEST_BACKUP_TICKET_SECONDS * 1000;
  const signature = await hashChallenge(secret, "guest-claim-v1", accountId,
    ticketMessage(previewToken, workIds, expiresAt));
  return `${expiresAt}.${signature}`;
}

export async function verifyGuestBackupTicket(
  ticket: string | null, secret: string, accountId: string, previewToken: string,
  workIds: string[], now = Date.now(),
): Promise<boolean> {
  if (!ticket) return false;
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(ticket);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now || expiresAt > now + GUEST_BACKUP_TICKET_SECONDS * 1000) return false;
  const expected = await hashChallenge(secret, "guest-claim-v1", accountId,
    ticketMessage(previewToken, workIds, expiresAt));
  return timingSafeEqual(expected, match[2]);
}

/** One SQLite statement changes all previewed guest works or none; descendants retain their IDs. */
export const CLAIM_ALL_GUEST_WORKS_SQL = `
  UPDATE works SET owner_id = ?
  WHERE owner_id = ?
    AND id IN (SELECT value FROM json_each(?))
    AND (SELECT COUNT(*) FROM works WHERE owner_id = ?) = ?
    AND (SELECT COUNT(*) FROM works WHERE owner_id = ?
         AND id IN (SELECT value FROM json_each(?))) = ?
  RETURNING id`;
