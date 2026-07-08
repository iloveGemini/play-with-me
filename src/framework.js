// 多游戏框架（不依赖酒馆，可预览）。
// 负责：游戏注册表、图标入口、进入/激活单个游戏、总开关、注入/消息路由与包裹、存储隔离、记忆。
//
// 游戏 descriptor：
//   { id, name, icon, defaultDepth=1, defaultRole='system',
//     mount(container, services) -> { getInjection(), onMessage(text), destroy() } }
//   services = { io }  // io 已按游戏 id 命名空间隔离
//   getInjection(): null | string | { content, depth?, role? }
//
// createGameHost 返回：{ registerGame, getInjection, onMessage, init }
//   getInjection(): null | { content, depth, role }   // content 已包裹 <plugin name="game">

const WRAP_NAME = 'game';
const K_ACTIVE = 'host:active';
const K_ENABLED = 'host:enabled';

function scopedIo(io, gameId) {
  const p = `game:${gameId}:`;
  return {
    read: key => io.read(p + key),
    write: (key, value) => io.write(p + key, value),
  };
}

export function createGameHost({ container, io, hostServices = {} }) {
  const games = [];
  let activeId = null;
  let enabled = true;
  let instance = null;   // 当前游戏实例
  let view = 'grid';     // 'grid' | 'game'

  // ── DOM 骨架 ──
  const root = document.createElement('div');
  root.className = 'gh';
  root.innerHTML = `
    <div class="gh-bar">
      <button class="gh-home" title="返回游戏列表">← 返回</button>
      <span class="gh-title">小游戏</span>
      <label class="gh-toggle" title="总开关：关掉则不注入、不处理 AI 消息">
        <input type="checkbox" class="gh-enabled"> 启用
      </label>
    </div>
    <div class="gh-body"></div>`;
  container.replaceChildren(root);
  const barTitle = root.querySelector('.gh-title');
  const homeBtn = root.querySelector('.gh-home');
  const enabledBox = root.querySelector('.gh-enabled');
  const body = root.querySelector('.gh-body');

  homeBtn.addEventListener('click', () => showGrid());
  enabledBox.addEventListener('change', async () => {
    enabled = enabledBox.checked;
    await io.write(K_ENABLED, enabled ? '1' : '0');
  });

  function renderBar() {
    homeBtn.style.visibility = view === 'game' ? 'visible' : 'hidden';
    const g = games.find(x => x.id === activeId);
    barTitle.textContent = view === 'game' && g ? g.name : '小游戏';
    enabledBox.checked = enabled;
  }

  function showGrid() {
    view = 'grid';
    renderBar();
    const grid = document.createElement('div');
    grid.className = 'gh-grid';
    for (const g of games) {
      const tile = document.createElement('button');
      tile.className = 'gh-tile';
      tile.innerHTML = `<span class="gh-tile-icon">${g.icon || '🎮'}</span><span class="gh-tile-name">${g.name}</span>`;
      tile.addEventListener('click', () => enterGame(g.id));
      grid.appendChild(tile);
    }
    body.replaceChildren(grid);
  }

  async function enterGame(id) {
    const g = games.find(x => x.id === id);
    if (!g) return;
    if (instance) { try { instance.destroy?.(); } catch {} instance = null; }
    activeId = id;
    await io.write(K_ACTIVE, id);
    view = 'game';
    renderBar();
    const mountEl = document.createElement('div');
    mountEl.className = 'gh-mount';
    body.replaceChildren(mountEl);
    instance = g.mount(mountEl, { ...hostServices, io: scopedIo(io, id) });
  }

  return {
    registerGame(desc) { games.push(desc); },

    getInjection() {
      if (!enabled || !instance || !instance.getInjection) return null;
      const raw = instance.getInjection();
      if (!raw) return null;
      const g = games.find(x => x.id === activeId) || {};
      const obj = typeof raw === 'string' ? { content: raw } : raw;
      const content = `<plugin name="${WRAP_NAME}">\n${obj.content}\n</plugin>`;
      return {
        content,
        depth: obj.depth ?? g.defaultDepth ?? 1,
        role: obj.role ?? g.defaultRole ?? 'system',
      };
    },

    onMessage(text) {
      if (!enabled || !instance || !instance.onMessage) return;
      instance.onMessage(text);
    },

    getActiveInstance() {
      return instance;
    },

    async init() {
      const savedEnabled = await io.read(K_ENABLED);
      enabled = savedEnabled === null ? true : savedEnabled === '1';
      const savedActive = await io.read(K_ACTIVE);
      renderBar();
      if (savedActive && games.some(g => g.id === savedActive)) {
        await enterGame(savedActive); // 记住上次进的游戏，打开即恢复
      } else {
        showGrid();
      }
    },
  };
}
