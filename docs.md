# 当天提问汇总 —2026-06-15

> 按今天的请求，统计从 JSONL 提取的当天（2026-06-15）所有用户提问，**清空之前内容重新整理**。
> 之前的 2026-06-10 / 2026-06-11 / 2026-06-12 内容已按用户要求丢弃，只保留今天。

## 总数

**9 条用户输入**（2026-06-15，无系统注入，无 AskUserQuestion 调用）。

## 按时间顺序列表

| # | 时间 | 类型 | 问题 |
|---|---|---|---|
|1 |09:37 |问题 |用英文写项目使用说明和主要功能文档 |
|2 |09:45 |问题 |增加一个 UI/UX 按钮，用于给推荐候选人发消息 |
|3 |10:30 |问题 |在 recommend tab（未打开会话）上跑 node tools/inspect-boss.cjs，验证 .card-item、.geek-name、.btn-greet 等 selector |
|4 |10:58 |问题 |更新文件以使用正确的 class |
|5 |12:13 |问题 |如果有 iframe，先把 iframe 抓出来，再更新 class |
|6 |14:03 |问题 |有没有办法重置每天的发送数量限制？ |
|7 |14:23 |问题 |在 popup 里加一个 "reset limit" UI |
|8 |15:29 |问题 |只能启用其中一个功能，不能同时执行 |
|9 |16:39 |问题 |点击选择功能后，需要在网页上点击对应 tab 来切换到对应功能 |

---

##详细内容

### 问题1 -09:37 (问题)

**问题**: 用英文写项目使用说明和主要功能文档

> 用户要求为这个 Chrome 扩展写一个英文 README，介绍主要功能和使用方法。我创建了 README.md，包含：核心功能（一键自动回复、上下文感知回复、3-option parser、每日配额）、安全机制（LRU 缓存、race-guard）、UI 状态、开发者工具（inspect-boss.cjs）、快速开始、构建说明、项目结构、消息协议、故障排查。

---

### 问题2 -09:45 (问题)

**问题**: 增加一个 UI/UX 按钮，用于给推荐候选人发消息

> 用户希望在 popup UI 中添加第二个按钮 "Recommend-greet"，独立于主 Auto-reply 循环，用于 /web/chat/recommend 页面主动打招呼。我实现了：
> - `SCRAPE_RECOMMENDED` / `GREET_CANDIDATE` / `TOGGLE_RECOMMEND` 消息类型
> - `runRecommendGreetOnce()` loop（独立于 chat-list 回复循环）
> - `RecommendRow` 组件（第二个 row 在 popup 中）
> - `findRecommended()` + `greetCandidate()` 在 scrape.ts
> - 候选 selector 加到 dom.ts

---

### 问题3 -10:30 (问题)

**问题**: 在 recommend tab（未打开会话）上跑 node tools/inspect-boss.cjs，验证 .card-item、.geek-name、.btn-greet 等 selector

> 用户要求验证 recommend 页面的 selector。运行后 probe 报告：所有 recommend selector 都 miss，因为 document.html 不包含 cards。诊断显示：
> - `<iframe name="recommendFrame" src="/web/frame/recommend/...">` 在主页面
> - 卡片实际渲染在 iframe 内（same-origin），document.html 看不到

---

### 问题4 -10:58 (问题)

**问题**: 更新文件以使用正确的 class

> 我先尝试用 `Page.getFrameTree` + `contextId: frame.frame.id` 访问 iframe，但 `frameId` ≠ `executionContextId`。我添加了 `Runtime.executionContextCreated` listener 来构建 frameId → contextId 映射。

---

### 问题5 -12:13 (问题)

**问题**: 如果有 iframe，先把 iframe 抓出来，再更新 class

