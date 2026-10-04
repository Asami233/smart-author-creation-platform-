/**
 * lib/client/chapter-order-guards.ts
 * 
 * Q01 & Q02 前端安全守护模块：
 * - Q01: 基于真实 sortOrder 和 volumeId 精确计算每章结构修订增量（解决 sortOrder 稀疏间隙重编号导致的正文基线冲突）
 * - Q01: 校验响应 revision 与提交前请求版本/正文基线快照，仅当匹配时推进正文基线；绝对不推进无关章节基线
 * - Q02: 目录待同步状态 (needsCatalogResync) 拦截结构性写入操作
 * - Q02: 缺失基线 revision 时禁止无版本 PATCH 保存
 * - Q02: 服务端删除章节的未保存草稿保留与恢复机制
 */

export interface ChapterReorderSnapshot {
  chapterId: string;
  requestRevision: number;
  contentBaseRevision: number | undefined;
  oldVolumeId: string | null;
  oldSortOrder: number;
  targetVolumeId: string | null;
  targetPosition: number;
  expectedDelta: number;
}

/**
 * Q01 核心算法：计算单章结构修订增量
 * 根据真实 oldVolumeId / oldSortOrder 与 targetVolumeId / targetPosition 对比：
 * 只要卷变更或顺序位变更，后端均会执行 UPDATE chapters SET volume_id = ?, sort_order = ?, revision = revision + 1
 * 从而产生 revision + 1 的确定性结构增量。
 * 绝对不以列表下标或“是否用户主动拖拽该章”猜测。
 */
export function calculateChapterOrderDelta(
  oldVolumeId: string | null,
  oldSortOrder: number,
  targetVolumeId: string | null,
  targetPosition: number,
): number {
  return (oldVolumeId !== targetVolumeId || oldSortOrder !== targetPosition) ? 1 : 0;
}

/**
 * 构造目标列表每章的提交快照与预期修订号
 */
export function buildReorderSnapshots(
  targetChapters: Array<{
    id: string;
    volumeId?: string | null;
    sortOrder?: number;
    revision?: number;
  }>,
  targetVolumeId: string | null,
  getCatalogRevision: (chapterId: string) => number | undefined,
  getContentBaseRevision: (chapterId: string) => number | undefined,
): {
  expectedRevisions: Array<{ chapterId: string; revision: number }>;
  snapshotMap: Map<string, ChapterReorderSnapshot>;
  hasMissingMetadata: boolean;
} {
  const expectedRevisions: Array<{ chapterId: string; revision: number }> = [];
  const snapshotMap = new Map<string, ChapterReorderSnapshot>();
  let hasMissingMetadata = false;

  for (let pos = 0; pos < targetChapters.length; pos++) {
    const item = targetChapters[pos];
    const rev = getCatalogRevision(item.id) ?? item.revision;
    if (rev === undefined || item.sortOrder === undefined) {
      hasMissingMetadata = true;
      continue;
    }

    expectedRevisions.push({ chapterId: item.id, revision: rev });

    const oldVolumeId = item.volumeId ?? null;
    const oldSortOrder = item.sortOrder;
    const delta = calculateChapterOrderDelta(oldVolumeId, oldSortOrder, targetVolumeId, pos);

    snapshotMap.set(item.id, {
      chapterId: item.id,
      requestRevision: rev,
      contentBaseRevision: getContentBaseRevision(item.id),
      oldVolumeId,
      oldSortOrder,
      targetVolumeId,
      targetPosition: pos,
      expectedDelta: delta,
    });
  }

  return { expectedRevisions, snapshotMap, hasMissingMetadata };
}

export interface VerificationResult {
  isMatch: boolean;
  expectedRevision: number;
  actualRevision: number;
  shouldAdvanceContentBase: boolean;
  isContentBaseLoaded: boolean;
  reason?: string;
}

/**
 * Q01 & Q02 响应核验：
 * - 核实服务器返回的章节 revision 是否与预期的结构修订严格一致
 * - 关键 Boundary ③：未加载正文的章节（contentBaseRevision === undefined）不可因排序响应建立正文基线
 * - 只有本地已经加载了正文且基线等于请求版本时，才允许推进正文基线
 */
