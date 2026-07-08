// ===== src/core/board.js =====
// 五子棋棋盘核心逻辑（纯函数，不依赖酒馆）。
// 约定：内部一律 0-indexed，board[row][col]，row/col ∈ [0, 14]。
// 单元格取值：0=空 1=黑 2=白。1–15 的坐标只出现在 ASCII 展示与 AI 消息层。

const SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

/** 生成 size×size 的全空棋盘。 */
function createBoard(size = SIZE) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => EMPTY));
}

/** 坐标是否在盘内。 */
function inBounds(board, row, col) {
  return row >= 0 && row < board.length && col >= 0 && col < board.length;
}

/** (row, col) 是否为合法落子点：在盘内且为空。 */
function isLegalMove(board, row, col) {
  return inBounds(board, row, col) && board[row][col] === EMPTY;
}

/** 落子，返回新棋盘（不改动原棋盘）；非法落子抛错。 */
function placeStone(board, row, col, stone) {
  if (!isLegalMove(board, row, col)) {
    throw new Error(`非法落子 (${row}, ${col})`);
  }
  const next = board.map(r => r.slice());
  next[row][col] = stone;
  return next;
}

// 连五检测的四个方向：横、竖、↘、↙。
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * 判断刚落在 (row, col) 的子是否连成五子（或以上，长连也算）。
 * @returns 获胜时返回连珠坐标数组 `[[r,c], ...]`（长度 ≥ 5）；否则返回 null。
 */
function checkWin(board, row, col) {
  const stone = board[row][col];
  if (stone === EMPTY) return null;

  for (const [dr, dc] of DIRECTIONS) {
    const line = [[row, col]];
    // 正向延伸
    for (let r = row + dr, c = col + dc; inBounds(board, r, c) && board[r][c] === stone; r += dr, c += dc) {
      line.push([r, c]);
    }
    // 反向延伸
    for (let r = row - dr, c = col - dc; inBounds(board, r, c) && board[r][c] === stone; r -= dr, c -= dc) {
      line.unshift([r, c]);
    }
    if (line.length >= 5) return line;
  }
  return null;
}

/** 棋盘是否已下满（无空位）。 */
function isBoardFull(board) {
  return board.every(row => row.every(cell => cell !== EMPTY));
}


// ===== src/core/parseMove.js =====
// 从 AI 回复文本中解析落子标记 <move>行,列</move>。
// AI 使用 1–15 的坐标；解析后转为内部 0-indexed。
// 返回：{ ok:true, row, col } | { ok:false, reason: 'missing'|'malformed'|'out_of_range' }



const MOVE_TAG = /<move>([\s\S]*?)<\/move>/gi;

