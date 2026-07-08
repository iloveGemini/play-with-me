import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSession, startGame, applyUserMove, applyAiMove,
} from '../src/core/session.js';
import { buildAiPrompt, buildUserInput, buildCorrection } from '../src/core/messages.js';

test('buildUserInput：可见短消息，坐标转 1-based', () => {
  const text = buildUserInput({ pos: [7, 4] });
  assert.match(text, /8/);
  assert.match(text, /5/);
});

test('buildAiPrompt：含图例、棋盘图与 <move> 指令', () => {
  let s = startGame(newSession(), { firstPlayer: 'ai' }); // AI 执黑先手
  s = applyAiMove(s, 7, 7);      // AI 先走
  s = applyUserMove(s, 7, 8);    // 玩家回应，轮到 AI
  const prompt = buildAiPrompt(s.game);
  assert.match(prompt, /·=空/);            // 图例
  assert.match(prompt, /[●○]/);            // 棋盘上有子
  assert.match(prompt, /<move>/);          // 落子指令
});

test('buildAiPrompt：正确告知 AI 自己的颜色（AI执黑→黑）', () => {
  let s = startGame(newSession(), { firstPlayer: 'ai' });
  s = applyAiMove(s, 7, 7);
  s = applyUserMove(s, 7, 8);
  const prompt = buildAiPrompt(s.game);
  assert.match(prompt, /你.*黑|执黑/);
});

test('buildAiPrompt：复述对方最新一手（1-based）', () => {
  let s = startGame(newSession(), { firstPlayer: 'ai' });
  s = applyAiMove(s, 7, 7);
  s = applyUserMove(s, 7, 8);   // 玩家落在内部 (7,8) → 显示 (8,9)
  const prompt = buildAiPrompt(s.game);
  assert.match(prompt, /8.*9|\(8, ?9\)/);
});

test('buildCorrection：不同原因给不同提示，且都要求 <move> 格式', () => {
  for (const reason of ['missing', 'malformed', 'out_of_range', 'illegal']) {
    const msg = buildCorrection(reason);
    assert.match(msg, /<move>/, `${reason} 应包含格式提示`);
    assert.ok(msg.length > 0);
  }
  assert.notEqual(buildCorrection('out_of_range'), buildCorrection('illegal'));
});
