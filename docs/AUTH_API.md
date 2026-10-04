# 邮箱认证与前端接入契约

本文档是 Gemini 接入登录页面时的唯一认证接口依据。前端不得保存密码、API 密钥或会话令牌；浏览器会话由服务端通过 `HttpOnly` Cookie 管理。

## 认证流程

### 邮箱注册

1. `POST /api/auth/register/start`
   - 请求：`{ "email": string, "password": string, "penName": string }`
   - 密码要求：8–128 位，必须同时包含字母和数字。
   - 返回 `202`。本地开发且未配置邮件服务时，`data.devCode` 会包含验证码；生产环境绝不会返回验证码。
2. `POST /api/auth/register/verify`
   - 请求：`{ "email": string, "code": "6位数字" }`
   - 成功返回 `201`，同时写入会话 Cookie。

注册不再接受手机号，也不允许通过验证码登录自动注册。

### 密码登录

`POST /api/auth/login/password`

```json
{ "email": "writer@example.com", "password": "novel2026" }
```

连续 5 次密码错误会锁定 15 分钟。错误响应统一为 `INVALID_CREDENTIALS`，前端不要尝试判断邮箱是否存在。

### 邮箱验证码登录

1. `POST /api/auth/login/code/start`，请求 `{ "email": string }`。
2. `POST /api/auth/login/code/verify`，请求 `{ "email": string, "code": string }`。

验证码 10 分钟有效、最多尝试 5 次、60 秒内不可重复发送。发送接口对不存在的邮箱也返回相同结构，防止探测账号。

### 找回密码

1. `POST /api/auth/password/forgot`，请求 `{ "email": string }`。
2. `POST /api/auth/password/reset`，请求 `{ "email": string, "code": string, "newPassword": string }`。

重置成功后，该账号全部旧会话会被撤销。

### 会话与安全操作

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| `GET` | `/api/auth/session` | 返回 `{ authenticated, user }`；未登录也返回 200 |
| `POST` | `/api/auth/logout` | 撤销当前会话并清除 Cookie |
| `POST` | `/api/auth/logout-all` | 撤销账号全部会话 |
| `GET` | `/api/auth/sessions` | 列出当前账号仍有效的会话，标明当前会话；读取时清理该账号已过期记录 |
| `DELETE` | `/api/auth/sessions/:sessionId` | 撤销指定的其他会话；当前会话必须使用退出登录 |
| `GET` | `/api/account/export` | 下载账号公开资料及完整作品备份；不包含密码、会话、验证码和 AI Key |
| `DELETE` | `/api/account` | 当前密码与固定确认短语复核后立即永久删除账号、全部作品及会话 |
| `POST` | `/api/auth/password/change` | 请求 `{ currentPassword, newPassword }`，保留当前会话并撤销其他会话 |
| `GET` | `/api/profile` | 获取当前用户资料和作品数 |
| `PATCH` | `/api/profile` | 可更新 `penName`、`bio`、`avatarUrl` |

前端调用必须使用同源 `/api/...` 地址，并设置 `credentials: "include"`。所有修改操作会拒绝跨站 `Origin`。

`GET /api/auth/sessions` 只返回会话 UUID、创建时间、最近活动时间、到期时间和 `current` 标记，不返回 Cookie 或其摘要。活动时间至多每 5 分钟更新一次，避免每个 API 请求都写数据库。撤销当前会话返回 `409 CANNOT_REVOKE_CURRENT_SESSION`；跨账号或不存在的 UUID 返回 `404 SESSION_NOT_FOUND`。对已撤销但尚未清理的同一 UUID 重试，返回 `alreadyRevoked:true`，不会影响其他会话。

账号永久删除没有冷静期。`DELETE /api/account` 要求当前密码、精确短语“永久删除我的账号”和同源请求；成功后删除账号的作品、设定、版本、偏好、AI 配置与用量、验证码、凭据及全部会话，并使当前 Cookie 立即过期。页面必须先展示不可恢复提醒并建议下载账号备份。错误密码不会执行任何删除。

## 通用响应

成功：`{ "data": ... }`

失败：

```json
{ "error": { "code": "错误代码", "message": "用户可读消息", "details": {} } }
```

前端应展示 `message`，并按 HTTP 状态处理：`400` 输入/验证码错误、`401` 未登录或凭据错误、`403` 禁止、`409` 邮箱已注册、`429` 频率限制。

## 服务端配置

生产环境需设置：

- `AUTH_SECRET`：至少 32 字符的随机密钥；未提供时会回退到已有的 `APP_ENCRYPTION_KEY`。
- `RESEND_API_KEY`：Resend 服务端 API Key。
- `AUTH_EMAIL_FROM`：已在 Resend 验证的发件人，例如 `智能作者 <auth@example.com>`。

`RESEND_API_KEY` 与 `AUTH_EMAIL_FROM` 必须同时配置。只配置其中一个会返回 `503 EMAIL_CONFIG_PARTIAL`，即使请求来自本机也不会静默退回开发验证码；发件地址格式不合法返回 `503 EMAIL_FROM_INVALID`。真实邮件请求 10 秒超时，供应商拒绝或网络失败统一返回 `502 EMAIL_DELIVERY_FAILED`，不会把供应商响应或 API Key 暴露给客户端。

部署检查可调用 `GET /api/health/auth-email`。就绪时返回 200 和 `{data:{ready,mode,provider,localRequest,devCodeEnabled,missing,issues}}`；公开环境未配置或配置不完整时返回 503，但保持相同响应结构。该接口不返回密钥和完整发件地址，并设置 `Cache-Control: no-store`。

只有 `localhost`、`127.0.0.1`、`[::1]` 且两个 Resend 变量都未配置时，才使用 `mode:"development"` 并在发送接口响应里返回 `devCode`；公开域名永远不会返回开发验证码。配置完整后，即使在本机也发送真实邮件。验证码不打印、不写入磁盘，只以 HMAC 摘要保存。邮件发送或配置检查失败会删除本次新建的验证码记录，因此不会留下 60 秒冷却；旧验证码只在新邮件成功发送后失效。

密码使用 PBKDF2-SHA256（随机盐、310,000 次迭代）；会话 Cookie 为 `HttpOnly + SameSite=Lax`，HTTPS 环境自动加 `Secure`。当前数据表尚未保存设备名称、浏览器 UA 或 IP，因此设备列表只区分当前会话与其他会话，避免伪造看似精确的设备信息。

## 数据隔离与兼容

部署环境的作品、章节、AI 设置和备份接口均要求登录，并以用户 UUID 作为 `ownerId` 隔离数据。只有本机开发地址保留旧 `local-author` 工作区。注册账号不会自动认领旧本地作品，避免误转移；用户须在“认领访客作品”页面完成预览、下载备份和明确确认，详细契约见 [`API_CONTRACTS.md`](./API_CONTRACTS.md)。
