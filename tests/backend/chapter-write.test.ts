import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { chapterWriteGuard } from "../../server/chapter-write";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE works (id TEXT PRIMARY KEY, owner_id TEXT, status TEXT);
    CREATE TABLE volumes (id TEXT PRIMARY KEY, work_id TEXT);
    CREATE TABLE chapters (id TEXT PRIMARY KEY, work_id TEXT, volume_id TEXT,
      revision INTEGER, deleted_at TEXT, content TEXT);
    INSERT INTO works VALUES ('work', 'owner', 'draft'), ('other', 'other-owner', 'draft');
    INSERT INTO volumes VALUES ('volume', 'work'), ('foreign-volume', 'other');
    INSERT INTO chapters VALUES ('chapter', 'work', 'volume', 1, NULL, 'original');`);
  return db;
}

function write(db: DatabaseSync, targetVolumeId?: string | null) {
  const guard = chapterWriteGuard("chapter", 1, "owner", targetVolumeId);
  return db.prepare(`UPDATE chapters SET content = 'new', revision = revision + 1
    WHERE ${guard.sql} RETURNING content, revision`).get(...guard.bindings);
}

describe("chapter write-time access guard (SQLite)", () => {
  for (const [name, interveningSql] of [
    ["archive after initial read", "UPDATE works SET status = 'archived' WHERE id = 'work'"],
    ["owner change after initial read", "UPDATE works SET owner_id = 'other-owner' WHERE id = 'work'"],
    ["soft-delete after initial read", "UPDATE chapters SET deleted_at = 'now'"],
    ["competing save after initial read", "UPDATE chapters SET revision = 2, content = 'competitor'"],
  ]) {
    it(`rejects ${name} without altering the latest row`, () => {
      const db = fixture();
      try {
        assert.equal(db.prepare("SELECT revision FROM chapters").get()?.revision, 1);
        db.exec(interveningSql);
        const before = db.prepare("SELECT * FROM chapters").get();
        assert.equal(write(db), undefined);
        assert.deepEqual(db.prepare("SELECT * FROM chapters").get(), before);
      } finally { db.close(); }
    });
  }
  it("rechecks a moved-to volume after its earlier validation", () => {
    const db = fixture();
    try {
      db.exec("DELETE FROM volumes WHERE id = 'volume'");
      assert.equal(write(db, "volume"), undefined);
      assert.equal(write(db, "foreign-volume"), undefined);
      assert.equal(db.prepare("SELECT content FROM chapters").get()?.content, "original");
    } finally { db.close(); }
  });
  it("allows valid volume, unassigned, and content-only saves", () => {
    for (const volume of ["volume", null, undefined]) {
      const db = fixture();
      try {
        const row = write(db, volume);
        assert.equal(row?.revision, 2);
        assert.equal(row?.content, "new");
      } finally { db.close(); }
    }
  });
  it("returns this mutation's result independently of later writes", () => {
    const db = fixture();
    try {
      const ownResult = write(db);
      db.exec("UPDATE chapters SET revision = 3, content = 'later'; UPDATE works SET status = 'archived'");
      assert.equal(ownResult?.revision, 2);
      assert.equal(ownResult?.content, "new");
    } finally { db.close(); }
  });
});
