// 本地预览：用假的 generate（一个随机落子的“笨 AI”）和 localStorage 存储，
// 让你无需推 GitHub、无需酒馆，就能在浏览器里真玩一局、验证 UI 和流程。

import { mountGomoku } from '../src/gomoku/ui.js';
import { isLegalMove } from '../src/core/board.js';

// —— 假存储：localStorage 版 io（刷新后仍能续玩，用于测试存档）——
const io = {
  read: async key => localStorage.getItem('gmk:' + key),
  write: async (key, value) => localStorage.setItem('gmk:' + key, value),
};

let handle;

// —— 假 AI：从当前棋盘随机挑一个空位落子，返回带 <move> 的文本 —— //
const generate = async ({ inject }) => {
  await new Promise(r => setTimeout(r, 350)); // 模拟思考延迟
  const board = handle.getSession().game.board;
  const empty = [];
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board.length; c++)
      if (isLegalMove(board, r, c)) empty.push([r, c]);
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const quips = ['就这？', '看我的。', '嘿嘿。', '接招！', '有意思。'];
  const quip = quips[Math.floor(Math.random() * quips.length)];
  return `${quip} <move>${r + 1},${c + 1}</move>`;
};

handle = mountGomoku(document.getElementById('app'), { io, generate });

// 方便调试：清存档按钮
document.getElementById('reset').addEventListener('click', () => {
  localStorage.removeItem('gmk:save');
  localStorage.removeItem('gmk:stats');
  location.reload();
});