> 我创建了独立的简单工具 `tools/dump-iframe.cjs`，专用于 dump recommendFrame iframe 内容。运行成功，生成了 176KB 的 `iframe-recommend.html`。
> 
> 从 iframe HTML 中找到真实 selector：
> - `.card-item` ← recommendCard
> - `.name-wrap .name` ← name
> - `.base-info span:nth-of-type(2)` ← years
> - `.base-info span:nth-of-type(3)` ← education
> - `.btn-greet` ← greet button
> - `iframe[name="recommendFrame"]` ← iframe marker
> 
> 更新了 dom.ts（移除 `.geek-name`、`.source-job` 等猜测 selector）和 scrape.ts / messages.ts / loop.ts。

---

### 问题6 -14:03 (问题)

**问题**: 有没有办法重置每天的发送数量限制？

> 我添加了 `resetDailyStats()` 到 storage.ts：
> - Reset `stats.sent = 0`、`stats.errors = 0`、`stats.lastErrorMsg = ''`
> - Reset `recommendGreeted = 0`
> - 不动 config、enabled 标志、conversations cache
> 
> 添加了 `RESET_STATS` message 类型到 PopupToSw union。

---

### 问题7 -14:23 (问题)

**问题**: 在 popup 里加一个 "reset limit" UI

> 在 popup App.tsx 中：
> - 添加 `onResetToday` handler
> - ErrorLine 组件支持 `limitReached` + `onReset` + `resetting` props
> - 当 `reachedDailyLimit=true` 时，在 error line 旁边显示 amber "Reset today" 按钮
> - Click → 调用 `RESET_STATS` → counter 归零 → button "Bật" 重新可用

---

### 问题8 -15:29 (问题)

**问题**: 只能启用其中一个功能，不能同时执行

> 互斥逻辑（mutual exclusion）：
> - 修改 `setEnabled()` 和 `setRecommendEnabled()` 在 storage.ts：开启一个时强制关闭另一个
> - UI 层面：`ToggleRow` 和 `RecommendRow` 都加 `otherActive` prop
> - 另一个 active 时，当前 button `disabled`，subtext 显示 "Another mode is active" / "Auto-reply is currently running"
> - 原因：两个 loop 共享 run-lock + GEMINI rate limit + daily limit，否则会 race

---

### 问题9 -16:39 (问题)

**问题**: 点击选择功能后，需要在网页上点击对应 tab 来切换到对应功能

> 添加 `CLICK_TAB` 消息类型：
> - 添加 `chatTab` / `recommendTab` / `recommendIframe` selector 到 dom.ts
> - 添加 `clickTab(tab)` 函数到 scrape.ts（点击 `<a>` inside `<dl class="menu-chat">` 或 `<dl class="menu-recommend">`）
> - 添加 `CLICK_TAB` handler 到 content script index.ts
> - 添加 `CLICKED_TAB` response type
> - 修改 `runOnce()`：先 click "沟通" tab → wait for `.user-list` mount → scrape
> - 修改 `runRecommendGreetOnce()`：先 click "推荐牛人" tab → wait for `iframe[name="recommendFrame"]` mount → scrape

---

##统计

| 类型 | 数量 | 条目 |
|---|---|---|
| 问题 (开放问题) | 9 条 | #1–#9 |
| AskUserQuestion | 0 条 | — |
| 粘贴错误日志 | 0 条 | — |
| **合计** | **9 条** | |

> 注：今天 9 条都是工作类问题（功能开发、调试、UI）。没有粘贴 error log（因为今天大多是新功能添加，错误是已修复的）。
> 注：今天没有任何 AskUserQuestion 调用（与 2026-06-10 的 3 次、2026-06-11 的 1 次形成对比）。

---

## 关联工作

今天完成的工作：
1. **README.md** (英文) — 项目使用文档
2. **Recommend-greet flow** — SCRAPE_RECOMMENDED + GREET_CANDIDATE + TOGGLE_RECOMMEND + RecommendRow UI
3. **DOM scraping 改进** — dom.ts selectors verified via dump-iframe.cjs; iframe handling
4. **resetDailyStats()** — 手动重置每日配额
5. **Reset UI** — "Reset today" button trong popup ErrorLine
6. **Mutual exclusion** — 只能同时启用 1 个功能
7. **CLICK_TAB** — 点击 tab 切换 BOSS UI 后再 scrape
