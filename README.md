# play-with-me · 跟 AI 玩的小游戏合集

一个 **SillyTavern 第三方扩展**：多游戏框架 + 若干"陪 AI 闹着玩"的小游戏。前端掌规则、AI 只负责出招/主持与插科打诨，通过事件钩子把游戏状态**动态注入**给 AI（不写进聊天记录）。

已有：**五子棋**（你 vs AI 对弈）、**海龟汤**（AI 当主持，你提问破案）。

设计文档见 [docs/superpowers/specs/2026-07-08-gomoku-ai-opponent-design.md](docs/superpowers/specs/2026-07-08-gomoku-ai-opponent-design.md)。

## 框架

- **图标入口**：打开面板是所有游戏的图标，点进哪个就激活哪个（一次只一个）；记住上次进的游戏。
- **总开关**：关掉则彻底不注入、不处理 AI 消息。
- **注入深度**：顶栏可调（持久化），每个游戏也能自带默认深度。
- **注入包裹**：统一包成 `<plugin name="game">…</plugin>`。
- **存储隔离**：每个游戏一套按 id 命名空间的 `localStorage`，互不打架。

游戏 descriptor 接口：
```js
{ id, name, icon, defaultDepth, defaultRole,
  mount(container, services) -> { getInjection(), onMessage(text), destroy() } }
// services = { io, fillInput }；getInjection(): null | string | { content, depth?, role? }
```

## 架构

```
index.js              扩展入口。唯一直接依赖酒馆的文件：把酒馆能力接给框架
src/framework.js      多游戏框架：图标入口/激活/总开关/深度/注入包裹/存储隔离
manifest.json         扩展清单
style.css             面板 + 框架 + 各游戏样式
src/core/             五子棋纯逻辑（不依赖酒馆，单元测试覆盖）
  board / parseMove / renderAscii / session / messages / storage
src/gomoku/extension.js    五子棋 descriptor（图形棋盘）
src/haiguitang/            海龟汤
  puzzles.js               内置题库（汤面 + 汤底）
  logic.js                 主持提示生成 / 破案识别 / 抽题（单元测试覆盖）
  extension.js             海龟汤 descriptor
preview/              本地预览（假 host services，无需酒馆）
```

## 两个游戏怎么玩

**五子棋**：点棋盘落子 → 扩展把「我落子 (x,y)」填进输入框（你自己发送）→ 生成前注入当前 ASCII 棋盘 → AI 回 `<move>行,列</move>` + 吐槽 → 扩展解析落子、刷新。

**海龟汤**：点「开始」抽一题 → 汤面显示在面板、汤底只注入给 AI → 你在聊天里问「是/不是」的问题，AI 当主持回答 → AI 判定破案时回复带 `【破案】`，扩展识别后揭晓汤底。

## 安装到 SillyTavern

扩展目录：`SillyTavern/data/<你的用户>/extensions/`（或 `public/scripts/extensions/third-party/`，视版本而定）。

```bash
cd .../extensions/third-party
git clone https://github.com/iloveGemini/play-with-me.git
```

或在酒馆「扩展」面板 →「安装扩展」→ 填入本仓库 Git 地址。装好刷新，点魔法棒菜单里的「小游戏」，或输入框打 `/小游戏` 打开面板。

- 存档/战绩存在浏览器 `localStorage`，**不用世界书**。
- 提示词注入走 `CHAT_COMPLETION_PROMPT_READY` / `GENERATE_AFTER_COMBINE_PROMPTS`，生成前动态注入，不污染聊天记录。

## 开发

```bash
npm test               # 全部单元测试（node:test，无依赖）
node scripts/serve.mjs # 本地静态服务器 :8123
# 浏览器开 http://localhost:8123/preview/extension-preview.html
#   —— 用假 host 模拟酒馆，试玩两个游戏的闭环
```