export function verifyChapterReorderRevision(
  snapshot: ChapterReorderSnapshot,
  serverReturnedRevision: number,
): VerificationResult {
  const expectedRev = snapshot.requestRevision + snapshot.expectedDelta;
  const isMatch = serverReturnedRevision === expectedRev;
  const hasLoadedContentBase = snapshot.contentBaseRevision !== undefined;

  // 若本地已加载正文，基线必须严格等于请求前版本
  const isBaseValid = hasLoadedContentBase
    ? snapshot.contentBaseRevision === snapshot.requestRevision
    : false;

  if (isMatch) {
    if (hasLoadedContentBase && !isBaseValid) {
      return {
        isMatch: false,
        expectedRevision: expectedRev,
        actualRevision: serverReturnedRevision,
        shouldAdvanceContentBase: false,
        isContentBaseLoaded: true,
        reason: `正文基线失真：请求前正文基线 (${snapshot.contentBaseRevision}) 不等于请求版本 (${snapshot.requestRevision})`,
      };
    }

    return {
      isMatch: true,
      expectedRevision: expectedRev,
      actualRevision: serverReturnedRevision,
      // 只有已加载正文且基线匹配的章节，才允许推进正文基线；未加载正文章节保持 shouldAdvanceContentBase = false
      shouldAdvanceContentBase: isBaseValid,
      isContentBaseLoaded: hasLoadedContentBase,
    };
  }

  return {
    isMatch: false,
    expectedRevision: expectedRev,
    actualRevision: serverReturnedRevision,
    shouldAdvanceContentBase: false,
    isContentBaseLoaded: hasLoadedContentBase,
    reason: `版本不匹配：预期 ${expectedRev} (请求基线 ${snapshot.requestRevision} + 增量 ${snapshot.expectedDelta})，实际返回 ${serverReturnedRevision}`,
  };
}

/**
 * Q02 Boundary ①: 区分结构修改异常类型（409 已知拒绝 vs 网络结果未知）
 */
export function categorizeMutationError(err: unknown): {
  isConflict: boolean;
  message: string;
  isUnknownResult: boolean;
} {
  const msg = err instanceof Error ? err.message : String(err || "未知错误");
  const status = (err as any)?.status;
  const isConflict = status === 409 || msg.includes("409") || msg.includes("冲突") || msg.includes("已被修改");
  const isBadRequest = status === 400 || msg.includes("400");
  const isNotFound = status === 404 || msg.includes("404");

  // 409/400/404 等属于服务端已确认接收并明确拒绝的操作
  // 网络超时、ECONNREFUSED、500/502/503/504 等属于结果未知
  const isUnknownResult = !isConflict && !isBadRequest && !isNotFound;

  return {
    isConflict,
    message: msg,
    isUnknownResult,
  };
}

/**
 * 标准化富文本用于安全比对：
 * 1. 统一换行符 \r\n -> \n
 * 2. 统一标签自闭合与大小写：<br/> -> <br>, <P> -> <p>
 * 3. 统一空段落表现：例如纯粹空章节的不同表示 ("" / "<p></p>" / "<p><br></p>" / "<p><br/></p>")
 * 关键安全规则：
 * - 绝对不剥离用户可见的格式标签（如 <strong>, <b>, <em>, <i>, <u>, <h1>~<h6>, <blockquote> 等）
 * - 绝对不去除用户可见的空格与空白字符（如英文空格、全角空格、换行符）
 * - 无法确定等价时必须返回 false，以便调用方保留草稿并转入冲突保护
 */
export function normalizeRichText(html: string): string {
  if (!html) return "";
  let s = html.replace(/\r\n/g, "\n");
  // 标签名规范化：小写化标签并保留闭合斜杠
  s = s.replace(/<(\/)?([A-Za-z0-9]+)(\s[^>]*)?>/g, (_match, slash, tag, rest) => {
    const prefix = slash ? "</" : "<";
    return rest ? `${prefix}${tag.toLowerCase()}${rest}>` : `${prefix}${tag.toLowerCase()}>`;
  });
  // 统一常见自闭合单标签格式
  s = s.replace(/<br\s*\/?>/gi, "<br>");
  s = s.replace(/<hr\s*\/?>/gi, "<hr>");

  // 关键安全修复：仅将完全精确匹配的空字符串及已确认的空段落占位符规范为空；
  // 绝对不得使用 s.trim() === "" 将纯英文空格、全角空格或换行等输入归零！
  if (
    s === "" ||
    s === "<p></p>" ||
    s === "<p><br></p>"
  ) {
    return "";
  }
  return s;
}

/**
 * Q02 Boundary ②: 富文本与空白安全的正文等价性比对
 * 任何可见格式变动（加粗/斜体/引用/段落）或空白变动均视为不等价
 */
