# play-with-me · 跟 AI 玩的小游戏合集

第一版：**五子棋**（你 vs AI），一个 **SillyTavern 第三方扩展**。前端渲染图形棋盘，只把棋盘的 ASCII 快照注入给 AI；AI 只需回一个 `<move>行,列</move>`，所有规则/胜负由前端确定性逻辑掌管。

设计文档见 [docs/superpowers/specs/2026-07-08-gomoku-ai-opponent-design.md](docs/superpowers/specs/2026-07-08-gomoku-ai-opponent-design.md)。

## 交互闭环

```
你点棋盘落子
  → 扩展把「我落子 (8,5)」填进酒馆输入框（不自动发送，可补一句再发）
  → 你发送 → AI 开始生成
  → 生成前，扩展用事件钩子把「当前 ASCII 棋盘 + 轮到你,用 <move>」动态注入（不写进聊天记录）
  → AI 回复(带 <move>行,列</move> + 吐槽)
  → 扩展监听 MESSAGE_RECEIVED，解析坐标，落 AI 的子，刷新棋盘
```

**职责分离**：前端 `board` 是唯一真相；AI 只出一步棋，声称的棋盘/胜负一律不信。

## 架构

```
index.js            扩展入口。唯一直接依赖酒馆的文件：把酒馆能力包成 ctx
manifest.json       扩展清单
style.css           棋盘 + 面板样式
src/core/           纯逻辑（不依赖酒馆，全部单元测试覆盖）
  board.js            棋盘规则：落子/合法性/连五/和棋
  parseMove.js        从 AI 回复抠 <move>行,列</move>
  renderAscii.js      board → 给 AI 看的 ASCII 棋盘图
  session.js          会话状态机 + 回合/胜负结算 + 暂停
  messages.js         构造给 AI 的提示 / 纠正消息
  storage.js          存档 + 战绩（读写经注入的 io 适配器）
src/gomoku/
  extension.js        游戏逻辑 + 视图（用注入的 ctx 与酒馆交互，可脱离酒馆预览）
preview/            本地预览（假 ctx，无需酒馆）
```

酒馆能力通过 `ctx` 注入（`io`/`fillInput`/`registerInjection`/`onMessageReceived`），
所以 `extension.js` 既能在真酒馆跑，也能用假 `ctx` 在浏览器里预览。

## 安装到 SillyTavern

扩展目录：`SillyTavern/data/<你的用户>/extensions/`（或 `public/scripts/extensions/third-party/`，视版本而定）。

```bash
cd .../extensions/third-party    # 进入第三方扩展目录
git clone https://github.com/iloveGemini/play-with-me.git
```

或在酒馆「扩展」面板 → 「安装扩展」→ 填入本仓库 Git 地址。装好后刷新，点魔法棒菜单里的「五子棋」，或在输入框打 `/五子棋` 打开面板。

- 存档/战绩存在浏览器 `localStorage`（键前缀 `gomoku:`），**不用世界书**。
- 提示词注入走 `CHAT_COMPLETION_PROMPT_READY` / `GENERATE_AFTER_COMBINE_PROMPTS`（Chat/Text Completion 各一条），生成前动态注入，不污染聊天记录。

## 开发

```bash
npm test               # 全部单元测试（node:test，无依赖）
node scripts/serve.mjs # 本地静态服务器 :8123
# 浏览器开 http://localhost:8123/preview/extension-preview.html
#   —— 用假 ctx 模拟酒馆（填输入框→点发送→假 AI 回 <move>），完整试玩对局闭环
```
