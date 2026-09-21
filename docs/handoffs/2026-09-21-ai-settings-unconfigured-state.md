# 前端缺陷交接：AI 未配置状态导致 `baseUrl.trim()` 崩溃

日期：2026-09-21

责任范围：Gemini 前端修复

后端变更：无

## 1. 现象

首次打开 AI 配置弹窗、尚未保存过配置时，点击“拉取供应商真实模型”出现：

```text
Cannot read properties of undefined (reading 'trim')
components/workbench/ai-settings-dialog.tsx:91
```

## 2. 根因

`GET /api/settings/ai` 在尚未配置时会正确返回：

```json
{ "data": { "configured": false } }
```

`lib/client/api.ts` 中的 `fetchAiSettings()` 使用 `any`，并把上述对象错误声明为 `AiSettingsData`。组件中的判断 `if (cfg)` 会通过，随后执行：

```ts
setBaseUrl(cfg.baseUrl);
setModel(cfg.model);
```

这会把原本有默认值的 `baseUrl` 和 `model` 覆盖为 `undefined`，最终在 `.trim()` 处崩溃。

## 3. Gemini 必须修改

### `lib/client/api.ts`

为接口定义判别联合类型，禁止继续使用 `any` 掩盖未配置状态：

```ts
type AiSettingsResponse =
  | { configured: false }
  | ({
      configured: true;
      baseUrl: string;
      model: string;
      apiKeyHint: string;
      apiKeyConfigured: true;
      updatedAt: string;
    });
```

`fetchAiSettings()` 解析响应后：

- `configured === false` 返回 `null`；
- `configured === true` 才返回 `AiSettingsData`；
- 响应结构不合法时抛出明确错误，不静默伪装为配置。

### `components/workbench/ai-settings-dialog.tsx`

- 只有 `cfg !== null` 时才覆盖 `baseUrl` 和 `model`。
- 未配置时保留组件默认值，不要覆盖用户正在输入的内容。
- 在事件处理器中增加防御性归一化，确保异常响应也不会触发未处理 Promise：

```ts
const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
```

同样保护 `model` 和 `apiKey`，但不要用空字符串吞掉服务端错误。

## 4. 不要修改

- 不要改变后端 `{ configured: false }` 的语义。
- 不要把未配置状态伪造成一份已保存配置。
- 不要把 API Key 放进 `localStorage`。
- 不要绕过 `/api/settings/ai/models` 直接请求模型供应商。

## 5. 验收步骤

- [ ] 清空 AI 配置后首次打开弹窗，没有控制台错误。
- [ ] 默认地址仍为组件定义的初始地址。
- [ ] 未填写首次 API Key 时显示表单错误，不崩溃。
- [ ] 填写地址和 Key 后能拉取真实模型。
- [ ] 保存配置、关闭再打开，能恢复脱敏地址和模型。
- [ ] 删除配置后再次打开，重新回到未配置状态。
- [ ] `npm run build` 和前端相关测试通过。
