# Gemini 接入清单：作品工作台与真实 AI

本文件定义前端本轮必须接入的后端能力。不得再从 `initialChapters`、固定《长夜行》标题、`setTimeout` 示例文案或 `localStorage` AI 配置读取正式状态。

## 一、总体作品工作台

### 首次加载

调用 `GET /api/workspace`：

```json
{
  "data": {
    "works": [
      {
        "id": "uuid",
        "title": "作品名",
        "description": "简介",
        "genre": "玄幻",
        "status": "draft",
        "targetWords": 1000000,
        "totalWords": 12345,
        "chapterCount": 8,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "activeWorkId": "uuid或null",
    "activeChapterId": "uuid或null"
  }
}
```

页面应有作品选择器或作品看板。切换作品时调用：

`PUT /api/workspace/active`

```json
{ "workId": "uuid", "chapterId": "可选uuid" }
```

随后调用 `GET /api/works/{workId}` 加载该作品的卷与章节目录；再用 `GET /api/chapters/{chapterId}` 加载正文。不得把不同作品的章节混在同一个客户端状态中。

### 创建作品

`POST /api/works`

```json
{
  "title": "新作品",
  "description": "作品简介",
  "genre": "玄幻",
  "targetWords": 1000000
}
```

后端会原子创建作品、第一卷、第一章，并自动将新作品设为当前作品。成功后直接使用响应中的 `work`、`volumes`、`chapters` 更新界面，并重新请求 `/api/workspace` 刷新作品列表。

归档当前作品后应重新请求 `/api/workspace`，让后端选择剩余作品中最近更新的一部。

## 二、真实 AI 配置

所有 API Key 只能提交给服务端，不得写入 `localStorage`、前端日志或错误上报。

### 推荐交互顺序

1. 用户填写 OpenAI 兼容 API Base URL 和 API Key。
2. 调用 `POST /api/settings/ai/models` 获取供应商真实模型列表。
3. 用户从返回列表选择模型，也允许手动填写兼容模型 ID。
4. 调用 `POST /api/settings/ai/test`，真实发出一次极小的 Chat Completions 请求。
5. 测试成功后调用 `PUT /api/settings/ai` 加密保存。

不要在界面内硬编码“推荐模型”或伪造连接成功状态。

### 获取模型

`POST /api/settings/ai/models`

首次配置：

```json
{ "baseUrl": "https://api.deepseek.com", "apiKey": "用户输入的密钥" }
```

已有保存配置时可提交 `{}`，后端会解密已保存的密钥并向供应商请求 `/models`。

响应：

```json
{
  "data": {
    "baseUrl": "https://api.deepseek.com",
    "models": [{ "id": "供应商真实模型ID", "ownedBy": "deepseek" }]
  }
}
```

### 测试连接

`POST /api/settings/ai/test`

```json
{
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "用户输入的密钥",
  "model": "用户选择的真实模型ID"
}
```

已有配置时，未变化的字段可以省略。成功响应包含 `connected`、`latencyMs` 和模型实际回复的 `responsePreview`。此操作会真实调用模型，可能产生极少量 token 费用，界面需明确提示。

### 保存与读取

- `GET /api/settings/ai`：读取脱敏配置，不返回密钥。
- `PUT /api/settings/ai`：提交 `{ baseUrl, model, apiKey? }`。首次保存必须有 `apiKey`；后续只改地址或模型时可以不再提交密钥。
- `DELETE /api/settings/ai`：删除加密配置。

### 真实生成

删除 `app/page.tsx` 中 `runAiPreview` 的固定 `samples` 和定时器，改为调用 `POST /api/ai/generate`。请求中的上下文必须只包含用户主动选择的章节、大纲、角色、世界观和时间线内容。

```json
{
  "action": "continue",
  "instruction": "保持当前叙事视角续写",
  "selectedText": "用户选中的正文",
  "context": {
    "chapters": [],
    "outlines": [],
    "characters": [],
    "worldEntries": [],
    "timelineEvents": []
  },
  "temperature": 0.7,
  "maxTokens": 2000
}
```

AI 返回内容只进入预览区；用户点击“采纳”后才写入编辑器并触发正常章节保存。
