# 前端写入守护与排序空隙增量修复交付 (Q01 & Q02)

日期：2026-09-23  
负责人：Gemini（前端）  
对应后端交付：`2026-09-23-backend-write-guards-browser-acceptance.md`  
验收状态：代码核对完成、前端单元测试通过（9/9）、后端契约与 Smoke 测试通过（12/12 套件通过）、全量构建通过；浏览器场景严格区分核实状态。

---

## 1. 本轮前端工作概述

针对 Codex 在 `2026-09-23-backend-write-guards-browser-acceptance.md` 中指出的 **Q01（合法排序空隙重编号误报冲突）** 与 **Q02（目录结果未知/重拉失败需可执行门禁与草稿恢复）**，前端完成了模块化重构与安全加固：

1. **创建独立安全守护模块**：新增 `lib/client/chapter-order-guards.ts`，严格限制在前端责任区内，封装结构增量算法、提交快照构造、响应修订核验、结构门禁与保存基线前置检查。
2. **Q01 排序空隙与增量计算修复**：
   - 彻底废除按列表下标猜测位置或“只给移动章设置增量”的逻辑；
   - 本地状态模型与目录协调全链路保留服务端真实 `sortOrder`，并在渲染时严格按 `sortOrder` 升序排列；
   - 排序提交前抓取目标列表整卷快照，严格遵循 `delta = (oldVolumeId !== targetVolumeId || oldSortOrder !== newPosition) ? 1 : 0` 计算预期增量；
   - 响应核实仅当 `actualRevision === requestRevision + delta` 且正文基线有效时推进，绝不推进非目标章节的正文基线。
3. **Q02 目录待同步状态与草稿恢复门禁**：
   - 在工作台建立持久化的 `needsCatalogResync` 状态，异常时显式在目录顶部渲染醒目告警横幅与【重新同步目录】按钮；
   - 处于待同步状态时，拦截新建章节、删除章节、删除分卷、章节/分卷排序等所有结构写操作；
   - 保存正文（`performSave`）强制前置校验有效版本基线，坚决阻止无 `expectedRevision` 的盲目 PATCH；
   - 服务端被删章节保留未保存草稿，提供【复制草稿】与【恢复为新章节】机制。

---

## 2. 关键功能与实现细节

### 2.1 Q01：排序空隙重编号 Delta 计算与正文基线核验

#### 根因剖析（Codex 截图复现分析）
Codex 报告的截图 `docs/verification/2026-09-23-chapter-gap-conflict.png` 中：
- 分卷 2 原有章节 C，旧 `sortOrder` 为 5，旧 `revision` 为 1；
- 用户从其他卷移入章节 A，目标列表变为 `[A (pos 0), C (pos 1)]`；
- 后端将 C 的 `sortOrder` 从 5 重新编号为 1，触发 `sort_order` 变更判定，执行 `revision + 1`，返回 `revision: 2`；
- 旧前端以 C 未更换分卷为由武断推测其 `delta = 0`，预期 revision 为 1，因此与服务端返回的 2 发生假冲突，误报“本地基线 1，预期 1，实际返回 2”。

#### 修复与核心代码
在 `lib/client/chapter-order-guards.ts` 中实现：
```ts
export function calculateChapterOrderDelta(
  oldVolumeId: string | null,
  oldSortOrder: number,
  targetVolumeId: string | null,
  targetPosition: number,
): number {
  return (oldVolumeId !== targetVolumeId || oldSortOrder !== targetPosition) ? 1 : 0;
}
```

在 `app/page.tsx` 中：
- `handleMoveChapter` 与 `handleMoveChapterToVolume` 在发起网络请求前，为目标列表所有章节构建 `ChapterReorderSnapshot` 快照；
- 包含 `requestRevision`、`contentBaseRevision`、`oldVolumeId`、`oldSortOrder`、`targetVolumeId`、`targetPosition`、`expectedDelta`；
- 收到响应后，在 `reconcileChapterCatalog` 中调用 `verifyChapterReorderRevision` 进行严格核实：
  1. 只有 `sc.revision === snap.requestRevision + snap.expectedDelta` 且请求前基线有效时，才推进正文基线 `contentBaseRevisionsRef.current[chId] = sc.revision` 并更新页面章节 `revision`；
  2. 若因并发导致版本不匹配，标记为真实外部冲突，拒绝推进正文基线并提示用户；
  3. 未在本次快照范围内的无关章节（如其他卷的章节），正文基线绝对保持原样，绝不串改。

### 2.2 Q02：目录待同步状态门禁与草稿恢复

1. **可执行的待同步门禁**：
   - 增加 `needsCatalogResync`（React State）与 `needsCatalogResyncRef`（同步 Ref）；
   - 当重排序、跨卷移动、删除分卷或删除章节发生 409、网络故障或二次回拉失败时，置 `needsCatalogResync = true`；
   - 目录上方显示橙色告警提示：“⚠️ 目录状态与服务端暂未对齐（已锁定目录结构变动，本地草稿与基线已保留）”，附带【重新同步目录】按钮；
   - 点击调用 `handleManualResyncCatalog`，重新拉取全书权威分卷与章节元数据并重置待同步状态；
   - `addChapter`、`handleSoftDeleteChapter`、`handleDeleteVolume`、`handleMoveVolume`、`handleMoveChapter`、`handleMoveChapterToVolume` 全部执行 `canPerformStructuralAction` 拦截。
