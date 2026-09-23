import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { reorderChaptersSchema } from "../../contracts/schemas";

describe("chapter move/order contract", () => {
  const chapterIds = [randomUUID(), randomUUID()];
  const request = { volumeId: null, chapterIds };
  const expectedRevisions = chapterIds.map((chapterId) => ({ chapterId, revision: 1 }));

  it("allows a real volume or unassigned target and legacy complete lists", () => {
    assert.ok(reorderChaptersSchema.safeParse(request).success);
    assert.ok(reorderChaptersSchema.safeParse({ ...request, volumeId: randomUUID(), expectedRevisions }).success);
    assert.ok(reorderChaptersSchema.safeParse({ ...request, expectedRevisions: [...expectedRevisions].reverse() }).success);
    assert.equal(reorderChaptersSchema.safeParse({ chapterIds }).success, false);
  });

  it("requires nonempty unique UUIDs and allows exactly 500 chapters", () => {
    for (const ids of [[], [chapterIds[0], chapterIds[0]], ["not-an-id"]]) {
      assert.equal(reorderChaptersSchema.safeParse({ ...request, chapterIds: ids }).success, false);
    }
    const ids = Array.from({ length: 501 }, () => randomUUID());
    assert.ok(reorderChaptersSchema.safeParse({ ...request, chapterIds: ids.slice(0, 500) }).success);
    assert.equal(reorderChaptersSchema.safeParse({ ...request, chapterIds: ids }).success, false);
  });

  it("requires revisions to cover precisely the same chapters without duplicates", () => {
    for (const revisions of [
      [], expectedRevisions.slice(0, 1), [expectedRevisions[0], expectedRevisions[0]],
      [...expectedRevisions, { chapterId: randomUUID(), revision: 1 }],
      [expectedRevisions[0], { chapterId: randomUUID(), revision: 1 }],
    ]) {
      assert.equal(reorderChaptersSchema.safeParse({ ...request, expectedRevisions: revisions }).success, false);
    }
  });

  it("rejects invalid revision values", () => {
    for (const revision of [0, -1, 1.5, "1", null]) {
      assert.equal(reorderChaptersSchema.safeParse({
        ...request, expectedRevisions: [{ ...expectedRevisions[0], revision }, expectedRevisions[1]],
      }).success, false);
    }
  });
});
