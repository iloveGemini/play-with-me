import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, startGame, applyUserMove } from '../src/core/session.js';
import { saveGame, loadGame, clearGame, recordResult, loadStats } from '../src/core/storage.js';

/** 内存版 IO 适配器：模拟世界书条目的读写。 */
function memIO(initial = {}) {
  const store = { ...initial };
  return {
    store,
    read: async key => (key in store ? store[key] : null),
    write: async (key, value) => { store[key] = value; },
  };
}

function sampleGame() {
  let s = startGame(newSession(), { firstPlayer: 'user' });
  s = applyUserMove(s, 7, 7);
  return s.game;
}

test('saveGame → loadGame 往返一致', async () => {
  const io = memIO();
  const game = sampleGame();
  await saveGame(io, game);
  const loaded = await loadGame(io);
  assert.equal(loaded.status, game.status);
  assert.equal(loaded.turn, game.turn);
  assert.deepEqual(loaded.players, game.players);
  assert.equal(loaded.board[7][7], game.board[7][7]);
});

test('loadGame：无存档返回 null', async () => {
  assert.equal(await loadGame(memIO()), null);
});

test('loadGame：损坏 JSON 返回 null（不抛错）', async () => {
  const io = memIO({ save: '{不是合法json' });
  assert.equal(await loadGame(io), null);
});

test('loadGame：结构不合法返回 null', async () => {
  const io = memIO({ save: JSON.stringify({ foo: 'bar' }) });
  assert.equal(await loadGame(io), null);
});

test('clearGame 后 loadGame 返回 null', async () => {
  const io = memIO();
  await saveGame(io, sampleGame());
  await clearGame(io);
  assert.equal(await loadGame(io), null);
});

test('loadStats：空时返回默认零战绩', async () => {
  const stats = await loadStats(memIO());
  assert.deepEqual(stats.gomoku, { win: 0, loss: 0, draw: 0 });
});

test('recordResult：user_win→win+1, ai_win→loss+1, draw→draw+1', async () => {
  const io = memIO();
  await recordResult(io, 'user_win');
  await recordResult(io, 'ai_win');
  await recordResult(io, 'ai_win');
  await recordResult(io, 'draw');
  const stats = await loadStats(io);
  assert.deepEqual(stats.gomoku, { win: 1, loss: 2, draw: 1 });
});

test('recordResult：损坏的战绩数据视为零重新累计', async () => {
  const io = memIO({ stats: 'garbage' });
  await recordResult(io, 'user_win');
  assert.deepEqual((await loadStats(io)).gomoku, { win: 1, loss: 0, draw: 0 });
});
