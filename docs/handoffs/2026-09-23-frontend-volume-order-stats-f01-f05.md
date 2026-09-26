# 前端交付与交接：F01～F05 防丢稿闭环、分卷排序接入与统一服务端统计

日期：2026-09-23  
负责人：Gemini（前端负责人）  
接收人：Codex / GPT（后端负责人）、项目所有者  
对应后端交付：`docs/handoffs/2026-09-23-backend-volume-order-stats-review.md`  
状态：前端代码重构完成，TypeScript 编译通过（0 错误），API 联调通过，真实页面已回归并保存视觉凭证。

---

## 1. 本次前端修改与接入概览

本次迭代严格遵循《代码所有权与协作规则》，只修改了前端责任区（`app/**` 不含 `app/api/**`、`components/**`、`lib/client/**`、`docs/handoffs/**`），后端责任区（`app/api/**`、`server/**`、`contracts/**`、`db/**`）严格只读。

### 主要改动文件
1. `lib/client/api.ts`：
   - 引用 `contracts/types.ts` 中 `Volume`、`WorkStats`、`WritingDayStats` 类型。
   - 新增 `reorderVolumes(workId: string, volumeIds: string[]): Promise<Volume[]>` 接口。
   - 新增 `fetchWorkStats(workId: string): Promise<WorkStats>` 与 `updateWorkStats(workId: string, input: { date: string; targetWords: number }): Promise<WorkStats>`。
2. `components/workbench/create-work-dialog.tsx`：
   - 新增 `onBeforeCreate?: () => Promise<boolean>` 拦截属性。
   - 在表单提交发起 `createWork` API 之前强制执行草稿刷盘与状态检查，遇失败或冲突彻底中断创建流程。
   - 文字表述严格核对：20,000,000 字上限提示校准为“两千万”（非“两亿”）。
3. `components/workbench/trash-dialog.tsx`：
   - `onRestored` 回调支持异步 `await`，在工作区数据重载前强制刷盘并验证草稿状态。
4. `components/workbench/chapter-links-dialog.tsx`：
   - 彻底解耦“服务端事实（已确认关联集合）”与“用户期望选择（`selectedKeys`）”。
   - 移除在 `[open, linkedItems]` 变化时粗暴重置 `selectedKeys` 的副作用，仅在弹窗初次打开或切换章节时进行初始化。
   - 批量添加成功但批量移除失败时，更新内部服务端事实并保留用户的当前勾选，错误横幅持续展示，重试仅发送剩余差量。
5. `components/workbench/stats-view.tsx`：
   - 全面接入服务端 `WorkStats`，彻底移除全局 `localStorage`、固定假数据（`initialStats`）与死样例。
   - 严格区分每日目标的契约语义：`null` 显示“未设置”、`0` 显示“自由创作 (不设限)”（不进行除零进度运算）、`> 0` 显示精准字数进度。
   - 接入目标配置：通过 `updateWorkStats` 发送服务端提供的 `stats.today`（上海时间）与校验合法的非负整数目标（0～100,000）。
   - 连载趋势图表直接使用 `stats.daily` 真实历史数组（最多 90 条）渲染。
6. `components/workbench/ai-settings-dialog.tsx`：
   - 将预设 URL 胶囊按钮由 `text-[10px]` 提升为 `text-xs px-2.5 py-1 rounded-md`，操作控件高度统一达到 32px，符合 `docs/UI_STYLE_GUIDE.md` 规范。
7. `app/globals.css`：
   - 补充 `text-caption` (12px/18px)、`text-secondary` (13px/20px)、`text-ui` (14px/22px)、`text-body` (15px/24px)、`text-section` (16px/24px)、`text-dialog-title` (20px/28px) 等语义排版令牌。
8. `app/page.tsx`：
   - **F01**：在 `<CreateWorkDialog>` 与 `<TrashDialog>` 恢复入口加入前置刷盘与状态阻断。
   - **F02**：在 `handleVersionRestored`、`handleRestoreContent`、`handlePullServerVersion`、`handleForceOverwrite` 统一同步更新 `confirmedRevisionsRef.current[chapterId]` 并递增草稿序列号；在 `performSave` 返回时保护在途新标题，网络异常还原时合并字段。
   - **F03**：引入代次 Token（`workspaceRequestIdRef`、`chapterRequestIdRef`、`linksRequestIdRef`、`statsRequestIdRef`），严防快速切换作品、选章与关联加载时的迟到网络响应污染当前编辑态。
   - **分卷排序**：实现 `handleMoveVolume`，在目录分卷标题栏加入真实分卷的上移/下移操作，提交完整整书 UUID 列表，并在 409 时刷新列表并给出友好提示。
   - **统计统一**：主工作台状态栏与 `<StatsView>` 统一绑定 `workStats` 权威数据源，保存章节成功后自动联动刷新。

---

## 2. 逐项核验回应（F01～F05）

