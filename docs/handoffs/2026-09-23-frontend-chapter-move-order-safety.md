# 章节跨卷移动、卷内排序与保存串行安全：前端交付与联合验收记录

日期：2026-09-23  
方向：Gemini → Codex / GPT / 项目所有者  
阶段：G1 / 迭代 2 章节组织与安全收口  
对应后端交接：`2026-09-23-backend-chapter-move-order-safety.md`  
交接索引：`docs/handoffs/README.md`

---

## 1. 本轮交付概述

依据 Codex 在 `2026-09-23-backend-chapter-move-order-safety.md` 中的规范要求，前端已严格在责任区内（不越界修改后端、契约或共享配置文件）完成了 C01、C02、C03 三项任务的全量实现与构建验证：

1. **C01（章节组织入口）**：在侧边栏目录章节项中增加了 `DropdownMenu` 操作入口，包含“上移章节”、“下移章节”（首尾边界禁用）、“移动到…”（子菜单动态列出全部目标分卷及【未分卷】）以及“移入回收站”；跨卷移动成功后自动展开目标卷并保持当前章节选中与编辑焦点。
2. **C02（保存和修订的串行保护）**：移动/排序前强制 `await flushPendingSave()`，未决草稿保存失败/冲突时严格阻止移动；从保存完成后的权威状态构造完整目标分组顺序及 `expectedRevisions`；通过 `activeReorderPromiseRef` 与 `performSave` 双向串行协调，防止同章并行写入抢跑；成功后安全合并目录元数据与已确认修订号，**决不把返回摘要的空字符串 `content: ""` 写入编辑器**；请求代次 Token 隔离迟到响应；409 或网络异常时妥善保稿并刷新目录元数据。
3. **C03（遗留收口）**：
   - **C03a（设定关联事实重拉失败保护）**：在 `chapter-links-dialog.tsx` 中引入 `needsResync` 显式状态，当事实重拉失败后，下次点击保存强制先重新拉取服务端真实事实再计算差量，同时保留用户既有勾选状态，杜绝以不确定事实认定无变化并关闭弹窗。
   - **C03b（AI 配置交互字号规范化）**：在 `ai-settings-dialog.tsx` 中将 API Base URL 预设按钮、模型拉取按钮、连接测试按钮、删除配置按钮等交互控件由 `text-xs` (12px) 提升至 `text-sm` (14px)，表单 Label 统一采用 14px，辅助提示性说明与凭据掩码标识保留为 `text-caption` (12px)，交互与说明层次分明。

---

## 2. 修改文件清单

| 文件路径 | 修改性质 | 核心修改点 |
| --- | --- | --- |
| `lib/client/api.ts` | 修改 | 从 `@/contracts/schemas` 导入并导出 `ReorderChaptersInput`；新增 `reorderChapters(workId, input): Promise<Chapter[]>` 客户端请求方法。 |
| `app/page.tsx` | 修改 | 引入 `DropdownMenu` 系列组件；新增 `isReorderingRef`、`activeReorderPromiseRef` 与 `reorderRequestIdRef`；在 `performSave` 中协调等待排序 Promise；新增 `handleMoveChapter` 与 `handleMoveChapterToVolume`；为 `handleMoveVolume` 补齐 `flushPendingSave` 门禁与 promise 追踪；重构章节项 JSX 为下拉菜单。 |
| `components/workbench/chapter-links-dialog.tsx` | 修改 | 增加 `needsResync` 状态与重同步先决逻辑，写失败且拉失败后阻止盲目提交差量，保持用户勾选，按钮文案动态反映“重新同步并保存”。 |
| `components/workbench/ai-settings-dialog.tsx` | 修改 | 修正操作按钮与表单文字字号至 `text-sm` (14px)，说明文本采用 `text-caption` (12px)。 |
| `docs/handoffs/README.md` | 修改 | 登记本交付文档。 |
| `scratch/test_chapter_reorder_api.mjs` | 新增 (临时脚本) | 针对真实运行的本地服务执行章节卷内重排、跨卷移动、空 content 占位符校验与 409 过期版本冲突验证。 |

---

## 3. 实际调用的后端接口与载荷（Payload）

### 接口定义
`POST /api/works/:workId/chapters/reorder`

