# 第 1 天交接：Gemini Q01/Q02 联合验收

日期：2026-09-23
负责人：Codex（后端验收与交接）
依据：`2026-09-23-frontend-write-guards-browser-acceptance-q01-q02.md`、`docs/WEEKLY_PLAN_2026-09-23.md`

## 今日结论

Q01 的真实页面复验通过：在独立测试作品中创建目标卷的章节 C（初始 `sortOrder=5, revision=1`），先在页面选中 C 加载正文，再将另一卷章节移入目标卷。服务端把 C 编号为 0、修订升为 2，浏览器显示版本 v2、正文仍为“空隙章正文”，没有出现误报冲突。随后在 C 继续输入，浏览器显示“已自动保存（v3）”，服务端版本升为 3。此前真实复现的排序空隙错误已修复。

Q02 尚未通过整体联合验收。前端新增待同步横幅和纯函数门禁，但以下代码路径与交付文档的承诺不一致，需要 Gemini 收口；尚未在浏览器注入断网或迟到响应，不把它们写成已实测故障。

1. `handleDeleteVolume` 和 `handleSoftDeleteChapter` 的失败分支只弹错，没有设置 `needsCatalogResync` 或回拉目录。若请求已在服务端生效、响应丢失，页面仍允许基于旧目录继续结构写入。新建章节同样需要处理结果未知的重复创建风险。失败时至少应进入“待确认”并以权威目录核对结果；“409 已知拒绝”和“网络结果未知”须区分。
2. `performSave` 发现 `contentBaseRev === undefined` 后，调用 `fetchChapter` 并直接把服务器最新 revision 写成旧草稿的正文基线，然后继续 PATCH。这只保证请求带版本号，不能证明本地草稿基于该正文；服务器正文若已变化，可能被旧草稿覆盖。缺基线时保留草稿、加载服务器正文供比较或冲突恢复，不得直接绑定最新 revision。
3. `verifyChapterReorderRevision` 把 `contentBaseRevision === undefined` 视为有效，可能承认一个未加载正文的结构修订并写入正文基线。若该章节的本地正文未被确认为该版本，不能把目录版本当成正文基线。新章节只需更新目录观察版本，选章时再加载正文建立基线。
4. `handleManualResyncCatalog` 请求前没有固定 workId/请求代次；响应后也不校验当前作品。切作品期间晚到的旧作品响应可能覆盖新作品目录，并解除新作品的待同步门禁。只有确认仍是同一作品且取得有效章节列表，才可清除门禁。

这些属于 Gemini 的 `app/page.tsx` 与 `lib/client/chapter-order-guards.ts`，Codex 不越界修改。

## 接口、兼容与验证

- 今日没有新增或修改 API、`contracts/**`、数据库迁移、依赖及共享构建配置；后端仍沿用前次保存/恢复写入守卫。
- `node --import tsx --test tests/backend/*.test.ts`：12 套件、43 项通过。
- `node --import tsx --test tests/frontend/chapter-gap-reorder.test.ts`：2 套件、9 项通过；这只覆盖纯函数，没有覆盖上述页面失败分支。
- `tsc --noEmit --incremental false`：通过。
- `npm run build`：通过；保留既有分块大小和路由静态分类提示。
- 浏览器：本地 5173、Codex 内置浏览器 1280×720，Q01 的创建、跨卷移动、继续保存通过。Q02 的断网重同步、删除结果未知、切作品迟到响应尚未页面复验。
- `git diff --check` 被 Gemini 所有的 `app/globals.css` 文件末尾空行阻断；请 Gemini 在其下一轮自行修正。此项不影响类型检查，但提交前应清理。

验收中只创建 `Codex验收Q01-20260923` 临时作品；验证结束恢复原活动作品并清理该样例。其余用户和 Gemini 样例不动。

## Gemini 下一轮提示词

```text
先读 AGENTS.md、docs/COLLABORATION_RULES.md、docs/handoffs/README.md、docs/WEEKLY_PLAN_2026-09-23.md 和 docs/handoffs/2026-09-23-backend-week-day1-acceptance.md。

Codex 用真实页面复验了 Q01：C 初始 sortOrder=5、revision=1，跨卷移动后 C 显示 v2 且正文不变，继续写作已自动保存为 v3。请保留这条已经通过的路径。

第 2 天只收口 Q02 的四个边界：① 删除卷/章和新建章结果未知时，进入可执行的待同步/核实流程，防止依据旧目录重复写；② 缺失正文基线时不得 fetch 最新 revision 后直接把旧草稿当作新版本保存，必须保留草稿并安全比较/恢复；③ 未加载正文的章节不可因排序响应就建立正文基线；④ 手动重同步要固定作品 ID 和请求代次，迟到响应不得污染切换后的作品或错误解除门禁。

补页面级或可控请求延迟/失败测试；纯函数测试不能替代失败路径的 UI 验收。只改前端责任区和自己的交接文档；不要修改后端、契约或数据库。顺手清理 app/globals.css 文件末尾多余空行，使 git diff --check 通过。完成后明确列出真实浏览器已测与未测项，并通知 Codex 联合复验。
```

下一步以 [一周工作包](../WEEKLY_PLAN_2026-09-23.md) 的第 2 天为准。G0/G1 未放行，AI 流式接口仍处于计划阶段。
