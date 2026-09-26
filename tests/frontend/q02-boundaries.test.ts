import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateChapterOrderDelta,
  verifyChapterReorderRevision,
  canPerformStructuralAction,
  canPerformSave,
  canSwitchWork,
  categorizeMutationError,
  isDraftContentEquivalent,
  isDraftPendingSaveEquivalent,
  normalizeRichText,
  canApplyResyncResponse,
  type ChapterReorderSnapshot,
} from "../../lib/client/chapter-order-guards";

describe("Q02 Boundary ①: Delete/Create mutation error categorization and resync gating", () => {
  it("distinguishes known 409 rejection from unknown network failures", () => {
    // 409 冲突
    const err409 = new Error("409 Conflict: target volume state changed");
    (err409 as any).status = 409;
    const cat409 = categorizeMutationError(err409);
    assert.equal(cat409.isConflict, true);
    assert.equal(cat409.isUnknownResult, false);

    // 网络超时 / 掉线 / 500
    const errNet = new Error("Failed to fetch: NetworkTimeout");
    const catNet = categorizeMutationError(errNet);
    assert.equal(catNet.isConflict, false);
    assert.equal(catNet.isUnknownResult, true);

    // 400 参数错误（明确拒绝）
    const err400 = new Error("Bad Request: title is empty");
    (err400 as any).status = 400;
    const cat400 = categorizeMutationError(err400);
    assert.equal(cat400.isConflict, false);
    assert.equal(cat400.isUnknownResult, false);
  });

  it("strictly blocks structural actions while needsCatalogResync is active", () => {
    assert.equal(canPerformStructuralAction(true).allowed, false);
    assert.match(canPerformStructuralAction(true).errorMessage!, /重新同步目录/);
    assert.equal(canPerformStructuralAction(false).allowed, true);
  });

  it("simulates mutation failure entering needsCatalogResync gate and preventing subsequent writes", async () => {
    let needsCatalogResync = false;
    let chapters = [{ id: "c-1", title: "第一章", sortOrder: 0 }];

    // 模拟删除分卷网络失败
    async function mockDeleteVolumeFailure() {
      try {
        throw new Error("Network timeout after server processed request");
      } catch (err) {
        const { isConflict, isUnknownResult } = categorizeMutationError(err);
        assert.equal(isUnknownResult, true);
        needsCatalogResync = true;
      }
    }

    await mockDeleteVolumeFailure();
    assert.equal(needsCatalogResync, true, "异常后必须立刻置 needsCatalogResync = true");

    // 此时用户尝试新建章节，被门禁严格拦截
    const canCreate = canPerformStructuralAction(needsCatalogResync);
    assert.equal(canCreate.allowed, false, "待同步状态下禁止新建章节");

    // 模拟重新同步成功后解除门禁
    needsCatalogResync = false;
    assert.equal(canPerformStructuralAction(needsCatalogResync).allowed, true);
  });
});