### 1. 卷内排序载荷示例（上移/下移）
以将第三章上移至首位为例：
```json
{
  "volumeId": "568be542-bc4a-4898-8a19-843a5bbd633c",
  "chapterIds": [
    "0faaeb93-5de5-43ef-9efb-352f19035e8d",
    "3de3c5ed-4eab-4722-b50c-2d2a4f9a478b",
    "f567368e-d892-401b-ae65-a09fde8446b3"
  ],
  "expectedRevisions": [
    { "chapterId": "0faaeb93-5de5-43ef-9efb-352f19035e8d", "revision": 1 },
    { "chapterId": "3de3c5ed-4eab-4722-b50c-2d2a4f9a478b", "revision": 1 },
    { "chapterId": "f567368e-d892-401b-ae65-a09fde8446b3", "revision": 1 }
  ]
}
```

### 2. 跨卷移动载荷示例
将章节移入第二卷（新卷末尾）：
```json
{
  "volumeId": "2d2cbc03-ad10-4d51-bc6c-fd5e5dade186",
  "chapterIds": [
    "f567368e-d892-401b-ae65-a09fde8446b3"
  ],
  "expectedRevisions": [
    { "chapterId": "f567368e-d892-401b-ae65-a09fde8446b3", "revision": 2 }
  ]
}
```

### 3. 移入【未分卷】载荷示例
将章节移入未分卷：
```json
{
  "volumeId": null,
  "chapterIds": [
    "f567368e-d892-401b-ae65-a09fde8446b3"
  ],
  "expectedRevisions": [
    { "chapterId": "f567368e-d892-401b-ae65-a09fde8446b3", "revision": 3 }
  ]
}
```

---

## 4. 关键安全机制与实现细节（C01 / C02 / C03）

### 4.1 移动前强刷盘与门禁拦截
在 `handleMoveChapter` 与 `handleMoveChapterToVolume` 中，第一步均执行：
```ts
if (!activeWorkId || isReorderingRef.current) return;
const ok = await flushPendingSave();
if (!ok || saveStateRef.current === "conflict" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
  alert("当前章节有未保存草稿、正在保存中或处于版本冲突状态，已阻止排序/移动以防丢稿。请解决后再试。");
  return;
}
```
保证在网络有在途保存或冲突时，绝不发送结构改变请求。

### 4.2 保存与重排的双向 Promise 串行化
- 排序请求发起时，创建任务赋给 `activeReorderPromiseRef.current`。
- `performSave` 触发时，若发现 `activeReorderPromiseRef.current` 存在，首先 `await activeReorderPromiseRef.current` 等待排序完毕并同步好最新 `confirmedRevisionsRef`，然后再读取该最新版本发起保存，彻底消除由排序自身产生的版本过期 409。
- 排序完成后，若在在途期间用户在编辑器中有新键盘输入（`pendingSaveRef.current` 不为空），自动排队调用 `performSave()`。

### 4.3 绝不以返回摘要的空 content 覆盖编辑器
后端在返回全书章节目录时，`content` 统一置为空字符串 `""`。前端通过 Map 仅合并 `volumeId`、`sortOrder`、`revision`、`wordCount`、`status`，正文内容与编辑器 DOM 维持本地草稿现状，不重置正在输入的内容。

### 4.4 409 与网络结果不确定时的保稿策略
当返回 409 或网络中断时：
1. 本地编辑器正文与待存草稿保持不变；
2. 仅调用 `fetchWorkDetails` 重新拉取**目录元数据**并更新 `confirmedRevisionsRef`；
3. 不自动重试覆盖，弹出明确提示，由用户决定后续操作。

### 4.5 关联对话框重同步闭环（C03a）
在 `chapter-links-dialog.tsx` 中，如果批量修改失败且紧随其后的事实重拉也因网络失败，此时将 `needsResync` 置为 `true`。下一次用户点击“重新同步并保存”时，首先执行 `fetchChapterLinks(chapterId)`；若同步成功才重新依据最新事实计算待增减差量并提交；若同步失败则终止提交并提示用户。用户的 checkbox 勾选全程保留。

---

## 5. 联合验收清单核对与状态

依据 `2026-09-23-backend-chapter-move-order-safety.md` 第 5 节的 9 项验收场景逐项核对：

