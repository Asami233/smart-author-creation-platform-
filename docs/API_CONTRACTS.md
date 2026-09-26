# 后端 API 契约

## 通用约定

- 基础路径：`/api`
- 成功响应：`{ "data": ... }`
- 失败响应：`{ "error": { "code": "...", "message": "...", "details": ... } }`
- ID：UUID 字符串
- 时间：ISO 8601 字符串
- 当前身份：部署环境使用邮箱账号的 HttpOnly 会话；本机开发地址在未登录时保留 `local-author` 兼容工作区
- 写操作均不会接受客户端传入的 `ownerId`

章节更新建议始终携带 `expectedRevision` 进行并发保护。过渡期允许旧客户端省略该字段，但省略后不能防止客户端先前读取的内容被后续写入覆盖；前端完成接入后将改为必填。收到 `409 CONFLICT` 时，前端不得自动重试覆盖，应重新加载最新章节并提示用户。

正文 PATCH 与历史版本恢复在数据库 UPDATE 执行时再次检查：章节未删除、修订一致、所属作品仍属于当前账号且未归档；PATCH 指定真实目标卷时也重新检查卷的归属和存在性。请求开始时已经不可访问仍为 404，读写间发生上述状态变化则为 409，拒绝写入不会追加版本快照、每日字数或更新作品时间。成功响应是本次写入直接返回的章节行，不再二次读取可能已被其他请求改动的正文/修订；之后 GET 仍可能观察到其他合法更新。

## 作品

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/works` | 获取作品列表和字数摘要 |
| POST | `/api/works` | 创建作品，同时创建默认分卷和第一章 |
| GET | `/api/works/:workId` | 获取作品、分卷和章节目录 |
| PATCH | `/api/works/:workId` | 更新作品信息 |
| DELETE | `/api/works/:workId` | 归档作品，不物理删除 |

作品更新支持 `status: "draft" | "completed" | "archived"`。`PATCH` 成功返回 HTTP 200，`data` 保持 `{ work, volumes, chapters }`；`chapters` 为不含正文的目录摘要。归档时返回本次更新后的作品快照（`work.status = "archived"`），不再在写入成功后错误地返回 404；可以同时修改标题、简介等合法字段。`DELETE` 仍返回 204 / 无响应体，现有前端归档调用不必替换。

归档与清空该作品的活动作品/章节偏好在同一事务中完成，归档非当前作品不会改动当前选择。普通 GET、统计、章节访问及 PATCH 对归档作品继续返回 404；恢复必须使用 `POST /api/trash/works/:workId/restore`，不能用 PATCH draft 绕过。不存在或不属于当前账号的作品返回 404；非法请求体 400（部署未登录 401）。重复归档返回 404、不再修改时间；同时归档同一作品仅一次成功。作品、卷章正文、历史版本并未物理删除。

总体工作台：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/workspace` | 获取作品卡片列表、当前作品和当前章节 |
| PUT | `/api/workspace/active` | 切换当前作品，可同时指定章节 |

切换作品请求：`{ "workId": "UUID", "chapterId": "可选UUID" }`。创建作品后，后端会自动将新作品设为当前作品。

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
| POST | `/api/works/:workId/volumes/reorder` | 提交整书完整分卷顺序 |
| GET/PATCH/DELETE | `/api/volumes/:volumeId` | 分卷详情/更新/删除 |
| GET/POST | `/api/works/:workId/chapters` | 章节列表/创建章节 |
| GET/PATCH/DELETE | `/api/chapters/:chapterId` | 章节详情/保存/软删除 |
| POST | `/api/works/:workId/chapters/reorder` | 批量移动与排序章节 |

分卷排序请求为 `{ "volumeIds": ["分卷 UUID，按新顺序排列"] }`，必须包含当前作品的全部分卷，每个仅一次，共 1～500 项。成功返回 HTTP 200，`data` 为按新顺序排列的 `Volume[]`，`sortOrder` 从 0 连续编号。无效格式、重复、空列表或超限返回 400；遗漏、失效或跨作品 ID 返回 409；作品不存在、已归档或属于其他账号返回 404（部署环境未登录为 401）。

