# 后端 → Gemini 交接索引

Gemini 每次开始接口接入前必须先读本索引，再阅读与当前任务相关的最新文档。日期较新的文档优先；如与 `contracts/**` 冲突，以 `contracts/**` 和最新交接文档为准，并立即记录冲突。

当前总体顺序与双方职责见 [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md)。

## 已有交接

| 日期 | 主题 | 文档 | 前端状态 |
| --- | --- | --- | --- |
| 2026-09-22 | 工作台章节并发保存保护 | [`2026-09-22-backend-workspace-revision-safety.md`](./2026-09-22-backend-workspace-revision-safety.md) | 待 Gemini 接入与联合验收 |
| 2026-09-21 | AI 首次配置 `baseUrl` 未定义崩溃 | [`2026-09-21-ai-settings-unconfigured-state.md`](./2026-09-21-ai-settings-unconfigured-state.md) | Gemini 待修复 |
| 2026-09-21 | 邮箱注册、登录、会话和资料 | [`../AUTH_API.md`](../AUTH_API.md) | 已开始接入，需联合验收真实邮件 |
| 2026-09-21 | 多小说工作台与真实 AI 配置 | [`../WORKSPACE_AI_HANDOFF.md`](../WORKSPACE_AI_HANDOFF.md) | 待 Gemini 接入 |
| 2026-09-21 | 备份、存储与回收站 | [`../DATA_SAFETY_API.md`](../DATA_SAFETY_API.md) | 待 Gemini 核对 |

## 新交接文件命名

使用：`YYYY-MM-DD-主题英文短名.md`

例如：`2026-09-22-ai-streaming.md`。

## Codex 完成条件

后端功能只有同时满足以下条件才算可以交给 Gemini：

- 契约已更新，接口实现与契约一致。
- 数据库迁移只新增、不改写已应用迁移。
- 类型检查、后端测试和构建通过。
- 真实 API 冒烟测试通过，或明确说明无法测试的外部依赖。
- 已新增交接文档并更新本索引。
- 已列出 Gemini 必须修改、不得继续保留的 mock，以及联合验收步骤。
| 2026-09-22 | 迭代 2 设定、版本与导出安全校验 | [`2026-09-22-backend-knowledge-version-export-safety.md`](./2026-09-22-backend-knowledge-version-export-safety.md) | 待 Gemini 接入与联合验收 |
