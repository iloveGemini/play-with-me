import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeStone, isLegalMove, BLACK, WHITE } from '../src/core/board.js';

test('createBoard 生成 15x15 全空棋盘', () => {
  const board = createBoard();
  assert.equal(board.length, 15);
  assert.ok(board.every(row => row.length === 15));
  assert.ok(board.every(row => row.every(cell => cell === 0)));
});

test('isLegalMove: 空位合法', () => {
  assert.equal(isLegalMove(createBoard(), 7, 7), true);
});

test('isLegalMove: 越界不合法', () => {
  const board = createBoard();
  assert.equal(isLegalMove(board, -1, 0), false);
  assert.equal(isLegalMove(board, 0, 15), false);
  assert.equal(isLegalMove(board, 15, 15), false);
});

test('isLegalMove: 已占用不合法', () => {
  const board = placeStone(createBoard(), 7, 7, BLACK);
  assert.equal(isLegalMove(board, 7, 7), false);
});

test('placeStone: 返回落子后的新棋盘，不改动原棋盘', () => {
  const board = createBoard();
  const next = placeStone(board, 7, 7, WHITE);
  assert.equal(next[7][7], WHITE);
  assert.equal(board[7][7], 0, '原棋盘应保持不变（纯函数）');
});

test('placeStone: 拒绝非法落子并抛错', () => {
  const board = placeStone(createBoard(), 7, 7, BLACK);
  assert.throws(() => placeStone(board, 7, 7, WHITE), /非法落子|illegal/i);
});
