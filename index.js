// SillyTavern 扩展入口。唯一直接依赖酒馆的文件：把酒馆能力包成 ctx 交给游戏逻辑。
import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { mountGame } from './src/gomoku/extension.js';

let injectionProvider = null;   // () => string|null，生成前调用取要注入的提示词
let messageCb = null;           // AI 消息到达回调

// ── 存储：localStorage ──
const io = {
  read: async key => localStorage.getItem('gomoku:' + key),
  write: async (key, value) => localStorage.setItem('gomoku:' + key, value),
};

// ── 填入输入框（不自动发送）──
function fillInput(text) {
  const ta = document.getElementById('send_textarea');
  if (!ta) return;
  ta.value = text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
}

// ── 浮动面板 ──
function buildPanel() {
  document.getElementById('gomoku-panel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'gomoku-panel';
  panel.innerHTML = `
    <div class="gomoku-panel-head">
      <span>五子棋</span>
      <span class="gomoku-panel-close" title="关闭">✕</span>
    </div>
    <div class="gomoku-panel-body" id="gomoku-mount"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.gomoku-panel-close').addEventListener('click', () => togglePanel(false));
  return panel;
}

function togglePanel(force) {
  const panel = document.getElementById('gomoku-panel') || buildPanel();
  const show = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', show);
}

// ── 魔法棒菜单入口 ──
function ensureWandButton() {
  if (document.getElementById('gomoku_wand_entry')) return;
  const target = document.getElementById('extensionsMenu');
  if (!target) return;
  const btn = document.createElement('div');
  btn.id = 'gomoku_wand_entry';
  btn.className = 'list_item list-group-item interactable flex-container flexGap5';
  btn.title = '五子棋';
  btn.innerHTML = `<i class="fa-solid fa-chess-board extensionsMenuExtensionButton"></i><span class="list_item_text">五子棋</span>`;
  btn.addEventListener('click', () => togglePanel(true));
  target.appendChild(btn);
}

// ── 酒馆事件接线 ──
function bindTavernEvents() {
  // 生成前注入当前棋盘（Chat Completion）
  eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, eventData => {
    const text = injectionProvider && injectionProvider();
    if (!text || !Array.isArray(eventData.chat)) return;
    const idx = Math.max(0, eventData.chat.length - 1); // 插在最后一条消息之前
    eventData.chat.splice(idx, 0, { role: 'system', content: text });
  });
  // 生成前注入（Text Completion）
  eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData => {
    const text = injectionProvider && injectionProvider();
    if (!text || typeof eventData.prompt !== 'string') return;
    eventData.prompt += '\n\n' + text;
  });
  // AI 消息到达 → 解析落子
  eventSource.on(event_types.MESSAGE_RECEIVED, id => {
    const msg = getContext().chat?.[id];
    if (!msg || msg.is_user) return;
    if (messageCb) messageCb(String(msg.mes || ''));
  });
}

export function init() {
  bindTavernEvents();
  const panel = buildPanel();
  ensureWandButton();
  // 菜单可能异步渲染，轮询补挂入口
  setInterval(ensureWandButton, 2000);

  const ctx = {
    container: panel.querySelector('#gomoku-mount'),
    io,
    fillInput,
    registerInjection: provider => { injectionProvider = provider; },
    onMessageReceived: cb => { messageCb = cb; },
  };
  mountGame(ctx);

  // 备用入口：斜杠命令 /五子棋
  try {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
      name: '五子棋',
      callback: () => { togglePanel(); return ''; },
      helpString: '打开/关闭五子棋面板',
    }));
  } catch (e) {
    console.warn('[Gomoku] 注册斜杠命令失败:', e);
  }
  window.gomokuToggle = togglePanel; // F12 兜底
}
