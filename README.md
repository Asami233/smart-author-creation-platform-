# 智能作者创作平台

面向中国网络文学个人作者的桌面写作工作台。项目采用“本地优先、写作为核心、AI 为辅助”的产品策略，支持作品组织、正文创作、资料管理、历史版本、导出，以及兼容 OpenAI API 格式的 AI 服务。

迭代 5 的本地开发与 Windows 桌面浏览器验收已完成；生产部署和真实邮件收信仍属于发布准备。当前实现以 Cloudflare D1 本地数据库运行。参与开发前请先阅读 [协作规则](./docs/COLLABORATION_RULES.md) 和 [迭代 5 结项记录](./docs/handoffs/2026-10-04-fullstack-iteration5-closeout.md)。

## 当前能力

- 作品、分卷、章节的创建、编辑、归档、移动和排序
- 富文本正文存储、字数统计、写作目标与连续创作统计
- 自动版本快照、手动版本、版本预览与安全恢复
- 大纲、角色卡、世界观、时间线和章节关联资料
- 全文与资料搜索
- TXT、DOCX、PDF 网文格式导出
- OpenAI-compatible AI 续写、润色、大纲生成、头脑风暴与一致性检查
- AI 地址安全校验、API Key 本地加密、调用限流和用量统计
- Cloudflare D1 本地数据库与可追踪迁移
- 账号会话、访客作品认领、数据导出与账号删除；生产邮件链路待外部环境验收

AI 只接收用户明确提交的指令和上下文，不会默认读取或上传整部作品。API Key 只由服务端读取并使用本地密钥加密保存。

## 快速启动（Windows）

建议安装 Node.js 22 或更高版本，然后双击仓库根目录中的 `start-dev.bat`。

启动器会依次：

1. 检查并按需安装依赖；
2. 创建仅供本机使用的 AI 配置加密密钥；
3. 构建项目并准备 Cloudflare 本地配置；
4. 自动应用尚未执行的 D1 数据库迁移；
5. 启动开发服务器。

终端会显示实际访问地址，当前通常为 `http://localhost:5173`。按 `Ctrl+C` 停止服务。

也可以从 PowerShell 启动：

```powershell
.\scripts\start-dev.ps1
```

已有依赖或构建结果时可以使用：

```powershell
.\scripts\start-dev.ps1 -SkipInstall -SkipBuild
```

本地数据保存在 `.wrangler/`，AI 配置加密密钥保存在 `.dev.vars`。两者均被 Git 忽略，不应上传到仓库。

## 常用命令

```bash
npm run dev
npm run build
npm run db:generate
```

后端测试使用 Node.js 内置测试运行器：

```bash
node --import tsx --test tests/backend/text.test.ts tests/backend/ai-security.test.ts tests/backend/exports.test.ts
```

## 技术方案

- Next.js 16、React 19、TypeScript
- Tailwind CSS 4 与 shadcn/ui
- Drizzle ORM 与 Cloudflare D1
- Zod API 输入校验
- 服务端 OpenAI-compatible 模型代理
- Node.js Test Runner 与 PowerShell API 冒烟测试

## 项目边界

- 第一阶段只服务个人作者和中文网文
- 第一版重点支持桌面浏览器
- Demo 使用本地数据库，不提供云同步或多人协作
- 云端同步、多人协作、社区和付费能力留待后续阶段

## 文档

- [项目里程碑](./MILESTONES.md)
- [后端阶段规划](./docs/BACKEND_ROADMAP.md)
- [API 契约](./docs/API_CONTRACTS.md)
- [前后端协作与代码所有权规则](./docs/COLLABORATION_RULES.md)
- [AI 助手仓库规则](./AGENTS.md)

## GitHub

<https://github.com/Asami233/smart-author-creation-platform-.git>
