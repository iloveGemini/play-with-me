// 五子棋游戏逻辑 + 视图（不直接依赖 SillyTavern）。
// 通过注入的 ctx 与酒馆交互，便于用假 ctx 在浏览器里预览。
//
// ctx = {
//   container: HTMLElement,                 // 挂载棋盘的容器
//   io: { read(key), write(key,value) },    // 存储（localStorage 背后）
//   fillInput(text): void,                  // 把文本填进酒馆输入框（不自动发送）
//   registerInjection(provider): void,      // provider() 返回本次生成要注入的提示词或 null
//   onMessageReceived(cb): void,            // AI 消息到达时 cb(text)
// }

import { SIZE, isLegalMove, BLACK } from '../core/board.js';
import {
  newSession, startGame, applyUserMove, applyAiMove, pause, resume, surrender,
  shouldCallAi, restoreSession,
} from '../core/session.js';
import { parseMove } from '../core/parseMove.js';
import { buildAiPrompt, buildUserInput, buildCorrection } from '../core/messages.js';
import { saveGame, loadGame, clearGame, recordResult, loadStats } from '../core/storage.js';

export function mountGame(ctx) {
  let session = newSession();
  let stats = { gomoku: { win: 0, loss: 0, draw: 0 } };
  let choosing = false;
  let notice = '';

  // ── DOM 骨架 ──
  const root = document.createElement('div');
  root.className = 'gmk';
  root.innerHTML = `
    <div class="gmk-top">
      <span class="gmk-title">五子棋 · 对战 AI</span>
      <span class="gmk-stats"></span>
    </div>
    <div class="gmk-board"></div>
    <div class="gmk-status"></div>
    <div class="gmk-controls"></div>`;
  ctx.container.replaceChildren(root);

  const boardEl = root.querySelector('.gmk-board');
  const statsEl = root.querySelector('.gmk-stats');
  const statusEl = root.querySelector('.gmk-status');
  const controlsEl = root.querySelector('.gmk-controls');

  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'gmk-cell';
      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }

  // ── 渲染 ──
  function render() {
    const game = session.game;
    const last = game && game.lastMove ? game.lastMove.pos : null;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = cells[r * SIZE + c];
        const v = game ? game.board[r][c] : 0;
        if (!v) { cell.replaceChildren(); continue; }
        const stone = document.createElement('div');
        stone.className = 'gmk-stone ' + (v === BLACK ? 'gmk-black' : 'gmk-white');
        if (last && last[0] === r && last[1] === c) stone.classList.add('gmk-last');
        cell.replaceChildren(stone);
      }
    }
    statsEl.textContent = `胜 ${stats.gomoku.win} · 负 ${stats.gomoku.loss} · 和 ${stats.gomoku.draw}`;
    statusEl.textContent = notice || statusText();
    renderControls();
  }

  function statusText() {
    if (choosing) return '谁先手？（先手执黑）';
    if (!session.game) return '点击「开始」新对局';
    switch (session.game.status) {
      case 'user_win': return '🎉 你赢了！';
      case 'ai_win': return session.state === 'finished' ? '😈 AI 赢了' : '';
      case 'draw': return '🤝 和棋';
      default:
        if (session.state === 'paused') return '⏸ 已暂停';
        return session.game.turn === 'user' ? '轮到你落子' : '轮到 AI（发送消息让它走）';
    }
  }

  function btn(label, onClick, disabled = false) {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderControls() {
    const c = [];
    if (choosing) {
      c.push(btn('我先手', () => startNew('user')));
      c.push(btn('AI 先手', () => startNew('ai')));
      c.push(btn('取消', () => { choosing = false; render(); }));
    } else if (session.state === 'idle' || session.state === 'finished') {
      c.push(btn('开始', () => { choosing = true; notice = ''; render(); }));
    } else {
      c.push(btn('暂停', doPause, session.state !== 'playing'));
      c.push(btn('继续', doResume, session.state !== 'paused'));
      c.push(btn('认输', doSurrender));
    }
    controlsEl.replaceChildren(...c);
  }

  // ── 流程 ──
  async function startNew(firstPlayer) {
    choosing = false; notice = '';
    session = startGame(session, { firstPlayer });
    await saveGame(ctx.io, session.game);
    render();
    // AI 先手：把开场提示填进输入框，让玩家发送触发 AI
    if (shouldCallAi(session)) ctx.fillInput('（新对局，你先手，请落子）');
  }

  async function onCellClick(r, c) {
    if (session.state !== 'playing' || !session.game) return;
    if (session.game.turn !== 'user') return;
    if (!isLegalMove(session.game.board, r, c)) return;
    session = applyUserMove(session, r, c);
    notice = '';
    await saveGame(ctx.io, session.game);
    render();
    if (session.state === 'finished') return finish();
    // 轮到 AI：把落子播报填进输入框，玩家可补一句再发送
    ctx.fillInput(buildUserInput(session.game.lastMove));
  }

  // AI 消息到达 → 解析落子
  async function handleAiMessage(text) {
    if (!shouldCallAi(session)) return; // 不是在等 AI 落子
    const parsed = parseMove(text);
    if (!parsed.ok || !isLegalMove(session.game.board, parsed.row, parsed.col)) {
      const reason = parsed.ok ? 'illegal' : parsed.reason;
      notice = `AI 落子无效：${buildCorrection(reason)}（让它重新生成一次即可）`;
      render();
      return;
    }
    session = applyAiMove(session, parsed.row, parsed.col);
    notice = '';
    await saveGame(ctx.io, session.game);
    render();
    if (session.state === 'finished') return finish();
  }

  async function finish() {
    if (session.game.status !== 'playing') {
      await recordResult(ctx.io, session.game.status);
      stats = await loadStats(ctx.io);
      await clearGame(ctx.io);
    }
    render();
  }

  async function doPause() { session = pause(session); await saveGame(ctx.io, session.game); render(); }
  async function doResume() {
    session = resume(session); render();
    if (shouldCallAi(session)) ctx.fillInput('（继续对局，轮到你走）');
  }
  async function doSurrender() { session = surrender(session); await saveGame(ctx.io, session.game); await finish(); }

  // ── 注入：生成前把当前棋盘发给 AI（仅轮到 AI 时）──
  ctx.registerInjection(() => {
    if (!shouldCallAi(session)) return null;
    return buildAiPrompt(session.game);
  });

  ctx.onMessageReceived(text => { handleAiMessage(text); });

  // ── 初始化：读战绩 + 续玩 ──
  (async () => {
    stats = await loadStats(ctx.io);
    const saved = await loadGame(ctx.io);
    if (saved) session = restoreSession(saved);
    render();
  })();

  return { getSession: () => session };
}
