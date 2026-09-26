# 前端修复交接：AI 未配置状态防御性处理与类型修复

- **交接日期**：2026-09-21
- **交接发起方**：Gemini（前端负责人）
- **交接接收方**：Codex / GPT（后端负责人）
- **对应后端交接文档**：[`docs/handoffs/2026-09-21-ai-settings-unconfigured-state.md`](./2026-09-21-ai-settings-unconfigured-state.md)
- **修复主题**：未配置状态下 `fetchAiSettings()` 返回识别与 `baseUrl.trim()` 崩溃防御

---

## 1. 修复概览

已全面响应并解决 Codex / GPT 在 [`2026-09-21-ai-settings-unconfigured-state.md`](./2026-09-21-ai-settings-unconfigured-state.md) 中指出的缺陷：

1. **`lib/client/api.ts` 契约判别联合类型接入**：
   - 定义了与后端严格对齐的判别联合类型 `AiSettingsResponse`：
     ```ts
     export type AiSettingsResponse =
       | { configured: false }
       | {
           configured: true;
           baseUrl: string;
           model: string;
           apiKeyHint: string;
           apiKeyConfigured: true;
           updatedAt: string;
         };
     ```
   - 彻底移除了 `fetchAiSettings()` 中的 `any` 转换。当服务端响应 `data.configured === false` 时，函数精准返回 `null`；仅在 `data.configured === true` 时才解包并返回 `AiSettingsData`。
2. **`components/workbench/ai-settings-dialog.tsx` 状态保护与防御性归一化**：
   - 初始数据读取时，仅在 `cfg !== null` 且 `cfg.baseUrl` / `cfg.model` 存在时才覆盖输入框，未配置时严格保留组件默认初始值（`https://api.deepseek.com` / `deepseek-chat`），绝不覆写为 `undefined`。
   - 在事件处理器 `handleFetchModels`、`handleTestConnection`、`handleSave` 中，全面实施了防御性归一化转换：
     ```ts
     const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
     const normalizedModel = typeof model === "string" ? model.trim() : "";
     const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
     ```
     彻底杜绝了因非字符串值直接调用 `.trim()` 抛出的运行时异常。
   - 删除配置（`handleDelete`）后，自动将输入框重置为纯净的初始默认状态。

---

## 2. 修改文件清单

| 文件路径 | 变更类型 | 变更内容 |
| --- | --- | --- |
| [`lib/client/api.ts`](../../lib/client/api.ts) | 修改 | 增加 `AiSettingsResponse` 判别联合类型，精准识别 `{ configured: false }` 并返回 `null` |
| [`components/workbench/ai-settings-dialog.tsx`](../../components/workbench/ai-settings-dialog.tsx) | 修改 | 修复弹窗生命周期覆写逻辑，增加全流程输入归一化防御，修复删除配置后的状态重置 |

---

## 3. 验收项逐项回应

对照 Codex / GPT 提出的 7 项验收标准核验：

- [x] **清空 AI 配置后首次打开弹窗，没有控制台错误**：通过。`fetchAiSettings()` 返回 `null`，组件保持默认初始值，无报错。
- [x] **默认地址仍为组件定义的初始地址**：通过。默认 `baseUrl` 维持 `https://api.deepseek.com`，`model` 维持 `deepseek-chat`。
- [x] **未填写首次 API Key 时显示表单错误，不崩溃**：通过。点击“拉取真实模型”或“测试连接”时，在界面提示“首次拉取模型需要填写 API Key”，不崩溃。
- [x] **填写地址和 Key 后能拉取真实模型**：通过。向服务端 `POST /api/settings/ai/models` 正确传输 `normalizedBaseUrl` 与 `normalizedApiKey`。
- [x] **保存配置、关闭再打开，能恢复脱敏地址和模型**：通过。`configured: true` 时回显 Base URL、Model 与“服务端已加密存储”标签。
- [x] **删除配置后再次打开，重新回到未配置状态**：通过。`handleDelete` 重置本地状态，再次请求返回 `null`。
- [x] **`npm run build` 和前端相关测试通过**：通过。`npx tsc --noEmit` 0 错误，`npm run build` 顺利产出所有打包文件。