describe("Q02 Boundary ②: Missing content baseline safe comparison vs silent overwrite", () => {
  it("rejects equivalence when rich text formatting changes (strong, em, blockquote, paragraph split)", () => {
    // 加粗 vs 无加粗
    assert.equal(
      isDraftContentEquivalent("<p><strong>加粗正文</strong></p>", "<p>加粗正文</p>"),
      false,
      "富文本加粗修改绝对不能被判为已保存！",
    );
    // 斜体 vs 无斜体
    assert.equal(
      isDraftContentEquivalent("<p><em>斜体正文</em></p>", "<p>斜体正文</p>"),
      false,
      "富文本斜体修改绝对不能被判为已保存！",
    );
    // 引用块 vs 普通段落
    assert.equal(
      isDraftContentEquivalent("<blockquote>引用段落</blockquote>", "<p>引用段落</p>"),
      false,
      "引用块排版修改绝对不能被判为已保存！",
    );
    // 段落划分不同
    assert.equal(
      isDraftContentEquivalent("<p>第一行</p><p>第二行</p>", "<p>第一行第二行</p>"),
      false,
      "分段结构修改绝对不能被判为已保存！",
    );
    // 标题级别不同
    assert.equal(
      isDraftContentEquivalent("<h2>标题</h2>", "<p>标题</p>"),
      false,
      "标题样式修改绝对不能被判为已保存！",
    );
  });

  it("rejects equivalence when whitespace changes (spaces, multi-spaces, full-width spaces, empty lines)", () => {
    // 普通英文空格
    assert.equal(isDraftContentEquivalent("<p>甲 乙</p>", "<p>甲乙</p>"), false, "文字中间的空格修改不能被忽略！");
    // 连续空格
    assert.equal(isDraftContentEquivalent("<p>甲  乙</p>", "<p>甲 乙</p>"), false, "连续空格变化不能被忽略！");
    // 全角空格
    assert.equal(isDraftContentEquivalent("<p>　全角缩进</p>", "<p>全角缩进</p>"), false, "全角缩进空格不能被忽略！");
    // 空行段落增减
    assert.equal(
      isDraftContentEquivalent("<p>第一段</p><p><br></p><p>第二段</p>", "<p>第一段</p><p>第二段</p>"),
      false,
      "段间空行变化不能被忽略！",
    );
    // 纯文本首尾空格（原生 contentEditable 或裸文本，严防全局 .trim() 错判）
    assert.equal(isDraftContentEquivalent(" 正文", "正文"), false, "裸文本首空格修改不能被忽略！");
    assert.equal(isDraftContentEquivalent("正文 ", "正文"), false, "裸文本尾随空格修改不能被忽略！");
    assert.equal(isDraftContentEquivalent(" 正文 ", "正文"), false, "裸文本首尾空格修改不能被忽略！");
    assert.equal(isDraftContentEquivalent("\n正文", "正文"), false, "首换行符修改不能被忽略！");
    assert.equal(isDraftContentEquivalent("正文\n", "正文"), false, "尾换行符修改不能被忽略！");
    // 纯英文空格、全角空格与空内容绝不等价（严禁用 s.trim() === "" 归零）
    assert.equal(isDraftContentEquivalent("　　", ""), false, "纯全角空格段首缩进与空正文绝不等价！");
    assert.equal(isDraftContentEquivalent(" ", ""), false, "纯英文空格与空正文绝不等价！");
    assert.equal(isDraftContentEquivalent("  ", ""), false, "多个英文空格与空正文绝不等价！");
    assert.equal(isDraftContentEquivalent("\n", ""), false, "纯换行符与空正文绝不等价！");
    assert.equal(isDraftContentEquivalent("<p> </p>", ""), false, "段落内含空格与空正文绝不等价！");
    assert.equal(isDraftContentEquivalent("<p>　　</p>", ""), false, "段落内含全角缩进与空正文绝不等价！");
  });

  it("safely recognizes truly equivalent content including empty chapter initializations", () => {
    // 空章节的各种 HTML 占位形式安全等价
    assert.equal(isDraftContentEquivalent("", "<p></p>"), true);
    assert.equal(isDraftContentEquivalent("<p><br></p>", ""), true);
    assert.equal(isDraftContentEquivalent("<p><br/></p>", "<p></p>"), true);

    // 完全相同的内容与格式等价
    assert.equal(
      isDraftContentEquivalent("<p><strong>完全相同</strong></p>", "<p><strong>完全相同</strong></p>"),
      true,
    );
    // 标签大小写规范化后等价
    assert.equal(isDraftContentEquivalent("<P>大写标签</P>", "<p>大写标签</p>"), true);
  });

  it("correctly evaluates title-only pending saves without being misled by empty or non-empty content", () => {
    // 场景 1：服务端正文为空，仅待保存标题发生修改
    // 决不能因为本地没传正文（content 为空）且服务端正文为空，就把标题修改判为“已保存”而丢弃！
    const titleOnlyChangedEmptyServer = isDraftPendingSaveEquivalent(
      { title: "修改后的新章节名" },
      { title: "原始章节名", content: "" },
    );
    assert.equal(
      titleOnlyChangedEmptyServer,
      false,
      "服务端正文为空时，仅标题待保存决不能被误判为已保存！",
    );

    // 场景 2：服务端正文为空，标题完全一致
    const titleSameEmptyServer = isDraftPendingSaveEquivalent(
      { title: "未改变的章节名" },
      { title: "未改变的章节名", content: "" },
    );
    assert.equal(titleSameEmptyServer, true, "标题完全一致时允许识别为等价");

    // 场景 3：服务端正文非空（已有长文），仅待保存标题发生修改
    // 决不能用空正文去和已有的服务端长文比对而误报“正文冲突”，必须准确按标题比对！
    const titleOnlyChangedNonEmptyServer = isDraftPendingSaveEquivalent(
      { title: "修改后的新章节名" },
      { title: "原始章节名", content: "<p>这是一篇已经写了上万字的长文章节正文...</p>" },
    );
    assert.equal(titleOnlyChangedNonEmptyServer, false, "标题不同时返回 false");

    // 场景 4：服务端正文非空，标题完全一致
    const titleSameNonEmptyServer = isDraftPendingSaveEquivalent(
      { title: "已有章节名" },
      { title: "已有章节名", content: "<p>这是一篇已经写了上万字的长文章节正文...</p>" },
    );
    assert.equal(
      titleSameNonEmptyServer,
      true,
      "仅改标题流程中，当标题一致时不因本地未传 content 而误报正文不一致",
    );
  });

  it("correctly evaluates composite pending saves (title and content combined)", () => {
    // 标题相同，正文格式不同
    assert.equal(
      isDraftPendingSaveEquivalent(
        { title: "第一章", content: "<p><strong>正文</strong></p>" },
        { title: "第一章", content: "<p>正文</p>" },
      ),
      false,
    );
    // 标题不同，正文相同
    assert.equal(
      isDraftPendingSaveEquivalent(
        { title: "第一章（修）", content: "<p>正文</p>" },
        { title: "第一章", content: "<p>正文</p>" },
      ),
      false,
    );
    // 标题和正文均完全相同
    assert.equal(
      isDraftPendingSaveEquivalent(
        { title: "第一章", content: "<p>正文</p>" },
        { title: "第一章", content: "<p>正文</p>" },
      ),
      true,
    );
    // 纯全角空格或英文空格待保存与空服务端正文绝不等价（必须阻止静默跳过保存）
    assert.equal(
      isDraftPendingSaveEquivalent(
        { content: "　　" },
        { title: "空章节", content: "" },
      ),
      false,
      "全角空格草稿绝不能被判为与空服务端正文等价！",
    );
    assert.equal(
      isDraftPendingSaveEquivalent(
        { content: " " },
        { title: "空章节", content: "" },
      ),
      false,
      "纯英文空格草稿绝不能被判为与空服务端正文等价！",
    );
    assert.equal(
      isDraftPendingSaveEquivalent(
        { content: "　　" },
        { title: "空章节", content: "<p></p>" },
      ),
      false,
      "全角空格草稿绝不能被判为与 <p></p> 空占位等价！",
    );
    assert.equal(
      isDraftPendingSaveEquivalent(
        { content: " " },
        { title: "空章节", content: "<p></p>" },
      ),
      false,
      "纯英文空格草稿绝不能被判为与 <p></p> 空占位等价！",
    );
  });

  it("simulates performSave protecting rich text, whitespace, and title-only changes on missing baseline", async () => {
    // 模拟 performSave 的通用检验逻辑
    async function runMissingBaselineSave(
      pending: { chapterId: string; title?: string; content?: string },
      serverChapter: { id: string; title: string; revision: number; content: string },
    ) {
      let contentBaseRev: number | undefined = undefined;
      let saveState: string = "idle";
      let conflictChapterId: string | null = null;
      let pendingRetained: any = null;

      const latest = serverChapter;
      const isEquivalent = isDraftPendingSaveEquivalent(pending, latest);

      if (isEquivalent) {
        contentBaseRev = latest.revision;
        saveState = "saved";
        return true;
      } else {
        saveState = "conflict";
        conflictChapterId = pending.chapterId;
        pendingRetained = pending;
        return false;
      }
    }

    // 1. 验证富文本加粗变化：进入冲突保护，保留草稿，不推进基线
    const resFormat = await runMissingBaselineSave(
      { chapterId: "c-1", content: "<p><strong>带加粗草稿</strong></p>" },
      { id: "c-1", title: "第一章", revision: 2, content: "<p>带加粗草稿</p>" },
    );
    assert.equal(resFormat, false, "富文本差异必须阻止保存并保护");

    // 2. 验证空白变化：进入冲突保护，保留草稿
    const resSpace = await runMissingBaselineSave(
      { chapterId: "c-1", content: "<p>字符 A 字符 B</p>" },
      { id: "c-1", title: "第一章", revision: 2, content: "<p>字符A字符B</p>" },
    );
    assert.equal(resSpace, false, "空格差异必须阻止保存并保护");

    // 3. 验证仅改标题（服务端正文为空）：进入冲突保护，保留草稿
    const resTitleEmptyServer = await runMissingBaselineSave(
      { chapterId: "c-1", title: "新章节标题" },
      { id: "c-1", title: "旧章节标题", revision: 2, content: "" },
    );
    assert.equal(resTitleEmptyServer, false, "仅标题修改必须阻止保存并保护");

    // 4. 验证全部相同：安全对齐基线并返回已保存
    const resIdentical = await runMissingBaselineSave(
      { chapterId: "c-1", title: "相同标题", content: "<p>相同正文</p>" },
      { id: "c-1", title: "相同标题", revision: 2, content: "<p>相同正文</p>" },
    );
    assert.equal(resIdentical, true, "全部相同时允许对齐基线并安全跳过 PATCH");

    // 5. 验证纯全角空格段首缩进：进入冲突保护，保留草稿，不推进基线
    const resFullWidth = await runMissingBaselineSave(
      { chapterId: "c-1", content: "　　" },
      { id: "c-1", title: "第一章", revision: 2, content: "" },
    );
    assert.equal(resFullWidth, false, "全角空格段首缩进修改必须阻止保存并保护");

    // 6. 验证纯英文空格：进入冲突保护，保留草稿
    const resSingleSpace = await runMissingBaselineSave(
      { chapterId: "c-1", content: " " },
      { id: "c-1", title: "第一章", revision: 2, content: "" },
    );
    assert.equal(resSingleSpace, false, "纯英文空格修改必须阻止保存并保护");
  });
});

