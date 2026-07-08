// 五子棋棋盘核心逻辑（纯函数，不依赖酒馆）。
// 约定：内部一律 0-indexed，board[row][col]，row/col ∈ [0, 14]。
// 单元格取值：0=空 1=黑 2=白。1–15 的坐标只出现在 ASCII 展示与 AI 消息层。

export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

/** 生成 size×size 的全空棋盘。 */
export function createBoard(size = SIZE) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => EMPTY));
}

/** 坐标是否在盘内。 */
function inBounds(board, row, col) {
  return row >= 0 && row < board.length && col >= 0 && col < board.length;
}

/** (row, col) 是否为合法落子点：在盘内且为空。 */
export function isLegalMove(board, row, col) {
  return inBounds(board, row, col) && board[row][col] === EMPTY;
}

/** 落子，返回新棋盘（不改动原棋盘）；非法落子抛错。 */
export function placeStone(board, row, col, stone) {
  if (!isLegalMove(board, row, col)) {
    throw new Error(`非法落子 (${row}, ${col})`);
  }
  const next = board.map(r => r.slice());
  next[row][col] = stone;
  return next;
}

// 连五检测的四个方向：横、竖、↘、↙。
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * 判断刚落在 (row, col) 的子是否连成五子（或以上，长连也算）。
 * @returns 获胜时返回连珠坐标数组 `[[r,c], ...]`（长度 ≥ 5）；否则返回 null。
 */
export function checkWin(board, row, col) {
  const stone = board[row][col];
  if (stone === EMPTY) return null;

  for (const [dr, dc] of DIRECTIONS) {
    const line = [[row, col]];
    // 正向延伸
    for (let r = row + dr, c = col + dc; inBounds(board, r, c) && board[r][c] === stone; r += dr, c += dc) {
      line.push([r, c]);
    }
    // 反向延伸
    for (let r = row - dr, c = col - dc; inBounds(board, r, c) && board[r][c] === stone; r -= dr, c -= dc) {
      line.unshift([r, c]);
    }
    if (line.length >= 5) return line;
  }
  return null;
}

/** 棋盘是否已下满（无空位）。 */
export function isBoardFull(board) {
  return board.every(row => row.every(cell => cell !== EMPTY));
}