完整性检查和分卷更新在数据库写入中执行，失败不部分改序，也不修改作品更新时间。并发提交相同分卷集合的不同顺序采用最后成功写入结果，不提供排序版本冲突检测。前端遇 409 应刷新完整分卷列表后让用户重新排序；不能提交筛选子集或把“未分卷”虚拟分组当成 UUID。排序不修改章节正文、章节修订号或所属分卷，既有导出按分卷新顺序组织内容。

删除分卷会保留章节并将其转入未分卷，将卷级大纲转为作品级；分卷记录本身删除，不属于回收站可恢复对象。

章节保存：

```json
{
  "title": "第一章 雨夜来客",
  "content": "<p>正文 HTML</p>",
  "expectedRevision": 3
}
```

章节排序 / 跨卷移动：`POST /api/works/:workId/chapters/reorder`。

```json
{
  "volumeId": "目标分卷 UUID，未分卷时为 null",
  "chapterIds": ["章节 A UUID", "章节 B UUID"],
  "expectedRevisions": [
    { "chapterId": "章节 A UUID", "revision": 3 },
    { "chapterId": "章节 B UUID", "revision": 1 }
  ]
}
```

- `volumeId` 必填：本作品真实分卷 UUID，或 `null` 表示未分卷；不能是虚拟分组字符串。
- `chapterIds` 为**目标分组操作后的完整顺序**：必须包含该组全部未删除章节和本次待移入章节，各一次，共 1～500 项。不是全书列表，也不是被选中的局部列表。其他源卷的剩余章节不提交、不重编号，允许顺序值有空隙。
- `expectedRevisions` 与 ID 列表一一对应，版本为正整数，数组自身顺序不限。新前端必须传入；仅为兼容旧调用保留可选。省略后仍有服务端读写期间竞争校验，但无法检测客户端持有的旧版本意图。
- 成功 HTTP 200，`data` 仍是**全书所有未删除章节的目录数组**，结构沿用 `Chapter[]`，其中 `content` 恒为 `""`（历史摘要占位，绝不是最新正文）。前端不得据此清空编辑器；按卷的 `sortOrder` 及章的 `sortOrder` 分组展示，不依赖响应整体的分卷顺序。
- 目标组 `sortOrder` 从 0 连续编号。归属或位置实际改变的章节 `revision + 1`，更新章节及作品时间；未改变的章节不加版本、不改时间。使用最新版本提交相同顺序是无副作用的空操作。不要用旧版本自动重试成功请求。
- 计算结构增量必须比较**真实旧 sortOrder 与新位置**以及旧/新 volumeId，不是比较列表显示下标，也不是仅为“移入的章”加 1。源卷允许留下空隙，因此跨卷移动可能同时给目标卷原有章节重新编号并增加其修订。前端应保存并使用服务端 sortOrder，禁止猜测连续编号。
- 不改正文、历史版本、关联、字数、每日统计或当前选章偏好。移动成功后必须安全更新已确认修订号，并保护请求期间产生的新草稿；保存和目录变更必须串行协调。
- **正文版本基线不可由目录刷新静默推进**：目录返回的 revision 描述服务端事实，不代表本地草稿已基于该版本。成功时仅对本次已校验的目标列表，并且响应修订号恰好等于请求版本加本次实际结构变化量（0 或 1）的章节，同步本次结构操作产生的版本；全书响应中无关章节不得批量覆盖草稿基线。409、网络结果未知或发现额外修订时，保留原正文基线、暂停相关自动保存，让用户拉取/比较正文后决定。不能将新 revision 与旧正文组合自动提交，这会绕过乐观锁。
- 400：缺失/非法参数、重复 ID、空列表、超过 500 项、版本列表不匹配。409：目标卷失效/跨作品，章节遗漏/失效/跨作品，版本过期或写入期间目标集合改变。404：作品不存在、归档或属于其他账号；部署环境未登录 401。
- 完整性、版本及归属校验在同一次数据库更新中重新确认，校验失败不部分移动、不更新时间。409 后保留草稿，刷新**目录元数据**并让用户重新操作，不自动重放或重新拉正文覆盖本地草稿。
- **兼容性收紧（2026-09-23）**：以前接受但会导致重复序号的目标分组局部列表，现在返回 409。需要局部上移/下移时，前端先构造完整目标组列表再提交。章节组织应使用此接口，不用逐章 PATCH 模拟批量移动。

