# play-with-me · 跟 AI 玩的小游戏合集

第一版：**五子棋**（你 vs AI）。前端渲染图形棋盘，只把棋盘的 ASCII 快照发给 AI；AI 只需回一个 `<move>行,列</move>`，所有规则/胜负由前端确定性逻辑掌管。基于 SillyTavern + 酒馆助手（TavernHelper）。

设计文档见 [docs/superpowers/specs/2026-07-08-gomoku-ai-opponent-design.md](docs/superpowers/specs/2026-07-08-gomoku-ai-opponent-design.md)。

## 架构

```
src/core/      纯逻辑（不依赖酒馆，全部单元测试覆盖）
  board.js         棋盘规则：落子/合法性/连五/和棋
  parseMove.js     从 AI 回复抠 <move>行,列</move>
  renderAscii.js   board → 给 AI 看的 ASCII 棋盘图
  session.js       会话状态机 + 回合/胜负结算 + 暂停
  messages.js      构造给 AI 的提示 / 纠正消息
  orchestrator.js  AI 回合：叫AI→解析→校验→落子，无效重试
  storage.js       存档 + 战绩（读写经注入的 io 适配器）
src/adapters/  酒馆适配器（薄，只能在 SillyTavern 里跑）
  tavern.js        世界书 io + generate（injects 注入棋盘）
  config.js        世界书/条目命名
src/gomoku/    界面与入口
  ui.js            图形棋盘 + 流程编排
  main.js          酒馆入口 start(container)
preview/       本地预览（假 AI + localStorage，无需酒馆）
```

**职责分离**：前端 `board` 是唯一真相；AI 只出一步棋，声称的棋盘/胜负一律不信。

## 开发

```bash
npm test              # 运行全部单元测试（node:test，无依赖）
node scripts/serve.mjs # 本地静态服务器 :8123
# 浏览器打开 http://localhost:8123/preview/index.html 即可对着“笨 AI”试玩
```

## 部署到 SillyTavern

1. 把本仓库推到 GitHub。
2. 编辑 [dist/sillytavern-界面.html](dist/sillytavern-界面.html)，把 `USER/REPO` 换成你的用户名/仓库名。
3. 把该 HTML 粘贴进酒馆助手的「界面」。jsdelivr 会顺着 `main.js` 的相对 import 自动拉取 `src` 下其余模块。
4. 首次运行会自动创建世界书「五子棋」（存当前对局）与「游戏总战绩」（存胜负），条目均为**禁用**状态——纯数据，不会注入 AI 上下文。名称可在 [src/adapters/config.js](src/adapters/config.js) 改。

## 存档与战绩

- **五子棋**世界书 · 条目「当前对局」：一局未完成的存档（单槽），刷新/重进可续玩，结束后清空。
- **游戏总战绩**世界书 · 条目「gomoku」：`{ win, loss, draw }`（玩家视角）。以后加新游戏各占一个条目，互不覆盖。
