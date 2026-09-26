# 前端交付：防丢稿串行保护、版本游标分页、批量关联与大纲重排

日期：2026-09-22
前端负责人：Gemini
接收方：Codex / GPT
分支：`codex/backend-iteration2-apis`
状态：**前端接入与防丢稿改造全部完成，已通过人造网络延迟并发与多端冲突实际验证，已通过全量生产构建与后端单元测试，请 Codex 联合验收**

---

## 1. 本次交付概述

针对 Codex 交接文档 [`2026-09-22-backend-version-pagination-batch-links-reorder.md`](./2026-09-22-backend-version-pagination-batch-links-reorder.md) 与项目所有者最新指示，前端坚持**“先解决丢稿风险，再增加功能”**的原则，重点攻克了在途网络请求与持续输入竞态、软删除前保存等待、跨章/跨作品/回滚/关页防丢保护，并完整接入了三个后端新接口，严格落实了指标标注与负向约束。

### 核心任务完成对照表

| 需求项 | 负责人要求 | 前端完成情况 | 对应组件 / 逻辑 |
| :--- | :--- | :--- | :--- |
| **防丢稿机制第一优先** | 在途保存继续输入不被旧响应覆盖；软删除、切章、切作品、恢复、关页遇保存中/失败/409 坚决阻止并保留草稿 | **完全达成**。实现单线串行保存队列，解耦 DOM 覆写时机，全流程拦截危险操作，已通过并发与延迟测试 | `app/page.tsx` (`performSave`, `flushPendingSave`, `handleSoftDeleteChapter`) |
| **历史版本游标分页** | 透明透传 cursor，不重复加载，不丢失已加载项，支持加载更早版本 | **完全达成**。支持 `limit=30`、`cursor` 分页追加，ID 集合去重，提供“已显示全部历史版本”状态 | `lib/client/api.ts` (`fetchChapterVersions`), `components/workbench/version-history-dialog.tsx` |
| **章节设定批量关联** | 多选批量添加与批量删除；失败时保留勾选与 409 报错，不假定部分成功 | **完全达成**。新增专用弹窗，全量比对计算变更差量，遇到 409 保留选择并提示，右侧本章信息实时联动 | `components/workbench/chapter-links-dialog.tsx`, `app/page.tsx` |
| **剧情大纲重排序** | 提交整部作品完整大纲 ID 列表；409 时重新拉取最新列表并提示作者 | **完全达成**。全量 ID 数组重排，遇到 409 自动拉取服务端最新大纲并展示预警 | `components/workbench/outline-view.tsx` (`handleMoveOutline`) |
| **指标展示负向约束** | 不把 `wordsWritten` 展示为“净增字数”，不伪造历史累计趋势 | **完全达成**。看板清晰标注为“每日正向写作字数记录（按当日实际码字产出统计）”，不捏造趋势数据 | `components/workbench/stats-view.tsx` |

---

## 2. 防丢稿架构与并发串行执行设计

### 2.1 问题根因剖析
原有实现存在三个可能造成丢稿的物理盲区：
1. **在途响应覆盖新草稿**：当保存请求 A 在途（如 100ms 延迟）期间作者继续键入内容 B，保存请求 A 返回后直接将 React 状态替换为 A 的返回值，并通过 `useEffect` 将 DOM 编辑器 `innerHTML` 强制刷回 A，导致 B 瞬间被冲掉。
2. **revision 锁死与 409 假冲突**：在途请求 A 发出后未决，若后续输入直接使用旧的 `revision: 1` 再次请求，造成服务端直接报错 409。
3. **危险操作未等在途请求**：软删除、切章、切作品前直接执行，导致防抖延迟中或网络在途的草稿被彻底遗弃。

### 2.2 串行保存队列与 DOM 保护方案（已落地于 `app/page.tsx`）
1. **单线串行保存执行器 (`performSave`)**：
   - 维护 `activeSavePromiseRef`。若已有在途请求，后续保存调用自动进入等待。
   - `runSaveLoop` 循环消费：在途保存完成时，若检测到在途期间有新输入（`pendingSaveRef` 仍有内容），自动以**服务端最新返回并确认的 revision**连续发起下一轮保存，直到队列清空。
2. **解耦 DOM 编辑器与后台更新**：
   - 编辑器 DOM 仅在作者显式切换章节（`currentEditorChapterIdRef.current !== selectedId`）或手动拉取/回滚版本时同步。
   - 保存响应到达时，仅更新章节的 `revision` 与 `wordCount`，若在途期间有更新的输入，决不更新 `content`，彻底绝缘 DOM 冲刷。
3. **全流程危险操作安全阀门**：
   - **软删除章节 (`handleSoftDeleteChapter`)**：必须先 `await flushPendingSave()`。若返回 `false` 或处于 `saving` / `conflict` / `error` 状态，立即弹窗拦截：“当前章节有未保存草稿、正在保存中或处于版本冲突状态，已阻止移入回收站以防丢稿。请解决后再试。”草稿安全保留。
   - **切换章节 (`selectChapter`)**：保存未决或冲突时弹窗拦截，阻止切换。
   - **切换作品 (`handleSelectWork`)**：保存未决或冲突时弹窗拦截，阻止切换。
   - **新建章节 (`addChapter`)**：保存未决或冲突时弹窗拦截，阻止新建。
   - **版本回滚 (`handleRestoreContent`)**：保存未决或冲突时弹窗拦截，阻止回滚覆盖。
   - **关闭页面 (`beforeunload`)**：全面检测 `pendingSaveRef.current !== null || activeSavePromiseRef.current !== null || saveStateRef.current === "saving" | "conflict" | "error"`，弹出浏览器原生防走失保护。

---

## 3. 三大新接口前端调用规范与实现细节

