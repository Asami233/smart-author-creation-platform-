import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  ACCOUNT_DELETE_CONFIRMATION,
  accountDeletionSchema,
} from "../../contracts/auth";
import { ACCOUNT_DELETION_SQL } from "../../server/account-deletion";

describe("permanent account deletion", () => {
  it("requires the exact warning phrase and a password", () => {
    assert.equal(accountDeletionSchema.safeParse({
      currentPassword: "SyntheticOnly123",
      confirmation: ACCOUNT_DELETE_CONFIRMATION,
    }).success, true);
    assert.equal(accountDeletionSchema.safeParse({
      currentPassword: "SyntheticOnly123",
      confirmation: "删除账号",
    }).success, false);
    assert.equal(accountDeletionSchema.safeParse({
      currentPassword: "",
      confirmation: ACCOUNT_DELETE_CONFIRMATION,
    }).success, false);
  });

  it("removes every account-owned row and preserves another account", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE);
        CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE);
        CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE);
        CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, email TEXT NOT NULL);
        CREATE TABLE works (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);
        CREATE TABLE chapters (id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE);
        CREATE TABLE workspace_preferences (owner_id TEXT PRIMARY KEY);
        CREATE TABLE ai_provider_configs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);
        CREATE TABLE ai_usage_daily (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);
        CREATE TABLE backup_import_jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);
      `);
      for (const [id, email] of [["target", "target@example.test"], ["other", "other@example.test"]]) {
        db.prepare("INSERT INTO auth_users VALUES (?, ?)").run(id, email);
        db.prepare("INSERT INTO auth_credentials VALUES (?)").run(id);
        db.prepare("INSERT INTO auth_sessions VALUES (?, ?)").run(`session-${id}`, id);
        db.prepare("INSERT INTO auth_challenges VALUES (?, ?)").run(`challenge-${id}`, email);
        db.prepare("INSERT INTO works VALUES (?, ?)").run(`work-${id}`, id);
        db.prepare("INSERT INTO chapters VALUES (?, ?)").run(`chapter-${id}`, `work-${id}`);
        db.prepare("INSERT INTO workspace_preferences VALUES (?)").run(id);
        db.prepare("INSERT INTO ai_provider_configs VALUES (?, ?)").run(`provider-${id}`, id);
        db.prepare("INSERT INTO ai_usage_daily VALUES (?, ?)").run(`usage-${id}`, id);
        db.prepare("INSERT INTO backup_import_jobs VALUES (?, ?)").run(`backup-${id}`, id);
      }

      const values: string[][] = [
        ["target"], ["target"], ["target"], ["target"], ["target"],
        ["target@example.test"], ["target"], ["target"], ["target", "target@example.test"],
      ];
      db.exec("BEGIN");
      ACCOUNT_DELETION_SQL.forEach((sql, index) => db.prepare(sql).run(...values[index]));
      db.exec("COMMIT");

      for (const table of [
        "auth_users", "auth_credentials", "auth_sessions", "auth_challenges", "works",
        "chapters", "workspace_preferences", "ai_provider_configs", "ai_usage_daily", "backup_import_jobs",
      ]) {
        assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count, 1, table);
      }
      assert.equal(db.prepare("SELECT id FROM auth_users").get()?.id, "other");
      assert.equal(db.prepare("SELECT id FROM works").get()?.id, "work-other");
      assert.equal(db.prepare("SELECT id FROM chapters").get()?.id, "chapter-other");
    } finally {
      db.close();
    }
  });
});