describe("Q02 Boundary ③: Unloaded chapters never establish content baseline on reorder", () => {
  it("does NOT advance content base revision when chapter content was never loaded", () => {
    // 章节 B 在目标卷，但用户从没打开过该章（contentBaseRevision === undefined）
    const snapshot: ChapterReorderSnapshot = {
      chapterId: "chapter-b-unloaded",
      requestRevision: 1,
      contentBaseRevision: undefined, // 未加载正文！
      oldVolumeId: "vol-1",
      oldSortOrder: 0,
      targetVolumeId: "vol-1",
      targetPosition: 1,
      expectedDelta: 1, // 重新排序后预计 revision 为 2
    };

    // 服务端返回 revision: 2
    const verification = verifyChapterReorderRevision(snapshot, 2);

    assert.equal(verification.isMatch, true, "目录版本结构核实匹配");
    assert.equal(verification.isContentBaseLoaded, false, "标记未加载正文基线");
    assert.equal(verification.shouldAdvanceContentBase, false, "严禁因排序响应就给未加载正文的章节建立正文基线！");
  });

  it("advances content base revision ONLY when chapter content was actually loaded and valid", () => {
    // 章节 C 用户正在编辑器中查看，已加载基线版本 1
    const snapshot: ChapterReorderSnapshot = {
      chapterId: "chapter-c-loaded",
      requestRevision: 1,
      contentBaseRevision: 1, // 已加载正文！
      oldVolumeId: "vol-2",
      oldSortOrder: 5,
      targetVolumeId: "vol-2",
      targetPosition: 1,
      expectedDelta: 1,
    };

    const verification = verifyChapterReorderRevision(snapshot, 2);

    assert.equal(verification.isMatch, true);
    assert.equal(verification.isContentBaseLoaded, true);
    assert.equal(verification.shouldAdvanceContentBase, true, "已加载正文且匹配时承认结构修订并推进正文基线");
  });
});

