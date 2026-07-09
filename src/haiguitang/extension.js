// 海龟汤游戏 descriptor。玩家靠正常聊天提问、AI 当主持人；面板负责选题、展示汤面、
// 把"主持规则+汤面+汤底"注入给 AI、识别"破案"。不直接依赖酒馆。
//
// mount(container, services) -> { getInjection(), onMessage(text), destroy() }

import { PUZZLES } from './puzzles.js';
import { buildHostPrompt, isSolvedMarker, pickNextPuzzle, findPuzzle } from './logic.js';

const SAVE_KEY = 'save';

function mount(container, { io, fillInput }) {
  // 状态：idle 未开局 / playing 猜谜中 / revealed 已揭晓
  let state = { status: 'idle', puzzleId: null, solved: 0, played: 0 };

  const root = document.createElement('div');
  root.className = 'hgt';
  root.innerHTML = `
    <div class="hgt-top">
      <span class="hgt-title">海龟汤 · AI 主持</span>
      <span class="hgt-stats"></span>
    </div>
    <div class="hgt-soup"></div>
    <div class="hgt-answer" style="display:none;"></div>
    <div class="hgt-status"></div>
    <div class="hgt-controls"></div>`;
  container.replaceChildren(root);

  const statsEl = root.querySelector('.hgt-stats');
  const soupEl = root.querySelector('.hgt-soup');
  const answerEl = root.querySelector('.hgt-answer');
  const statusEl = root.querySelector('.hgt-status');
  const controlsEl = root.querySelector('.hgt-controls');

  const puzzle = () => findPuzzle(PUZZLES, state.puzzleId);

  function render() {
    const p = puzzle();
    statsEl.textContent = `已解开 ${state.solved} / 玩过 ${state.played}`;
    soupEl.textContent = p ? p.title : '点「开始」抽一道海龟汤，然后在聊天里向 AI 提问（只能问「是/不是」的问题）。';

    if (state.status === 'revealed' && p) {
      answerEl.style.display = '';
      answerEl.innerHTML = `<b>汤底：</b>${p.answer}`;
    } else {
      answerEl.style.display = 'none';
    }

    statusEl.textContent = statusText();
    renderControls();
  }

  function statusText() {
    switch (state.status) {
      case 'playing': return '💬 在聊天里向 AI 提问吧（AI 只答「是/不是/无关」）';
      case 'revealed': return state.justSolved ? '🎉 破案啦！' : '汤底已揭晓';
      default: return '';
    }
  }

  function btn(label, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderControls() {
    const c = [];
    if (state.status === 'idle') {
      c.push(btn('开始', () => start()));
    } else if (state.status === 'playing') {
      c.push(btn('换一题', () => start()));
      c.push(btn('看汤底', () => reveal(false)));
      c.push(btn('不玩了', () => stop()));
    } else {
      c.push(btn('下一题', () => start()));
      c.push(btn('返回', () => stop()));
    }
    controlsEl.replaceChildren(...c);
  }

  async function start() {
    const next = pickNextPuzzle(PUZZLES, state.puzzleId);
    state = { status: 'playing', puzzleId: next.id, solved: state.solved, played: state.played + 1, justSolved: false };
    await save();
    render();
    fillInput('我们来玩海龟汤，我准备开始提问了。');
  }

  function reveal(solved) {
    state = { ...state, status: 'revealed', justSolved: !!solved };
    if (solved) state.solved += 1;
    save();
    render();
  }

  async function stop() {
    state = { ...state, status: 'idle', puzzleId: null, justSolved: false };
    await save();
    render();
  }

  function save() {
    return io.write(SAVE_KEY, JSON.stringify({
      status: state.status, puzzleId: state.puzzleId, solved: state.solved, played: state.played,
    }));
  }

  async function load() {
    try {
      const raw = await io.read(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      state = {
        status: ['idle', 'playing', 'revealed'].includes(d.status) ? d.status : 'idle',
        puzzleId: d.puzzleId || null,
        solved: Number.isInteger(d.solved) ? d.solved : 0,
        played: Number.isInteger(d.played) ? d.played : 0,
        justSolved: false,
      };
      if (state.status !== 'idle' && !puzzle()) { state.status = 'idle'; state.puzzleId = null; }
    } catch {}
  }

  (async () => { await load(); render(); })();

  return {
    getInjection: () => (state.status === 'playing' && puzzle() ? buildHostPrompt(puzzle()) : null),
    onMessage: text => {
      if (state.status === 'playing' && isSolvedMarker(text)) reveal(true);
    },
    destroy: () => container.replaceChildren(),
  };
}

export const haiguitangGame = {
  id: 'haiguitang',
  name: '海龟汤',
  icon: '🐢',
  defaultDepth: 1,
  defaultRole: 'system',
  mount,
};
