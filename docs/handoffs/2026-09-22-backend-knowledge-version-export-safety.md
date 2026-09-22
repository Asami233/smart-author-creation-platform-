# 后端交接：迭代 2 设定、版本与导出安全校验

日期：2026-09-22

后端分支：`codex/backend-knowledge-version-safety`

后端提交：以本交接文档所在提交为准

兼容性：现有接口保持可用；历史恢复新增可选的 `expectedRevision` 请求字段，建议新前端必传

## 1. 完成结果

迭代 2 已有的设定 CRUD、历史版本、导出和回收站接口经过本地真实 API 联调。本次加固阻止跨作品的大纲作用范围与时间线参与角色，删除角色时同步清理时间线参与 ID，删除分卷时保留其大纲并转为作品级；历史版本恢复采用章节修订号条件更新，恢复前快照只在实际恢复成功时创建。恢复旧稿不会虚增当天新写字数。

这是后端预备交付，不代表迭代 2 整体验收通过。迭代 1 的前端保存失败后继续切章/切作品问题仍需先修复，详情见 [`2026-09-22-backend-workspace-revision-safety.md`](./2026-09-22-backend-workspace-revision-safety.md) 第 9 节。

## 2. 接口与契约

所有接口均使用当前登录用户身份；本机未登录时保留 `local-author` 兼容工作区。跨用户资源返回 `404`，写请求不接受 `ownerId`，正文、设定、历史版本不得写入日志。

| 方法与路径 | 用途、请求与响应 | 主要错误 |
| --- | --- | --- |
| `GET/POST /api/works/:workId/knowledge/:kind` | 列表/创建；`kind` 为 `outlines`、`characters`、`world`、`timeline`；成功为 `{data: 对象或数组}` | `400` 字段错误、`404` 作品不可见、`409` 跨作品关联 |
| `GET/PATCH/DELETE /api/knowledge/:kind/:id` | 单条查看、更新、删除；删除为 `204` | `400`、`404`、`409` |
| `GET/POST /api/chapters/:chapterId/links` | 查看/添加章节与设定关联；添加 body 为 `{entityType,entityId}` | `404`、`409` 跨作品关联 |
| `DELETE /api/chapters/:chapterId/links?entityType=...&entityId=...` | 删除关联，成功 `204` | `400`、`404` |
| `GET/POST /api/chapters/:chapterId/versions` | 版本摘要列表（当前最多 200 条）/创建手动版本，创建 body 为 `{label}` | `400`、`404` |
| `GET /api/chapter-versions/:versionId` | 版本完整 `content` 与 `plainText`，供预览/对比 | `404` |
| `POST /api/chapter-versions/:versionId/restore` | 建议 body `{ "expectedRevision": 3 }`；成功返回新章节对象及递增的 `revision`；旧客户端空 body 仍兼容 | `400`、`404`、`409` 版本冲突 |
| `GET /api/works/:workId/export?format=txt\|docx\|pdf` | 返回真实下载文件；不需要前端伪造内容 | `400`、`404` |
| `GET /api/trash`、`POST /api/trash/chapters/:id/restore`、`POST /api/trash/works/:id/restore` | 查看回收站、恢复软删章节/归档作品 | `404`、`409` |

大纲 `scopeType=work` 时 `scopeId` 可省略；`volume` 或 `chapter` 时必须指定当前作品的有效 ID。时间线 `participantIds` 必须为当前作品角色 ID，不能重复。删除角色会移除对应章节关联及时间线中的参与 ID，不删除时间线事件本身。删除分卷时，其分卷级大纲会保留并转换为作品级大纲。

历史恢复先在同一数据库批次中条件更新章节，再保存“恢复前”快照；若请求给出的 `expectedRevision` 已过期，或批次内出现并发冲突，返回 `409`，不会产生虚假的恢复快照。恢复会改变章节总字数，但旧稿文字不计入“今日新写字数”。

