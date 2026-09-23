import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateWorkSchema } from "../../contracts/schemas";

describe("work status update contract", () => {
  it("preserves all three supported statuses", () => {
    for (const status of ["draft", "completed", "archived"]) {
      assert.equal(updateWorkSchema.parse({ status }).status, status);
    }
  });
  it("allows archive together with ordinary metadata changes", () => {
    const input = updateWorkSchema.parse({ status: "archived", title: " 归档作品 ", targetWords: 0 });
    assert.deepEqual(input, { status: "archived", title: "归档作品", targetWords: 0 });
  });
  it("rejects invalid states without treating them as a default", () => {
    for (const status of ["deleted", "", null, 1]) {
      assert.equal(updateWorkSchema.safeParse({ status, title: "不应保存" }).success, false);
    }
  });
  it("rejects empty or malformed metadata changes", () => {
    for (const input of [{}, { title: " " }, { targetWords: -1 }, { status: "archived", title: " " }]) {
      assert.equal(updateWorkSchema.safeParse(input).success, false);
    }
  });
});
