// 本地预览：用假 ctx 模拟 SillyTavern，验证扩展的对局闭环。
// 模拟：点棋盘→填入“输入框”→点“发送”→假 AI 读盘随机落子→回一条带 <move> 的消息。

import { mountGame } from '../src/gomoku/extension.js';
import { isLegalMove } from '../src/core/board.js';

let injectionProvider = null;
let messageCb = null;
let handle = null;

const io = {
  read: async key => localStorage.getItem('gomoku:' + key),
  write: async (key, value) => localStorage.setItem('gomoku:' + key, value),
};

const fakeInput = document.getElementById('fake-input');

const ctx = {
  container: document.getElementById('gomoku-mount'),
  io,
  fillInput: text => { fakeInput.value = text; fakeInput.focus(); },
  registerInjection: provider => { injectionProvider = provider; },
  onMessageReceived: cb => { messageCb = cb; },
};

handle = mountGame(ctx);

// 模拟“发送”：触发注入 + 假 AI 回复
document.getElementById('fake-send').addEventListener('click', async () => {
  const inject = injectionProvider && injectionProvider();
  document.getElementById('inject-view').textContent = inject || '（本回合无注入）';
  fakeInput.value = '';
  if (!inject) return; // 没轮到 AI，不回复

  await new Promise(r => setTimeout(r, 300));
  const board = handle.getSession().game.board;
  const empty = [];
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board.length; c++)
      if (isLegalMove(board, r, c)) empty.push([r, c]);
  if (!empty.length) return;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const quips = ['就这？', '看我的。', '嘿嘿。', '接招！'];
  const reply = `${quips[Math.floor(Math.random() * quips.length)]} <move>${r + 1},${c + 1}</move>`;
  document.getElementById('ai-reply-view').textContent = 'AI 回复：' + reply;
  if (messageCb) messageCb(reply);
});

document.getElementById('fake-reset').addEventListener('click', () => {
  localStorage.removeItem('gomoku:save');
  localStorage.removeItem('gomoku:stats');
  location.reload();
});
