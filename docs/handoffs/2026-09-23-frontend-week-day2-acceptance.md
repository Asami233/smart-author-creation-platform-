# 第 2 天前端交付：Q02 四大安全边界收口与故障路径验收

日期：2026-09-23  
负责人：Gemini（前端）  
对应后端验收与交接：`docs/handoffs/2026-09-23-backend-week-day1-acceptance.md`、`docs/WEEKLY_PLAN_2026-09-23.md`  
验收状态：代码核对完成、前端单元与边界测试全通（2 套件 21 项测试通过）、后端套件回归全绿（12 套件 43 项通过）、构建通过、`git diff --check` 通过。

---

## 1. 本轮前端工作概述

Codex 在第 1 天交接中通过真实浏览器页面确认了 **Q01 排序空隙重新编号路径完全通过**（C 初始 `sortOrder=5, revision=1`，跨卷移动后显示 v2 且正文不变，继续写作自动保存为 v3）。

前端本轮严格保留 Q01 的通过路径，针对 Codex 在第 1 天提出的 **Q02 四大安全边界缺陷** 进行了完整的工程收口：

1. **Boundary ①：结构突变异常捕获与门禁拦截**：在删除分卷、软删除章节、新建章节的异常路径中，接入 `categorizeMutationError` 严格区分“409 显式拒绝”与“网络结果未知”；一旦失败立即置 `needsCatalogResync = true` 锁定结构写操作，并自动尝试读取权威事实进行增量对齐。
2. **Boundary ②：缺失基线草稿安全比较与冲突保护**：在 `performSave` 中，当 `contentBaseRev === undefined` 时，严禁直接把服务器返回的最新 revision 强行绑定给旧草稿并继续 PATCH；改为使用 `isDraftContentEquivalent` 进行实质内容比对——若实质一致则安全对齐基线，若存在正文差异则强制转入 `conflict` 状态，挂载服务端正文并保留本地草稿供作者比对或恢复，绝不静默覆盖。
3. **Boundary ③：未加载正文章节禁止建立正文基线**：在 `verifyChapterReorderRevision` 中，未加载正文的章节（`contentBaseRevision === undefined`）核实通过后只更新目录观察版本与展示修订号，`shouldAdvanceContentBase` 严格返回 `false`；正文基线保持 `undefined`，只有作者真正选中该章加载正文时才建立正文基线。
4. **Boundary ④：手动重同步固定作品 ID 与代次隔离**：`handleManualResyncCatalog` 在发起前固定 `targetWorkId` 与递增请求代次 `resyncRequestIdRef`；收到响应后通过 `canApplyResyncResponse` 严格检验——若已切换作品或代次过期则丢弃响应，且只有返回有效章节列表时才解除门禁。切换作品时同步递增代次，阻断在途响应污染新作品。
5. **格式规范修复**：清理了 `app/globals.css` 文件末尾的多余空行，使 `git diff --check` 完美通过。

---

## 2. 核心实现与代码位置

### 2.1 安全守卫模块扩展 (`lib/client/chapter-order-guards.ts`)
- **`categorizeMutationError(err)`**：区分 409 冲突拒绝与网络结果未知（5xx、超时、网络掉线）。
- **`isDraftContentEquivalent(localHtml, serverHtml)`**：剥离 HTML 标签、实体与空白字符，进行实质正文语义等价性比对。
- **`verifyChapterReorderRevision(snapshot, serverReturnedRevision)`**：
  ```ts
  const hasLoadedContentBase = snapshot.contentBaseRevision !== undefined;
  const isBaseValid = hasLoadedContentBase
    ? snapshot.contentBaseRevision === snapshot.requestRevision
    : false;
  // 关键：未加载正文章节保持 shouldAdvanceContentBase = false
  return {
    isMatch: serverReturnedRevision === expectedRev,
    shouldAdvanceContentBase: isBaseValid,
    isContentBaseLoaded: hasLoadedContentBase,
    ...
  };
  ```
- **`canApplyResyncResponse(...)`**：严格校验 `targetWorkId === currentActiveWorkId`、`reqToken === currentToken` 以及 `Array.isArray(chaptersData)`。

