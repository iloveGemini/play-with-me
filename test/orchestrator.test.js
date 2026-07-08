import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, startGame, applyUserMove } from '../src/core/session.js';
import { aiTakeTurn } from '../src/core/orchestrator.js';
import { BLACK, WHITE } from '../src/core/board.js';

/** 造一个假的 generate：按脚本依次返回回复，并记录每次收到的输入。 */
function fakeGenerate(replies) {
  const calls = [];
  const fn = async (arg) => {
    calls.push(arg);
    return replies[calls.length - 1];
  };
  fn.calls = calls;
  return fn;
}

/** 玩家先手走一步，轮到 AI 的 session。 */
function userMovedSession() {
  let s = startGame(newSession(), { firstPlayer: 'user' });
  return applyUserMove(s, 7, 7); // 玩家(黑) 下 (7,7)，轮到 AI(白)
}

test('AI 一次给出合法落子：落子成功、返回回复文本', async () => {
  const generate = fakeGenerate(['哼，我下这 <move>1,1</move>']); // 显示(1,1)→内部(0,0)，空位
  const r = await aiTakeTurn(userMovedSession(), { generate });
  assert.equal(r.ok, true);
  assert.equal(r.session.game.board[7][7], BLACK);  // 玩家的黑子还在
  assert.equal(r.session.game.board[0][0], WHITE);  // AI 白子落在内部(0,0)
  assert.match(r.reply, /哼/);                       // 返回原始回复供显示
});

test('AI 落在已占用点：纠正后重试，第二次合法', async () => {
  // 玩家占了 (7,7)=显示(8,8)。AI 先给 (8,8) 非法，再给 (9,9) 合法。
  const generate = fakeGenerate([
    '我下 <move>8,8</move>',   // 内部(7,7) 已被玩家占 → illegal
    '那我下 <move>9,9</move>', // 内部(8,8) 合法
  ]);
  const r = await aiTakeTurn(userMovedSession(), { generate });
  assert.equal(r.ok, true);
  assert.equal(generate.calls.length, 2, '应重试一次');
  assert.equal(r.session.game.board[8][8], WHITE);
  // 第二次调用应带纠正提示
  assert.match(generate.calls[1].userInput, /已经有子|不可落|<move>/);
});

test('AI 始终不给合法落子：超过重试上限 → ok=false, reason=ai_failed', async () => {
  const generate = fakeGenerate(['没有坐标', '还是没有', '依然没有']);
  const r = await aiTakeTurn(userMovedSession(), { generate, maxRetries: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ai_failed');
  assert.equal(generate.calls.length, 3, '首次 + 2 次重试');
  assert.equal(r.session.game.turn, 'ai', 'session 仍停在 AI 回合');
});

test('缺 <move> 时纠正提示为 missing 文案', async () => {
  const generate = fakeGenerate(['我想想……', '好吧 <move>9,9</move>']);
  const r = await aiTakeTurn(userMovedSession(), { generate });
  assert.equal(r.ok, true);
  assert.match(generate.calls[1].userInput, /没有读到/);
});

test('非 AI 回合时拒绝调用', async () => {
  const s = startGame(newSession(), { firstPlayer: 'user' }); // 轮到玩家
  await assert.rejects(() => aiTakeTurn(s, { generate: fakeGenerate([]) }), /回合|turn|playing/i);
});

test('首次调用的 inject 含棋盘图，userInput 为玩家落子播报', async () => {
  const generate = fakeGenerate(['<move>9,9</move>']);
  await aiTakeTurn(userMovedSession(), { generate });
  assert.match(generate.calls[0].inject, /·=空/);       // 棋盘图/图例
  assert.match(generate.calls[0].userInput, /我落子/);   // 播报玩家的手
});
