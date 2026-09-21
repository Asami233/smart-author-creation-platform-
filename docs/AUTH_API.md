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
| `POST` | `/api/auth/password/change` | 请求 `{ currentPassword, newPassword }`，保留当前会话并撤销其他会话 |
| `GET` | `/api/profile` | 获取当前用户资料和作品数 |
| `PATCH` | `/api/profile` | 可更新 `penName`、`bio`、`avatarUrl` |

前端调用必须使用同源 `/api/...` 地址，并设置 `credentials: "include"`。所有修改操作会拒绝跨站 `Origin`。

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

本地 `localhost`/`127.0.0.1` 在未配置 Resend 时使用 `devCode`，不打印验证码，也不写入磁盘。验证码仅以 HMAC 摘要保存；密码使用 PBKDF2-SHA256（随机盐、310,000 次迭代）；会话 Cookie 为 `HttpOnly + SameSite=Lax`，HTTPS 环境自动加 `Secure`。

## 数据隔离与兼容

部署环境的作品、章节、AI 设置和备份接口均要求登录，并以用户 UUID 作为 `ownerId` 隔离数据。只有本机开发地址保留旧 `local-author` 工作区，便于 Gemini 在完成前端接入前继续调试。注册账号不会自动认领旧本地样例数据，避免误转移作品。