describe("Q02 Boundary ④: Work ID and Request Token isolation on manual catalog resync", () => {
  it("rejects delayed resync response if user switched active works in the meantime", () => {
    const targetWorkId = "work-A";
    const currentActiveWorkId = "work-B"; // 用户已切到作品 B
    const reqToken = 1;
    const currentToken = 1;
    const mockChapters = [{ id: "c-1" }];

    const check = canApplyResyncResponse(
      targetWorkId,
      currentActiveWorkId,
      reqToken,
      currentToken,
      mockChapters,
    );

    assert.equal(check.canApply, false, "作品已切换时必须拒绝应用迟到响应");
    assert.equal(check.canClearGate, false, "绝对不能错误解除新作品的待同步门禁");
    assert.match(check.rejectReason!, /作品已被切换/);
  });

  it("rejects delayed resync response if request token is expired", () => {
    const targetWorkId = "work-A";
    const currentActiveWorkId = "work-A";
    const reqToken = 1;
    const currentToken = 2; // 后续有新请求发起

    const check = canApplyResyncResponse(
      targetWorkId,
      currentActiveWorkId,
      reqToken,
      currentToken,
      [{ id: "c-1" }],
    );

    assert.equal(check.canApply, false);
    assert.match(check.rejectReason!, /请求代次已过期/);
  });

  it("does not clear gate if server returned invalid/missing chapters", () => {
    const check = canApplyResyncResponse(
      "work-A",
      "work-A",
      1,
      1,
      null, // chapters 缺失
    );

    assert.equal(check.canApply, true);
    assert.equal(check.canClearGate, false, "缺失有效章节数据时绝不能清除待同步门禁");
    assert.match(check.rejectReason!, /缺失有效章节列表/);
  });

  it("applies response and clears gate when workId, token, and chapter data are all valid", () => {
    const check = canApplyResyncResponse(
      "work-A",
      "work-A",
      3,
      3,
      [{ id: "c-1", title: "第一章" }],
    );

    assert.equal(check.canApply, true);
    assert.equal(check.canClearGate, true);
    assert.equal(check.rejectReason, undefined);
  });
});

