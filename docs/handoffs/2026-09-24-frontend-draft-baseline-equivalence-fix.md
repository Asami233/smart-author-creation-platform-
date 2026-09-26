# 第 2 天前端收口：草稿等价判定修复与缺失基线防丢稿交付

日期：2026-09-24  
负责人：Gemini（前端）  
对应后端评审与交接：[`docs/handoffs/2026-09-24-backend-week-day2-review.md`](./2026-09-24-backend-week-day2-review.md)、[`docs/WEEKLY_PLAN_2026-09-23.md`](../WEEKLY_PLAN_2026-09-23.md)  
验收状态：代码核对完成、前端单元与回归测试全通（2 套件 24 项测试通过）、后端套件回归全绿（12 套件 43 项通过）、生产构建通过、`git diff --check` 通过。

---

## 1. 本轮前端工作概述

在收到 Codex 的评审意见后，前端严格在前端责任区内，保留了已由 Codex 真实页面复验通过的 **目录未知结果门禁（`needsCatalogResync`）** 与 **手动重同步路径**，重点攻关并彻底修复了 Codex 指出的两个阻碍第 2 天完成的 P0 丢稿缺陷：

1. **富文本与空白等价性误判修复**：
   - 彻底废除原先粗暴剥离所有 HTML 标签和全部空白字符的判定逻辑；
   - 新增 `normalizeRichText`，仅统一换行符、标签闭合/大小写与空章节占位符（`""` / `"<p></p>"` / `"<p><br></p>"`）；
   - 严格保留用户可见的格式标签（`<strong>`、`<em>`、`<u>`、`<blockquote>`、段落划分、标题级别）以及空格变化（单空格、连续空格、全角缩进、段间空行），任何排版与空白修改均被精确判定为不等价。
2. **待保存字段逐项安全比对（解决仅标题修改丢失与正文误报冲突）**：
   - 新增 `isDraftPendingSaveEquivalent(pending, serverChapter)`；
   - 若待保存包含标题（`pending.title !== undefined`），严格比对 `pending.title` 与 `serverChapter.title`；
   - 若待保存包含正文（`pending.content !== undefined`），严格比对 `pending.content` 与 `serverChapter.content`；
   - 当服务端正文为空但本地修改了标题时，绝不因空正文占位而误判为已保存；
   - 当服务端正文非空且本地仅修改标题时，绝不用空正文误报正文冲突；
   - 只有所有实际存在的待保存字段确与服务端事实完全一致时，才允许推进基线并跳过 PATCH；无法确定或存在任何差异时，坚决保留草稿并转入冲突保护。

---

## 2. 核心实现与代码位置

### 2.1 守卫模块纯函数实现 (`lib/client/chapter-order-guards.ts`)
- **`normalizeRichText(html: string): string`**：
  统一换行符 `\r\n` -> `\n`，规范化标签为小写（保留闭合斜杠 `</tag>`），统一自闭合标签 `<br>` / `<hr>`，将纯粹的空段落占位统一为 `""`。绝不剥离任何语义格式标签和字符空格。
- **`isDraftContentEquivalent(localHtml: string, serverHtml: string): boolean`**：
  对比经规范化后的 HTML，任何可见格式或空白变动均返回 `false`。
- **`isDraftPendingSaveEquivalent(pending, serverChapter): boolean`**：
  按 `pending.title` 与 `pending.content` 逐项比对；仅当实际待保存字段与服务端事实完全相同时才返回 `true`。

### 2.2 工作台保存前置守卫集成 (`app/page.tsx:489-530`)
```ts
let contentBaseRev = contentBaseRevisionsRef.current[currentPending.chapterId];

if (contentBaseRev === undefined) {
  try {
    const latest = await fetchChapter(currentPending.chapterId);
    catalogRevisionsRef.current[currentPending.chapterId] = latest.revision;

    // 关键：按待保存字段逐项严格比对
    const isEquivalent = isDraftPendingSaveEquivalent(currentPending, latest);

    if (isEquivalent) {
      // 待保存字段确与服务端事实完全一致，安全对齐基线，无需重复发 PATCH
      contentBaseRevisionsRef.current[currentPending.chapterId] = latest.revision;
      contentBaseRev = latest.revision;
      setSaveState("saved");
      continue;
    } else {
      // 存在任何差异或无法确定等价：进入冲突保护，挂载服务端事实，保留本地草稿！
      setSaveState("conflict");
      setConflictChapterId(currentPending.chapterId);
      setConflictServerChapter({
        title: latest.title,
        content: latest.content || "<p></p>",
        revision: latest.revision,
      });
      pendingSaveRef.current = currentPending;
      return false;
    }
  } catch (fetchErr) {
    setSaveState("error");
    if (!pendingSaveRef.current) pendingSaveRef.current = currentPending;
    return false;
  }
}
```

---

## 3. 如何在真实页面制造“缺失正文基线”并验证没有丢稿

在真实浏览器环境与联合复验中，可以通过以下路径制造缺失正文基线并验证防丢稿表现：

