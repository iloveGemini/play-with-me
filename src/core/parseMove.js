// 从 AI 回复文本中解析落子标记 <move>行,列</move>。
// AI 使用 1–15 的坐标；解析后转为内部 0-indexed。
// 返回：{ ok:true, row, col } | { ok:false, reason: 'missing'|'malformed'|'out_of_range' }

import { SIZE } from './board.js';

const MOVE_TAG = /<move>([\s\S]*?)<\/move>/gi;

export function parseMove(text) {
  const matches = [...String(text).matchAll(MOVE_TAG)];
  if (matches.length === 0) {
    return { ok: false, reason: 'missing' };
  }

  // 取最后一个 <move>，视作 AI 的最终结论。
  const inner = matches[matches.length - 1][1];
  // 容忍空格与中文逗号。
  const parts = inner.replace(/，/g, ',').split(',').map(s => s.trim());
  if (parts.length !== 2) {
    return { ok: false, reason: 'malformed' };
  }

  const nums = parts.map(Number);
  if (nums.some(n => !Number.isInteger(n))) {
    return { ok: false, reason: 'malformed' };
  }

  const [row1, col1] = nums;
  if (row1 < 1 || row1 > SIZE || col1 < 1 || col1 > SIZE) {
    return { ok: false, reason: 'out_of_range' };
  }

  return { ok: true, row: row1 - 1, col: col1 - 1 };
}
