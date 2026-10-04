import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { updateChapterSchema } from "../../contracts/schemas";
import { isMatchingSaveReplay } from "../../server/chapter-save";

const saveId = randomUUID();
const committed = {
  volume_id: null,
  title: "第一章",
  summary: "",
  content: "<p>新稿</p>",
  status: "draft",
  sort_order: 0,
  revision: 2,
};

describe("chapter save idempotency", () => {
  it("requires an actual update and accepts an optional UUID saveId", () => {
    assert.equal(updateChapterSchema.safeParse({ content: committed.content, expectedRevision: 1, saveId }).success, true);
    assert.equal(updateChapterSchema.safeParse({ content: committed.content, expectedRevision: 1, saveId, preservePreviousVersion: true }).success, true);
    assert.equal(updateChapterSchema.safeParse({ expectedRevision: 1, saveId }).success, false);
    assert.equal(updateChapterSchema.safeParse({ expectedRevision: 1, preservePreviousVersion: true }).success, false);
    assert.equal(updateChapterSchema.safeParse({ content: committed.content, saveId: "not-a-uuid" }).success, false);
  });

  it("acknowledges only the exact latest committed request", () => {
    assert.equal(isMatchingSaveReplay(committed, {
      content: committed.content,
      expectedRevision: 1,
      saveId,
    }), true);
    assert.equal(isMatchingSaveReplay(committed, {
      content: "<p>另一份稿</p>", expectedRevision: 1, saveId,
    }), false);
    assert.equal(isMatchingSaveReplay(committed, {
      content: committed.content, expectedRevision: 2, saveId,
    }), false);
    assert.equal(isMatchingSaveReplay({ ...committed, revision: 3 }, {
      content: committed.content, expectedRevision: 1, saveId,
    }), false);
  });
});
