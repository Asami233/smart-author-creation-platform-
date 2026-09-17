# 后端 API 契约

## 通用约定

- 基础路径：`/api`
- 成功响应：`{ "data": ... }`
- 失败响应：`{ "error": { "code": "...", "message": "...", "details": ... } }`
- ID：UUID 字符串
- 时间：ISO 8601 字符串
- 当前身份：本地用户 `local-author`；M6 再接入账号系统
- 写操作均不会接受客户端传入的 `ownerId`

章节更新使用 `expectedRevision` 进行并发保护。收到 `409 CONFLICT` 时，前端不得自动重试覆盖，应重新加载最新章节并提示用户。

## 作品

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/works` | 获取作品列表和字数摘要 |
| POST | `/api/works` | 创建作品，同时创建默认分卷和第一章 |
| GET | `/api/works/:workId` | 获取作品、分卷和章节目录 |
| PATCH | `/api/works/:workId` | 更新作品信息 |
| DELETE | `/api/works/:workId` | 归档作品，不物理删除 |

创建作品：

```json
{
  "title": "长夜行",
  "description": "悬疑仙侠长篇",
  "genre": "仙侠",
  "targetWords": 1200000
}
```

## 分卷与章节

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET/POST | `/api/works/:workId/volumes` | 分卷列表/创建分卷 |
| GET/PATCH/DELETE | `/api/volumes/:volumeId` | 分卷详情/更新/删除 |
| GET/POST | `/api/works/:workId/chapters` | 章节列表/创建章节 |
| GET/PATCH/DELETE | `/api/chapters/:chapterId` | 章节详情/保存/软删除 |
| POST | `/api/works/:workId/chapters/reorder` | 批量移动与排序章节 |

章节保存：

```json
{
  "title": "第一章 雨夜来客",
  "content": "<p>正文 HTML</p>",
  "expectedRevision": 3
}
```

排序：

```json
{
  "volumeId": "目标分卷 UUID，未分卷时为 null",
  "chapterIds": ["按新顺序排列的章节 UUID"]
}
```

## 历史版本

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/chapters/:chapterId/versions` | 获取版本摘要列表 |
| POST | `/api/chapters/:chapterId/versions` | 创建手动命名版本，body 为 `{ "label": "定稿前" }` |
| GET | `/api/chapter-versions/:versionId` | 获取版本完整内容，用于前端对比 |
| POST | `/api/chapter-versions/:versionId/restore` | 恢复版本；恢复前自动备份当前正文 |

## 大纲、角色、世界观和时间线

资源类型 `kind` 取值：`outlines`、`characters`、`world`、`timeline`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET/POST | `/api/works/:workId/knowledge/:kind` | 获取或创建设定对象 |
| GET/PATCH/DELETE | `/api/knowledge/:kind/:id` | 获取、更新或删除单个对象 |

世界观类型：`location`、`faction`、`system`、`item`、`custom`。

章节关联：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/chapters/:chapterId/links` | 查看章节关联 |
| POST | `/api/chapters/:chapterId/links` | 添加关联 |
| DELETE | `/api/chapters/:chapterId/links?entityType=character&entityId=...` | 删除关联 |

添加关联请求：

```json
{
  "entityType": "character",
  "entityId": "角色 UUID"
}
```

## 搜索与统计

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/works/:workId/search?q=关键词` | 搜索章节、角色、世界观和大纲 |
| GET | `/api/works/:workId/stats` | 获取总字数、章节数、连续写作和最近 90 天统计 |
| PUT | `/api/works/:workId/stats` | 设置某日目标，body 为 `{ "date": "2026-09-17", "targetWords": 3000 }` |

## 导出

`GET /api/works/:workId/export?format=txt|docx|pdf`

需要限定章节时重复传递 `chapterId`：

```text
/api/works/:workId/export?format=docx&chapterId=id1&chapterId=id2
```

响应为附件字节流，不使用 JSON 包装。

## AI 设置与生成

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/settings/ai` | 查看是否已配置，只返回密钥掩码 |
| PUT | `/api/settings/ai` | 加密保存服务地址、模型和 API Key |
| DELETE | `/api/settings/ai` | 删除保存的 AI 配置 |
| POST | `/api/ai/generate` | 生成建议，不修改正文 |
| GET | `/api/ai/usage` | 最近 30 天请求与 token 统计 |

保存 AI 设置：

```json
{
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "apiKey": "用户输入的密钥"
}
```

生成请求：

```json
{
  "action": "continue",
  "instruction": "保持克制悬疑的语气续写",
  "selectedText": "用户选中的正文",
  "context": {
    "chapters": [{ "title": "第一章", "content": "明确选择的正文" }],
    "outlines": [],
    "characters": [],
    "worldEntries": [],
    "timelineEvents": []
  },
  "temperature": 0.7,
  "maxTokens": 2000
}
```

`action` 取值：`continue`、`rewrite`、`polish`、`outline`、`brainstorm`、`consistency`。

后端只使用请求中明确提供的上下文，不会自动读取整部作品。AI 输出必须由前端展示为可接受或舍弃的建议，不能直接覆盖正文。

## 健康检查

`GET /api/health` 返回服务状态，不访问数据库。