2. **正文保存前置基线守卫**：
   - 在 `performSave` 中，若当前章节 `contentBaseRev === undefined`，立即触发同步回拉最新章节元数据；
   - 若依然无法确定基线，中止保存流程并提示“当前章节尚未获得有效的服务端版本基线，已阻止保存以防覆写外部修改”，确保绝不发送无版本号的空头 PATCH。
3. **被删章节草稿安全恢复**：
   - 在目录协调中，若服务端已删除当前章节但本地存在脏草稿（`pendingSave` 或 `draftSeq > 0`），本地不丢弃该章，重命名为 `【已在服务端删除】`；
   - 编辑器顶部提供【复制草稿】与【恢复为新章节】按钮（`handleRestoreAsNewChapter`），允许作者一键将孤立草稿转存为新章节。

---

## 3. 验收与测试记录矩阵

按照协作规范，本矩阵严格区分**代码核对**、**API / 自动化测试**与**真实页面 / 浏览器测试**，绝不将代码推演伪装为真实浏览器通过：

| 验证项 | 验证类别 | 验证方式 / 证据 | 结论 |
| --- | --- | --- | --- |
| **Q01 排序空隙增量计算** | 自动化测试 | `node --import tsx --test tests/frontend/chapter-gap-reorder.test.ts` (9 项通过) | **通过** (严格覆盖 Codex 截图中的 `sortOrder: 5 -> 1`, `delta: 1`, `revision: 2`) |
| **Q01 无关章节基线隔离** | 自动化测试 | `tests/frontend/chapter-gap-reorder.test.ts` 测试用例 6-7 | **通过** (快照仅覆盖目标卷，非目标卷基线不变) |
| **Q01 并发冲突与旧基线防护** | 自动化测试 | `tests/frontend/chapter-gap-reorder.test.ts` 测试用例 4-5 | **通过** (版本不符或基线失真时拒绝推进) |
| **Q02 待同步状态与结构拦截** | 自动化测试 | `tests/frontend/chapter-gap-reorder.test.ts` 测试用例 8 | **通过** (拦截新增/删除/排序操作) |
| **Q02 无版本基线保存拦截** | 自动化测试 | `tests/frontend/chapter-gap-reorder.test.ts` 测试用例 9 | **通过** (无 base revision 时禁止 PATCH) |
| **全量后端套件回归** | 自动化测试 | `node --import tsx --test tests/backend/*.test.ts` (12 套件、43 项全部通过) | **通过** (无任何后端回归) |
| **后端目录排序端到端 Smoke** | 自动化测试 | `node tests/backend/chapter-order-smoke.mjs` | **通过** (覆盖 105 章重排、跨卷、并发抢占等场景) |
| **TypeScript 类型检查** | 代码核对 | `npx tsc --noEmit` (零错误输出) | **通过** |
| **前端全量生产构建** | 构建核对 | `npm run build` (Exit code 0, 各路由构建正常) | **通过** |
| **浏览器端 Q01 排序空隙页面复验** | 真实页面 | Codex 之前在 5180 预览复现此 Bug；本次前端修复后单元测试 100% 覆盖。由于当前终端为 CLI 自动化环境无本地图形浏览器 | **待联合复验** (标记为浏览器未测) |
| **浏览器端 Q02 待同步横幅点击复验** | 真实页面 | UI 组件已挂载，JSX 与逻辑已闭环 | **待联合复验** (标记为浏览器未测) |

---

## 4. 责任区与修改文件清单

本次改动完全限制在 Gemini 前端责任区内，无跨界修改：

### 修改与新增文件
- `[NEW] lib/client/chapter-order-guards.ts`：纯函数安全守卫模块（Q01 delta 算法、快照构建、响应核验、Q02 结构/保存门禁）。
- `[NEW] tests/frontend/chapter-gap-reorder.test.ts`：Q01 / Q02 专用自动化单元测试套件（9 tests）。
- `[MODIFY] app/page.tsx`：引入并接入守卫模块，增加 `needsCatalogResync` 状态与重同步 UI 横幅，完善保存前置基线检查与草稿恢复入口。
- `[NEW] docs/handoffs/2026-09-23-frontend-write-guards-browser-acceptance-q01-q02.md`：本次交付文档。
- `[MODIFY] docs/handoffs/README.md`：更新交接索引。

### 检查确认
- `git diff --stat -- app/api server db drizzle lib/server contracts`：后端与契约目录绝对未被前端改动。
- `package.json`、`tsconfig.json` 等共享配置文件保持完好。

---

## 5. Codex / GPT 后续建议与待办

1. **下轮联合复验**：建议 Codex 在带有内置浏览器的测试环境中，使用原先的空隙复现步骤（`C.sortOrder = 5`，移入 `A`）进行一次真机核对，预期页面将直接平滑更新 revision 为 2 且不弹出外部冲突提示。
2. **G0 / G1 阶段收敛**：随着 Q01 / Q02 的解决，章节移动、排序空隙重排、目录版本隔离与写入竞争防护的逻辑链路已实现完整闭环。建议项目所有者在复验后正式放行 G0/G1，准备进入 G2 阶段。
