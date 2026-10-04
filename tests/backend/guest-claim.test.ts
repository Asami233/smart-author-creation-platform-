import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import type { BackupDocument } from "../../contracts/data-safety";
import { claimGuestWorksSchema } from "../../contracts/guest-claim";
import {
  CLAIM_ALL_GUEST_WORKS_SQL, createGuestBackupTicket,
  guestSnapshotToken, verifyGuestBackupTicket,
} from "../../server/guest-claim";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

describe("local guest claim safeguards", () => {
  it("binds the backup ticket to account, snapshot, exact work IDs and expiry", async () => {
    const secret = "s".repeat(32);
    const now = 1_800_000_000_000;
    const token = `v1:${"a".repeat(43)}`;
    const ticket = await createGuestBackupTicket(secret, "account-a", token, [secondId, firstId], now);
    assert.equal(await verifyGuestBackupTicket(ticket, secret, "account-a", token, [firstId, secondId], now), true);
    assert.equal(await verifyGuestBackupTicket(ticket, secret, "account-b", token, [firstId, secondId], now), false);
    assert.equal(await verifyGuestBackupTicket(ticket, secret, "account-a", `v1:${"b".repeat(43)}`, [firstId, secondId], now), false);
    assert.equal(await verifyGuestBackupTicket(ticket, secret, "account-a", token, [firstId], now), false);
    assert.equal(await verifyGuestBackupTicket(ticket, secret, "account-a", token, [firstId, secondId], now + 3_600_001), false);
  });

  it("hashes guest content but not export time or API settings", async () => {
    const backup = {
      exportedAt: "2026-09-26T00:00:00Z",
      data: {
        works: [{ id: firstId, title: "甲" }], chapters: [{ id: secondId, content: "正文" }],
        aiSettings: { baseUrl: "https://provider.example", model: "m" },
      },
    } as BackupDocument;
    const before = await guestSnapshotToken(backup);
    backup.exportedAt = "2026-09-27T00:00:00Z";
    backup.data.aiSettings = null;
    assert.equal(await guestSnapshotToken(backup), before);
    backup.data.chapters[0].content = "已修改正文";
    assert.notEqual(await guestSnapshotToken(backup), before);
  });

  it("rejects duplicate work IDs before mutation", () => {
    const parsed = claimGuestWorksSchema.safeParse({
      workIds: [firstId, firstId], previewToken: `v1:${"a".repeat(43)}`, confirm: true,
    });
    assert.equal(parsed.success, false);
  });

  it("transfers all previewed guest works atomically and preserves descendants", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE works (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL); CREATE TABLE chapters (id TEXT PRIMARY KEY, work_id TEXT NOT NULL);");
      db.prepare("INSERT INTO works VALUES (?, ?)").run(firstId, "local-author");
      db.prepare("INSERT INTO works VALUES (?, ?)").run(secondId, "local-author");
      db.prepare("INSERT INTO chapters VALUES (?, ?)").run("chapter-1", firstId);
      const transfer = (ids: string[]) => db.prepare(CLAIM_ALL_GUEST_WORKS_SQL).all(
        "account-a", "local-author", JSON.stringify(ids),
        "local-author", ids.length, "local-author", JSON.stringify(ids), ids.length,
      );
      assert.equal(transfer([firstId]).length, 0); // stale or incomplete preview never moves a subset
      assert.equal(transfer([firstId, secondId]).length, 2);
      assert.equal(db.prepare("SELECT owner_id FROM works WHERE id = ?").get(firstId)?.owner_id, "account-a");
      assert.equal(db.prepare("SELECT work_id FROM chapters WHERE id = ?").get("chapter-1")?.work_id, firstId);
      assert.equal(transfer([firstId, secondId]).length, 0); // idempotent service response handles retry
    } finally { db.close(); }
  });
});
