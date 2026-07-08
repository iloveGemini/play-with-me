// 构造发给 AI 的提示 / 可见消息 / 纠正消息（纯函数）。
// 内部坐标 0-indexed；面向 AI 与玩家的文本一律显示 1-based。

import { BLACK } from './board.js';
import { renderAscii, LEGEND } from './renderAscii.js';

const disp = ([r, c]) => `(${r + 1},${c + 1})`; // 0-based → 1-based 显示

/** AI 这一方的颜色描述。 */
function aiColor(game) {
  return game.players.black === 'ai'
    ? { name: '黑', glyph: '●' }
    : { name: '白', glyph: '○' };
}

/** 玩家点击后发出的可见短消息（不含棋盘，避免刷屏）。 */
export function buildUserInput(lastMove) {
  return `我落子 ${disp(lastMove.pos)}`;
}

/**
 * 注入给 AI 的提示：图例 + 棋盘图 + 对方最新一手 + 落子指令。
 * 通过 generate 的 injects 送达，不落成楼层。
 */
export function buildAiPrompt(game) {
  const ai = aiColor(game);
  const board = renderAscii(game.board, game.lastMove);

  let oppLine = '';
  if (game.lastMove && game.lastMove.player !== 'ai') {
    oppLine = `\n玩家刚落子：${disp(game.lastMove.pos)}`;
  }

  return [
    '你正在和玩家下五子棋，你是对手。',
    LEGEND,
    board,
    oppLine.trim(),
    `轮到你（你执${ai.name}，${ai.glyph}）。先自由说一句，然后必须用 <move>行,列</move> 给出落子，行列均为 1–15。`,
  ].filter(Boolean).join('\n');
}

/** 落子无效时的纠正消息，供有限次重试。 */
export function buildCorrection(reason) {
  const tail = '请重新用 <move>行,列</move> 给出落子，行列均为 1–15。';
  switch (reason) {
    case 'missing':
      return `没有读到你的落子。${tail}`;
    case 'malformed':
      return `落子格式无法解析。${tail}`;
    case 'out_of_range':
      return `坐标超出棋盘范围（应在 1–15）。${tail}`;
    case 'illegal':
      return `那个位置已经有子或不可落。${tail}`;
    default:
      return `落子无效。${tail}`;
  }
}
