import type { BackupDocument, BackupTitleConflict } from "@/contracts/data-safety";

export const BACKUP_PREFLIGHT_TTL_MS = 30 * 60 * 1000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

export async function backupSnapshotHash(backup: BackupDocument): Promise<string> {
  const canonical = JSON.stringify({ schemaVersion: backup.schemaVersion, data: backup.data });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function createBackupPreviewToken(
  secret: string,
  ownerId: string,
  snapshotHash: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: string }> {
  const expiresAtMs = now + BACKUP_PREFLIGHT_TTL_MS;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    version: 1,
    ownerId,
    snapshotHash,
    expiresAtMs,
  })));
  return {
    token: `v1.${payload}.${await hmac(secret, payload)}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export async function verifyBackupPreviewToken(
  token: string,
  secret: string,
  ownerId: string,
  snapshotHash: string,
  now = Date.now(),
): Promise<boolean> {
  const [version, payload, signature, extra] = token.split(".");
  if (version !== "v1" || !payload || !signature || extra) return false;
  const expected = await hmac(secret, payload);
  const actualBytes = base64UrlToBytes(signature);
  const expectedBytes = base64UrlToBytes(expected);
  if (!actualBytes || !expectedBytes || actualBytes.length !== expectedBytes.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actualBytes.length; index += 1) mismatch |= actualBytes[index] ^ expectedBytes[index];
  if (mismatch !== 0) return false;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload) ?? new Uint8Array())) as {
      version?: number; ownerId?: string; snapshotHash?: string; expiresAtMs?: number;
    };
    return decoded.version === 1 && decoded.ownerId === ownerId && decoded.snapshotHash === snapshotHash &&
      typeof decoded.expiresAtMs === "number" && decoded.expiresAtMs >= now;
  } catch {
    return false;
  }
}

export function findBackupTitleConflicts(
  backup: BackupDocument,
  existingWorks: Array<{ id: string; title: string; status: string }>,
): BackupTitleConflict[] {
  const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
  return backup.data.works.flatMap((work) => {
    const matches = existingWorks.filter((existing) => normalized(existing.title) === normalized(work.title));
    return matches.length ? [{ sourceWorkId: work.id, sourceTitle: work.title, existingWorks: matches }] : [];
  });
}
