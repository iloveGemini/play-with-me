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

酒馆里交互式前端走「**正则 + 占位符**」：一条正则把消息里的占位符替换成整段**内联** HTML/JS 在 iframe 渲染。替换内容不能有外链 `import`，所以先打包成零外链单文件。详见 [dist/部署-正则方式.md](dist/部署-正则方式.md)。

```bash
npm run build          # 生成 dist/五子棋-regex.json（可直接导入酒馆「正则」）
```

1. 酒馆「正则」扩展 → 导入 `dist/五子棋-regex.json`。
2. 在任意消息里写占位符 `<GomokuBoard/>` → 渲染成棋盘。
3. 首次运行自动创建世界书「五子棋」（存当前对局）与「游戏总战绩」（存胜负），条目均为**禁用**状态——纯数据，不注入 AI 上下文。名称可在 [src/adapters/config.js](src/adapters/config.js) 改。

> 不用 CDN/GitHub：整段代码内联进正则，改了 `src` 重新 `npm run build` 再导入覆盖即可。

## 存档与战绩

- **五子棋**世界书 · 条目「当前对局」：一局未完成的存档（单槽），刷新/重进可续玩，结束后清空。
- **游戏总战绩**世界书 · 条目「gomoku」：`{ win, loss, draw }`（玩家视角）。以后加新游戏各占一个条目，互不覆盖。
