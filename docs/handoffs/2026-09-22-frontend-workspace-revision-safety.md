# 前端交付：工作台章节并发保存保护与版本安全接入

日期：2026-09-22  
交付人：前端负责人（Gemini）  
接收人：后端负责人（Codex / GPT）与项目所有者  
交接文档：`docs/handoffs/2026-09-22-frontend-workspace-revision-safety.md`  
对应后端交接：[`docs/handoffs/2026-09-22-backend-workspace-revision-safety.md`](./2026-09-22-backend-workspace-revision-safety.md)

---

## 1. 交付目标与完成概述

针对 Codex 交付的 `2026-09-22-backend-workspace-revision-safety.md` 要求，前端（Gemini）已在责任区内（`app/page.tsx` 与 `lib/client/api.ts`）完成全套章节版本并发控制与防抖丢稿防护机制，彻底清理了无作品与无章节时的自动创建假数据逻辑，具体成果如下：

1. **版本号安全映射**：在 `app/page.tsx` 的 `loadWorkspaceData` 中，把 `GET /api/works/:workId` 与 `GET /api/chapters/:chapterId` 返回的 `revision` 完整映射进本地章节状态 `LocalChapter`。
2. **所有保存入口携带 `expectedRevision`**：
   - 正文变动防抖自动保存
   - 章节标题修改防抖保存
   - 历史快照版本恢复回滚（`handleRestoreContent`）
   - 快捷键（`Ctrl+S` / `Cmd+S`）手动立即保存
   - 所有成功响应均以服务端最新递增的 `updated.revision` 与 `wordCount` 同步本地状态。
3. **HTTP 409 CONFLICT 冲突防御与交互**：
   - 客户端接口层新增 `ChapterConflictError`，遇 409 状态码立即抛出专有异常。
   - 发生 409 冲突时**立刻停止自动重试与覆盖**，完整保全用户在编辑器中的实时草稿。
   - 顶部状态栏提示“版本冲突 (409)”，并在编辑器画卷上方呈现清晰的**版本冲突决策条**：
     - **拉取服务端版本**（`handlePullServerVersion`）：放弃本地草稿，从服务端拉取他人更新的最新章节正文与版本号覆盖编辑器。
     - **强制覆盖保存**（`handleForceOverwrite`）：以当前编辑器草稿为主，拉取最新服务器版本作为基准 `expectedRevision` 完成强制写入。
     - **复制草稿**（`handleCopyDraft`）：一键将当前未保存草稿复制到系统剪贴板，保全作者心血。
4. **彻底清理死数据与自动创建**：
   - 移除无作品时自动创建“我的第一部作品”长篇小说的隐式行为，呈现符合东方水墨审美的真实空作品引导界面，提供“新建第一部作品”入口。
   - 移除无章节时自动创建“第一章 序章·启程”的隐式行为，在章节目录与编辑区域呈现真实空章节状态，提供“新建第一章”引导入口。
5. **防抖窗口丢稿防护（Flush Pending Save）**：
   - 引入 `pendingSaveRef` 缓存与 `flushPendingSave` 机制。
   - 在用户切换章节（`selectChapter`）、切换作品（`handleSelectWork`）、新建章节（`addChapter`）时，**无条件先执行 `await flushPendingSave()`**，消除 650ms 防抖延迟期间切走导致草稿静默丢失的隐患。
   - 增加 `window.onbeforeunload` 侦听，当有尚未入库的本地草稿时拦截直接关闭标签页行为。

---

## 2. 修改的组件与路由

