// 本地预览：用假 host services 模拟 SillyTavern，验证框架 + 两个游戏的闭环。
// 五子棋：点棋盘→填输入框→发送→假 AI 随机落子。
// 海龟汤：开始→在输入框打问题→发送→假 AI 随机答 是/不是/无关（偶尔破案）。

import { createGameHost } from '../src/framework.js';
import { gomokuGame } from '../src/gomoku/extension.js';
import { haiguitangGame } from '../src/haiguitang/extension.js';
import { isLegalMove } from '../src/core/board.js';

const io = {
  read: async key => localStorage.getItem(key),
  write: async (key, value) => localStorage.setItem(key, value),
};

const fakeInput = document.getElementById('fake-input');

const host = createGameHost({
  container: document.getElementById('gomoku-mount'),
  io,
  hostServices: {
    fillInput: text => { fakeInput.value = text; fakeInput.focus(); },
  },
});

host.registerGame(gomokuGame);
host.registerGame(haiguitangGame);
await host.init();

function fakeGomokuReply() {
  const board = host.getActiveInstance()?.getSession?.().game.board;
  if (!board) return null;
  const empty = [];
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board.length; c++)
      if (isLegalMove(board, r, c)) empty.push([r, c]);
  if (!empty.length) return null;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const quips = ['就这？', '看我的。', '嘿嘿。', '接招！'];
  return `${quips[Math.floor(Math.random() * quips.length)]} <move>${r + 1},${c + 1}</move>`;
}

function fakeSoupReply() {
  // 10% 概率"破案"，方便测试揭晓流程
  if (Math.random() < 0.1) return '【破案】没错，就是这样！汤底揭晓，恭喜你～';
  return ['是。', '不是。', '无关。'][Math.floor(Math.random() * 3)] + '（随便答的，测试用）';
}

document.getElementById('fake-send').addEventListener('click', async () => {
  const inject = host.getInjection();
  document.getElementById('inject-view').textContent = inject
    ? `depth=${inject.depth}, role=${inject.role}\n\n${inject.content}`
    : '（本回合无注入）';
  const isSoup = inject && inject.content.includes('海龟汤');
  fakeInput.value = '';
  if (!inject) return;

  await new Promise(r => setTimeout(r, 300));
  const reply = isSoup ? fakeSoupReply() : fakeGomokuReply();
  if (!reply) return;
  document.getElementById('ai-reply-view').textContent = 'AI 回复：' + reply;
  host.onMessage(reply);
});

document.getElementById('fake-reset').addEventListener('click', () => {
  for (const key of [...Object.keys(localStorage)]) {
    if (key.startsWith('game:') || key.startsWith('host:')) localStorage.removeItem(key);
  }
  location.reload();
});
