# 前端交接：多小说工作台与真实大模型接入

- **交接日期**：2026-09-21
- **交接发起方**：Gemini（前端负责人）
- **交接接收方**：Codex / GPT（后端负责人）
- **对应后端交接文档**：[`docs/WORKSPACE_AI_HANDOFF.md`](../WORKSPACE_AI_HANDOFF.md)
- **对应阶段目标**：[`docs/DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) 迭代 1（工作台接入）与 迭代 3（真实 AI 创作）

---

## 1. 前端完成情况概览

根据 Codex 交付的 `WORKSPACE_AI_HANDOFF.md` 要求，前端已全面完成所有接入与重构任务，消除了遗留的死数据与前端本地假生成：

1. **彻底消除死数据与本地存储密钥**：
   - 彻底移除了原写死的《长夜行》固定章节数组 `initialChapters` 与固定作品标题。
   - 彻底移除了将 AI API Key 保存到浏览器 `localStorage` 的旧逻辑。
2. **多小说工作台与作品切换**：
   - 完成了顶部栏水墨风 [`WorkSwitcher`](../../components/workbench/work-switcher.tsx) 组件，基于 `GET /api/workspace` 动态列出用户所有的长篇小说，显示总字数、章节数与题材，支持一键切换（`PUT /api/workspace/active`）。
   - 支持非激活作品的**快速归档**操作（`DELETE /api/works/{workId}`），归档后重新请求 `/api/workspace` 刷新，确保客户端状态与服务端同步。
   - 新建作品弹窗 [`CreateWorkDialog`](../../components/workbench/create-work-dialog.tsx)，接入 `POST /api/works`，直接使用服务端原子化生成的初始卷章并激活新作品。
3. **章节编辑保存与修订版本防冲突**：
   - 章节正文与标题变更实时防抖保存（`PATCH /api/chapters/{chapterId}`），每次请求严格携带当前章节的 `expectedRevision: selected.revision`。
   - 收到后端 `409 CONFLICT` 时，向用户弹出冲突提示，避免跨端并发编辑覆写丢稿。
4. **服务端高强度加密大模型服务配置**：
   - 完成了服务端加密配置弹窗 [`AiSettingsDialog`](../../components/workbench/ai-settings-dialog.tsx)。
   - **读取脱敏配置**：弹窗打开时调用 `GET /api/settings/ai`，回显当前 Base URL、模型及服务端已加密状态。
   - **拉取真实模型**：点击调用 `POST /api/settings/ai/models`，自动解析供应商返回的真实模型列表，支持下拉选择或手动输入。
   - **连接测试与延迟探测**：点击调用 `POST /api/settings/ai/test`，向模型发送微量探测请求，真实展示服务端测得的通信耗时（如 `latencyMs: 320ms`）以及模型的回复片段预览，并提示微量 Token 消耗。
   - **加密保存与清除**：支持 `PUT /api/settings/ai` 加密保存（已配置时允许省略密钥仅更新模型或 Base URL），支持 `DELETE /api/settings/ai` 清除配置。
5. **AI 灵感创作面板与上下文可控勾选**：
   - 右侧检查器 AI 面板彻底移除定时器假生成，接入 `POST /api/ai/generate`。
   - **主动勾选参考范围**：创作者可自由选择是否携带：当前正文末尾（最多 3000 字）、卷章大纲、核心角色、世界观设定、历史时间线。
   - **Token 与字数透明预算**：根据勾选范围动态计算并显示预估字数与 Tokens（如 `~1,250 字 / 约 810 Tokens`）。
   - **严格对齐契约**：严格按 `aiGenerationSchema` 结构化打包上下文。
   - **采纳闭环**：生成结果仅进入右侧预览区，提供“采纳并写入正文”（自然段排版追加并触发保存）、“复制建议”、“按同参数重新构思”与“舍弃”按钮。

---

## 2. 前端调用的后端接口与载荷结构一览

前端目前在 [`lib/client/api.ts`](../../lib/client/api.ts) 中对后端提供的接口进行了封装调用，具体参数格式如下：

| 接口路径 | 方法 | 前端发送的数据结构 | 业务场景 |
| --- | --- | --- | --- |
| `/api/workspace` | `GET` | 无 | 工作区初始化，获取所有作品、激活作品与激活章节 |
| `/api/workspace/active` | `PUT` | `{ workId: string, chapterId?: string }` | 切换当前激活的作品或章节 |
| `/api/works/{workId}` | `GET` | 无 | 获取当前作品的详情、卷列表及章节列表 |
| `/api/works` | `POST` | `{ title, description?, genre?, targetWords? }` | 原子创建新作品及其初始卷章 |
| `/api/works/{workId}` | `DELETE` | 无 | 归档作品 |
| `/api/chapters/{chapterId}` | `GET` | 无 | 点击章节时加载正文与 revision |
| `/api/chapters/{chapterId}` | `PATCH` | `{ title?, content?, expectedRevision? }` | 章节防抖保存，携带期望版本号 |
| `/api/works/{workId}/chapters` | `POST` | `{ title, volumeId?, content? }` | 在当前作品下新建章节 |
| `/api/settings/ai` | `GET` | 无 | 获取当前已保存的脱敏 AI 配置 |
| `/api/settings/ai` | `PUT` | `{ baseUrl, model, apiKey? }` | 加密保存 AI 配置（二次修改 apiKey 可选） |
| `/api/settings/ai` | `DELETE` | 无 | 清除已加密保存的 AI 配置 |
| `/api/settings/ai/models` | `POST` | `{ baseUrl?, apiKey? }` | 拉取供应商模型（已有配置时字段可省略） |
| `/api/settings/ai/test` | `POST` | `{ baseUrl?, apiKey?, model? }` | 真实微量测试连接，获取耗时与预览 |
| `/api/ai/generate` | `POST` | `{ action, instruction, selectedText?, context, temperature?, maxTokens? }` | 智能创作生成，严格符合 `aiGenerationSchema` |

### `POST /api/ai/generate` 结构化上下文说明
前端发送的 `context` 结构严格满足 `aiContextSchema`：
```json
{
  "action": "continue",
  "instruction": "保持克制沉稳的语气，续写下一段场景。",
  "selectedText": "用户划选的局部文本（若有）",
  "context": {
    "chapters": [
      {
        "id": "chap-uuid",
        "title": "第一章 序章·启程",
        "content": "正文截取的末尾3000字纯文本"
      }
    ],
    "outlines": [
      { "title": "卷一总述", "content": "..." }
    ],
    "characters": [
      { "name": "沈砚", "description": "主角: 青石巷旧书铺掌柜..." }
    ],
    "worldEntries": [
      { "name": "北山禁地", "content": "..." }
    ],
    "timelineEvents": [
      { "title": "雨夜朱砂信", "description": "..." }
    ]
  },
  "temperature": 0.7,
  "maxTokens": 2000
}
```

---

## 3. 前端修改文件清单

| 文件路径 | 状态 | 说明 |
| --- | --- | --- |
| `components/workbench/ai-settings-dialog.tsx` | **新增** | 服务端加密 AI 模型配置弹窗（发现模型/测速/加密保存/删除） |
| `components/workbench/work-switcher.tsx` | **修改** | 下拉菜单展示多作品，并支持一键归档非激活作品 |
| `lib/client/api.ts` | **修改** | 封装完整的作品、章节、AI配置、模型探测与结构化生成 API |
| `app/page.tsx` | **修改** | 全面接入工作台与真实大模型；重构 AI 检查器上下文复选与采纳逻辑；移除本地明文 key |
| `components/workbench/export-dialog.tsx` | **修改** | 导出文案动态绑定当前作品与章节，清理硬编码作品名 |
| `components/profile/profile-view.tsx` | **修改** | 个人中心备份范围动态化 |

---

## 4. 联合验收核对结果（对齐 WORKSPACE_AI_HANDOFF.md）

- [x] **零浏览器存储密钥**：审查了 `localStorage` 与 SessionStorage，没有任何 API Key 写入；控制台与错误上报亦无密钥打印。
- [x] **零直接供应商请求**：网络请求中所有 AI 相关调用（获取模型、测速、生成）全部走 `/api/*` 服务端路由，前端未发起任何对 `api.deepseek.com` 或 `api.openai.com` 的跨域请求。
- [x] **多作品切换与隔离**：在前端测试切换作品后，卷与章节目录、正文及字数完全按目标作品刷新，不存在状态跨作品串联。
- [x] **正文覆盖保护**：AI 生成的建议仅呈现在卡片中，只有用户主动点击“采纳并写入”才会追加并触发保存。
- [x] **版本冲突防御**：并发保存时若服务端返回 409，前端捕获并给出了“章节已被其他端更新”的提示。
- [x] **编译与类型校验**：`npx tsc --noEmit` 0 错误；`npm run build` 构建成功。

---

## 5. 对 Codex / GPT 的后续协同与建议（迭代 2 展望）

1. **设定与资料库正式接口（迭代 2）**：
   - 当前在大纲、角色、世界观、时间线面板中，素材库仍保留有演示用的默认示范条目作为视觉展示。当 Codex 在迭代 2 完成知识库（大纲/角色/世界观/时间线）真实增删改查及关联接口后，请在 `docs/handoffs/` 提供对应交接文档，Gemini 将立即全面切换为真实后端数据。
2. **AI 流式生成（SSE / ReadableStream）**：
   - 当前 `POST /api/ai/generate` 采用整段等待返回，生成长文本时约需 2~5 秒。后续若后端支持 SSE 或 ReadableStream，前端随时可以升级为打字机式的流式呈现与随时中止生成（AbortController）能力。
3. **未配置大模型的错误友好度**：
   - 若用户尚未配置大模型即点击生成，后端返回的错误码与提示非常清晰，前端已准确接住并引导用户点击右上角设置弹窗。
