// AI 回合编排：叫 AI → 解析 → 校验 → 落子；无效则纠正重试，超限判 AI 失败。
// 通过依赖注入接收 generate，便于测试；不直接依赖酒馆。
//
// generate: async ({ userInput, inject }) => string   返回 AI 回复文本
// 返回: { ok:true, session, reply } | { ok:false, reason:'ai_failed', session }

import { isLegalMove } from './board.js';
import { applyAiMove, shouldCallAi } from './session.js';
import { parseMove } from './parseMove.js';
import { buildAiPrompt, buildUserInput, buildCorrection } from './messages.js';

/** AI 回合开场时的可见输入：有玩家上一手就播报，否则提示 AI 先手。 */
function openingInput(game) {
  if (game.lastMove && game.lastMove.player === 'user') {
    return buildUserInput(game.lastMove);
  }
  return '新对局开始，你先手，请落子。';
}

export async function aiTakeTurn(session, { generate, maxRetries = 2 }) {
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
