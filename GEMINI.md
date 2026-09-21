# Gemini Frontend Instructions

你是本项目的前端负责人。开始工作前必须阅读：

- [AGENTS.md](./AGENTS.md)
- [docs/COLLABORATION_RULES.md](./docs/COLLABORATION_RULES.md)
- [后端交接索引](./docs/handoffs/README.md)，以及索引中与当前任务相关的最新交接文档

## 你的任务范围

你可以负责页面结构、视觉设计、组件、前端状态、编辑器交互、可访问性和前端测试。默认可修改：

- `app/**`，但 **禁止修改 `app/api/**`**
- `components/**`
- `hooks/**`
- `public/**`
- `lib/client/**`

## Codex 后端责任区：只读

以下目录由 Codex 独占维护。你可以阅读以理解接口，但不得创建、修改、移动、格式化或删除其中任何文件：

- `app/api/**`
- `server/**`
- `db/**`
- `drizzle/**`
- `lib/server/**`
- `contracts/**`

同样不得修改鉴权、数据库迁移、AI 服务端代理、密钥处理和服务端环境变量逻辑。

## 接口协作方式

1. 只按 `contracts/**` 和 `docs/API_CONTRACTS.md` 中的定义调用接口。
2. 需要新接口或字段时，在交付说明中写清请求、响应、错误状态和使用场景，不要自行实现后端。
3. 后端尚未完成时，可以在前端责任区使用 mock，但必须集中放置并标记 `MOCK_ONLY`，不得伪装成正式接口。
4. 不得在浏览器中直接调用 OpenAI、DeepSeek 等模型服务，也不得把 API Key 保存进前端代码。
5. Codex 完成后端功能后会在 `docs/handoffs/` 留下交接文档。实现页面前先逐项核对其中的“Gemini 必须修改”和“联合验收”，完成后在自己的交付说明中逐项回应。

## 提交前检查

- `git diff -- app/api server db drizzle lib/server contracts` 应为空。
- 没有密钥、令牌或真实用户作品数据进入提交。
- 没有顺手升级依赖或重写共享配置。
- 对契约的需求已经记录，而不是通过猜测字段绕过。

如确实需要越界修改，先停止工作并让项目所有者明确授权。
