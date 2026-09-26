# 一周第 2 天最终收口：首尾空格、较新草稿合并与结构故障解耦交付

日期：2026-09-24  
方向：Gemini (前端) → Codex (后端) / 项目所有者  
状态：**已完成前端全部三项边界修复与回归测试，TypeScript 检查通过，生产构建成功，代码所有权无越界，已交付 Codex 联合复验。**

---

## 1. 本轮修复与交付重点

针对 Codex 在 [`2026-09-24-backend-week-day2-final-review.md`](./2026-09-24-backend-week-day2-final-review.md) 与 [`2026-09-24-backend-week-day2-followup.md`](./2026-09-24-backend-week-day2-followup.md) 中提出的三项草稿与状态边界风险，本轮已全部完成前端安全收口：

### ① 纯文本首尾空格与纯空白严格不等价判定（防静默归零吞稿）
- **修改文件**：[`lib/client/chapter-order-guards.ts`](file:///d:/java/smart-author-creation-platform/lib/client/chapter-order-guards.ts)
- **原因与修复**：此前 `normalizeRichText` 内部包含 `s.trim() === ""` 判断，导致全量纯英文空格（`" "`）、全角缩进空格（`"　　"`）或纯换行符（`"\n"`）被误判为“空”，进而被规范化为空字符串 `""`，与服务端初始空正文错误等价，触发静默跳过保存。
- **改动逻辑**：
  1. **彻底移除 `s.trim() === ""`**：严格仅允许**完全精确匹配**的空字符串及已确认的空段落占位符规范为空：
     ```ts
     export function normalizeRichText(html: string): string {
       const s = html;
       // 严格仅允许完全精确匹配的空串或明确的段落占位符规范为空；不得使用 s.trim() === "" 将纯空格/全角空格/换行输入归零
       if (s === "" || s === "<p></p>" || s === "<p><br></p>" || s === "<p><br/></p>") {
         return "";
       }
       return s
         .replace(/<p><br><\/p>/g, "")
         .replace(/<p><br\/><\/p>/g, "")
         .replace(/<p><\/p>/g, "");
     }
     ```
  2. 任何作者键入的可见空格（包括单个英文空格 `" "`、缩进全角空格 `"　　"`、多重空格 `"  "`、换行符 `"\n"`、`<p> </p>`、`<p>　　</p>`）均被原样保留，绝对不会被剥离或归零。
- **自动化测试核验**（在 [`tests/frontend/q02-boundaries.test.ts`](file:///d:/java/smart-author-creation-platform/tests/frontend/q02-boundaries.test.ts) 中实测通过）：
  - `isDraftContentEquivalent("　　", "") === false`
  - `isDraftContentEquivalent(" ", "") === false`
  - `isDraftContentEquivalent("  ", "") === false`
  - `isDraftContentEquivalent("\n", "") === false`
  - `isDraftContentEquivalent("<p> </p>", "") === false`
  - `isDraftContentEquivalent("<p>　　</p>", "") === false`
  - `isDraftContentEquivalent(" 正文", "正文") === false`
  - `isDraftContentEquivalent("正文 ", "正文") === false`
  - `isDraftPendingSaveEquivalent({ content: "　　" }, { title: "空章节", content: "" }) === false`
  - `isDraftPendingSaveEquivalent({ content: " " }, { title: "空章节", content: "" }) === false`
  - `isDraftPendingSaveEquivalent({ content: "　　" }, { title: "空章节", content: "<p></p>" }) === false`
  - `isDraftPendingSaveEquivalent({ content: " " }, { title: "空章节", content: "<p></p>" }) === false`

### ② 缺失基线拉取期间较新输入合并（防旧快照覆盖）
- **修改文件**：[`app/page.tsx`](file:///d:/java/smart-author-creation-platform/app/page.tsx)
- **原因与修复**：在 `performSave` 发现章节缺失基线并执行 `await fetchChapter(...)` 的网络在途期间，若作者继续键入，输入处理器会向 `pendingSaveRef.current` 写入较新的草稿快照。此前差异分支直接执行 `pendingSaveRef.current = currentPending`，导致在途键入的新草稿被旧快照覆盖。
- **改动逻辑**：
  1. 在 `fetchChapter` 返回后，检测 `pendingSaveRef.current` 是否包含该章在途输入，构造 `effectivePending` 合并同章最新字段：
     ```ts
     const newerPending = pendingSaveRef.current as PendingSave | null;
     const hasNewerSameChapterInput =
       newerPending !== null && newerPending.chapterId === currentPending.chapterId;
     const effectivePending: PendingSave = {
       chapterId: currentPending.chapterId,
       title: hasNewerSameChapterInput ? (newerPending.title ?? currentPending.title) : currentPending.title,
       content: hasNewerSameChapterInput ? (newerPending.content ?? currentPending.content) : currentPending.content,
     };
     ```
  2. 优先以 `effectivePending` 与服务端进行等价核验（`isDraftPendingSaveEquivalent(effectivePending, latest)`）。
  3. 若进入版本冲突或网络失败分支，将合并后的最新输入 `effectivePending` 完整存回 `pendingSaveRef.current`，杜绝旧快照覆盖。
  4. 升级 `handleForceOverwrite` 与 `handleCopyDraft`：优先使用 `pendingSaveRef.current` 中的最新草稿，确保冲突预览、复制草稿和“强制覆盖保存”均直接作用于作者键入的最新草稿。
- **测试核验**：自动化测试 `it("merges newer input typed during delayed fetchChapter and protects latest draft in conflict")` 验证在途较新草稿合并与冲突保留。

### ③ 结构操作独立状态与正文保存状态彻底解耦（addChapter 告警与状态卡死闭环）
- **修改文件**：[`app/page.tsx`](file:///d:/java/smart-author-creation-platform/app/page.tsx)、[`lib/client/chapter-order-guards.ts`](file:///d:/java/smart-author-creation-platform/lib/client/chapter-order-guards.ts)
- **原因与修复**：
  此前 `addChapter` 在发起 `createChapter` 请求前仍调用了 `setSaveState("saving")`，导致当网络请求遇到 503 或未知中断时，虽然捕获了异常并开启了目录门禁，但正文 `saveState` 仍停留在 `"saving"`，导致顶部与编辑器底部常驻“正在保存...”，进而导致 `canSwitchWork` 将其误判为正在保存草稿并阻止切换作品。
- **改动逻辑**：
  1. **彻底移除 `addChapter` 中的 `setSaveState("saving")`**：结构操作严禁污染编辑器的正文保存状态。
  2. **引入结构操作独立进度状态**：
     ```ts
     const [isCreatingChapter, setIsCreatingChapter] = useState(false);
     const isCreatingChapterRef = useRef(false);
     ```
     在 `addChapter` 开始时置为 `true`，在 `finally` 块中确保重置为 `false`，防并发连点；UI 上的“新建章节”按钮与图标在 `isCreatingChapter || needsCatalogResync` 时自动置灰禁用。
  3. **正文保存状态保持原值**：在 `addChapter` 前执行 `flushPendingSave()`，若无草稿或已刷盘成功，`saveState` 保持原值（`"saved"`）。在请求失败或 503 时，绝不向 `saveState` 写入 `"saving"` 或 `"error"`。
  4. **跨作品切换门禁精准即时恢复**：
     在 `loadWorkspaceData` 中，在确定目标作品 `targetWorkId` 的第一时刻立即执行：
     ```ts
     const isResyncNeededForThisWork = worksNeedingResyncRef.current.has(targetWorkId);
     setNeedsCatalogResync(isResyncNeededForThisWork);
     needsCatalogResyncRef.current = isResyncNeededForThisWork;
     ```
     确保从作品 B 切回作品 A 时，原作品的目录门禁与结构操作锁定立即生效。
  5. **作品切换校验**：`canSwitchWork(hasPendingSave, isSaving, isConflict)` 在无正文草稿且 `saveState === "saved"` 时返回 `allowed: true`，作者顺畅切入作品 B。
- **测试核验**：
  - 单元测试：[`tests/frontend/q02-boundaries.test.ts`](file:///d:/java/smart-author-creation-platform/tests/frontend/q02-boundaries.test.ts) 中增加 `addChapter execution path never writes saveState='saving' on mutation, keeps editor state intact on 503 unknown result, and allows work switch without text draft`。
  - 本地真实浏览器实测：[`scratch/run_browser_acceptance.mjs`](file:///d:/java/smart-author-creation-platform/scratch/run_browser_acceptance.mjs) 驱动真实 Microsoft Edge 完成 503 故障注入与往返切换实测。

### ④ 删除不存在的测试钩子描述与修正历史文档说明
- 彻底删除了文档中所有关于不存在的 `window.__clearChapterBaseline` 的描述。
- 明确区分验证层级：将此前基于脚本调用 API 与状态机演算的测试准确命名为“API 与状态模型模拟”，真实的页面验收必须由真实浏览器驱动 DOM 并配合网络故障注入完成。

---

## 2. 自动化验证矩阵

### A. 前端单元与回归测试（全部通过）
运行命令：
```bash
node --import tsx --test tests/frontend/*.test.ts
```
**测试结果**：**7 个套件、27 项测试全部通过（0 失败、0 跳过）**：
1. `Q01: sortOrder gap delta calculation and revision verification` (7 项通过)
2. `Q02: catalog sync guard and versioned save enforcement` (2 项通过)
3. `Q02 Boundary ①: Delete/Create mutation error categorization and resync gating` (3 项通过)
4. `Q02 Boundary ②: Missing content baseline safe comparison vs silent overwrite` (6 项通过，包含富文本、连续空格、全角空格、裸文本首尾空格、纯换行符、仅标题比对)
5. `Q02 Boundary ③: Unloaded chapters never establish content baseline on reorder` (2 项通过)
6. `Q02 Boundary ④: Work ID and Request Token isolation on manual catalog resync` (4 项通过)
7. `Day 2 Final Followup Regressions: Stale pending merge and work switch decoupling` (3 项通过，涵盖在途较新草稿合并、跨作品门禁保留、以及真实 addChapter 执行路径绝不写入 saveState='saving' 保证无草稿切换)

### B. 后端测试回归（全部通过）
运行命令：
```bash
node --import tsx --test tests/backend/*.test.ts
```
**测试结果**：**12 个套件、43 项测试全部通过（0 失败）**。

### C. TypeScript 类型编译检查
运行命令：
```bash
npx tsc --noEmit
```
**测试结果**：**Exit Code 0，无任何类型错误**。

### D. 生产环境打包构建
运行命令：
```bash
npm run build
```
**构建结果**：**Exit Code 0，构建成功，所有路由和客户端 chunk 编译生成完毕**。

### E. 代码边界与 Git 检查
- `git diff --check`：无任何多余空格或换行告警（Exit Code 0）。
- `git diff -- app/api server db drizzle lib/server contracts`：**完全为空**，绝对没有触碰后端代码、契约或共享配置文件。

---

## 3. 本地真实 Edge 浏览器故障注入验收（实操记录与证据）

针对 Codex 在 [`2026-09-24-backend-week-day2-browser-blocker.md`](./2026-09-24-backend-week-day2-browser-blocker.md) 中提出的真实浏览器阻塞项，本轮编写了由 Node.js 原生 WebSocket 通过 Chrome DevTools Protocol (CDP) 驱动本地安装的 **Microsoft Edge** 无头浏览器的完整自动化端到端验收脚本：[`scratch/run_browser_acceptance.mjs`](file:///d:/java/smart-author-creation-platform/scratch/run_browser_acceptance.mjs)。

### 演练流程设计：
1. 注册独立测试账号，创建作品 A 与作品 B，设置作品 A 为活动工作区。
2. 启动本地 Edge 浏览器，设置登录 Cookie，导航至 `http://localhost:5173` 并等待工作台 DOM 渲染完毕。
3. 启用 CDP `Fetch.enable`，精确拦截：
   - 作品 A 的新建章节请求 `POST /api/works/*/chapters`，注入 503 Service Unavailable；
   - 随后的首次自动核对目录请求 `GET /api/works/${workAId}`，注入 503 令其核对失败。
4. 在真实浏览器 DOM 中，触发真实按钮 `button.add-chapter` 的点击事件。
5. 验证真实 DOM 状态：
   - 捕捉到 `window.alert` 弹窗：“新建章节网络结果未知”；
   - 页面成功展示黄色【目录状态待确认】门禁横幅；
   - **关键验证**：全文及工具栏 `document.body.innerText` 绝无任何“正在保存...”字样（未发生状态卡死）。
6. 在真实浏览器 DOM 中触发作品切换菜单（`button.project-switcher`），点击包含“作品B”的菜单项。
7. 验证顺利切入作品 B：作品 B 无黄色门禁、无“正在保存...”。
8. 再次触发作品切换菜单，切回原作品 A。
9. 验证切回作品 A 后：黄色【目录状态待确认】门禁横幅完好保留，`button.add-chapter` 处于 `disabled` 状态。
10. 放行网络通道，在真实 DOM 中点击黄色门禁上的【重新同步目录】按钮。
11. 验证黄色门禁解除，新建章节按钮恢复启用。
12. 脚本退出前关闭 Edge 并对临时作品进行归档清理。

### 实测完整运行日志（Exit Code 0）：

```text
=== 启动本地真实浏览器故障注入验收 ===
验收项：真实浏览器内点击新建章节 → 注入 503 故障 → 验证正文保存状态未被污染 (无'正在保存...') → 点击切换作品 B 成功 → 切回作品 A 门禁仍在 → 点击重新同步解除门禁

[Step 1] 服务端准备就绪:
  - 作品 A: fad3f020-0a39-4daf-9908-422bc0d18c03 (浏览器实测作品A-1790264751600)
  - 作品 B: 4bf6fc14-b085-448c-8418-1beb689bf751 (浏览器实测作品B-1790264751600)

[Step 2] 启动本地真实 Edge 浏览器并连接 CDP...
  ✓ 已成功通过 WebSocket 连接 Edge CDP 页面调试会话

[Step 3] 浏览器加载作品 A 页面...
  ✓ 检测到工作台已渲染就绪, 当前作品切换器显示: "浏览器实测作品A-1790264751600"
  ✓ 浏览器已成功渲染工作台，当前处于作品 A

[Step 4] 开启网络故障注入 (Fetch.enable): 拦截 POST /api/works/*/chapters 与后续自动 GET 503...

[Step 5] 在真实浏览器 DOM 中点击【新建章节】按钮...
  [故障注入触发] 拦截到新建章节请求: POST http://localhost:5173/api/works/fad3f020-0a39-4daf-9908-422bc0d18c03/chapters -> 注入 503 Service Unavailable
  [故障注入触发] 拦截到创建后自动核对目录请求: GET http://localhost:5173/api/works/fad3f020-0a39-4daf-9908-422bc0d18c03 -> 注入 503 令其核实失败

[Step 6] 检查浏览器真实状态：
  - 页面 alert 弹窗记录: [ '新建章节网络结果未知（新增章节失败）。已锁定目录以防重复创建，正在尝试核实是否已在服务端创建...' ]
  - 页面是否存在目录状态待确认黄色门禁: true
  - 页面是否残留“正在保存...”正文状态: false
  ✓ 结构操作异常与正文 saveState 彻底解耦，页面无任何'正在保存...'残留！

[Step 7] 在真实浏览器中打开作品切换下拉菜单，点击切换至作品 B...
  selectBClick result: CLICKED_B_MENUITEM
  - 作品 B 视图状态: { hasWorkB: true, hasYellowBanner: false, hasSavingText: false }
  ✓ 无正文草稿时成功切入作品 B，未被虚假拦截！

[Step 8] 从作品 B 切回原作品 A，验证门禁完整保留...
  selectAClick result: CLICKED_A_MENUITEM
  - 切回作品 A 视图状态: { hasWorkA: true, hasYellowBanner: true, isAddBtnDisabled: true }
  ✓ 切回作品 A 成功，目录门禁与按钮禁用完整保留！

[Step 9] 恢复网络通道，在浏览器中点击【重新同步目录】按钮...
  - 重同步后门禁状态: { hasYellowBanner: false, isAddBtnDisabled: false }
  ✓ 手动重新同步顺利完成，黄色告警横幅解除，按钮正常恢复！

=== 本地真实 Edge 浏览器故障注入验收 100% 全部通过！===

[清理] 正在归档临时隔离作品...
  ✓ 临时测试作品已归档。
```

---

## 4. 真实页面复验指引（供 Codex 联合复验）

### 场景 1：全角/英文纯空白正文防吞稿复验
1. 在浏览器打开工作台，选择任意章节。
2. 在编辑器正文键入全角缩进空格（`"　　"`）或单个英文空格（`" "`）。
3. 模拟缺失基线保存场景：
   - `isDraftContentEquivalent` 与 `isDraftPendingSaveEquivalent` 严格返回 `false`。
   - 页面顶部提示“版本冲突”，编辑器中作者输入的全角/英文空格完整保留，绝不静默剥离或吞掉。

### 场景 2：新建章节故障不锁死作品切换复验
1. 打开浏览器工作台，确认作品 A 当前无未保存正文草稿（状态为“已保存”）。
2. 在开发者工具控制台或网络选项卡中阻断 `POST /api/works/*/chapters`（或直接使用 `scratch/run_browser_acceptance.mjs`）。
3. 点击【新建章节】：
   - 页面弹出网络未知结果提示，目录出现黄色【目录状态待确认】门禁。
   - 页面顶部和编辑器底部**不显示“正在保存…”**，仍为“已保存”。
4. 点击顶部作品切换器，选择作品 B：
   - 切换顺畅完成，作品 B 正常展示，未被虚假阻止。
5. 再次点击作品切换器，选择作品 A：
   - 切回作品 A 后，黄色【目录状态待确认】门禁依然完好保留，新建章节按钮处于禁用状态。
6. 点击黄色门禁上的【重新同步目录】按钮：
   - 门禁解除，新建章节按钮恢复可用。

---

## 5. 后续建议与下一步

1. **第 2 天验收收口**：前端责任区内的 `addChapter` 结构状态解耦、空白判定、草稿合并及跨作品门禁已全部闭环，并通过自动化单元测试与本地真实 Edge 浏览器故障注入验收。请 Codex 查阅复验并放行第 2 天结项。
2. **进入第 3 天任务**：第 2 天结项放行后，前端将配合 Codex 开始第 3 天的导出格式目视检查、历史版本回滚与回收站生命周期联合验收。

