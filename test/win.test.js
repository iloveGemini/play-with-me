import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeStone, checkWin, isBoardFull, BLACK, WHITE } from '../src/core/board.js';

/** 在一串坐标依次落同色子，返回最终棋盘。 */
function placeLine(coords, stone) {
  return coords.reduce((b, [r, c]) => placeStone(b, r, c, stone), createBoard());
}

test('checkWin: 横向连五获胜，返回连珠坐标', () => {
  const board = placeLine([[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]], BLACK);
  const line = checkWin(board, 7, 7);
  assert.ok(line, '应判定为获胜');
  assert.equal(line.length, 5);
});

test('checkWin: 纵向连五获胜', () => {
  const board = placeLine([[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]], WHITE);
  assert.ok(checkWin(board, 5, 7));
});

test('checkWin: 主对角线（↘）连五获胜', () => {
  const board = placeLine([[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]], BLACK);
  assert.ok(checkWin(board, 5, 5));
});

test('checkWin: 反对角线（↙）连五获胜', () => {
  const board = placeLine([[3, 7], [4, 6], [5, 5], [6, 4], [7, 3]], BLACK);
  assert.ok(checkWin(board, 5, 5));
});

test('checkWin: 只有四连不算获胜', () => {
  const board = placeLine([[7, 4], [7, 5], [7, 6], [7, 7]], BLACK);
  assert.equal(checkWin(board, 7, 7), null);
});

test('checkWin: 被对方子隔断的不算连五', () => {
  let board = placeLine([[7, 3], [7, 4], [7, 6], [7, 7]], BLACK);
  board = placeStone(board, 7, 5, WHITE); // 中间被白子隔断
  board = placeStone(board, 7, 8, BLACK);
  assert.equal(checkWin(board, 7, 8), null);
});

test('checkWin: 六连（长连）也算获胜', () => {
  const board = placeLine([[7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7]], BLACK);
  assert.ok(checkWin(board, 7, 7));
});

test('isBoardFull: 空盘为 false', () => {
  assert.equal(isBoardFull(createBoard()), false);
});

test('isBoardFull: 满盘为 true', () => {
  let board = createBoard();
  board = board.map(row => row.map(() => BLACK));
  assert.equal(isBoardFull(board), true);
});
