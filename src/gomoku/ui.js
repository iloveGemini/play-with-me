// 五子棋图形界面 + 流程编排。把核心模块接到 DOM。
// mountGomoku(container, { io, generate })：deps 注入，便于本地预览用假实现。

import { SIZE, isLegalMove, BLACK, WHITE } from '../core/board.js';
import {
  newSession, startGame, applyUserMove, pause, resume, surrender,
  shouldCallAi, restoreSession,
} from '../core/session.js';
import { aiTakeTurn } from '../core/orchestrator.js';
import { saveGame, loadGame, clearGame, recordResult, loadStats } from '../core/storage.js';

const STYLE = `
.gmk { font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #2b2b2b; }
.gmk-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.gmk-title { font-weight:700; font-size:18px; }
.gmk-stats { font-size:13px; color:#555; }
.gmk-board { position:relative; background:#e3b96b; border:2px solid #7a5320; border-radius:6px;
  display:grid; grid-template-columns:repeat(${SIZE}, 1fr); gap:0; aspect-ratio:1/1; }
.gmk-cell { position:relative; border:0.5px solid #b98a3e; cursor:pointer; }
.gmk-cell:hover::after { content:''; position:absolute; inset:18%; border-radius:50%;
  background:rgba(0,0,0,0.08); }
.gmk-stone { position:absolute; inset:10%; border-radius:50%; }
.gmk-black { background:radial-gradient(circle at 35% 30%, #6b6b6b, #050505); }
.gmk-white { background:radial-gradient(circle at 35% 30%, #ffffff, #c4c4c4); border:0.5px solid #999; }
.gmk-last { box-shadow:0 0 0 2px #d63b3b, 0 0 4px 1px rgba(214,59,59,.6); }
.gmk-status { text-align:center; margin:10px 0; min-height:22px; font-size:14px; }
.gmk-controls { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.gmk-controls button { padding:6px 14px; border:1px solid #7a5320; background:#f6e7c8;
  border-radius:6px; cursor:pointer; font-size:14px; }
.gmk-controls button:disabled { opacity:.4; cursor:not-allowed; }
.gmk-thinking { color:#8a6d1f; }
`;

export function mountGomoku(container, { io, generate, maxRetries = 2 } = {}) {
  let session = newSession();
  let stats = { gomoku: { win: 0, loss: 0, draw: 0 } };
  let busy = false;      // AI 思考中锁盘
  let choosing = false;  // 正在选先手

  // ---- DOM 骨架 ----
  const style = document.createElement('style');
  style.textContent = STYLE;
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
  container.replaceChildren(style, root);

  const boardEl = root.querySelector('.gmk-board');
  const statsEl = root.querySelector('.gmk-stats');
  const statusEl = root.querySelector('.gmk-status');
  const controlsEl = root.querySelector('.gmk-controls');

  // 预建格子
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

  // ---- 渲染 ----
  function render() {
    const game = session.game;
    // 棋子
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
    statusEl.innerHTML = statusText();
    renderControls();
  }

  function statusText() {
    if (busy) return '<span class="gmk-thinking">AI 思考中…</span>';
    if (choosing) return '谁先手？（先手执黑）';
    if (!session.game) return '点击「开始」新对局';
    switch (session.game.status) {
      case 'user_win': return '🎉 你赢了！';
      case 'ai_win': return session.state === 'finished' ? '😈 AI 赢了' : '';
      case 'draw': return '🤝 和棋';
      default:
        if (session.state === 'paused') return '⏸ 已暂停';
        return session.game.turn === 'user' ? '轮到你落子' : '轮到 AI';
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
      c.push(btn('开始', () => { choosing = true; render(); }));
    } else {
      const playing = session.state === 'playing';
      c.push(btn('暂停', doPause, !playing || busy));
      c.push(btn('继续', doResume, session.state !== 'paused' || busy));
      c.push(btn('认输', doSurrender, busy));
    }
    controlsEl.replaceChildren(...c);
  }

  // ---- 流程 ----
  async function startNew(firstPlayer) {
    choosing = false;
    session = startGame(session, { firstPlayer });
    await saveGame(io, session.game);
    render();
    if (shouldCallAi(session)) await runAiTurn();
  }

  async function onCellClick(r, c) {
    if (busy || session.state !== 'playing') return;
    if (session.game.turn !== 'user') return;
    if (!isLegalMove(session.game.board, r, c)) return;
    session = applyUserMove(session, r, c);
    await saveGame(io, session.game);
    render();
    if (session.state === 'finished') return finish();
    await runAiTurn();
  }

  async function runAiTurn() {
    busy = true; render();
    let result;
    try {
      result = await aiTakeTurn(session, { generate, maxRetries });
    } catch (e) {
      busy = false; statusEl.textContent = 'AI 调用出错：' + e.message; return;
    }
    busy = false;
    if (result.ok) {
      session = result.session;
      await saveGame(io, session.game);
      render();
      if (session.state === 'finished') return finish();
    } else {
      render();
      showAiFailed();
    }
  }

  function showAiFailed() {
    statusEl.textContent = 'AI 连续给出无效落子。';
    controlsEl.replaceChildren(
      btn('判 AI 负', async () => {
        session = { state: 'finished', game: { ...session.game, status: 'user_win' } };
        await saveGame(io, session.game); await finish();
      }),
      btn('再试一次', runAiTurn),
    );
  }

  async function finish() {
    if (session.game.status !== 'playing') {
      await recordResult(io, session.game.status);
      stats = await loadStats(io);
      await clearGame(io); // 清空存档槽
    }
    render();
  }

  async function doPause() { session = pause(session); await saveGame(io, session.game); render(); }
  async function doResume() { session = resume(session); render(); if (shouldCallAi(session)) await runAiTurn(); }
  async function doSurrender() { session = surrender(session); await saveGame(io, session.game); await finish(); }

  // ---- 初始化：读战绩 + 尝试续玩 ----
  (async () => {
    stats = await loadStats(io);
    const saved = await loadGame(io);
    if (saved) {
      session = restoreSession(saved);
    }
    render();
    if (shouldCallAi(session)) await runAiTurn();
  })();

  return { getSession: () => session };
}