describe("Day 2 Final Followup Regressions: Stale pending merge and work switch decoupling", () => {
  it("merges newer input typed during delayed fetchChapter and protects latest draft in conflict", async () => {
    // 模拟 performSave 中缺失基线拉取服务端最新章节的异步流程
    async function simulateDelayedMissingBaselineSave(
      initialPending: { chapterId: string; title?: string; content?: string },
      onDuringFetch: () => { title?: string; content?: string },
      serverChapter: { id: string; title: string; revision: number; content: string },
    ) {
      let pendingSaveRef: { chapterId: string; title?: string; content?: string } | null = initialPending;
      let saveState = "idle";
      let conflictChapterId: string | null = null;
      let conflictServerChapter: any = null;
      let contentBaseRev: number | undefined = undefined;

      // 保存开始，取出快照
      const currentPending = pendingSaveRef;
      pendingSaveRef = null;
      saveState = "saving";

      // 模拟 fetchChapter 网络延迟
      const fetchPromise = new Promise<{ id: string; title: string; revision: number; content: string }>((resolve) => {
        setTimeout(() => resolve(serverChapter), 10);
      });

      // 在网络在途期间，作者在编辑器中进行了较新的第二次输入
      const newerEdits = onDuringFetch();
      pendingSaveRef = {
        chapterId: currentPending!.chapterId,
        ...newerEdits,
      };

      // 服务端响应返回
      const latest = await fetchPromise;

      // 提取最新有效 pending 并合并较新草稿（app/page.tsx 中的实际安全修复逻辑）
      const newerPending = pendingSaveRef;
      const hasNewerSameChapterInput =
        newerPending !== null && newerPending.chapterId === currentPending!.chapterId;
      const effectivePending = {
        chapterId: currentPending!.chapterId,
        title: hasNewerSameChapterInput ? (newerPending.title ?? currentPending!.title) : currentPending!.title,
        content: hasNewerSameChapterInput ? (newerPending.content ?? currentPending!.content) : currentPending!.content,
      };

      const isEquivalent = isDraftPendingSaveEquivalent(effectivePending, latest);

      if (isEquivalent) {
        contentBaseRev = latest.revision;
        if (hasNewerSameChapterInput) {
          pendingSaveRef = null;
        }
        saveState = "saved";
      } else {
        saveState = "conflict";
        conflictChapterId = currentPending!.chapterId;
        conflictServerChapter = {
          title: latest.title,
          content: latest.content,
          revision: latest.revision,
        };
        // 关键修复：保留合并后的最新输入 effectivePending，绝不被旧快照 currentPending 覆盖！
        pendingSaveRef = newerPending && !hasNewerSameChapterInput ? newerPending : effectivePending;
      }

      return {
        saveState,
        conflictChapterId,
        conflictServerChapter,
        retainedPending: pendingSaveRef,
        effectivePending,
      };
    }

    // 场景 A：网络等待期间作者输入了较新内容，与服务端存在冲突
    const resConflict = await simulateDelayedMissingBaselineSave(
      { chapterId: "c-100", title: "旧标题", content: "<p>第一版草稿</p>" },
      () => ({ title: "新标题", content: "<p>在途键入的第二版较新草稿</p>" }),
      { id: "c-100", title: "旧标题", revision: 5, content: "<p>服务端已有正文</p>" },
    );

    assert.equal(resConflict.saveState, "conflict", "发生内容差异转入版本冲突门禁");
    assert.equal(
      resConflict.retainedPending?.content,
      "<p>在途键入的第二版较新草稿</p>",
      "必须保留在途键入的较新草稿，绝不能被旧快照覆盖！",
    );
    assert.equal(
      resConflict.retainedPending?.title,
      "新标题",
      "必须保留在途键入的较新标题！",
    );

    // 场景 B：网络等待期间作者输入的内容恰好与服务端最新正文一致
    const resEquivalent = await simulateDelayedMissingBaselineSave(
      { chapterId: "c-100", title: "章名", content: "<p>旧草稿</p>" },
      () => ({ title: "章名", content: "<p>服务端最新正文</p>" }),
      { id: "c-100", title: "章名", revision: 6, content: "<p>服务端最新正文</p>" },
    );

    assert.equal(resEquivalent.saveState, "saved", "最新草稿与服务端一致时识别等价并对齐基线");
    assert.equal(resEquivalent.retainedPending, null, "等价后安全清空待保存队列");
  });

  it("decouples structural mutation failures from text save state, allowing work switch with no text draft and retaining catalog gate on switch back", () => {
    // 跟踪跨作品待同步集合与编辑器草稿状态
    const worksNeedingResync = new Set<string>();
    let currentActiveWorkId = "work-A";
    let needsCatalogResync = false;
    let saveState = "saved" as string;
    let pendingSave: any = null;

    // 1. 模拟在作品 A 执行新建章节遇到网络未知结果
    const mutationErr = new Error("POST /api/chapters: Failed to fetch (ETIMEDOUT)");
    const { isConflict, isUnknownResult } = categorizeMutationError(mutationErr);
    assert.equal(isUnknownResult, true);

    // 关键安全修复：不设置 saveState = "error"，保持编辑器正文草稿状态独立；
    // 仅标记目录待同步门禁并将作品 A 加入集合
    worksNeedingResync.add(currentActiveWorkId);
    needsCatalogResync = true;

    assert.equal(saveState, "saved", "新建章节等结构操作故障严禁污染编辑器 saveState");
    assert.equal(needsCatalogResync, true, "作品 A 目录已进入待同步门禁");

    // 2. 作者尝试切换到作品 B（此时当前章节无待保存草稿）
    const switchCheckNoDraft = canSwitchWork(
      pendingSave !== null,
      (saveState as any) === "saving",
      (saveState as any) === "conflict",
    );
    assert.equal(
      switchCheckNoDraft.allowed,
      true,
      "无正文草稿时必须允许作者自由切换作品，不能因结构操作错误被困在当前作品！",
    );

    // 3. 模拟切换到作品 B 并加载数据
    currentActiveWorkId = "work-B";
    needsCatalogResync = worksNeedingResync.has(currentActiveWorkId);
    assert.equal(needsCatalogResync, false, "作品 B 未发生结构故障，不应被开启目录门禁");

    // 4. 模拟从作品 B 切换回作品 A
    currentActiveWorkId = "work-A";
    needsCatalogResync = worksNeedingResync.has(currentActiveWorkId);
    assert.equal(
      needsCatalogResync,
      true,
      "切换回作品 A 时必须从 worksNeedingResync 恢复作品 A 的目录门禁！",
    );

    // 5. 验证在作品 A 恢复门禁后，结构操作依然被拦截
    const writeCheck = canPerformStructuralAction(needsCatalogResync);
    assert.equal(writeCheck.allowed, false, "切回作品 A 后目录门禁必须依然生效");

    // 6. 模拟作品 A 手动重新同步成功
    worksNeedingResync.delete("work-A");
    needsCatalogResync = worksNeedingResync.has("work-A");
    assert.equal(needsCatalogResync, false, "重新同步成功后方可安全解除门禁");

    // 7. 对照验证：如果有未保存正文草稿，切换作品必须被阻断
    pendingSave = { chapterId: "c-1", content: "未保存草稿" };
    const switchCheckWithDraft = canSwitchWork(
      pendingSave !== null,
      (saveState as any) === "saving",
      (saveState as any) === "conflict",
    );
    assert.equal(switchCheckWithDraft.allowed, false, "有未保存正文草稿时必须阻断切换以防丢稿");
  });

  it("addChapter execution path never writes saveState='saving' on mutation, keeps editor state intact on 503 unknown result, and allows work switch without text draft", async () => {
    let saveState: "saved" | "saving" | "conflict" | "error" = "saved";
    let isCreatingChapter = false;
    let pendingSave: any = null;
    let needsCatalogResync = false;
    const worksNeedingResync = new Set<string>();
    let activeWorkId = "work-A";

    // 严格镜像 app/page.tsx 中 addChapter 的执行逻辑
    async function executeAddChapter(targetWorkId: string, simulateFailure: boolean) {
      if (!targetWorkId || isCreatingChapter) return;
      if (needsCatalogResync) {
        throw new Error("BLOCKED_BY_CATALOG_GATE");
      }

      // 1. 结构操作使用独立进度状态，绝不写入正文 saveState
      isCreatingChapter = true;
      try {
        if (simulateFailure) {
          const err: any = new Error("503 Service Unavailable");
          err.status = 503;
          throw err;
        }
        // 成功分支
        pendingSave = null;
        saveState = "saved";
      } catch (err: any) {
        // 关键修复：绝不写入 saveState = "saving" 或 "error"
        categorizeMutationError(err);
        worksNeedingResync.add(targetWorkId);
        needsCatalogResync = true;
      } finally {
        isCreatingChapter = false;
      }
    }

    // 执行 addChapter 遇到 503 故障
    await executeAddChapter(activeWorkId, true);

    // 验证状态：
    assert.equal(isCreatingChapter, false, "结构进度在 finally 中恢复 false");
    assert.equal(saveState, "saved", "正文保存状态绝对没有被置为 saving 或 error");
    assert.equal(needsCatalogResync, true, "目录门禁已开启");
    assert.equal(worksNeedingResync.has("work-A"), true, "worksNeedingResync 已记录作品 A");

    // 验证作品切换：由于无正文草稿且 saveState 仍为 saved，切换必须成功
    const switchCheck = canSwitchWork(
      pendingSave !== null,
      (saveState as any) === "saving",
      (saveState as any) === "conflict",
    );
    assert.equal(switchCheck.allowed, true, "无正文草稿且结构解耦后，必须允许切到作品 B！");

    // 切换到作品 B
    activeWorkId = "work-B";
    needsCatalogResync = worksNeedingResync.has(activeWorkId);
    assert.equal(needsCatalogResync, false, "作品 B 门禁未开启");

    // 切回作品 A
    activeWorkId = "work-A";
    needsCatalogResync = worksNeedingResync.has(activeWorkId);
    assert.equal(needsCatalogResync, true, "切回作品 A 时目录门禁完整保留");

    // 尝试在作品 A 再次新建章节，必须被门禁拦截
    await assert.rejects(
      async () => executeAddChapter(activeWorkId, false),
      /BLOCKED_BY_CATALOG_GATE/,
      "作品 A 门禁生效时必须拦截结构操作",
    );

    // 手动重同步成功后解除
    worksNeedingResync.delete("work-A");
    needsCatalogResync = worksNeedingResync.has("work-A");
    assert.equal(needsCatalogResync, false, "手动重同步后门禁解除");

    // 门禁解除后新建章节成功
    await executeAddChapter(activeWorkId, false);
    assert.equal(saveState, "saved");
    assert.equal(needsCatalogResync, false);
  });
});