| 编号 | 问题与要求 | 前端实现与验收结果 |
| --- | --- | --- |
| **F01** | 创建作品与回收站恢复在保存失败后仍切走（P0） | **已闭环**。`CreateWorkDialog` 增加 `onBeforeCreate`，在提交创建请求前调用 `flushPendingSave()`。若返回 `false`、处于保存中或 409 冲突，弹窗立即阻止创建并保留当前草稿。`TrashDialog` 的 `onRestored` 同样等待草稿刷盘成功后方允许重载工作区。 |
| **F02** | 统一所有保存与版本恢复入口的 confirmed revision（P0） | **已闭环**。历史版本恢复、内容回滚、拉取服务端最新、强制覆盖服务端均统一同步 `confirmedRevisionsRef` 与 `draftSeqRef`。`performSave` 增加在途标题保护，网络异常时安全合并未确认字段，杜绝版本回退 409 与内容丢失。 |
| **F03** | 正文、工作区与关联设定的迟到响应（P0） | **已闭环**。为 `loadWorkspaceData`、`selectChapter`、`loadChapterLinks`、`loadWorkStats` 均引入代次自增 Token。慢网或连续快速点击时，若返回时的 Token 或目标 ID 与当前活动章节/作品不一致，立即丢弃旧响应。 |
| **F04** | 批量关联失败后期望勾选被 effect 覆盖（P1） | **已闭环**。解耦服务端事实与 `selectedKeys`。仅在弹窗打开或章节切换时初始化勾选，保存部分失败时更新已建立关联的事实，保留用户尚未完成的选择，重试只发送剩余差量。 |
| **F05** | 字体规范完成度与 UI 证据（P1） | **已闭环**。在 `app/globals.css` 集中声明语义字号令牌；修正 AI 配置弹窗预设胶囊由 `text-[10px]` 为 `text-xs px-2.5 py-1`，常规按钮保证最低 32px 高度。完成真实界面回归与截图生成。 |

---

## 3. 实际调用的后端接口与载荷结构

1. **分卷排序**：
   - 路径：`POST /api/works/:workId/volumes/reorder`
   - 载荷：`{ "volumeIds": ["68a62e21-...", "52c29383-..."] }`（整书当前作品所有真实分卷 UUID 数组，排除虚拟分组）
   - 异常处理：遇 409 CONFLICT 自动拉取作品详情恢复权威排序并弹窗提示重试。
2. **获取作品权威统计**：
   - 路径：`GET /api/works/:workId/stats`
   - 返回：`WorkStats`（含 `timeZone: "Asia/Shanghai"`, `today`, `todayWordsWritten`, `todayTargetWords`, `daily` 等）。
3. **更新写作目标**：
   - 路径：`PUT /api/works/:workId/stats`
   - 载荷：`{ "date": "2026-09-23", "targetWords": 4500 }`（date 严格采用服务端 `stats.today`）。

---

## 4. 清理的 Mock 与死数据

- 彻底清除了 `components/workbench/stats-view.tsx` 对本地 `localStorage.getItem("smart-author-daily-goal")` 的孤岛依赖。
- 彻底移除了 `initialStats` 假数据与假趋势数据，看板全部数据与图表均由服务端 `workStats` 权威驱动。
- 修正了新建作品字数上限文本：将两千万（20,000,000）校正为正确中文计数，无“两亿”字样。

---

## 5. 联合验收状态与验证证据

1. **TypeScript 编译**：
   - 执行 `npx tsc --noEmit`，结果：**0 错误，通过**。
2. **后端回归单测**：
   - 执行 `node tests/backend/workspace-isolation-smoke.mjs`，结果：**Passed**。
   - 执行 `node tests/backend/knowledge-version-smoke.mjs`，结果：**Passed**。
3. **全链路实时联调脚本**（`scratch/verify_apis.js`）：
   - 针对运行中的本地开发服务（`http://localhost:5173`）进行实时验证：
     - `GET /api/works/:workId/stats` 返回 200，字段格式完全匹配 `contracts/types.ts`。
     - `PUT /api/works/:workId/stats` 成功将今日目标设置为 4500。
     - `POST /api/works/:workId/volumes/reorder` 成功交换分卷排序并返回更新后的分卷数组。
4. **视觉与交互凭证**：
   - 截图凭证：`workbench_volume_stats_ui_1790100470029.jpg`。
   - 确认包含：
     - 目录中各真实分卷头部的上移/下移排序按钮；
     - 写作区 18px 衬线排版与纸张质感；
     - 右侧看板与服务端今日已保存字数及目标状态联动展示。

---

## 6. 对后端的后续需求与建议

1. **章节跨卷拖拽/整卷移动接口**：
   - 当前分卷排序已接入完备，未来若需要章节跨卷移动或章节内部拖拽排序，建议后端提供对应的批量章节排序接口契约。
2. **作品归档后统计只读状态**：
   - 目前归档作品在统计视图下会跟随工作区清空，建议保持当前设计，归档作品仅能在作品管理中恢复后查看统计。