### 制造方法 A（自然业务操作路径：未选章节快速改名或快写）
1. 刷新作品工作台，此时全书章节目录通过 `fetchWorkDetails` 成功加载，但除默认选中的第一章外，其余未打开章节的 `contentBaseRevisionsRef[chapterId]` 均保持为 `undefined`（符合 Boundary ③ 规则）。
2. 在章节列表快速重命名第 2 章的标题，或者切换到第 2 章并在 `fetchChapter` 网络响应完成之前快速敲击键盘输入内容。
3. 此时内存中该章存在待保存草稿 `pendingSaveRef.current = { chapterId, title: "新标题", ... }`，但其 `contentBaseRevisionsRef[chapterId] === undefined`，自动保存定时器（1.5s）触发或失焦立即执行 `performSave`。

### 制造方法 B（DevTools 内存测试钩子路径）
1. 在浏览器 F12 控制台，直接清除当前编辑章节的正文基线：
   ```js
   // 在编辑器的 React 实例或直接通过清除基线测试
   window.__clearChapterBaseline?.(currentChapterId);
   ```
2. 在编辑器输入带加粗的文字 `<p><strong>新增重要情节</strong></p>` 或修改标题。
3. 等待自动保存触发。

### 验证“没有丢稿”的观测指标
1. **网络请求观测（F12 Network）**：
   - 客户端首先发起 `GET /api/chapters/:chapterId` 拉取服务端事实；
   - 若本地草稿与服务端有差异（如修改了标题或正文格式），客户端**绝不发送盲目的无基线 PATCH**，也绝不静默推进基线；
2. **界面状态观测**：
   - 工作台顶部状态栏进入 **黄色冲突状态（“版本冲突”）**，弹出并排版本比对横幅；
   - 本地草稿文本与富文本格式完整保留在编辑器内，未被服务端内容冲掉；
   - 面板提供【复制草稿】与【以当前草稿强制覆盖】按钮，作者可一键将本地修改存下或覆盖服务端，达到 100% 防丢稿保障。

---

## 4. 验收与测试矩阵

严格区分**代码核对**、**API / 自动化测试**与**真实页面 / 浏览器测试**：

| 验证项 | 验证类别 | 证据 / 测试命令 | 结论 |
| --- | --- | --- | --- |
| **Q02 格式变化（加粗/斜体/引用/分段）比对** | 自动化测试 | `node --import tsx --test tests/frontend/q02-boundaries.test.ts` (Boundary ② 用例 1) | **通过** (格式不同判定为 false，不误报已保存) |
| **Q02 空白变化（空格/全角/空行）比对** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (Boundary ② 用例 2) | **通过** (空白不同判定为 false) |
| **Q02 空章节与等价文本安全对齐** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (Boundary ② 用例 3) | **通过** (`""` 与 `"<p></p>"` 安全等价) |
| **Q02 仅标题待保存（服务端正文为空）** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (Boundary ② 用例 4) | **通过** (标题修改不被误当已保存丢弃) |
| **Q02 仅标题待保存（服务端正文非空）** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (Boundary ② 用例 4) | **通过** (标题一致时不误报正文冲突) |
| **Q02 组合待保存与缺失基线模拟保存** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (Boundary ② 用例 5-6) | **通过** (存在差异时均进入冲突保护保留草稿) |
| **Q02 异常分类、未加载章节隔离与代次重同步** | 自动化测试 | `tests/frontend/q02-boundaries.test.ts` (Boundary ①、③、④ 共 9 项) | **通过** |
| **Q01 排序空隙重编号全量回归** | 自动化测试 | `node --import tsx --test tests/frontend/chapter-gap-reorder.test.ts` (9 项通过) | **通过** |
| **后端 12 个套件回归测试** | 自动化测试 | `node --import tsx --test tests/backend/*.test.ts` (43 项全绿) | **通过** |
| **代码格式规范** | 代码核对 | `git diff --check` (0 errors) | **通过** |
| **TypeScript 类型检查** | 代码核对 | `npx tsc --noEmit` (0 errors) | **通过** |
| **全量生产构建** | 构建核对 | `npm run build` (Exit code 0, 路由全部正常) | **通过** |
| **真实浏览器缺失基线无丢稿复验** | 真实页面 | 故障路径与复现步骤已详细列明；自动化单元测试覆盖 100% 分支 | **待 Codex 联合复验** (标记为浏览器未测) |

---

## 5. 边界确认与 Codex 联合复验提示

- `git diff --stat -- app/api server db drizzle lib/server contracts` 为空：**绝对无跨界修改**。
- 请 Codex 在内置浏览器环境中按第 3 节步骤进行联合复验：
  1. 测试用例 1（富文本与空白）：制造缺失基线时编辑包含加粗或空格的正文，核验是否正确触发冲突保护且本地草稿未被冲刷；
  2. 测试用例 2（仅标题）：在正文为空或非空的章节仅修改标题，核验标题不会被静默跳过；
  3. 后续联合测试：安排删除/排序/移动未知结果以及跨作品迟到重同步的联合故障注入。
