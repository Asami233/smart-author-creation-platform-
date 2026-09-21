# 数据保全与回收站 API

本阶段为个人中心“数据保全与存储”页面提供正式后端能力。所有接口当前归属本地作者 `local-author`；进入账号阶段后会自动切换为会话用户的数据范围。除下载接口外，成功响应统一使用 `{ "data": ... }`，失败响应使用 `{ "error": { "code", "message", "details?" } }`。

## 完整备份

### `GET /api/backup`

下载当前作者的 `smart-author-backup` JSON 文件。响应是原始 JSON 文档而不是 `{ data }` 包装，并带有 `Content-Disposition: attachment` 和 `Cache-Control: no-store`。

该操作只读取数据，不修改数据库。备份包含作品、卷章、历史版本、大纲、角色、世界观、时间线、章节关联和写作统计。AI 配置只记录接口地址与模型名称，永远不包含 API Key。

### `POST /api/backup/validate`

请求体直接使用待验证的备份 JSON。响应示例：

```json
{
  "data": {
    "valid": true,
    "issues": [],
    "summary": {
      "workCount": 1,
      "volumeCount": 2,
      "chapterCount": 30,
      "activeChapterCount": 29,
      "versionCount": 18,
      "knowledgeCount": 42,
      "totalWords": 128600
    }
  }
}
```

结构或对象关联有问题时仍返回 `200`，但 `valid` 为 `false`，前端不得启用导入按钮。该操作不修改数据库。

### `POST /api/backup/import`

请求体直接使用已经验证的备份 JSON。当前只提供“安全合并”模式：所有对象生成新 ID，不覆盖当前作品。成功状态码为 `201`：

```json
{
  "data": {
    "importedWorkIds": ["新作品 UUID"],
    "summary": {},
    "warnings": ["出于安全原因，备份不包含 API Key；AI 模型配置需要重新填写密钥。"]
  }
}
```

任一批次失败时会删除本次已创建的作品，避免留下半成品。请求体上限为 25 MB。

可预期错误：

- `400 INVALID_BACKUP_JSON`：请求体不是 JSON。
- `400 VALIDATION_ERROR`：文档格式、字段或数量上限不符合契约。
- `400 INVALID_BACKUP_REFERENCES`：作品、卷章或设定之间的引用不完整。
- `400 BACKUP_IMPORT_FAILED`：写入失败且补偿清理已经执行。
- `413 BACKUP_TOO_LARGE`：请求体超过 25 MB。

## 存储统计

### `GET /api/storage`

返回活动/归档作品数、活动/已删除章节数、历史版本数、设定条目数、总字数和文本数据估算大小。该接口只读取数据。

```json
{
  "data": {
    "activeWorks": 1,
    "archivedWorks": 0,
    "activeChapters": 30,
    "deletedChapters": 1,
    "versions": 18,
    "knowledgeEntries": 42,
    "totalWords": 128600,
    "approximateTextBytes": 620000
  }
}
```

## 回收站

### `GET /api/trash`

列出当前作者的归档作品，以及仍属于活动作品的已软删除章节。该接口只读取数据。

### `POST /api/trash/works/:workId/restore`

恢复归档作品并把状态改为 `draft`。成功响应：`{ "data": { "id": "...", "restored": true } }`。

### `POST /api/trash/chapters/:chapterId/restore`

恢复软删除章节、增加章节修订号并更新所属作品时间。成功响应：`{ "data": { "id": "...", "workId": "...", "restored": true } }`。

如果章节所属作品也已归档，必须先恢复作品。当前阶段不提供永久删除接口，避免误操作造成不可恢复的数据损失。

可预期错误：

- `404 NOT_FOUND`：目标不属于当前作者或不存在。
- `409 CONFLICT`：目标不在回收站，或章节所属作品仍处于归档状态。

## 隐私与前端接入要求

- 前端上传前应先调用校验接口并向用户展示数量摘要。
- 导入只允许由用户明确触发，不得在页面加载时自动执行。
- 下载文件可能包含完整正文，前端需明确提示用户妥善保存。
- 不得把完整备份写入浏览器日志、遥测或错误上报。
- `contracts/data-safety.ts` 是字段与数量上限的唯一正式类型来源。
