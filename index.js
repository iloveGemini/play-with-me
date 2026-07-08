// SillyTavern 扩展入口。唯一直接依赖酒馆的文件：把酒馆能力接给多游戏框架。
import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { createGameHost } from './src/framework.js';
import { gomokuGame } from './src/gomoku/extension.js';

let host = null;

// ── 存储：localStorage（框架内部按游戏 id 命名空间隔离）──
const io = {
  read: async key => localStorage.getItem(key),
  write: async (key, value) => localStorage.setItem(key, value),
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
      <span>小游戏</span>
      <span class="gomoku-panel-close" title="关闭">✕</span>
    </div>
    <div class="gomoku-panel-body" id="game-host"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.gomoku-panel-close').addEventListener('click', () => togglePanel(false));
  bindPanelDrag(panel);
  return panel;
}

let panelMoved = false;

function togglePanel(force) {
  const panel = document.getElementById('gomoku-panel') || buildPanel();
  const show = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', show);
  if (show) { panelMoved = false; positionPanel(true); }
}

// 依据可见视口（visualViewport，排除键盘遮挡区）定位面板。
function positionPanel(center) {
  const panel = document.getElementById('gomoku-panel');
  if (!panel || !panel.classList.contains('open')) return;
  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;
  const offL = vv ? vv.offsetLeft : 0;
  const offT = vv ? vv.offsetTop : 0;

  panel.style.transform = 'none';
  panel.style.maxHeight = Math.round(vh * 0.92) + 'px';

  const rect = panel.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  let left, top;
  if (center || !panelMoved) {
    left = offL + (vw - w) / 2;
    top = offT + (vh - h) / 2;
  } else {
    left = parseFloat(panel.style.left) || 0;
    top = parseFloat(panel.style.top) || 0;
  }
  left = Math.max(offL + 4, Math.min(left, offL + vw - w - 4));
  top = Math.max(offT + 4, Math.min(top, offT + vh - h - 4));
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

function bindPanelDrag(panel) {
  const head = panel.querySelector('.gomoku-panel-head');
  let startX = 0, startY = 0, baseL = 0, baseT = 0, dragging = false;
  head.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('gomoku-panel-close')) return;
    dragging = true;
    panelMoved = true;
    const rect = panel.getBoundingClientRect();
    baseL = rect.left; baseT = rect.top;
    startX = e.clientX; startY = e.clientY;
    head.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  head.addEventListener('pointermove', e => {
    if (!dragging) return;
    panel.style.transform = 'none';
    panel.style.left = (baseL + e.clientX - startX) + 'px';
    panel.style.top = (baseT + e.clientY - startY) + 'px';
  });
  head.addEventListener('pointerup', e => {
    dragging = false;
    try { head.releasePointerCapture(e.pointerId); } catch {}
    positionPanel(false);
  });
}

// ── 魔法棒菜单入口 ──
function ensureWandButton() {
  if (document.getElementById('gomoku_wand_entry')) return;
  const target = document.getElementById('extensionsMenu');
  if (!target) return;
  const btn = document.createElement('div');
  btn.id = 'gomoku_wand_entry';
  btn.className = 'list_item list-group-item interactable flex-container flexGap5';
  btn.title = '小游戏';
  btn.innerHTML = `<i class="fa-solid fa-gamepad extensionsMenuExtensionButton"></i><span class="list_item_text">小游戏</span>`;
  btn.addEventListener('click', () => togglePanel(true));
  target.appendChild(btn);
}

// ── 酒馆事件接线 → 框架 ──
function bindTavernEvents() {
  eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, eventData => {
    const inj = host && host.getInjection();
    if (!inj || !Array.isArray(eventData.chat)) return;
    const depth = Number.isFinite(inj.depth) ? inj.depth : 1;
    const idx = Math.max(0, eventData.chat.length - depth);
    eventData.chat.splice(idx, 0, { role: inj.role || 'system', content: inj.content });
  });
  eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, eventData => {
    const inj = host && host.getInjection();
    if (!inj || typeof eventData.prompt !== 'string') return;
    eventData.prompt += '\n\n' + inj.content;
  });
  eventSource.on(event_types.MESSAGE_RECEIVED, id => {
    const msg = getContext().chat?.[id];
    if (!msg || msg.is_user) return;
    if (host) host.onMessage(String(msg.mes || ''));
  });
}

export function init() {
  bindTavernEvents();
  const panel = buildPanel();
  ensureWandButton();
  setInterval(ensureWandButton, 2000);

  // 键盘弹出/收起、视口变化时把面板夹回可见区
  const reflow = () => positionPanel(false);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', reflow);
    window.visualViewport.addEventListener('scroll', reflow);
  }
  window.addEventListener('resize', reflow);

  host = createGameHost({ container: panel.querySelector('#game-host'), io, hostServices: { fillInput } });
  host.registerGame(gomokuGame);
  host.init();

  try {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
      name: '小游戏',
      callback: () => { togglePanel(); return ''; },
      helpString: '打开/关闭小游戏面板',
    }));
  } catch (e) {
    console.warn('[Games] 注册斜杠命令失败:', e);
  }
  window.gomokuToggle = togglePanel;
}
