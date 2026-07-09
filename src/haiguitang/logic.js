// 海龟汤纯逻辑（不依赖酒馆/DOM）。

export const SOLVED_TAG = '【破案】';

/** 生成注入给 AI 的主持人提示：汤面 + 汤底(保密) + 规则。 */
export function buildHostPrompt(puzzle) {
  return [
    '你正在主持一局"海龟汤"（情境推理游戏），你是主持人，玩家来猜谜。请始终保持这个身份。',
    `【汤面】（玩家已知）：${puzzle.title}`,
    `【汤底】（只有你知道，绝对不能主动说出，除非玩家明确说"看答案/公布汤底"）：${puzzle.answer}`,
    '规则：',
    '- 玩家只会问能用"是/不是/无关"回答的是非题。你的回答以"是。""不是。""无关。"之一开头，可再补一句简短、俏皮的点评或引导，但不要剧透。',
    '- 玩家问得跑偏时回"无关。"；逐渐逼近真相时可以给点鼓励。',
    `- 当玩家已经把汤底的关键情节基本还原出来时，在回复里带上标记 ${SOLVED_TAG}，然后揭晓完整汤底并道贺。`,
    '- 保持简短，不要长篇大论，也不要一次问答就把谜底送出去。',
  ].join('\n');
}

/** AI 回复是否宣布破案。 */
export function isSolvedMarker(text) {
  return String(text).includes(SOLVED_TAG);
}

/** 从题库随机抽一题；多题时避免与 currentId 相同。 */
export function pickNextPuzzle(puzzles, currentId) {
  const pool = puzzles.length > 1 ? puzzles.filter(p => p.id !== currentId) : puzzles;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 按 id 找题。 */
export function findPuzzle(puzzles, id) {
  return puzzles.find(p => p.id === id) || null;
}