## 历史版本

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/chapters/:chapterId/versions` | 获取版本摘要列表 |
| POST | `/api/chapters/:chapterId/versions` | 创建手动命名版本，body 为 `{ "label": "定稿前" }` |
| GET | `/api/chapter-versions/:versionId` | 获取版本完整内容，用于前端对比 |
| POST | `/api/chapter-versions/:versionId/restore` | 恢复版本；恢复前自动备份当前正文；建议 body 为 `{ "expectedRevision": 当前章节版本号 }`，过期返回 409（旧客户端空 body 仍兼容） |

版本列表支持 `?limit=50&cursor=<上页 nextCursor>`，`limit` 为 1–200，默认 200。响应保持 `data` 为版本摘要数组，另附顶层 `pagination: { hasMore: boolean, nextCursor: string | null }`，因此旧客户端只读取 `data` 仍可工作。游标是仅用于翻页的不透明字符串，前端应原样回传；非法游标返回 `400 INVALID_CURSOR`。列表按创建时间和 ID 倒序稳定排列，不包含正文；正文需单独请求版本详情。

## 大纲、角色、世界观和时间线

资源类型 `kind` 取值：`outlines`、`characters`、`world`、`timeline`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET/POST | `/api/works/:workId/knowledge/:kind` | 获取或创建设定对象 |
| GET/PATCH/DELETE | `/api/knowledge/:kind/:id` | 获取、更新或删除单个对象 |

世界观类型：`location`、`faction`、`system`、`item`、`custom`。

作品级大纲的 `scopeId` 可省略；分卷/章节级大纲必须指定当前作品内存在的分卷/章节 ID。时间线 `participantIds` 必须是当前作品的角色 ID 且不能重复。跨作品关联返回 `409 CONFLICT`。
删除角色会清理其章节关联与时间线参与 ID；删除分卷会把对应分卷级大纲转为作品级，保留大纲内容。

章节关联：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/chapters/:chapterId/links` | 查看章节关联 |
| POST | `/api/chapters/:chapterId/links` | 添加关联 |
| DELETE | `/api/chapters/:chapterId/links?entityType=character&entityId=...` | 删除关联 |
| POST/DELETE | `/api/chapters/:chapterId/links/batch` | 原子批量添加/删除关联；body 为 `{ "links": [{ "entityType": "character", "entityId": "UUID" }] }`，每次 1–100 条 |

添加关联请求：

```json
{
  "entityType": "character",
  "entityId": "角色 UUID"
}
```

批量关联请求不得重复；添加前验证所有目标均属于该章节作品，任一无效则整批返回 `409` 且不写入。批量删除只作用于当前章节的关联。成功响应的 `data` 为操作后的完整章节关联列表。

大纲排序：`POST /api/works/:workId/knowledge/outlines/reorder`，body 为 `{ "outlineIds": ["按显示顺序排列的 UUID"] }`。列表必须恰好包含当前作品的全部大纲 ID，每个仅一次；缺失、重复或混入其他作品返回 `400`（重复/格式错误）或 `409`（非本作品完整列表）。成功响应的 `data` 为排序后的大纲列表，不修改大纲所属的作品或作用范围。

