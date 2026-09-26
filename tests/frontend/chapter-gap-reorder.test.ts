import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateChapterOrderDelta,
  buildReorderSnapshots,
  verifyChapterReorderRevision,
  canPerformStructuralAction,
  canPerformSave,
  type ChapterReorderSnapshot,
} from "../../lib/client/chapter-order-guards";

describe("Q01: sortOrder gap delta calculation and revision verification", () => {
  it("calculates delta=1 when sortOrder changes due to gap re-indexing (Codex gap scenario)", () => {
    // 场景复现：分卷 2 原有章节 C，旧 sortOrder=5，旧 revision=1
    // 用户将章节 A 移入分卷 2，排列为 [A (pos 0), C (pos 1)]
    // C 在卷内没有更换 volumeId，但 sortOrder 从 5 重新编号为 1
    const oldVolumeId = "vol-2";
    const targetVolumeId = "vol-2";
    const oldSortOrder = 5;
    const newPosition = 1;

    const delta = calculateChapterOrderDelta(oldVolumeId, oldSortOrder, targetVolumeId, newPosition);
    assert.equal(delta, 1, "sortOrder 从 5 变为 1 必须判定结构发生变化，产生增量 1");

    const snapshot: ChapterReorderSnapshot = {
      chapterId: "chapter-c",
      requestRevision: 1,
      contentBaseRevision: 1,
      oldVolumeId,
      oldSortOrder,
      targetVolumeId,
      targetPosition: newPosition,
      expectedDelta: delta,
    };

    // 服务端因 sort_order 变更执行 revision+1，返回 revision: 2
    const verification = verifyChapterReorderRevision(snapshot, 2);
    assert.equal(verification.isMatch, true);
    assert.equal(verification.expectedRevision, 2);
    assert.equal(verification.actualRevision, 2);
    assert.equal(verification.shouldAdvanceContentBase, true);
  });

  it("calculates delta=0 when volume and sortOrder are completely unchanged", () => {
    // 章节 D 已经在目标卷且位置未变
    const oldVolumeId = "vol-2";
    const targetVolumeId = "vol-2";
    const oldSortOrder = 0;
    const newPosition = 0;

    const delta = calculateChapterOrderDelta(oldVolumeId, oldSortOrder, targetVolumeId, newPosition);
    assert.equal(delta, 0, "位置未改变时增量必须为 0");

    const snapshot: ChapterReorderSnapshot = {
      chapterId: "chapter-d",
      requestRevision: 3,
      contentBaseRevision: 3,
      oldVolumeId,
      oldSortOrder,
      targetVolumeId,
      targetPosition: newPosition,
      expectedDelta: delta,
    };

    const verification = verifyChapterReorderRevision(snapshot, 3);
    assert.equal(verification.isMatch, true);
    assert.equal(verification.expectedRevision, 3);
    assert.equal(verification.shouldAdvanceContentBase, true);
  });

  it("calculates delta=1 when chapter moves across volumes even if position index matches", () => {
    // 章节从未分卷 (null) 移入 vol-1，在各自列表中的下标恰好都是 0
    const delta = calculateChapterOrderDelta(null, 0, "vol-1", 0);
    assert.equal(delta, 1, "跨卷移动即使目标下标恰好相同，也必须产生增量 1");
  });

  it("detects external concurrent mutation and refuses to advance content base", () => {
    const snapshot: ChapterReorderSnapshot = {
      chapterId: "chapter-c",
      requestRevision: 1,
      contentBaseRevision: 1,
      oldVolumeId: "vol-2",
      oldSortOrder: 5,
      targetVolumeId: "vol-2",
      targetPosition: 1,
      expectedDelta: 1, // 预期 revision 变为 2
    };

    // 假设远端有人在此期间提交了正文或并发修改，服务端返回 revision: 3
    const verification = verifyChapterReorderRevision(snapshot, 3);
    assert.equal(verification.isMatch, false);
    assert.equal(verification.expectedRevision, 2);
    assert.equal(verification.actualRevision, 3);
    assert.equal(verification.shouldAdvanceContentBase, false);
    assert.match(verification.reason!, /版本不匹配/);
  });

  it("detects stale pre-request content baseline and refuses to advance content base", () => {
    const snapshot: ChapterReorderSnapshot = {
      chapterId: "chapter-c",
      requestRevision: 2,
      contentBaseRevision: 1, // 请求前正文基线已经落后于目录请求版本 2
      oldVolumeId: "vol-2",
      oldSortOrder: 0,
      targetVolumeId: "vol-2",
      targetPosition: 1,
      expectedDelta: 1,
    };

    const verification = verifyChapterReorderRevision(snapshot, 3);
    assert.equal(verification.isMatch, false);
    assert.equal(verification.shouldAdvanceContentBase, false);
    assert.match(verification.reason!, /正文基线失真/);
  });

  it("buildReorderSnapshots accurately packages whole target group and flags missing sortOrder", () => {
    const chapters = [
      { id: "c-1", volumeId: "v1", sortOrder: 0, revision: 1 },
      { id: "c-2", volumeId: "v1", sortOrder: 5, revision: 2 },
      { id: "c-3", volumeId: null, sortOrder: 2, revision: 1 },
    ];

    const { expectedRevisions, snapshotMap, hasMissingMetadata } = buildReorderSnapshots(
      chapters,
      "v1",
      (id) => chapters.find((c) => c.id === id)?.revision,
      () => 1,
    );

    assert.equal(hasMissingMetadata, false);
    assert.equal(expectedRevisions.length, 3);
    assert.equal(snapshotMap.size, 3);

    // c-1: oldVol v1, oldPos 0 -> newPos 0. delta = 0
    assert.equal(snapshotMap.get("c-1")?.expectedDelta, 0);

    // c-2: oldVol v1, oldPos 5 -> newPos 1. delta = 1 (5 != 1)
    assert.equal(snapshotMap.get("c-2")?.expectedDelta, 1);

    // c-3: oldVol null, oldPos 2 -> newPos 2, targetVol v1. delta = 1 (null != v1)
    assert.equal(snapshotMap.get("c-3")?.expectedDelta, 1);
  });

  it("buildReorderSnapshots identifies missing sortOrder or revision metadata", () => {
    const chapters = [
      { id: "c-1", volumeId: "v1", revision: 1 }, // missing sortOrder
    ];

    const { hasMissingMetadata } = buildReorderSnapshots(
      chapters,
      "v1",
      () => 1,
      () => 1,
    );

    assert.equal(hasMissingMetadata, true, "sortOrder 为 undefined 时必须标记元数据缺失");
  });
});

describe("Q02: catalog sync guard and versioned save enforcement", () => {
  it("blocks structural actions when needsCatalogResync is true", () => {
    const checkBlocked = canPerformStructuralAction(true);
    assert.equal(checkBlocked.allowed, false);
    assert.match(checkBlocked.errorMessage!, /重新同步目录/);

    const checkAllowed = canPerformStructuralAction(false);
    assert.equal(checkAllowed.allowed, true);
    assert.equal(checkAllowed.errorMessage, undefined);
  });

  it("blocks chapter save when content base revision is missing/undefined", () => {
    const checkBlocked = canPerformSave(undefined);
    assert.equal(checkBlocked.allowed, false);
    assert.match(checkBlocked.errorMessage!, /尚未获得有效的服务端版本基线/);

    const checkAllowed = canPerformSave(1);
    assert.equal(checkAllowed.allowed, true);
    assert.equal(checkAllowed.errorMessage, undefined);
  });
});
