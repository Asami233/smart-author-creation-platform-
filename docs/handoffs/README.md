# 前后端双向交接索引（Codex ↔ Gemini）

本索引用于记录前后端双向交接文档。双方每次开始新一轮开发或接入前必须先阅读本索引及最新相关文档。日期较新的文档优先；如与 `contracts/**` 冲突，以 `contracts/**` 和最新交接文档为准，并立即记录冲突。

当前总体规划与阶段划分见 [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md)。

## 已有交接文档

| 日期 | 方向 | 主题 | 文档 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-09-23 | 后端 → 前端 | 一周第 1 天：Q01 页面复验、Q02 代码风险与 Gemini 待办 | [联合验收与下一轮提示词](./2026-09-23-backend-week-day1-acceptance.md) | Q01 真实页面通过；Q02 待收口；G0/G1 未放行 |
| 2026-09-23 | 前端 → 后端 | 写入守护与排序空隙增量修复 (Q01 & Q02) 交付 | [`./2026-09-23-frontend-write-guards-browser-acceptance-q01-q02.md`](./2026-09-23-frontend-write-guards-browser-acceptance-q01-q02.md) | **单元测试通过 (9/9)、全量回归通过 (12 套件)、构建通过，已交付 Codex 联合验收** |
| 2026-09-23 | 后端 → 前端 | 保存/恢复写入竞争保护、真实浏览器验收与排序空隙误报 | [后端交付、页面证据与 Gemini 提示词](./2026-09-23-backend-write-guards-browser-acceptance.md) | 43 单测与三组回归通过；浏览器两条关键路径通过，Q01 误报冲突已复现，待前端收口 |
| 2026-09-23 | 前端 → 后端 | 目录版本基线分离、结构操作互斥闭环与增删协调（R01～R03）交付 | [`./2026-09-23-frontend-archive-fix-chapter-review-r01-r03.md`](./2026-09-23-frontend-archive-fix-chapter-review-r01-r03.md) | **已完成并交付 Codex / GPT 联合验收** |
| 2026-09-23 | 后端 → 前端 | 归档响应修复、章节组织复核与版本基线保护 | [本轮后端结果与 Gemini 提示词](./2026-09-23-backend-archive-fix-chapter-review.md) | 后端验证通过；前端已完成 R01～R03 闭环交付 |
| 2026-09-23 | 前端 → 后端 | 章节跨卷移动、卷内排序与保存串行安全交付 | [`./2026-09-23-frontend-chapter-move-order-safety.md`](./2026-09-23-frontend-chapter-move-order-safety.md) | **已完成并交付 Codex / GPT 联合验收** |
| 2026-09-23 | 后端 → 前端 | 章节跨卷移动/排序安全、并发修订与 Gemini 下一工作包 | [章节组织交付与提示词](./2026-09-23-backend-chapter-move-order-safety.md) | 后端回归通过；前端已接入完成并交付联合验收 |
| 2026-09-23 | 前端 → 后端 | F01～F05 防丢稿闭环、分卷排序接入与统一服务端统计交付 | [`./2026-09-23-frontend-volume-order-stats-f01-f05.md`](./2026-09-23-frontend-volume-order-stats-f01-f05.md) | **已完成并交付 Codex / GPT 联合验收** |
| 2026-09-23 | 后端 → 前端 | 分卷排序、上海日统计、UI 交付再验收与 Gemini 后续任务 | [本轮后端交付与提示词](./2026-09-23-backend-volume-order-stats-review.md) | 后端验证通过；前端 F01～F05 与新接口接入已完成 |
| 2026-09-23 | 前端 → 后端 | 界面字体与视觉规范统一、产品复盘 A01～A07 验收收口与分卷安全删除 | [`./2026-09-23-frontend-ui-unification-and-acceptance.md`](./2026-09-23-frontend-ui-unification-and-acceptance.md) | **已完成并交付 Codex / GPT 联合验收** |
| 2026-09-23 | Codex → 项目所有者 / Gemini | 产品复盘、验收收口、开发周期与 UI 字体规范 | [本轮规划与 Gemini 提示词](./2026-09-23-product-review-ui-roadmap.md) | 规划已交付；前端已按规范收口交付 |
| 2026-09-22 | 前端 → 后端 | 分卷折叠交互优化、双引号取消与编辑器细节修复交付 | [`./2026-09-22-frontend-editor-and-volume-fixes.md`](./2026-09-22-frontend-editor-and-volume-fixes.md) | **已交付 Codex / GPT 查阅** |
| 2026-09-22 | 前端 → 后端 | 新建分卷功能、分卷折叠交互与后续后端需求 | [`./2026-09-22-frontend-volume-management.md`](./2026-09-22-frontend-volume-management.md) | **已交付 Codex / GPT 查阅** |
| 2026-09-22 | 前端 → 后端 | 防丢稿串行保护、版本分页、批量关联与大纲重排交付 | [`./2026-09-22-frontend-version-pagination-batch-links-reorder.md`](./2026-09-22-frontend-version-pagination-batch-links-reorder.md) | **已交付 Codex / GPT 联合验收** |
| 2026-09-22 | 后端 → 前端 | 版本分页、批量关联与大纲排序 | [`./2026-09-22-backend-version-pagination-batch-links-reorder.md`](./2026-09-22-backend-version-pagination-batch-links-reorder.md) | **前端已接入完成，已交付联合验收** |
| 2026-09-22 | 前端 → 后端 | 设定知识库、历史版本、真实导出与回收站接入交付 | [`./2026-09-22-frontend-knowledge-version-export.md`](./2026-09-22-frontend-knowledge-version-export.md) | **已交付 Codex / GPT 联合验收** |
| 2026-09-22 | 后端 → 前端 | 迭代 2 设定、版本与导出安全校验 | [`./2026-09-22-backend-knowledge-version-export-safety.md`](./2026-09-22-backend-knowledge-version-export-safety.md) | **前端已接入完成，已交付联合验收** |
| 2026-09-22 | 前端 → 后端 | 工作台章节并发保存保护与版本安全接入交付 | [`./2026-09-22-frontend-workspace-revision-safety.md`](./2026-09-22-frontend-workspace-revision-safety.md) | **已交付 Codex / GPT 联合验收** |
| 2026-09-22 | 后端 → 前端 | 工作台章节并发保存保护 | [`./2026-09-22-backend-workspace-revision-safety.md`](./2026-09-22-backend-workspace-revision-safety.md) | **前端已接入完成，已交付联合验收** |
| 2026-09-21 | 前端 → 后端 | 每日目标卡片 SSR 水合不匹配修复交付 | [`./2026-09-21-frontend-hydration-fix.md`](./2026-09-21-frontend-hydration-fix.md) | **已交付 Codex / GPT 验收** |
| 2026-09-21 | 后端 → 前端 | AI 首次配置 `baseUrl` 未定义崩溃 | [`2026-09-21-ai-settings-unconfigured-state.md`](./2026-09-21-ai-settings-unconfigured-state.md) | **前端已修复** |
| 2026-09-21 | 前端 → 后端 | AI 未配置状态防御性处理与类型修复交付 | [`./2026-09-21-frontend-ai-settings-unconfigured-fix.md`](./2026-09-21-frontend-ai-settings-unconfigured-fix.md) | **已交付 Codex / GPT 验收** |
| 2026-09-21 | 后端 → 前端 | 多小说工作台与真实 AI 配置 | [`../WORKSPACE_AI_HANDOFF.md`](../WORKSPACE_AI_HANDOFF.md) | **前端已接入完成** |
| 2026-09-21 | 前端 → 后端 | 多小说工作台与真实 AI 前端接入交付 | [`./2026-09-21-frontend-workspace-and-ai.md`](./2026-09-21-frontend-workspace-and-ai.md) | **已交付 Codex / GPT 联合验收** |
| 2026-09-21 | 后端 → 前端 | 邮箱注册、登录、会话和资料 | [`../AUTH_API.md`](../AUTH_API.md) | 已开始接入，需联合验收真实邮件 |
| 2026-09-21 | 后端 → 前端 | 备份、存储与回收站 | [`../DATA_SAFETY_API.md`](../DATA_SAFETY_API.md) | 待 Gemini 核对 |