## 搜索与统计

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/works/:workId/search?q=关键词` | 搜索章节、角色、世界观和大纲 |
| GET | `/api/works/:workId/stats` | 获取作品总字数、章节数、连续写作和最近 90 条日统计 |
| PUT | `/api/works/:workId/stats` | 设置某日目标，body 为 `{ "date": "2026-09-17", "targetWords": 3000 }` |

GET / PUT 均返回 `{ data: WorkStats }`（类型见 contracts/types.ts）。保留原来的 totalWords、targetWords（全书目标）、chapterCount、completedChapterCount、streakDays 和 daily，新增以下字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| timeZone | "Asia/Shanghai" | 本阶段自然日统计时区 |
| today | string | 服务端本次请求确定的上海日期，YYYY-MM-DD |
| todayWordsWritten | number | 当前作品当天已保存正文的正向字数变化累计；无记录为 0 |
| todayTargetWords | number 或 null | 当天记录中的目标；0 为不设限，null 为当天尚无记录 |

streakDays 从上海今日开始向前统计连续有正向写作记录的天数；今日未写则为 0，不表示截至昨日的连续天数。计算不再被 daily 返回的 90 条记录截断。daily 按日期倒序，最多 90 条已有记录，不补齐缺失日期，不等于完整 90 个自然日曲线；允许既有未来日目标记录出现在列表中，today 字段不受其影响。

todayWordsWritten 不是净增、键盘输入次数或当前正文总字数：删除、版本恢复不会直接抵扣/增加这个累计，导入及创建章节也不能当成手工新写。未来净增趋势需独立账本，本轮没有新增 todayNetWords / recentTrends。

PUT 的 date 必须为有效日历日期，例如 2026-02-31 返回 400；targetWords 为 0～100,000 的整数。目标只作用于指定作品与日期，不是永久默认偏好。首次正向保存若尚无日记录，沿用既有服务端默认目标 3000；事先设置 0 的日记录不会被正文保存改回 3000。

统计 API 具有作品归属检查。前端应使用服务端今日字段展示已保存统计，失败显示失败/重试，不能静默改用浏览器全局 localStorage 或捏造历史。

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
| POST | `/api/settings/ai/models` | 使用用户填写或已保存的密钥获取供应商真实模型列表 |
| POST | `/api/settings/ai/test` | 发出极小的真实模型请求，验证地址、密钥和模型 |
| POST | `/api/ai/generate` | 生成建议，不修改正文 |
| POST | `/api/ai/generate/stream` | 流式生成建议（SSE），不修改正文 |
| GET | `/api/ai/usage` | 最近 30 天请求与 token 统计 |

保存 AI 设置：

```json
{
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "apiKey": "首次保存必填；后续不更换密钥时可省略"
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

### 流式生成（迭代 3，第 4 天）

`POST /api/ai/generate/stream` 使用与 `/api/ai/generate` 完全相同的 JSON 请求体与校验规则。需要有效会话（本机开发环境沿用单作者身份），非同源写请求返回 `403 CROSS_SITE_REQUEST`。服务端仅使用已保存的加密 AI 配置，密钥不进入响应、浏览器或日志；不会额外读取整部作品。旧的一次性接口保留且响应不变。

成功握手为 HTTP 200，`Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-store, no-transform`。每个 SSE 帧的 `event` 等于 JSON `data.type`，正式类型见 `contracts/types.ts` 的 `AiStreamEvent`：

```text
event: start
data: {"type":"start","requestId":"...","action":"continue","model":"...","contextBudget":{"estimatedInputTokens":420,"inputTokenLimit":14000,"requestedContextTokens":210,"includedContextTokens":210,"omittedCharacters":0,"truncatedSections":[],"selectedTextTooLong":false}}

event: delta
data: {"type":"delta","text":"一小段新增文本"}

event: done
data: {"type":"done","usage":{"inputTokens":null,"outputTokens":null},"contextSummary":{"chapterCount":1,"outlineCount":0,"characterCount":0,"worldEntryCount":0,"timelineEventCount":0}}

event: error
data: {"type":"error","code":"AI_STREAM_INTERRUPTED","message":"模型流式响应未完整结束"}
```

`done` 与 `error` 互斥；只有收到 `done` 的文本才是完整建议，才能启用“采纳”。上游某些兼容供应商不提供流式 token 用量，故 `usage` 可为 `null`。`requestId` 用于界面追踪一次请求，不是可重连游标，不支持 `EventSource` 自动重连。

上下文预算采用前后端共用的保守估算：ASCII 约每 4 字符 1 Token，非 ASCII 每字符按 2 Token，估算总窗口 16,000 Token，扣除本次 `maxTokens` 后是输入预算。该值不是供应商模型的精确分词或窗口承诺，供应商仍可能拒绝超出其自身限制的请求。先完整保留用户选中的文本；选区本身放不下时，握手前返回 `400 AI_SELECTED_TEXT_TOO_LONG`，不向供应商发送截断选区。其余材料按“章节末尾 → 大纲 → 角色 → 世界观 → 时间线”顺序填入；章节保留末尾，其余条目保留开头，截断位置在提示词内标明。`start.contextBudget` 报告实际发送量与省略字数；前端发起前使用同一规划函数显示预计量和超限提示。

`GET /api/ai/usage` 的 `requestCount` 现在表示当天已接受的生成尝试，包含用户取消和供应商失败；本地 100 次上限在请求供应商前原子占用名额，避免并发或连续取消绕过。`inputTokens` 与 `outputTokens` 仅累计完整结束且供应商明确报告的非负整数，**不是账单金额，也不能代表取消请求的实际供应商费用**。每个日记录新增 `requestCountMeaning: "attempts"` 与 `tokenCountMeaning: "provider_reported_on_completed_requests"`，原字段仍保留。改版前已有的历史 `requestCount` 按旧规则只统计成功请求，不回填无法推断的取消次数。

用户停止生成时，浏览器中止 `fetch` 的 `AbortSignal`，服务端随之取消上游请求；没有独立的取消 API，也不保证取消后可收到 `error` 帧。预览中已到达的部分文本可以复制，但不得当成完整建议写入正文。新请求或切换作品/章节须取消旧请求并隔离旧片段。

握手前的参数、鉴权、配置和供应商 HTTP 错误沿用 `{ "error": { "code", "message" } }` JSON 非 200 响应（例如 400/401/403/429/502/504）；握手后发生的断流、超时、格式错误以 `error` 帧结束，HTTP 状态仍为 200。绝不把供应商原始错误正文或 API Key 透传。兼容标准 SSE、分块 CRLF、文本数组、以 `finish_reason` 收尾而不发 `[DONE]` 的响应，以及供应商直接返回的非流式 `application/json` 完成结果。流式代理总时限 120 秒、单帧 100 万字符、总输出 20 万字符；超过上限以安全错误终止。

## 邮箱认证

完整请求、响应和错误码见 [`AUTH_API.md`](./AUTH_API.md)。主要接口：

- `/api/auth/register/start`、`/api/auth/register/verify`
- `/api/auth/login/password`
- `/api/auth/login/code/start`、`/api/auth/login/code/verify`
- `/api/auth/password/forgot`、`/api/auth/password/reset`、`/api/auth/password/change`
- `/api/auth/session`、`/api/auth/logout`、`/api/auth/logout-all`
- `/api/profile`

前端必须使用 `credentials: "include"`，不得读取或保存会话令牌。

## 数据安全

完整契约见 [`DATA_SAFETY_API.md`](./DATA_SAFETY_API.md)。包含完整备份、备份验证与导入、存储摘要、回收站和恢复接口。

## 健康检查

`GET /api/health` 返回服务状态，不访问数据库。
