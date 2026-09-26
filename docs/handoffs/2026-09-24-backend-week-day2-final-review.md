# 第 2 天最终复核：空白正文仍会被误判为空

日期：2026-09-24  
方向：Codex → Gemini  
结论：**第 2 天尚未完成，G0/G1 暂不放行。** 本轮没有后端接口、契约、迁移或前端代码改动。

## 已确认

- 已阅读 Gemini 的 [最终交付](./2026-09-24-frontend-week-day2-final.md)，复核三项修改确实进入前端代码：正文首尾空格比较不再对返回值整体 `trim()`；缺失基线拉取期间的新输入被合并；结构操作失败与正文保存状态分离，并按作品记录目录待同步门禁。
- 本机复跑前端 26/26、后端 43/43、TypeScript 类型检查及生产构建，全部通过。此前真实页面已通过章节删除／新建未知结果门禁、手动重同步、无基线正文冲突保护，以及切作品后旧目录响应被丢弃。
- 尚未把 Gemini 此轮“无草稿时切作品—切回仍锁定”的新实现做真实页面故障注入；其单测不能替代联合页面验收。

## 仍阻塞结项的具体反例

`lib/client/chapter-order-guards.ts` 的 `normalizeRichText` 虽已删除全量 `s = s.trim()`，但仍执行 `const trimmed = s.trim()`，并在 `trimmed === ""` 时返回空字符串。这会把只有空格的正文认作空正文。实测函数返回：

```text
isDraftContentEquivalent('　　', '') === true
isDraftPendingSaveEquivalent({ content: '　　' }, { title: '空章节', content: '' }) === true
isDraftContentEquivalent(' ', '') === true
```

中文网文里全角空格可作为段首缩进，并非必然“无修改”。在 `app/page.tsx` 的缺失基线分支，等价结果为 `true` 时会推进基线、跳过 PATCH 并显示已保存，因此该输入仍可能被静默丢弃。这是当前代码可直接证实的风险；本轮未声称已在真实页面复现。

### 给 Gemini 的最小修复任务

> 请先阅读 `AGENTS.md`、`docs/COLLABORATION_RULES.md`、`docs/handoffs/README.md` 和本交接，只修改前端责任区。`normalizeRichText` 仅可把**完全精确匹配**的空字符串及已确认的空段落占位符规范为空；不得使用 `s.trim() === ""` 将纯英文空格、全角空格或换行输入归零。补 `isDraftContentEquivalent('　　','') === false`、`isDraftContentEquivalent(' ','') === false`、对应 `isDraftPendingSaveEquivalent` 的测试；复验本轮三项修复未回退，并写前端交接。再以隔离作品做一次“结构操作结果未知 → 无正文草稿切到另一作品 → 切回原作品仍有门禁 → 重同步解除”的真实页面验收。不要改后端、契约或共享配置。

## 后端状态

目前不需要新 API 或数据库变更。第 3 天历史版本、回收站和三种导出实际打开检查仍在计划中；第二天数据安全门槛未通过前，不启动第 4 天 AI 流式开发。
