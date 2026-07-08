// 会话状态机 + 对局逻辑（纯函数，不依赖酒馆）。
//
// session:  { state: 'idle'|'playing'|'paused'|'finished', game: Game|null }
// Game:     { gameId, status, board, turn, players:{black,white}, lastMove, startedAt, updatedAt }
//   status: 'playing'|'user_win'|'ai_win'|'draw'
//   turn:   'user'|'ai'（先手方=black）
//
// 所有转移函数都返回新的 session（不改动入参）。

import { createBoard, placeStone, checkWin, isBoardFull, BLACK, WHITE } from './board.js';

const now = () => Date.now();
const other = who => (who === 'user' ? 'ai' : 'user');

/** 某一方当前该落的棋子颜色。 */
function stoneOf(game, who) {
  return game.players.black === who ? BLACK : WHITE;
}

export function newSession() {
  return { state: 'idle', game: null };
}

/** 开新局。firstPlayer 执黑先手；size 仅用于测试，默认 15。 */
export function startGame(_session, { firstPlayer = 'user', size = 15 } = {}) {
  const black = firstPlayer;
  const white = other(firstPlayer);
  const game = {
    gameId: `gomoku-${now()}`,
    status: 'playing',
    board: createBoard(size),
    turn: firstPlayer,
    players: { black, white },
    lastMove: null,
    startedAt: now(),
    updatedAt: now(),
  };
  return { state: 'playing', game };
}

/** 内部：由某一方落子并结算。 */
function applyMove(session, who, row, col) {
  if (session.state !== 'playing') {
    throw new Error(`当前状态 ${session.state}，非 playing，不能落子`);
  }
  const game = session.game;
  if (game.turn !== who) {
    throw new Error(`还没轮到 ${who} 的回合`);
  }

  const stone = stoneOf(game, who);
  const board = placeStone(game.board, row, col, stone); // 非法落子会抛错

  const winLine = checkWin(board, row, col);
  let status = 'playing';
  let turn = other(who);
  if (winLine) {
    status = who === 'user' ? 'user_win' : 'ai_win';
    turn = game.turn;
  } else if (isBoardFull(board)) {
    status = 'draw';
    turn = game.turn;
  }

  const nextGame = {
    ...game,
    board,
    status,
    turn,
    lastMove: { player: who, stone, pos: [row, col] },
    updatedAt: now(),
  };
  const state = status === 'playing' ? 'playing' : 'finished';
  return { state, game: nextGame };
}

export function applyUserMove(session, row, col) {
  return applyMove(session, 'user', row, col);
}

export function applyAiMove(session, row, col) {
  return applyMove(session, 'ai', row, col);
}

export function pause(session) {
  if (session.state !== 'playing') {
    throw new Error(`只能从 playing 暂停，当前为 ${session.state}`);
  }
  return { ...session, state: 'paused' };
}

export function resume(session) {
  if (session.state !== 'paused') {
    throw new Error(`只能从 paused 恢复，当前为 ${session.state}`);
  }
  return { ...session, state: 'playing' };
}

/** 玩家认输 → AI 获胜。 */
export function surrender(session) {
  if (session.state !== 'playing' && session.state !== 'paused') {
    throw new Error(`当前状态 ${session.state} 无法认输`);
  }
  return {
    state: 'finished',
    game: { ...session.game, status: 'ai_win', updatedAt: now() },
  };
}

/** 是否允许此刻调用 AI：仅 playing 且轮到 AI。 */
export function shouldCallAi(session) {
  return session.state === 'playing' && !!session.game && session.game.turn === 'ai';
}

/** 从存档（Game）恢复出 session。 */
export function restoreSession(game) {
  return { state: game.status === 'playing' ? 'playing' : 'finished', game };
}