export function isDraftContentEquivalent(localHtml: string, serverHtml: string): boolean {
  const normLocal = normalizeRichText(localHtml);
  const normServer = normalizeRichText(serverHtml);
  return normLocal === normServer;
}

/**
 * Q02 Boundary ②: 按待保存字段逐项安全比对
 * 只有所有实际存在的待保存字段（title 和/或 content）均确与服务端最新数据完全一致时，才算真正等价；
 * 无法确定或存在任何差异时返回 false，确保绝不静默丢弃待保存修改。
 */
export function isDraftPendingSaveEquivalent(
  pending: { title?: string; content?: string },
  serverChapter: { title: string; content?: string | null },
): boolean {
  // 1. 如果没有待保存的任何字段，视为等价（无需保存）
  if (pending.title === undefined && pending.content === undefined) {
    return true;
  }

  // 2. 若待保存包含标题：严格比对标题
  if (pending.title !== undefined) {
    const localTitle = (pending.title ?? "").trim();
    const serverTitle = (serverChapter.title ?? "").trim();
    if (localTitle !== serverTitle) {
      return false; // 标题不同，绝不能当作等价跳过保存
    }
  }

  // 3. 若待保存包含正文：严格安全比对正文（包括富文本格式与空白）
  if (pending.content !== undefined) {
    const isContentMatch = isDraftContentEquivalent(
      pending.content,
      serverChapter.content || "",
    );
    if (!isContentMatch) {
      return false; // 正文不同或格式不同，绝不能当作等价跳过保存
    }
  }

  // 只有所有实际存在的待保存字段均与服务端一致，才算等价
  return true;
}

/**
 * Q02 Boundary ④: 严格校验目录重同步响应是否允许应用并解除门禁
 */
export function canApplyResyncResponse(
  targetWorkId: string,
  currentActiveWorkId: string | null,
  reqToken: number,
  currentToken: number,
  chaptersData: unknown,
): {
  canApply: boolean;
  canClearGate: boolean;
  rejectReason?: string;
} {
  if (reqToken !== currentToken) {
    return {
      canApply: false,
      canClearGate: false,
      rejectReason: `请求代次已过期 (req: ${reqToken}, current: ${currentToken})`,
    };
  }

  if (targetWorkId !== currentActiveWorkId) {
    return {
      canApply: false,
      canClearGate: false,
      rejectReason: `作品已被切换 (target: ${targetWorkId}, active: ${currentActiveWorkId})`,
    };
  }

  const hasValidChapters = Array.isArray(chaptersData);
  return {
    canApply: true,
    canClearGate: hasValidChapters,
    rejectReason: hasValidChapters ? undefined : "返回数据中缺失有效章节列表",
  };
}
export function canPerformStructuralAction(needsCatalogResync: boolean): {
  allowed: boolean;
  errorMessage?: string;
} {
  if (needsCatalogResync) {
    return {
      allowed: false,
      errorMessage: "当前作品目录状态待确认，请先点击【重新同步目录】获取最新事实后再执行结构操作。",
    };
  }
  return { allowed: true };
}

/**
 * Q02: 校验保存前置条件，拒绝无版本号的盲目 PATCH 保存
 */
export function canPerformSave(
  contentBaseRev: number | undefined,
): {
  allowed: boolean;
  errorMessage?: string;
} {
  if (contentBaseRev === undefined) {
    return {
      allowed: false,
      errorMessage: "当前章节尚未获得有效的服务端版本基线，已阻止保存以防覆写外部修改。",
    };
  }
  return { allowed: true };
}

/**
 * Q02: 解耦结构操作与正文草稿保存状态，校验作品切换前置条件：
 * 仅当存在未保存的正文草稿、正在保存中或处于版本冲突时才阻止切换作品；
 * 结构操作的异常（如新建/删除分卷结果未知）仅作用于目录门禁，不伪造正文未保存状态，允许无草稿时切换作品。
 */
export function canSwitchWork(
  hasPendingSave: boolean,
  isSaving: boolean,
  isConflict: boolean,
): {
  allowed: boolean;
  errorMessage?: string;
} {
  if (isConflict) {
    return {
      allowed: false,
      errorMessage: "当前章节处于版本冲突状态，请先解决冲突后再切换作品。",
    };
  }
  if (hasPendingSave || isSaving) {
    return {
      allowed: false,
      errorMessage: "当前章节有尚未保存的内容或正在保存中，请稍候再切换作品。",
    };
  }
  return { allowed: true };
}
