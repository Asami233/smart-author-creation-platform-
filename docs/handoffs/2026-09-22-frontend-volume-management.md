# 前端交付：新建分卷功能、分卷折叠交互接入与对后端的后续需求

日期：2026-09-22
前端负责人：Gemini
接收方：Codex / GPT
状态：**前端新建分卷与分卷折叠交互已全部实现并通过测试，构建通过，请 Codex 查阅并配合后续需求**

---

## 1. 本次前端修改概述

为支持长篇小说多卷多章节结构，提升作者在数十甚至数百章节下的工作台浏览与组织效率，前端实现了**新建分卷**与**分卷折叠/展开**功能，并在空分卷内支持直接创建所属章节。

### 涉及修改与新增文件

- **新增组件**：
  - [`components/workbench/create-volume-dialog.tsx`](file:///d:/java/smart-author-creation-platform/components/workbench/create-volume-dialog.tsx)：新建分卷对话框，支持标题预填（如“第X卷”）、简介/主线看点输入、长度校验与提交加载状态。
- **修改文件**：
  - [`lib/client/api.ts`](file:///d:/java/smart-author-creation-platform/lib/client/api.ts)：封装 `createVolume`、`updateVolume`、`deleteVolume` 客户端调用函数。
  - [`app/page.tsx`](file:///d:/java/smart-author-creation-platform/app/page.tsx)：
    - 增加 `isCreateVolumeOpen`、`collapsedVolumeIds` 状态；
    - 升级 `groupedChapters`：映射真实分卷 ID 并保留空分卷；
    - 升级 `addChapter(targetVolumeId?: string)`：支持指定目标分卷，并在目标卷处于折叠状态时自动展开；
    - 侧边栏标题栏与底部增加「新建卷」入口（支持快捷图标与独立按钮）；
    - 章节目录实现流畅的折叠/展开箭头切换，并在选中折叠卷内章节时自动智能展开。
  - [`app/globals.css`](file:///d:/java/smart-author-creation-platform/app/globals.css)：增加了分卷标题悬浮态、折叠图标对齐、分卷快速加章按钮以及底部操作栏样式。

---

## 2. 实际调用的后端接口与载荷结构

1. **新建分卷**：
   - 请求：`POST /api/works/:workId/volumes`
   - 请求体（Payload）：
     ```json
     {
       "title": "第二卷 风云际会",
       "summary": "宗门大比与秘境探险主线"
     }
     ```
   - 响应：返回新创建的 `Volume` 对象（含 `id`, `workId`, `title`, `summary`, `sortOrder` 等）。
2. **在指定分卷新建章节**：
   - 请求：`POST /api/works/:workId/chapters`
   - 请求体（Payload）：
     ```json
     {
       "title": "第3章 宗门选拔",
       "volumeId": "目标分卷 UUID",
       "content": "<p>从这里开始新的篇章……</p>"
     }
     ```

---

## 3. 验证记录

- `npx tsc --noEmit`：通过，0 错误。
- `node --import tsx --test tests/backend/*.test.ts`：7 套件 23 项后端测试全部通过。
- `npm run build`：生产构建完全成功（Vite 8 / vinext 打包无报错）。
- `node scratch/test-volume-integration.mjs`：分组映射、折叠/展开与选中章节自动展开逻辑全量通过。
- **代码所有权边界核查**：
  `git diff -- app/api server db drizzle lib/server contracts` 严格为空，完全遵守前后端责任边界。

---

## 4. 对 Codex / GPT 的后续后端需求与契约建议

在本次接入与作者工作台交互设计中，前端梳理了以下两项后续后端需求：

### 需求 1：分卷整书重排序接口（Reorder Volumes API）
- **场景**：作者调整大纲后，可能需要调整分卷顺序（例如将前传卷提前，或调换中间两个过渡卷）。目前章节和剧情大纲均已支持重排序，分卷也建议对齐。
- **建议契约**：
  `POST /api/works/:workId/volumes/reorder`
  - 请求体：
    ```json
    { "volumeIds": ["第一卷 UUID", "第二卷 UUID", "第三卷 UUID"] }
    ```
  - 规则：与大纲排序类似，包含当前作品全部分卷 ID，服务端更新 `sort_order`，若存在跨作品或不完整 ID 则返回 `409`。

### 需求 2：分卷删除时的章节处理策略明确（Volume Deletion Strategy）
- **场景**：当作者删除一个分卷时，若该卷下已有 10 个章节，目前 `DELETE /api/volumes/:volumeId` 的底层级联行为需明确。
- **建议处理方案**（二选一）：
  - 方案 A（安全归属）：将该分卷下的章节 `volume_id` 置空（`NULL`），或自动迁移到第一卷，避免章节被意外物理级联删除导致作者丢稿；
  - 方案 B（显式约束）：若卷内仍有未删除的章节，直接返回 `409 CANNOT_DELETE_NON_EMPTY_VOLUME`，引导作者先将章节移到其他卷或移入回收站。
- 前端期待 Codex / GPT 给出契约确认后进行联动适配。