function parseMove(text) {
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


// ===== src/core/renderAscii.js =====
// 把 board 渲染成给 AI 看的 ASCII 棋盘图。
// 内部 0-indexed；展示层用 1–15 的行列号。
// lastMove（可选）：{ stone, pos:[row,col] }，把最新一手标为带点变体字。



// 图例由消息构造层按需拼在棋盘前；renderAscii 只产出纯网格，避免字形污染。
const LEGEND = '棋盘  ·=空  ●=黑  ○=白   ◎=白方最新一手  ◉=黑方最新一手';

function glyph(cell, isLast) {
  if (cell === EMPTY) return '·';
  if (cell === BLACK) return isLast ? '◉' : '●';
  return isLast ? '◎' : '○';
}

const pad2 = n => String(n).padStart(2, ' ');

function renderAscii(board, lastMove = null) {
  const size = board.length;
  const lastPos = lastMove && lastMove.pos ? lastMove.pos : null;

  const header = '   ' + Array.from({ length: size }, (_, i) => pad2(i + 1)).join(' ');

  const rows = board.map((row, r) => {
    const cells = row.map((cell, c) => {
      const isLast = lastPos && lastPos[0] === r && lastPos[1] === c;
      return ' ' + glyph(cell, isLast);
    });
    return pad2(r + 1) + cells.join('');
  });

  return [header, ...rows].join('\n');
}


// ===== src/core/session.js =====
// 会话状态机 + 对局逻辑（纯函数，不依赖酒馆）。
//
// session:  { state: 'idle'|'playing'|'paused'|'finished', game: Game|null }
// Game:     { gameId, status, board, turn, players:{black,white}, lastMove, startedAt, updatedAt }
//   status: 'playing'|'user_win'|'ai_win'|'draw'
//   turn:   'user'|'ai'（先手方=black）
//
// 所有转移函数都返回新的 session（不改动入参）。



const now = () => Date.now();
const other = who => (who === 'user' ? 'ai' : 'user');

/** 某一方当前该落的棋子颜色。 */
function stoneOf(game, who) {
  return game.players.black === who ? BLACK : WHITE;
}

function newSession() {
  return { state: 'idle', game: null };
}

/** 开新局。firstPlayer 执黑先手；size 仅用于测试，默认 15。 */
function startGame(_session, { firstPlayer = 'user', size = 15 } = {}) {
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

function applyUserMove(session, row, col) {
  return applyMove(session, 'user', row, col);
}

function applyAiMove(session, row, col) {
  return applyMove(session, 'ai', row, col);
}

function pause(session) {
  if (session.state !== 'playing') {
    throw new Error(`只能从 playing 暂停，当前为 ${session.state}`);
  }
  return { ...session, state: 'paused' };
}

function resume(session) {
  if (session.state !== 'paused') {
    throw new Error(`只能从 paused 恢复，当前为 ${session.state}`);
  }
  return { ...session, state: 'playing' };
}

/** 玩家认输 → AI 获胜。 */
function surrender(session) {
  if (session.state !== 'playing' && session.state !== 'paused') {
    throw new Error(`当前状态 ${session.state} 无法认输`);
  }
  return {
    state: 'finished',
    game: { ...session.game, status: 'ai_win', updatedAt: now() },
  };
}

/** 是否允许此刻调用 AI：仅 playing 且轮到 AI。 */
function shouldCallAi(session) {
  return session.state === 'playing' && !!session.game && session.game.turn === 'ai';
}

/** 从存档（Game）恢复出 session。 */
function restoreSession(game) {
  return { state: game.status === 'playing' ? 'playing' : 'finished', game };
}


// ===== src/core/messages.js =====
// 构造发给 AI 的提示 / 可见消息 / 纠正消息（纯函数）。
// 内部坐标 0-indexed；面向 AI 与玩家的文本一律显示 1-based。




const disp = ([r, c]) => `(${r + 1},${c + 1})`; // 0-based → 1-based 显示

/** AI 这一方的颜色描述。 */
function aiColor(game) {
  return game.players.black === 'ai'
    ? { name: '黑', glyph: '●' }
    : { name: '白', glyph: '○' };
}

/** 玩家点击后发出的可见短消息（不含棋盘，避免刷屏）。 */
function buildUserInput(lastMove) {
  return `我落子 ${disp(lastMove.pos)}`;
}

/**
 * 注入给 AI 的提示：图例 + 棋盘图 + 对方最新一手 + 落子指令。
 * 通过 generate 的 injects 送达，不落成楼层。
 */
function buildAiPrompt(game) {
  const ai = aiColor(game);
  const board = renderAscii(game.board, game.lastMove);

  let oppLine = '';
  if (game.lastMove && game.lastMove.player !== 'ai') {
    oppLine = `\n玩家刚落子：${disp(game.lastMove.pos)}`;
  }

  return [
    '你正在和玩家下五子棋，你是对手。',
    LEGEND,
    board,
    oppLine.trim(),
    `轮到你（你执${ai.name}，${ai.glyph}）。先自由说一句，然后必须用 <move>行,列</move> 给出落子，行列均为 1–15。`,
  ].filter(Boolean).join('\n');
}

/** 落子无效时的纠正消息，供有限次重试。 */
function buildCorrection(reason) {
  const tail = '请重新用 <move>行,列</move> 给出落子，行列均为 1–15。';
  switch (reason) {
    case 'missing':
      return `没有读到你的落子。${tail}`;
    case 'malformed':
      return `落子格式无法解析。${tail}`;
    case 'out_of_range':
      return `坐标超出棋盘范围（应在 1–15）。${tail}`;
    case 'illegal':
      return `那个位置已经有子或不可落。${tail}`;
    default:
      return `落子无效。${tail}`;
  }
}


// ===== src/core/orchestrator.js =====
// AI 回合编排：叫 AI → 解析 → 校验 → 落子；无效则纠正重试，超限判 AI 失败。
// 通过依赖注入接收 generate，便于测试；不直接依赖酒馆。
//
// generate: async ({ userInput, inject }) => string   返回 AI 回复文本
// 返回: { ok:true, session, reply } | { ok:false, reason:'ai_failed', session }






/** AI 回合开场时的可见输入：有玩家上一手就播报，否则提示 AI 先手。 */
function openingInput(game) {
  if (game.lastMove && game.lastMove.player === 'user') {
    return buildUserInput(game.lastMove);
  }
  return '新对局开始，你先手，请落子。';
}

async function aiTakeTurn(session, { generate, maxRetries = 2 }) {
  if (!shouldCallAi(session)) {
    throw new Error('当前不是 AI 回合或不处于可对局状态');
  }

  let userInput = openingInput(session.game);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const inject = buildAiPrompt(session.game);
    const reply = await generate({ userInput, inject });

    const parsed = parseMove(reply);
    if (parsed.ok && isLegalMove(session.game.board, parsed.row, parsed.col)) {
      const next = applyAiMove(session, parsed.row, parsed.col);
      return { ok: true, session: next, reply };
    }

    const reason = parsed.ok ? 'illegal' : parsed.reason;
    userInput = buildCorrection(reason);
  }

  return { ok: false, reason: 'ai_failed', session };
}


// ===== src/core/storage.js =====
// 存储层：对局存档 + 战绩，读写通过注入的 io 适配器（酒馆世界书在薄适配器里接）。
//
// io: { read: async (key) => string|null, write: async (key, value:string) => void }
// 键：SAVE_KEY 存当前对局（单槽）；STATS_KEY 存跨局战绩（按游戏名命名空间）。

const SAVE_KEY = 'save';
const STATS_KEY = 'stats';
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

async function saveGame(io, game) {
  await io.write(SAVE_KEY, JSON.stringify(game));
}

async function loadGame(io) {
  const game = safeParse(await io.read(SAVE_KEY));
  return isValidGame(game) ? game : null;
}

async function clearGame(io) {
  await io.write(SAVE_KEY, '');
}

function zeroRecord() {
  return { win: 0, loss: 0, draw: 0 };
}

async function loadStats(io) {
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
async function recordResult(io, status) {
  const stats = await loadStats(io);
  const rec = stats[GAME_KEY];
  if (status === 'user_win') rec.win += 1;
  else if (status === 'ai_win') rec.loss += 1;
  else if (status === 'draw') rec.draw += 1;
  await io.write(STATS_KEY, JSON.stringify(stats));
}


// ===== src/adapters/config.js =====
// 世界书 / 条目命名。想改名字只动这里。
// 存档与战绩分属不同世界书：对局存在「五子棋」，战绩汇总在「游戏总战绩」。
// 战绩按游戏各占一个条目，避免以后加新游戏时互相覆盖。

const GAME_WORLDBOOK = '五子棋';
const GAME_ENTRY = '当前对局';

const STATS_WORLDBOOK = '游戏总战绩';
const STATS_ENTRY = 'gomoku';


// ===== src/adapters/tavern.js =====
// 酒馆适配器（薄）：把 storage/orchestrator 需要的 io 与 generate 接到 TavernHelper。
// 只能在 SillyTavern（TavernHelper 注入了全局函数）里真正运行。
//
// 依赖的 TavernHelper 全局：getWorldbookNames / createWorldbook / getWorldbook /
//   updateWorldbookWith / createWorldbookEntries / generate




const g = globalThis;

/** storage 的逻辑键 → 具体（世界书, 条目）。 */
function locate(key) {
  if (key === SAVE_KEY) return { book: GAME_WORLDBOOK, entry: GAME_ENTRY };
  if (key === STATS_KEY) return { book: STATS_WORLDBOOK, entry: STATS_ENTRY };
  throw new Error(`未知存储键: ${key}`);
}

/** 世界书不存在则创建空的（不覆盖已存在的）。 */
async function ensureWorldbook(name) {
  const names = await g.getWorldbookNames();
  if (!names.includes(name)) {
    await g.createWorldbook(name);
  }
}

async function readEntryContent(book, entryName) {
  await ensureWorldbook(book);
  const entries = await g.getWorldbook(book);
  const found = entries.find(e => e.name === entryName);
  return found ? found.content : null;
}

async function writeEntryContent(book, entryName, content) {
  await ensureWorldbook(book);
  const entries = await g.getWorldbook(book);
  const exists = entries.some(e => e.name === entryName);
  if (exists) {
    await g.updateWorldbookWith(book, wb =>
      wb.map(e => (e.name === entryName ? { ...e, content } : e)),
    );
  } else {
    // 纯数据条目：禁用，绝不注入 AI 上下文。
    await g.createWorldbookEntries(book, [{ name: entryName, content, enabled: false }]);
  }
}

/** 供 storage.js 使用的 io 适配器。 */
const tavernIO = {
  read: async key => {
    const { book, entry } = locate(key);
    return readEntryContent(book, entry);
  },
  write: async (key, value) => {
    const { book, entry } = locate(key);
    await writeEntryContent(book, entry, value);
  },
};

/**
 * 供 orchestrator.js 使用的 generate 适配器（交互 A）：
 * user_input 落成可见楼层；棋盘图通过 injects 注入，不落楼层。
 */
async function tavernGenerate({ userInput, inject }) {
  return g.generate({
    user_input: userInput,
    injects: [{
      role: 'system',
      content: inject,
      position: 'in_chat',
      depth: 0,
      should_scan: false,
    }],
  });
}


// ===== src/gomoku/ui.js =====
// 五子棋图形界面 + 流程编排。把核心模块接到 DOM。
// mountGomoku(container, { io, generate })：deps 注入，便于本地预览用假实现。






const STYLE = `
.gmk { font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #2b2b2b; }
.gmk-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.gmk-title { font-weight:700; font-size:18px; }
.gmk-stats { font-size:13px; color:#555; }
.gmk-board { position:relative; background:#e3b96b; border:2px solid #7a5320; border-radius:6px;
  display:grid; grid-template-columns:repeat(${SIZE}, 1fr); gap:0; aspect-ratio:1/1; }
.gmk-cell { position:relative; border:0.5px solid #b98a3e; cursor:pointer; }
.gmk-cell:hover::after { content:''; position:absolute; inset:18%; border-radius:50%;
  background:rgba(0,0,0,0.08); }
.gmk-stone { position:absolute; inset:10%; border-radius:50%; }
.gmk-black { background:radial-gradient(circle at 35% 30%, #6b6b6b, #050505); }
.gmk-white { background:radial-gradient(circle at 35% 30%, #ffffff, #c4c4c4); border:0.5px solid #999; }
.gmk-last { box-shadow:0 0 0 2px #d63b3b, 0 0 4px 1px rgba(214,59,59,.6); }
.gmk-status { text-align:center; margin:10px 0; min-height:22px; font-size:14px; }
.gmk-controls { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.gmk-controls button { padding:6px 14px; border:1px solid #7a5320; background:#f6e7c8;
  border-radius:6px; cursor:pointer; font-size:14px; }
.gmk-controls button:disabled { opacity:.4; cursor:not-allowed; }
.gmk-thinking { color:#8a6d1f; }
`;

function mountGomoku(container, { io, generate, maxRetries = 2 } = {}) {
  let session = newSession();
  let stats = { gomoku: { win: 0, loss: 0, draw: 0 } };
  let busy = false;      // AI 思考中锁盘
  let choosing = false;  // 正在选先手

  // ---- DOM 骨架 ----
  const style = document.createElement('style');
  style.textContent = STYLE;
  const root = document.createElement('div');
  root.className = 'gmk';
  root.innerHTML = `
    <div class="gmk-top">
      <span class="gmk-title">五子棋 · 对战 AI</span>
      <span class="gmk-stats"></span>
    </div>
    <div class="gmk-board"></div>
    <div class="gmk-status"></div>
    <div class="gmk-controls"></div>`;
  container.replaceChildren(style, root);

  const boardEl = root.querySelector('.gmk-board');
  const statsEl = root.querySelector('.gmk-stats');
  const statusEl = root.querySelector('.gmk-status');
  const controlsEl = root.querySelector('.gmk-controls');

  // 预建格子
  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'gmk-cell';
      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }

  // ---- 渲染 ----
  function render() {
    const game = session.game;
    // 棋子
    const last = game && game.lastMove ? game.lastMove.pos : null;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = cells[r * SIZE + c];
        const v = game ? game.board[r][c] : 0;
        if (!v) { cell.replaceChildren(); continue; }
        const stone = document.createElement('div');
        stone.className = 'gmk-stone ' + (v === BLACK ? 'gmk-black' : 'gmk-white');
        if (last && last[0] === r && last[1] === c) stone.classList.add('gmk-last');
        cell.replaceChildren(stone);
      }
    }
    statsEl.textContent = `胜 ${stats.gomoku.win} · 负 ${stats.gomoku.loss} · 和 ${stats.gomoku.draw}`;
    statusEl.innerHTML = statusText();
    renderControls();
  }

  function statusText() {
    if (busy) return '<span class="gmk-thinking">AI 思考中…</span>';
    if (choosing) return '谁先手？（先手执黑）';
    if (!session.game) return '点击「开始」新对局';
    switch (session.game.status) {
      case 'user_win': return '🎉 你赢了！';
      case 'ai_win': return session.state === 'finished' ? '😈 AI 赢了' : '';
      case 'draw': return '🤝 和棋';
      default:
        if (session.state === 'paused') return '⏸ 已暂停';
        return session.game.turn === 'user' ? '轮到你落子' : '轮到 AI';
    }
  }

  function btn(label, onClick, disabled = false) {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderControls() {
    const c = [];
    if (choosing) {
      c.push(btn('我先手', () => startNew('user')));
      c.push(btn('AI 先手', () => startNew('ai')));
      c.push(btn('取消', () => { choosing = false; render(); }));
    } else if (session.state === 'idle' || session.state === 'finished') {
      c.push(btn('开始', () => { choosing = true; render(); }));
    } else {
      const playing = session.state === 'playing';
      c.push(btn('暂停', doPause, !playing || busy));
      c.push(btn('继续', doResume, session.state !== 'paused' || busy));
      c.push(btn('认输', doSurrender, busy));
    }
    controlsEl.replaceChildren(...c);
  }

  // ---- 流程 ----
  async function startNew(firstPlayer) {
    choosing = false;
    session = startGame(session, { firstPlayer });
    await saveGame(io, session.game);
    render();
    if (shouldCallAi(session)) await runAiTurn();
  }

  async function onCellClick(r, c) {
    if (busy || session.state !== 'playing') return;
    if (session.game.turn !== 'user') return;
    if (!isLegalMove(session.game.board, r, c)) return;
    session = applyUserMove(session, r, c);
    await saveGame(io, session.game);
    render();
    if (session.state === 'finished') return finish();
    await runAiTurn();
  }

  async function runAiTurn() {
    busy = true; render();
    let result;
    try {
      result = await aiTakeTurn(session, { generate, maxRetries });
    } catch (e) {
      busy = false; statusEl.textContent = 'AI 调用出错：' + e.message; return;
    }
    busy = false;
    if (result.ok) {
      session = result.session;
      await saveGame(io, session.game);
      render();
      if (session.state === 'finished') return finish();
    } else {
      render();
      showAiFailed();
    }
  }

  function showAiFailed() {
    statusEl.textContent = 'AI 连续给出无效落子。';
    controlsEl.replaceChildren(
      btn('判 AI 负', async () => {
        session = { state: 'finished', game: { ...session.game, status: 'user_win' } };
        await saveGame(io, session.game); await finish();
      }),
      btn('再试一次', runAiTurn),
    );
  }

  async function finish() {
    if (session.game.status !== 'playing') {
      await recordResult(io, session.game.status);
      stats = await loadStats(io);
      await clearGame(io); // 清空存档槽
    }
    render();
  }

  async function doPause() { session = pause(session); await saveGame(io, session.game); render(); }
  async function doResume() { session = resume(session); render(); if (shouldCallAi(session)) await runAiTurn(); }
  async function doSurrender() { session = surrender(session); await saveGame(io, session.game); await finish(); }

  // ---- 初始化：读战绩 + 尝试续玩 ----
  (async () => {
    stats = await loadStats(io);
    const saved = await loadGame(io);
    if (saved) {
      session = restoreSession(saved);
    }
    render();
    if (shouldCallAi(session)) await runAiTurn();
  })();

  return { getSession: () => session };
}


// ===== mount =====
mountGomoku(document.getElementById('gomoku-root'), { io: tavernIO, generate: tavernGenerate });