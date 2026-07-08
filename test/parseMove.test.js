import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMove } from '../src/core/parseMove.js';

test('解析标准 <move>：1-based 转 0-based', () => {
  const r = parseMove('我下这里 <move>8,5</move> 哼哼');
  assert.deepEqual(r, { ok: true, row: 7, col: 4 });
});

test('容忍空格', () => {
  assert.deepEqual(parseMove('<move> 8 , 5 </move>'), { ok: true, row: 7, col: 4 });
});

test('容忍中文逗号', () => {
  assert.deepEqual(parseMove('<move>8，5</move>'), { ok: true, row: 7, col: 4 });
});

test('多个 <move> 时取最后一个（视作 AI 的最终结论）', () => {
  const r = parseMove('先想想 <move>1,1</move>，不对，就 <move>15,15</move>');
  assert.deepEqual(r, { ok: true, row: 14, col: 14 });
});

test('没有 <move> 标签：ok=false，reason=missing', () => {
  const r = parseMove('我觉得中间不错');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing');
});

test('越界坐标（0 或 16）：ok=false，reason=out_of_range', () => {
  assert.equal(parseMove('<move>0,5</move>').reason, 'out_of_range');
  assert.equal(parseMove('<move>16,5</move>').reason, 'out_of_range');
  assert.equal(parseMove('<move>8,16</move>').ok, false);
});

test('格式错乱（非数字）：ok=false，reason=malformed', () => {
  const r = parseMove('<move>abc</move>');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'malformed');
});
