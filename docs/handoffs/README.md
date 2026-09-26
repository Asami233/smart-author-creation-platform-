# 全栈交付与历史交接索引

本索引用于记录当前全栈交付和此前 Codex ↔ Gemini 双向交接文档。自 2026-09-26 起由 Codex 统一负责前后端；每轮开始前仍须阅读本索引及最新相关文档。日期较新的文档优先；如与 `contracts/**` 冲突，以正式契约和最新交付文档为准，并立即记录冲突。

当前总体规划与阶段划分见 [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md)。

## 已有交接文档

| 日期 | 方向 | 主题 | 文档 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-09-26 | 全栈 → 项目所有者 | 一周第 5 天结项：上下文预算、供应商兼容、取消用量语义与周放行 | [第 5 天与本周结项](./2026-09-26-fullstack-week-day5-complete.md) | **56 项后端、32 项前端、真实供应商、超限拒绝、浏览器截断与停止门禁、类型和构建通过；本周结项** |
| 2026-09-26 | 全栈 → 项目所有者 | 一周第 4 天结项：AI 流式代理、预览、停止生成与真实供应商验收 | [第 4 天 AI 流式生成闭环](./2026-09-26-fullstack-week-day4-complete.md) | **真实供应商 SSE、浏览器完整/停止门禁、48 项后端、32 项前端测试、类型与构建通过；可进入第 5 天** |
| 2026-09-26 | 全栈 → 项目所有者 | 一周第 3 天结项：恢复确认、回收站日期、桌面布局与 G0/G1 放行 | [第 3 天结项与第 4 天入口](./2026-09-26-fullstack-week-day3-complete.md) | **29 项前端、43 项后端测试、专项冒烟、类型、构建和真实页面闭环通过；G0/G1 正式放行，下一工作日进入 AI 流式后端** |
| 2026-09-26 | 后端 → 项目所有者 / 前端 | 一周第 3 天 G0/G1 页面与导出复验、Gemini 待办 | [第 3 天部分验收与下一轮提示词](./2026-09-26-backend-week-day3-review.md) | 已由同日全栈结项文档关闭；保留为问题发现与验收过程记录 |
| 2026-09-25 | 后端 → 项目所有者 / 前端 | 一周第 2 天联合验收结项：目录故障、草稿基线与作品隔离 | [第 2 天最终放行与第 3 天分工](./2026-09-25-backend-week-day2-complete.md) | **27 项前端、43 项后端测试、类型检查、构建及真实浏览器 503 往返链路通过；第 2 天完成，进入第 3 天** |
| 2026-09-24 | 前端 → 后端 | 一周第 2 天最终收口：addChapter 状态解耦、独立结构进度与真实 Edge 浏览器故障注入验收 | [`./2026-09-24-frontend-week-day2-final.md`](./2026-09-24-frontend-week-day2-final.md) | **单元与回归测试全通 (27 项)、后端回归全绿 (43 项)、本地真实 Edge 浏览器 9 步故障注入全通、构建与 diff --check 通过，已交付 Codex 联合复验** |
| 2026-09-24 | 后端 → 前端 | 第 2 天真实页面复验：结构请求遗留 saving 状态 | [浏览器阻塞项与 Gemini 修复提示](./2026-09-24-backend-week-day2-browser-blocker.md) | 纯空白正文修复及测试通过；无草稿新建故障仍阻止切作品，第 2 天未完成 |
| 2026-09-24 | 后端 → 前端 | 第 2 天最终复核：空白正文误判为空 | [复核结果与最小修复任务](./2026-09-24-backend-week-day2-final-review.md) | 26 前端、43 后端测试及构建通过；纯空白正文仍有静默跳过风险，第 2 天未完成 |
| 2026-09-24 | 后端 → 前端 | 第 2 天复验续篇：跨作品迟到响应与草稿边界 | [页面证据及 Gemini 下一轮提示词](./2026-09-24-backend-week-day2-followup.md) | 迟到响应真实页面通过；空白等价、较新草稿覆盖与结构错误状态待修；第 2 天未完成 |
| 2026-09-24 | 前端 → 后端 | 一周第 2 天：草稿等价判定修复与缺失基线防丢稿交付 | [`./2026-09-24-frontend-draft-baseline-equivalence-fix.md`](./2026-09-24-frontend-draft-baseline-equivalence-fix.md) | **单元与回归测试全通 (24 项)、后端回归全绿 (43 项)、构建与 diff --check 通过，已交付 Codex 联合复验** |
| 2026-09-24 | 后端 → 前端 | 一周第 2 天：目录故障门禁复验与缺失基线丢稿风险 | [联合复验与 Gemini 下一轮提示词](./2026-09-24-backend-week-day2-review.md) | 目录断网门禁与手动重同步真实页面通过；富文本／仅标题缺失基线风险待修；第 2 天未完成 |
| 2026-09-23 | 前端 → 后端 | 一周第 2 天：Q02 四大安全边界收口与故障路径验收交付 | [`./2026-09-23-frontend-week-day2-acceptance.md`](./2026-09-23-frontend-week-day2-acceptance.md) | **单元与边界测试全通 (21 项)、回归全通 (43 项)、构建与 diff --check 通过，已交付 Codex 联合复验** |
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

## Codex 全栈完成条件

工作包只有同时满足以下条件才算完成：
- 契约已更新，接口实现与契约一致。
- 数据库迁移只新增、不改写已应用迁移。
- 前端测试、后端测试、类型检查和构建按风险通过。
- 真实 API 冒烟测试通过，或明确说明无法测试的外部依赖。
- 关键用户流程完成真实浏览器联合验收。
- 已新增交接文档并更新本索引。
- 交付文档分别说明页面、接口、契约、迁移、兼容性、测试、真实页面证据和已知风险。

早期 `backend-*` 与 `frontend-*` 文档保留历史方向，不代表当前仍由不同负责人执行。
