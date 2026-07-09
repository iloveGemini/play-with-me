import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHostPrompt, isSolvedMarker, pickNextPuzzle, SOLVED_TAG } from '../src/haiguitang/logic.js';
import { PUZZLES } from '../src/haiguitang/puzzles.js';

const sample = { id: 't', title: '汤面文本XYZ', answer: '汤底文本ABC' };

test('buildHostPrompt: 含汤面、汤底、是/不是/无关规则与破案标记', () => {
  const p = buildHostPrompt(sample);
  assert.match(p, /汤面文本XYZ/);
  assert.match(p, /汤底文本ABC/);
  assert.match(p, /是|不是|无关/);
  assert.ok(p.includes(SOLVED_TAG), '应告知 AI 用破案标记');
});

test('isSolvedMarker: 命中破案标记为 true', () => {
  assert.equal(isSolvedMarker(`恭喜！${SOLVED_TAG} 汤底是……`), true);
});

test('isSolvedMarker: 普通回答为 false', () => {
  assert.equal(isSolvedMarker('是。你再想想方向。'), false);
});

test('pickNextPuzzle: 返回题库中的一题', () => {
  const p = pickNextPuzzle(PUZZLES, null);
  assert.ok(PUZZLES.some(x => x.id === p.id));
});

test('pickNextPuzzle: 多题时不与当前同题', () => {
  const cur = PUZZLES[0].id;
  for (let i = 0; i < 20; i++) {
    assert.notEqual(pickNextPuzzle(PUZZLES, cur).id, cur);
  }
});

test('题库每题都有 id / title / answer 且 id 唯一', () => {
  assert.ok(PUZZLES.length >= 5);
  const ids = new Set();
  for (const p of PUZZLES) {
    assert.ok(p.id && p.title && p.answer, `题目字段缺失: ${JSON.stringify(p)}`);
    ids.add(p.id);
  }
  assert.equal(ids.size, PUZZLES.length, 'id 应唯一');
});
