// 五子棋游戏 descriptor。不直接依赖酒馆，也不直接碰注入/消息钩子——
// 把 getInjection/onMessage 交给框架统一调度。
//
// mount(container, services) -> { getInjection(), onMessage(text), destroy() }
//   services = { io, fillInput }

import { SIZE, isLegalMove, BLACK } from '../core/board.js';
import {
  newSession, startGame, applyUserMove, applyAiMove, pause, resume, surrender,
  shouldCallAi, restoreSession,
} from '../core/session.js';
import { parseMove } from '../core/parseMove.js';
import { buildAiPrompt, buildUserInput, buildCorrection } from '../core/messages.js';
import { saveGame, loadGame, clearGame, recordResult, loadStats } from '../core/storage.js';

function mount(container, { io, fillInput }) {
  let session = newSession();
  let stats = { gomoku: { win: 0, loss: 0, draw: 0 } };
  let choosing = false;
  let notice = '';

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
  container.replaceChildren(root);

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

  async function startNew(firstPlayer) {
    choosing = false; notice = '';
    session = startGame(session, { firstPlayer });
    await saveGame(io, session.game);
    render();
    if (shouldCallAi(session)) fillInput('（新对局，你先手，请落子）');
  }

  async function onCellClick(r, c) {
    if (session.state !== 'playing' || !session.game) return;
    if (session.game.turn !== 'user') return;
    if (!isLegalMove(session.game.board, r, c)) return;
    session = applyUserMove(session, r, c);
    notice = '';
    await saveGame(io, session.game);
    render();
    if (session.state === 'finished') return finish();
    fillInput(buildUserInput(session.game.lastMove));
  }

  async function handleAiMessage(text) {
    if (!shouldCallAi(session)) return;
    const parsed = parseMove(text);
    if (!parsed.ok || !isLegalMove(session.game.board, parsed.row, parsed.col)) {
      const reason = parsed.ok ? 'illegal' : parsed.reason;
      notice = `AI 落子无效：${buildCorrection(reason)}（让它重新生成一次即可）`;
      render();
      return;
    }
    session = applyAiMove(session, parsed.row, parsed.col);
    notice = '';
    await saveGame(io, session.game);
    render();
    if (session.state === 'finished') return finish();
  }

  async function finish() {
    if (session.game.status !== 'playing') {
      await recordResult(io, session.game.status);
      stats = await loadStats(io);
      await clearGame(io);
    }
    render();
  }

  async function doPause() { session = pause(session); await saveGame(io, session.game); render(); }
  async function doResume() {
    session = resume(session); render();
    if (shouldCallAi(session)) fillInput('（继续对局，轮到你走）');
  }
  async function doSurrender() { session = surrender(session); await saveGame(io, session.game); await finish(); }

  // 初始化：读战绩 + 续玩
  (async () => {
    stats = await loadStats(io);
    const saved = await loadGame(io);
    if (saved) session = restoreSession(saved);
    render();
  })();

  return {
    getInjection: () => (shouldCallAi(session) ? buildAiPrompt(session.game) : null),
    onMessage: text => { handleAiMessage(text); },
    getSession: () => session,
    destroy: () => container.replaceChildren(),
  };
}

export const gomokuGame = {
  id: 'gomoku',
  name: '五子棋',
  icon: '⚫',
  defaultDepth: 1,
  defaultRole: 'system',
  mount,
};