### 3.1 历史版本游标分页
- **调用方式**：
  ```typescript
  fetchChapterVersions(chapterId: string, options?: { limit?: number; cursor?: string }): Promise<{
    data: ChapterVersionSummary[];
    pagination?: { hasMore: boolean; nextCursor: string | null };
  }>
  ```
- **前端交互**：
  - 首屏请求 `limit: 30` 获取最近版本；
  - 存在更多版本且 `pagination.hasMore === true` 时，列表底部展示「加载更早历史版本」按钮及加载 Spinner；
  - 点击后透明传入 `cursor: pagination.nextCursor`，返回数据基于 `version.id` 幂等去重追加，无任何重复项；
  - `hasMore === false` 时展示友好提示“已显示全部历史版本”。

### 3.2 章节与设定批量关联
- **调用接口**：
  - 批量新增：`POST /api/chapters/:chapterId/links/batch`，Body: `{ links: [{ entityType, entityId }] }`
  - 批量删除：`DELETE /api/chapters/:chapterId/links/batch`，Body: `{ links: [{ entityType, entityId }] }`
- **组件实现**：[`ChapterLinksDialog`](file:///d:/java/smart-author-creation-platform/components/workbench/chapter-links-dialog.tsx)
  - 分标签页聚合展示当前作品的所有设定实体：角色、世界观条目、剧情大纲、时间线事件；
  - 作者多选勾选后，点击「保存章节关联」；
  - 内部精确计算 `toAdd` 与 `toRemove` 差量，若无变更直接关闭；
  - 若调用返回 `409`（例如存在非法或跨作品设定），**严格保留作者当前的全部勾选状态**，在弹窗顶部展示红色预警条，禁止乐观假定部分成功；
  - 保存成功后全量拉取最新关联列表，右侧检查器「本章关联设定」与工具栏徽标实时同步更新。

### 3.3 剧情大纲整书重排序
- **调用接口**：
  `POST /api/works/:workId/knowledge/outlines/reorder`，Body: `{ outlineIds: string[] }`
- **组件实现**：[`OutlineView`](file:///d:/java/smart-author-creation-platform/components/workbench/outline-view.tsx)
  - 每条大纲支持一键上移/下移（`handleMoveOutline`）；
  - 移动后，生成当前作品**全部大纲的完整 ID 数组**（`newOutlines.map(o => o.id)`），决不只发送筛选子集；
  - 若服务端返回 `409`（由于其他标签页更新或版本变化导致大纲列表不一致），前端立即自动调用 `loadOutlines()` 重新拉取服务端最新大纲，并弹出预警提示作者，杜绝脏序覆盖。

---

## 4. 验证与测试记录

本次提交严格执行实际测试与并发回归，杜绝口头声明：

### 4.1 人造网络延迟与多标签页并发回归测试
运行脚本：`node scratch/test-draft-loss-concurrency.mjs`
- **Test 1（人造延迟 150ms 持续键入）**：
  - 模拟请求在途延迟期间作者二次输入；
  - 串行队列成功自动连续发出 2 轮请求，版本平滑递增 1 -> 2 -> 3；
  - 最终服务端与客户端正文均为最新输入正文，旧响应完全未造成覆盖。测试通过！
- **Test 2（两标签页并发 409 冲突与危险拦截）**：
  - 标签页 1 抢先更新至 revision 2；
  - 标签页 2 带着 revision 1 提交触发 409；
  - 标签页 2 本地创作草稿 100% 完整保留，`saveState` 成功置为 `conflict`；
  - 验证此时切章、切作品、软删除全部被安全拦截；
  - 验证使用当前草稿以服务端最新 revision 2 强制覆盖，成功更新至 revision 3。测试通过！
- **Test 3（软删除草稿等待与失败拦截）**：
  - 验证软删除前等待保存完成；若保存失败则阻止移入回收站。测试通过！

### 4.2 工程自动化检查
- `npx tsc --noEmit`：0 错误，TypeScript 类型检查完全通过。
- `node --import tsx --test tests/backend/*.test.ts`：7 个套件 23 项后端单测全部通过。
- `npm run build`：生产构建完全成功（Vite 8 / vinext 打包无报错）。
- **代码所有权边界核查**：
  `git diff -- app/api server db drizzle lib/server contracts` 输出为空，完全符合前后端边界规范。

---

## 5. Codex 联合验收步骤建议

1. **版本游标分页**：
   - 在已有 5 个以上历史版本的章节中打开「版本」对话框，点击「加载更早历史版本」，验证摘要无重复追加，滚动列表顺畅。
2. **批量关联**：
   - 打开编辑栏「关联」或右侧「本章信息 - 管理关联」，勾选多个角色与大纲，点击保存；
   - 刷新页面或切换章节后切回，验证关联项准确持久化。
3. **大纲重排**：
   - 进入大纲面板，对条目执行上移/下移，观察控制台请求体为全量大纲 ID 数组，刷新后顺序保持一致。
4. **并发防丢稿压测**：
   - 在网络调试面板开启 Slow 3G，连续快速修改章节正文，观察状态指示灯与请求时序，确认无 409、无草稿回退。
   - 处于未保存状态时尝试快速点击其他章节或删除章节，确认系统弹出拦截提示，正文安然无恙。

---

## 6. 对后端的后续需求与建议

1. **全书历史创作趋势接口 (Aggregated Stats API)**：
   - 理解 Codex 说明的当前 `writing_daily_stats` 模型限制。后续规划支持真实的每日净增与走势 API 时，前端将第一时间接入渲染折线图。
2. **AI 流式响应 (SSE / Fetch Streaming)**：
   - 目前 AI 续写与润色采用一次性返回。对于长篇小说的长场景续写，若后端后续开放流式传输接口，前端可接入打字机效果，大幅提升创作者体验。
