// 酒馆适配器（薄）：把 storage/orchestrator 需要的 io 与 generate 接到 TavernHelper。
// 只能在 SillyTavern（TavernHelper 注入了全局函数）里真正运行。
//
// 依赖的 TavernHelper 全局：getWorldbookNames / createWorldbook / getWorldbook /
//   updateWorldbookWith / createWorldbookEntries / generate

import { SAVE_KEY, STATS_KEY } from '../core/storage.js';
import {
  GAME_WORLDBOOK, GAME_ENTRY, STATS_WORLDBOOK, STATS_ENTRY,
} from './config.js';

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
export const tavernIO = {
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
export async function tavernGenerate({ userInput, inject }) {
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