## 新交接文件命名规范

- 后端交付前端：`YYYY-MM-DD-backend-<主题英文短名>.md`（早期直接在 `docs/` 下）
- 前端交付后端：`YYYY-MM-DD-frontend-<主题英文短名>.md`

例如：`2026-09-21-frontend-ai-settings-unconfigured-fix.md`、`2026-09-22-backend-ai-streaming.md`。

## Codex（后端）完成条件

后端功能只有同时满足以下条件才算可以交给 Gemini：
- 契约已更新，接口实现与契约一致。
- 数据库迁移只新增、不改写已应用迁移。
- 类型检查、后端测试和构建通过。
- 真实 API 冒烟测试通过，或明确说明无法测试的外部依赖。
- 已新增交接文档并更新本索引。
- 已列出 Gemini 必须修改、不得继续保留的 mock，以及联合验收步骤。

## Gemini（前端）完成与交付条件（强制约束）

前端每次完成页面功能、接口接入或阶段改造后，必须同时满足以下条件：
- **必须编写对应的交接文档**：在 `docs/handoffs/` 新增一份 `YYYY-MM-DD-frontend-<主题>.md`，并更新本索引。
- **必须明确告知后端（Codex / GPT）**：详细说明前端修改了哪些组件与路由、实际调用的接口路径与载荷结构（Payload）、已清理的 mock 与死数据、联合验收状态以及对后端的后续需求与契约建议。
- **严格遵循代码所有权边界**：`git diff -- app/api server db drizzle lib/server contracts` 必须为空，不越界修改后端。
- **前端类型检查与构建通过**：`npx tsc --noEmit` 0 错误，`npm run build` 构建成功。
