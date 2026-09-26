# 前端修复交接：每日目标卡片 SSR 水合不匹配缺陷修复

- **交接日期**：2026-09-21
- **交接发起方**：Gemini（前端负责人）
- **交接接收方**：Codex / GPT（后端负责人）
- **修复主题**：修复 `goal-card` 中因为 `useState` 读取 `localStorage` 导致服务端与客户端 DOM 不一致的 Hydration Mismatch

---

## 1. 缺陷根因

在客户端组件 `app/page.tsx` 与 `components/workbench/stats-view.tsx` 中，`todayWords` 和 `dailyGoal` 状态在 `useState` 初始化函数中直接尝试读取了 `localStorage`：
- **服务端渲染阶段（SSR）**：`typeof window === "undefined"`，状态被初始化为固定的默认值（如 `todayWords = 1850`，`dailyGoal = 3000`，`isGoalReached = false`），渲染出的 HTML 为绿色默认水墨样式的 Target 图标以及字数文本 `1850 / 3000 字`。
- **客户端初次水合阶段（Client Hydration）**：`typeof window !== "undefined"`，`useState` 初始函数从用户的浏览器 `localStorage` 中读到了真实历史字数（例如 `todayWords = 1912`，`isGoalReached = true`），生成的虚拟 DOM 包含了动效类名 `text-emerald-600 animate-pulse` 与字数文本 `1912 / 3000 字`。
- **水合比对失败**：React 检测到服务器下发的 HTML 与客户端初次渲染的 DOM 结构及属性不一致，抛出：
  ```text
  Hydration failed because the server rendered text didn't match the client.
  + className="lucide lucide-target text-emerald-600 animate-pulse"
  - className="lucide lucide-target text-[#176b5b]"
  + 1912
  - 1850
  ```

---

## 2. 修复方案与代码变更

遵循 React / Next.js 官方规范中对浏览器专用存储的无差异水合模式：
1. **服务端与初次水合使用严格一致的确定性初值**：
   - 移除 `useState` 中包含 `typeof window !== "undefined"` 的惰性求值分支。
   - `todayWords` 初始值统一定为 `1850`，`dailyGoal` 统一定为 `3000`。
2. **延迟至 `useEffect` 挂载后安全同步 `localStorage`**：
   - `useEffect` 仅在客户端完成水合并挂载后触发，绝不参与首屏 HTML 生成。
   - 挂载后通过 `syncFromStorage()` 一次性从 `localStorage` 同步真实的 `todayWords` 与 `dailyGoal`，并保持全局事件广播（`daily-goal-change` / `today-words-change` / `storage`）监听。
3. **协同修复 `components/workbench/stats-view.tsx`**：
   - 采用相同模式，使用 `initialStats` 确定性初值并在 `useEffect` 挂载后安全同步，防止统计页面触发次生水合错误。

---

## 3. 修改文件清单

| 文件路径 | 变更类型 | 说明 |
| --- | --- | --- |
| [`app/page.tsx`](../../app/page.tsx) | 修改 | 修复 `todayWords` 与 `dailyGoal` 的初值确定性，合并挂载后的 `useEffect` 缓存读取 |
| [`components/workbench/stats-view.tsx`](../../components/workbench/stats-view.tsx) | 修改 | 修复统计视图中 `useState` 初始读取 `localStorage` 导致的潜在水合错误 |

---

## 4. 验证与核验结果

- [x] **SSR 水合验证**：刷新页面首屏直接通过水合校验，控制台无 `Hydration failed` 警告与错误。
- [x] **数据持久化保持**：挂载后无缝更新为本地已保存的 1912 字及自定义目标，达标欢呼动效正常生效。
- [x] **类型与构建验证**：`npx tsc --noEmit` 0 错误；`npm run build` 打包完全成功。
- [x] **代码所有权边界**：未修改任何后端目录（`git diff -- app/api server db drizzle lib/server contracts` 为空）。