正式字段定义：`contracts/schemas.ts`、`docs/API_CONTRACTS.md`、`docs/DATA_SAFETY_API.md`。

## 3. 数据库与迁移

本次无需新增迁移。历史恢复的条件写入使用迭代 1 已新增的 `chapters.last_save_id`，因此部署本分支前必须先应用 `drizzle/0003_clammy_bullseye.sql`。旧数据无需人工修改。

## 4. Gemini 必须修改

1. **先修迭代 1 丢稿缺口**：`flushPendingSave()` 返回 `false` 时禁止切章、切作品或新建章节；历史恢复前不可直接丢弃待保存草稿。保存中关闭页面也要有离开保护。
2. 大纲、角色、世界观、时间线面板改用上述真实 CRUD；删除固定样例素材和静默 mock 回退。根据 `scopeType` 展示可选卷/章；参与角色只能从当前作品角色列表选取，并处理 `409`。
3. `VersionHistoryDialog` 删除 `initialVersions` 等固定快照。打开时加载版本摘要，点击条目后按版本 ID 获取完整正文；手动版本通过 `POST` 创建。恢复应调用真正的 `/restore` 接口并传当前章节 `expectedRevision`，不能只把演示文本交给 `PATCH /api/chapters/:id`。恢复前先处理未保存草稿，成功后用返回的 `revision` 和正文同步编辑器；`409` 时保留草稿。
4. 导出弹窗改用真实 `GET /api/works/:workId/export?format=...`，下载响应字节；删除定时器模拟与前端伪造 TXT/DOCX/PDF。加载、网络失败和无作品状态要明确。
5. 接入回收站列表、章节恢复与作品恢复；删除动作应标明可恢复，恢复后刷新作品/章节列表。不实现前端永久删除。
6. 完成接入后新增 Gemini 前端交接文档，列出具体调用、已删除的 mock，以及实际浏览器验收结果。

前端所有文件仍由 Gemini 负责；Codex 不修改 `app/page.tsx`、`components/**` 或 `lib/client/**`。

## 5. 推荐联调顺序

先修保存失败时的草稿保护 → 接入设定列表与编辑 → 接入版本摘要、完整预览和真实恢复 → 接入三个导出格式 → 接入回收站 → 使用两部作品做跨作品隔离与冲突测试。

## 6. 联合验收

- [ ] 不同作品的角色、大纲、世界观、时间线和章节关联互不串联。
- [ ] 删除角色后，其章节关联与时间线参与 ID 清除，时间线本身保留。
- [ ] 恢复旧版本前自动保存当前正文快照；恢复成功后章节版本号递增，过期请求为 `409` 且保留草稿。
- [ ] TXT、DOCX、PDF 文件都包含正确作品标题、卷章顺序与中文正文。
- [ ] 软删章节和归档作品可从回收站恢复。
- [ ] 网络失败、空数据、重复点击与切换作品不会静默丢稿或显示假数据。

## 7. 验证记录

- `npx tsc --noEmit`：通过。
- `node --import tsx --test tests/backend/*.test.ts`：23 项通过。
- `npm run build`：通过。
- `node tests/backend/knowledge-version-smoke.mjs`：通过；覆盖跨作品设定关联拒绝、角色删除清理、分卷删除后保留大纲、旧/新恢复调用、恢复前快照、字数统计、三格式导出与章节回收。测试账号及作品自动从本地 D1 清理；未触及远程数据库。
- 未验证：Gemini 的真实浏览器交互与生产邮件服务，不应据此标记阶段完成。

## 8. 已知限制

- 历史摘要列表当前最多返回最新 200 条，尚无游标分页。若前端需要浏览更早版本，请先提出分页交互需求，后端再扩充契约；不要在前端假造旧版本。
- 空 body 的历史恢复仍兼容旧客户端，但无法识别客户端请求前的过期状态；新前端应始终传 `expectedRevision`。
