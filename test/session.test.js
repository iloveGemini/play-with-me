import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE } from '../src/core/board.js';
import {
  newSession, startGame, pause, resume, surrender,
  applyUserMove, applyAiMove, shouldCallAi, restoreSession,
} from '../src/core/session.js';

test('newSession: 初始为 idle、无对局', () => {
  const s = newSession();
  assert.equal(s.state, 'idle');
  assert.equal(s.game, null);
});

test('startGame(玩家先手): 玩家执黑、轮到玩家、空盘、playing', () => {
  const s = startGame(newSession(), { firstPlayer: 'user' });
  assert.equal(s.state, 'playing');
  assert.equal(s.game.players.black, 'user');
  assert.equal(s.game.players.white, 'ai');
  assert.equal(s.game.turn, 'user');
  assert.equal(s.game.status, 'playing');
});

test('startGame(AI先手): AI 执黑、轮到 AI', () => {
  const s = startGame(newSession(), { firstPlayer: 'ai' });
  assert.equal(s.game.players.black, 'ai');
  assert.equal(s.game.turn, 'ai');
});

test('applyUserMove: 落子后轮到 AI，棋子为对应颜色', () => {
  let s = startGame(newSession(), { firstPlayer: 'user' });
  s = applyUserMove(s, 7, 7);
  assert.equal(s.game.board[7][7], BLACK); // 玩家执黑
  assert.equal(s.game.turn, 'ai');
  assert.deepEqual(s.game.lastMove.pos, [7, 7]);
});

test('不是你的回合时落子抛错', () => {
  const s = startGame(newSession(), { firstPlayer: 'ai' }); // 轮到 AI
  assert.throws(() => applyUserMove(s, 7, 7), /回合|turn/i);
});

test('玩家连五：status=user_win，state=finished', () => {
  let s = startGame(newSession(), { firstPlayer: 'user' });
  // 玩家(黑)与 AI(白)交替，玩家在第 7 行连成五子
  const userCols = [3, 4, 5, 6, 7];
  const aiCols = [3, 4, 5, 6]; // AI 下在第 8 行凑数，最后一手玩家取胜前 AI 已走 4 手
  for (let i = 0; i < 4; i++) {
    s = applyUserMove(s, 7, userCols[i]);
    s = applyAiMove(s, 8, aiCols[i]);
  }
  s = applyUserMove(s, 7, userCols[4]); // 第五子
  assert.equal(s.game.status, 'user_win');
  assert.equal(s.state, 'finished');
});

test('对局结束后不能再落子', () => {
  let s = startGame(newSession(), { firstPlayer: 'user' });
  s = surrender(s);
  assert.throws(() => applyUserMove(s, 0, 0), /结束|finished|playing/i);
});

test('shouldCallAi: 仅在 playing 且轮到 AI 时为真', () => {
  let s = startGame(newSession(), { firstPlayer: 'ai' });
  assert.equal(shouldCallAi(s), true);
  s = startGame(newSession(), { firstPlayer: 'user' });
  assert.equal(shouldCallAi(s), false); // 轮到玩家
});

test('pause 冻结：即便轮到 AI，shouldCallAi 也为假', () => {
  let s = startGame(newSession(), { firstPlayer: 'ai' });
  s = pause(s);
  assert.equal(s.state, 'paused');
  assert.equal(shouldCallAi(s), false);
});

test('resume 恢复到 playing', () => {
  let s = startGame(newSession(), { firstPlayer: 'ai' });
  s = resume(pause(s));
  assert.equal(s.state, 'playing');
  assert.equal(shouldCallAi(s), true);
});

test('pause 只能从 playing 触发', () => {
  assert.throws(() => pause(newSession()), /playing/i);
});

test('surrender：玩家认输 → ai_win、finished', () => {
  let s = startGame(newSession(), { firstPlayer: 'user' });
  s = surrender(s);
  assert.equal(s.game.status, 'ai_win');
  assert.equal(s.state, 'finished');
});

test('和棋：3×3 下满无连五 → draw、finished', () => {
  let s = startGame(newSession(), { firstPlayer: 'user', size: 3 });
  // 依次填满 3×3（顺序保证不会更早出现 3 子？3×3 连五不可能，必和）
  const cells = [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]];
  for (let i = 0; i < cells.length; i++) {
    const [r, c] = cells[i];
    s = (i % 2 === 0) ? applyUserMove(s, r, c) : applyAiMove(s, r, c);
  }
  assert.equal(s.game.status, 'draw');
  assert.equal(s.state, 'finished');
});

test('restoreSession: 进行中的存档恢复为 playing', () => {
  let s = startGame(newSession(), { firstPlayer: 'user' });
  s = applyUserMove(s, 7, 7);
  const restored = restoreSession(s.game);
  assert.equal(restored.state, 'playing');
  assert.equal(restored.game.turn, 'ai');
});

test('restoreSession: 已结束的存档恢复为 finished', () => {
  let s = surrender(startGame(newSession(), { firstPlayer: 'user' }));
  assert.equal(restoreSession(s.game).state, 'finished');
});