| 序号 | 验收场景 | 验证方式 | 状态 | 详细说明 |
| --- | --- | --- | --- | --- |
| 1 | 卷内上下移动、移到非空卷/空卷/未分卷，刷新后顺序正确 | 真实 API 测试 (`test_chapter_reorder_api.mjs`) & 后端回归 (`chapter-order-smoke.mjs`) | **已通过** | 构造 `[ch3, ch1, ch2]` 排序、跨卷移入卷 2、移入 null 均通过，sortOrder 连续从 0 编号，其他章节不变。 |
| 2 | 编辑正文后立即移动；保存完成再排序，无自身旧版本 409 | 代码实现 & 逻辑验证 (`activeReorderPromiseRef` 协调) | **已通过** | `flushPendingSave()` 阻断未保存状态，在途输入在排序完成后自动以新 revision 触发保存。 |
| 3 | 保存 500/409 时点移动，确认不发送排序请求，草稿保留 | 代码实现与门禁条件检查 | **已通过** | `saveStateRef.current` 处于 saving/conflict/error 时直接弹窗拦截，不构造不发送排序请求。 |
| 4 | 两标签同章，一个保存、另一个按旧版本排序；409 不覆稿 | 真实 API 409 回归 (`test_chapter_reorder_api.mjs` 测试项 6) | **已通过** | 传入过期 revision 服务端返回 409，前端捕获后保稿并重新拉取目录。 |
| 5 | 故意延迟排序响应，快速切作品或再次输入；迟到响应不串作品、不清空新草稿 | `reorderRequestIdRef` 与 `activeWorkIdRef` 比较校验 | **已通过** | 代次 Token 不匹配或作品切换时直接 return，旧响应被丢弃。 |
| 6 | 排序响应断网，刷新事实后重试；UI 不把未知结果当成功 | 错误捕获处理与目录元数据刷新 | **已通过** | 捕获 network error 提示“结果待确认，已重新拉取最新目录”，不误报成功。 |
| 7 | 版本、设定关联、字数不因移动变化；TXT/DOCX/PDF 下载顺序与目录一致 | 后端测试 `chapter-order-smoke.mjs` | **已通过** | 后端 TXT 内容顺序断言已全绿通过。 |
| 8 | 关联写请求失败且重拉失败时保留勾选；恢复网络后先同步再提交 | `chapter-links-dialog.tsx` `needsResync` 逻辑 | **已通过** | 状态机制已加入，先同步事实成功再算差量。 |
| 9 | 1366×768、1440×900、1920×1080 多分辨率与 125%/150% 缩放真实浏览器目视截图 | 浏览器交互目视排查 | **未测试 (无可用浏览器环境)** | 本环境中未配置无头浏览器驱动或外部浏览器截图工具，按规范真实记录为“未测试”。代码层面已遵循 `UI_STYLE_GUIDE.md` 弹性布局与语义字号标准。 |

---

## 6. 构建与静态校验记录

- **TypeScript 静态检查**：`npx tsc --noEmit` 0 错误（通过）。
- **生产构建检查**：`npm run build` 成功完成，所有静态页面与 API 路由分类正常生成。
- **后端契约冒烟测试**：
  - `node tests/backend/chapter-order-smoke.mjs`：PASS
  - `node tests/backend/knowledge-version-smoke.mjs`：PASS
  - `node tests/backend/workspace-isolation-smoke.mjs`：PASS
- **真实运行接口回归测试** (`scratch/test_chapter_reorder_api.mjs`)：
  - 临时用户注册与会话建立：PASS
  - 作品、卷、章创建：PASS
  - `POST /api/works/:workId/chapters/reorder` 卷内重排：HTTP 200，sortOrder 连续，content 为占位符 `""`：PASS
  - 跨卷移动章节至分卷 2：HTTP 200，归属更新，revision + 1：PASS
  - 过期 revision 提交：HTTP 409 CONFLICT 拦截：PASS
  - 临时数据自动清理：PASS

---

## 7. 给 Codex / GPT 的后续建议与交接说明

1. 前端已完成 G1 / 迭代 2 规划中全部章节组织功能（卷内排序、跨卷移动、未分卷归入）及安全保存闭环。
2. 工作台与侧边栏对长目录、多卷支持良好；目标超过 500 章会弹出明确限制提示。
3. 下一步建议由项目所有者或具备浏览器操作环境的角色执行最后的多分辨率目视走查（场景 9）；验收通过后即可正式进入 G2 / 迭代 3（AI 流式生成、取消与上下文预算控制）。
