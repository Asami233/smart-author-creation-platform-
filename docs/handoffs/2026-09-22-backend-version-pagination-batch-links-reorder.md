# 后端交接：版本分页、批量关联与大纲排序

日期：2026-09-22

后端分支：`codex/backend-iteration2-apis`

后端提交：以本交接文档所在提交为准

兼容性：向后兼容；原有单条关联和版本列表读取方式均可继续使用

## 1. 对 Gemini 四项需求的处理

| Gemini 需求 | 本次结果 |
| --- | --- |
| 历史版本游标分页 | 已实现，仍保留 `data` 为数组，新增顶层 `pagination` |
| 章节设定批量关联 | 已实现原子批量添加与删除 |
| 每日净增字数与历史累计趋势 | 暂不提供伪精确数据；现有表只记录正向写作量，无法正确倒推出历史净增，见第 8 节 |
| 大纲拖拽排序接口 | 已实现整部作品的大纲顺序更新 |

## 2. 接口与契约

所有请求使用当前作者身份；跨用户章节或作品返回 `404`，不会暴露他人设定、正文或版本。写接口不接受客户端传入 `ownerId`，不记录正文到日志。

### 2.1 历史版本游标分页

`GET /api/chapters/:chapterId/versions?limit=50&cursor=<nextCursor>`

- `limit`：1–200，省略时仍返回最多 200 条，保持旧客户端行为；非法值 `400`。
- `cursor`：服务端返回的不透明字符串，前端原样传回；非法值 `400 INVALID_CURSOR`。
- `200` 响应示例：

```json
{
  "data": [{ "id": "UUID", "chapterId": "UUID", "kind": "manual", "label": "定稿前", "wordCount": 1200, "sourceRevision": 4, "createdAt": "2026-09-22T10:00:00.000Z" }],
  "pagination": { "hasMore": true, "nextCursor": "opaque-token" }
}
```

版本按 `createdAt DESC, id DESC` 稳定排列。摘要不含正文，正文继续通过 `GET /api/chapter-versions/:versionId` 读取。旧版 `fetchChapterVersions` 只取 `json.data` 仍正常工作，但只能看到第一页。

### 2.2 批量章节设定关联

`POST /api/chapters/:chapterId/links/batch` 与 `DELETE /api/chapters/:chapterId/links/batch`

```json
{
  "links": [
    { "entityType": "character", "entityId": "角色 UUID" },
    { "entityType": "world", "entityId": "世界观条目 UUID" }
  ]
}
```

每次 1–100 条，不得重复。`POST` 成功为 `201`，`DELETE` 成功为 `200`；`data` 均为操作后的完整章节关联数组。添加前会检查**全部**目标与章节同属一部作品：任一目标无效，整批返回 `409` 且不写入。重复添加已有关系是幂等操作。原单条关联接口保持不变。

### 2.3 大纲排序

`POST /api/works/:workId/knowledge/outlines/reorder`

```json
{ "outlineIds": ["第一个大纲 UUID", "第二个大纲 UUID"] }
```

列表必须恰好包含当前作品的**全部**大纲 ID，各出现一次，上限 500 条。重复或格式错误返回 `400`，缺失、混入其他作品或列表与当前作品不一致返回 `409`。成功 `200`，`data` 为排序后的大纲数组。排序只更新 `sortOrder`，不改变大纲作用范围或内容。

正式校验定义：`contracts/schemas.ts`；接口说明：`docs/API_CONTRACTS.md`。

## 3. 数据库与迁移

无需新迁移；使用现有版本时间索引、章节关联唯一约束和大纲 `sort_order`。旧数据无须转换。

## 4. Gemini 必须修改

1. `fetchChapterVersions` 增加可选 `limit/cursor` 参数并保留 `pagination`；版本弹窗滚动/点击“加载更多”时用 `nextCursor` 追加摘要，`hasMore=false` 停止。不得自行拼造游标或将摘要当成正文。
2. 多选角色、世界观、时间线、大纲后调用批量关联接口；批量操作失败时保留当前选择并展示 `409`，不要先乐观认定部分写入成功。
3. 大纲拖拽结束后发送**全作品完整 ID 顺序**，不是仅当前分卷或当前筛选结果；`409` 时重新拉取列表并提示作者排序已变化。
4. 不要把现有 `writing_daily_stats.wordsWritten` 称为“净增字数”。趋势 API 未完成前，统计页面只能明确标注现有指标为正向写作量。
5. 代码复核发现软删除当前章节的 `handleSoftDeleteChapter` 没有先 `flushPendingSave`；若防抖窗口内删除，服务端只保留旧正文。请先阻止未保存/冲突状态的删除并完成保存。另需用真实网络延迟验证“保存请求在途时继续输入”：当前 `flushPendingSave` 发出请求就清空队列，后续输入可能携带旧 `revision`，首个请求返回又可能把编辑器新草稿覆盖。请序列化在途保存、保留脏草稿并补前端回归测试。

以上为前端责任区，Codex 不直接修改 `app/page.tsx`、`components/**`、`lib/client/**`。

## 5. 联合验收

- [ ] 版本超过一页时可无重复、无遗漏地加载更早版本；旧版第一页读取仍可用。
- [ ] 混入跨作品目标的批量关联整批 `409`，章节关联没有部分写入；重复提交不会重复生成关联。
- [ ] 批量删除只影响当前章节的指定关联。
- [ ] 大纲按完整顺序刷新后保持稳定；缺失/跨作品列表被拒绝。
- [ ] 删除章节、快速切章和保存中继续输入都不会丢失本地草稿。

## 6. 验证记录

- `npx tsc --noEmit`：通过。
- `node --import tsx --test tests/backend/*.test.ts`：23 项通过。
- `npm run build`：通过。
- `node tests/backend/knowledge-version-smoke.mjs`：通过，新增覆盖游标翻页、非法游标、批量关联原子性与幂等、大纲完整排序与跨作品拒绝。测试账号及作品仅在本地 D1 创建，并在测试结束时删除。

## 7. 兼容性细节

- 版本列表仍以 `data` 数组返回，新增的 `pagination` 不影响只读取 `data` 的旧客户端。
- 单条章节关联接口未删除。
- 大纲原有 `PATCH sortOrder` 仍可使用；新接口解决整列表拖拽后的顺序更新。

## 8. 趋势统计的正确实现前提

现有 `writing_daily_stats.words_written` 仅累计章节正文增加时的**正向差值**，不能代表净增：删稿、软删除、恢复和导入都会改变当前总字数。直接把它画成“每日净增”和“历史累计”会误导作者。

后端需要先引入从某一明确日期开始的净字数变更记录，并覆盖创建、编辑、删除、恢复、导入等写入路径；历史记录启用前的每日累计值应标为“不可用”，不能伪造。本需求留在下一轮数据模型迭代，前端如需要请先确认统计口径与历史缺口的呈现方式。
