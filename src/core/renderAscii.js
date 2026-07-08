// 把 board 渲染成给 AI 看的 ASCII 棋盘图。
// 内部 0-indexed；展示层用 1–15 的行列号。
// lastMove（可选）：{ stone, pos:[row,col] }，把最新一手标为带点变体字。

import { EMPTY, BLACK } from './board.js';

// 图例由消息构造层按需拼在棋盘前；renderAscii 只产出纯网格，避免字形污染。
export const LEGEND = '棋盘  ·=空  ●=黑  ○=白   ◎=白方最新一手  ◉=黑方最新一手';

function glyph(cell, isLast) {
  if (cell === EMPTY) return '·';
  if (cell === BLACK) return isLast ? '◉' : '●';
  return isLast ? '◎' : '○';
}

const pad2 = n => String(n).padStart(2, ' ');

export function renderAscii(board, lastMove = null) {
  const size = board.length;
  const lastPos = lastMove && lastMove.pos ? lastMove.pos : null;

  const header = '   ' + Array.from({ length: size }, (_, i) => pad2(i + 1)).join(' ');

  const rows = board.map((row, r) => {
    const cells = row.map((cell, c) => {
      const isLast = lastPos && lastPos[0] === r && lastPos[1] === c;
      return ' ' + glyph(cell, isLast);
    });
    return pad2(r + 1) + cells.join('');
  });

  return [header, ...rows].join('\n');
}