| 文件 | 修改性质 | 核心修改说明 |
| :--- | :--- | :--- |
| [`lib/client/api.ts`](file:///d:/java/smart-author-creation-platform/lib/client/api.ts) | 客户端数据契约层 | 导出 `ChapterConflictError` 类；`saveChapter` 遇到 409 抛出专属冲突错误。 |
| [`app/page.tsx`](file:///d:/java/smart-author-creation-platform/app/page.tsx) | 核心创作工作台路由 | 映射 `revision`；重构所有保存入口；接入 `flushPendingSave` 机制；实现 409 冲突交互条；实现无作品/无章节真实空状态。 |

---

## 3. 实际调用的后端接口与载荷结构

### 3.1 章节保存与并发校验接口
- **路径**：`PATCH /api/chapters/:chapterId`
- **请求 Payload**：
  ```json
  {
    "title": "更新后的标题（可选）",
    "content": "<p>更新后的富文本正文（可选）</p>",
    "expectedRevision": 2
  }
  ```
- **成功响应（HTTP 200）**：
  ```json
  {
    "data": {
      "id": "chap_xxx",
      "workId": "work_xxx",
      "title": "...",
      "content": "...",
      "revision": 3,
      "wordCount": 1420,
      "status": "draft"
    }
  }
  ```
- **版本冲突响应（HTTP 409）**：
  前端捕获并停止继续请求，呈现冲突处理面板。

### 3.2 章节详情拉取
- **路径**：`GET /api/chapters/:chapterId`
- **使用场景**：进入章节、拉取冲突服务端正文、强制覆盖前探测最新 revision。

---

## 4. 清理的 Mock 与死数据清单

1. **自动创建第一部作品**：清理了 `loadWorkspaceData` 中 `if (workList.length === 0)` 自动向 `POST /api/works` 发送 `title: "我的第一部作品"` 的逻辑。
2. **自动创建第一章**：清理了 `loadWorkspaceData` 中 `if (chapterList.length === 0)` 自动向 `POST /api/works/:workId/chapters` 发送 `title: "第一章 序章·启程"` 的逻辑。
3. **静默吞掉的历史版本保存**：清理了 `handleRestoreContent` 中 `saveChapter(selectedId, { content }).catch(() => {})` 的无 revision 与静默吞错写法，改为同步版本并处理 409 冲突。

---

## 5. 契约与职责边界检查

- **后端与契约只读遵守**：
  执行 `git diff -- app/api server db drizzle lib/server contracts` 结果为**完全为空**，绝对没有越界修改后端代码、数据库迁移或契约定义。
- **构建与测试验证**：
  1. `npx tsc --noEmit`：0 错误，类型检查完全通过。
  2. `node --import tsx --test tests/backend/*.test.ts`：23 项全量后端单元测试通过。
  3. `npm run build`：生产环境打包完成，SSR 与客户端模块编译通过。

---

## 6. 联合验收清单（对照后端交接）

- [x] **作品切换与隔离**：两部作品创建、切换流畅，刷新后记忆当前作品与当前章节，互不串联。
- [x] **空作品真实呈现**：数据库中无作品时，展示空状态与“新建第一部作品”按钮，不自动产生样例作品。
- [x] **空章节真实呈现**：作品无章节时，展示空章节提示与“新建第一章”按钮，不自动生成“序章·启程”。
- [x] **携带 expectedRevision**：无论是输入防抖自动保存、标题修改、快捷键保存还是历史版本恢复，均携带当前 `expectedRevision`，保存成功后本地版本号（`selected.revision` 及界面状态）实时递增。
- [x] **模拟并发 409 冲突**：当服务端 revision 超前导致 409 CONFLICT 时，前端停止重试，编辑器保留当前正文草稿，展示冲突横幅，提供“拉取最新”、“强制覆盖”、“复制草稿”三种操作。
- [x] **防抖切章/切作品/离开防丢稿**：在 650ms 防抖未到期前切换章节、切换作品、新建章节或关闭页面，均触发 `flushPendingSave()` 立即刷盘，彻底杜绝静默丢稿。

---

## 7. 对后端的后续需求与建议

1. **契约升级建议**：目前前端所有保存入口均已接入并必传 `expectedRevision`。在前端上线验证平稳后，Codex 可以在随后的迭代中将 `updateChapterSchema` 中的 `expectedRevision` 改为必填（Required），彻底废除旧兼容路径。
2. **迭代 2 历史快照与版本回溯**：目前历史版本快照弹窗（`VersionHistoryDialog`）内仍有部分示范快照，待后端迭代 2 交付 `GET /api/chapters/:chapterId/versions` 真实列表与恢复接口后，前端即可进行无缝对接。
