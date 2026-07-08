// 存储层：对局存档 + 战绩，读写通过注入的 io 适配器（酒馆世界书在薄适配器里接）。
//
// io: { read: async (key) => string|null, write: async (key, value:string) => void }
// 键：SAVE_KEY 存当前对局（单槽）；STATS_KEY 存跨局战绩（按游戏名命名空间）。

export const SAVE_KEY = 'save';
export const STATS_KEY = 'stats';
const GAME_KEY = 'gomoku';

const STATUSES = new Set(['playing', 'user_win', 'ai_win', 'draw']);
const TURNS = new Set(['user', 'ai']);

/** 宽松校验一个对局存档的结构；不合法返回 false。 */
function isValidGame(g) {
  return !!g
    && Array.isArray(g.board)
    && g.board.every(row => Array.isArray(row))
    && STATUSES.has(g.status)
    && TURNS.has(g.turn)
    && g.players && (g.players.black === 'user' || g.players.black === 'ai');
}

function safeParse(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveGame(io, game) {
  await io.write(SAVE_KEY, JSON.stringify(game));
}

export async function loadGame(io) {
  const game = safeParse(await io.read(SAVE_KEY));
  return isValidGame(game) ? game : null;
}

export async function clearGame(io) {
  await io.write(SAVE_KEY, '');
}

function zeroRecord() {
  return { win: 0, loss: 0, draw: 0 };
}

export async function loadStats(io) {
  const parsed = safeParse(await io.read(STATS_KEY)) || {};
  const rec = parsed[GAME_KEY] || {};
  return {
    [GAME_KEY]: {
      win: Number.isInteger(rec.win) ? rec.win : 0,
      loss: Number.isInteger(rec.loss) ? rec.loss : 0,
      draw: Number.isInteger(rec.draw) ? rec.draw : 0,
    },
  };
}

/** 依据对局结果累计战绩（玩家视角）。status ∈ user_win|ai_win|draw。 */
export async function recordResult(io, status) {
  const stats = await loadStats(io);
  const rec = stats[GAME_KEY];
  if (status === 'user_win') rec.win += 1;
  else if (status === 'ai_win') rec.loss += 1;
  else if (status === 'draw') rec.draw += 1;
  await io.write(STATS_KEY, JSON.stringify(stats));
}
