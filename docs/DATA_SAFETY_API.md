# 数据保全与回收站 API

本阶段为个人中心“数据保全与存储”页面提供正式后端能力。所有接口当前归属本地作者 `local-author`；进入账号阶段后会自动切换为会话用户的数据范围。除下载接口外，成功响应统一使用 `{ "data": ... }`，失败响应使用 `{ "error": { "code", "message", "details?" } }`。

## 完整备份

### `GET /api/backup`

下载当前作者的 `smart-author-backup` JSON 文件。响应是原始 JSON 文档而不是 `{ data }` 包装，并带有 `Content-Disposition: attachment` 和 `Cache-Control: no-store`。

该操作只读取数据，不修改数据库。备份包含作品、卷章、历史版本、大纲、角色、世界观、时间线、章节关联和写作统计。AI 配置只记录接口地址与模型名称，永远不包含 API Key。

章节备份记录现含 `contentFormatVersion: 1`，表示 HTML 正文格式。旧 `schemaVersion: 1` 备份没有该字段时按 1 导入；未知内容格式版本拒绝导入，不进行未经定义的格式转换。

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

### `POST /api/backup/preflight`

请求体直接使用待恢复的 `smart-author-backup` JSON。账号完整导出文件不能直接提交；页面会先提取其中的 `content` 节点。该接口只读，不写入数据库，成功后返回恢复摘要、同名作品冲突和一个 30 分钟有效的恢复凭据：

```json
{
  "data": {
    "valid": true,
    "mode": "merge-copy",
    "snapshotHash": "备份内容摘要",
    "previewToken": "仅用于本次备份与当前账号的签名凭据",
    "expiresAt": "2026-09-27T07:00:00.000Z",
    "summary": {
      "workCount": 1,
      "volumeCount": 2,
      "chapterCount": 30,
      "activeChapterCount": 29,
      "versionCount": 18,
      "knowledgeCount": 42,
      "totalWords": 128600
    },
    "existingWorkCount": 2,
    "titleConflicts": [
      {
        "sourceWorkId": "备份作品 UUID",
        "sourceTitle": "同名作品",
        "existingWorks": [{ "id": "现有作品 UUID", "title": "同名作品", "status": "draft" }]
      }
    ],
    "warnings": ["有 1 部备份作品与现有作品同名；将创建独立副本，不会覆盖。"],
    "alreadyImported": false
  }
}
```

同名只作为风险提示，不阻止恢复。标题比较会忽略首尾空格、连续空白和大小写差异。预检凭据同时绑定当前数据所有者和备份内容；修改备份、换账号或凭据过期后必须重新预检。

### `POST /api/backup/import`

恢复是显式确认操作，要求同源请求。请求体必须使用预检返回的原始备份和签名凭据：

```json
{
  "backup": { "format": "smart-author-backup", "schemaVersion": 1, "data": {} },
  "previewToken": "预检返回的凭据",
  "mode": "merge-copy",
  "confirm": true
}
```

当前只提供固定的 `merge-copy`（合并副本）模式：所有导入对象生成新 ID，保留现有作品，不覆盖、不删除、也不把同名作品合并。成功状态码为 `201`：

```json
{
  "data": {
    "importId": "恢复任务 UUID",
    "importedWorkIds": ["新作品 UUID"],
    "summary": {},
    "warnings": ["备份不包含 AI API Key；恢复后需要重新配置密钥。"],
    "mode": "merge-copy",
    "alreadyImported": false
  }
}
```

服务端以“当前所有者 + 备份内容摘要”记录恢复任务。相同备份重复提交会返回第一次的 `importId` 和作品 ID，并把 `alreadyImported` 设为 `true`，不会重复创建作品。正在执行的同一份恢复返回 409；超过 5 分钟的中断任务会先清理它预分配的作品 ID，再允许安全重试。任一写入批次失败时也会按本次任务精确清理新作品，现有数据不参与补偿删除。

请求体上限以 25 MB 原始备份为准，确认包装预留 64 KiB。旧版“直接把原始备份 POST 到 `/api/backup/import`”不再兼容，会返回 428，必须先预检。

可预期错误：

- `400 INVALID_BACKUP_JSON`：请求体不是 JSON。
- `400 VALIDATION_ERROR`：文档格式、字段或数量上限不符合契约。
- `400 INVALID_BACKUP_REFERENCES`：作品、卷章或设定之间的引用不完整。
- `400 BACKUP_IMPORT_FAILED`：写入失败且补偿清理已经执行。
- `403 CROSS_SITE_REQUEST`：恢复写请求不是同源请求。
- `409 BACKUP_IMPORT_IN_PROGRESS`：同一份备份正在恢复。
- `412 BACKUP_PREFLIGHT_REQUIRED`：凭据无效、过期、账号不匹配或备份内容在预检后发生变化。
- `428 BACKUP_PREFLIGHT_REQUIRED`：客户端仍在使用旧版直接导入流程。
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

- 前端恢复前必须调用预检接口，展示数量摘要、现有作品数、同名冲突和全部警告，并要求用户主动勾选确认。
- 导入只允许由用户明确触发，不得在页面加载时自动执行。
- 客户端不得提供覆盖或自动合并选项；当前唯一受支持的策略是 `merge-copy`。
- 下载文件可能包含完整正文，前端需明确提示用户妥善保存。
- 不得把完整备份写入浏览器日志、遥测或错误上报。
- `contracts/data-safety.ts` 是字段与数量上限的唯一正式类型来源。