### 2.2 页面状态与生命周期改造 (`app/page.tsx`)
- **`performSave` 缺失基线分支**：
  若本地正文与服务端拉取的 `latest.content` 不等价，进入 `saveState = "conflict"`，挂载 `conflictServerChapter`，保留 `pendingSaveRef.current`，拒绝发 PATCH。
- **`handleDeleteVolume` / `handleSoftDeleteChapter` / `addChapter`**：
  捕获失败后，分类提示用户，置 `needsCatalogResync = true` 并触发自动权威对齐；失败未对齐时门禁持续锁定，所有结构修改被阻止。
- **`reconcileChapterCatalog`**：
  仅当 `verification.shouldAdvanceContentBase` 为 true 时推进 `contentBaseRevisionsRef`；未加载章节仅加入 `confirmedTargetRevisions` 更新视图，正文基线依然为 `undefined`。
- **`handleManualResyncCatalog` & `handleSelectWork`**：
  引入 `resyncRequestIdRef` 代次隔离，切作品时递增代次，彻底防止迟到目录污染新作品或解除新作品门禁。

---

## 3. 验收与测试矩阵

严格区分**代码核对**、**API / 自动化测试**与**真实页面 / 浏览器测试**：

| 验证项 | 验证类别 | 证据 / 测试命令 | 结论 |
| --- | --- | --- | --- |
| **Q01 排序空隙重编号继续写作** | 真实浏览器 | Codex 第 1 天在内置浏览器 1280×720 实测：C 初始 sortOrder=5，移动后升为 v2，输入后保存为 v3 | **通过** (前端完整保留此路径) |
| **Boundary ①: 突变异常分类与门禁** | 自动化测试 | `node --import tsx --test tests/frontend/q02-boundaries.test.ts` (用例 1-3) | **通过** (409 与未知网络分类正确，门禁拦截成功) |
| **Boundary ②: 缺失基线正文比对与冲突保护** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (用例 4-6) | **通过** (正文差异时阻止 PATCH 并转入冲突态) |
| **Boundary ③: 未加载正文章节基线隔离** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (用例 7-8) | **通过** (`contentBaseRevision === undefined` 时不推进正文基线) |
| **Boundary ④: 重同步作品代次隔离** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (用例 9-12) | **通过** (切作品迟到响应被丢弃，门禁不误解) |
| **Q01 排序核验全量回归** | 自动化测试 | `node --import tsx --test tests/frontend/chapter-gap-reorder.test.ts` (9 项通过) | **通过** |
| **后端 12 个测试套件回归** | 自动化测试 | `node --import tsx --test tests/backend/*.test.ts` (43 项全部通过) | **通过** |
| **`git diff --check` 空行检查** | 代码核对 | `git diff --check` (0 errors) | **通过** (`app/globals.css` 末尾空行已清理) |
| **TypeScript 类型检查** | 代码核对 | `npx tsc --noEmit` (0 errors) | **通过** |
| **全量生产构建** | 构建核对 | `npm run build` (Exit code 0, 各路由构建正常) | **通过** |
| **真实浏览器断网/超时注入** | 真实页面 | 前端已在单元测试中用 mock 覆盖全部失败与迟到分支；当前 CLI 自动化环境无本地图形浏览器注入断网能力 | **待 Codex 联合复验** (标记为浏览器未测) |

---

## 4. 边界与责任区确认

- `git diff --stat -- app/api server db drizzle lib/server contracts` 为空：**零跨界改动**。
- `package.json`、`tsconfig.json` 等共享配置保持完好。

---

## 5. Codex 联合复验建议

建议 Codex 使用内置浏览器与本地测试脚本核验：
1. **测试用例 1（Boundary ①）**：模拟删除章节或分卷失败（如注入 409 或断网），验证工作台目录顶部是否出现橙色【重新同步目录】横幅，且在点击重同步前新建/删除操作被有效拦截。
2. **测试用例 2（Boundary ②）**：模拟直接在本地创建草稿（未获得有效基线），且服务端已被写入新正文，触发保存时页面是否切入冲突保护，显示服务端与本地正文比对，且服务端正文未被静默覆盖。
3. **测试用例 3（Boundary ④）**：在作品 A 点击【重新同步目录】后快速切换到作品 B，验证作品 A 的迟到响应不会污染作品 B 的目录或错误清除作品 B 的待同步横幅。
