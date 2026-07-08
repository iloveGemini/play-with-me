import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, placeStone, BLACK, WHITE } from '../src/core/board.js';
import { renderAscii } from '../src/core/renderAscii.js';

/** 统计某字符在字符串中出现次数。 */
function count(str, ch) {
  return [...str].filter(c => c === ch).length;
}

test('空盘：225 个空位字符 ·', () => {
  const out = renderAscii(createBoard());
  assert.equal(count(out, '·'), 225);
});

test('含列号 1 与 15、行号 15', () => {
  const out = renderAscii(createBoard());
  assert.match(out, /\b1\b/);
  assert.match(out, /\b15\b/);
});

test('黑子渲染为 ●，白子渲染为 ○', () => {
  let board = placeStone(createBoard(), 7, 7, BLACK);
  board = placeStone(board, 7, 8, WHITE);
  const out = renderAscii(board);
  assert.equal(count(out, '●'), 1);
  assert.equal(count(out, '○'), 1);
});

test('最新一手（黑）标为 ◉，其余黑子仍是 ●', () => {
  let board = placeStone(createBoard(), 3, 3, BLACK); // 旧黑子
  board = placeStone(board, 7, 7, BLACK);             // 最新黑子
  const out = renderAscii(board, { player: 'x', stone: BLACK, pos: [7, 7] });
  assert.equal(count(out, '◉'), 1, '最新黑子应为 ◉');
  assert.equal(count(out, '●'), 1, '旧黑子仍为 ●');
});

test('最新一手（白）标为 ◎', () => {
  const board = placeStone(createBoard(), 7, 4, WHITE);
  const out = renderAscii(board, { stone: WHITE, pos: [7, 4] });
  assert.equal(count(out, '◎'), 1);
  assert.equal(count(out, '○'), 0);
});

test('无 lastMove 时不产生任何最新一手标记', () => {
  const board = placeStone(createBoard(), 7, 7, BLACK);
  const out = renderAscii(board);
  assert.equal(count(out, '◉'), 0);
  assert.equal(count(out, '◎'), 0);
});
