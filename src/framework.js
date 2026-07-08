// Multi-game host. Keeps SillyTavern-specific wiring out of individual games.
//
// Game descriptor:
// {
//   id, name, icon, defaultDepth = 1, defaultRole = 'system',
//   mount(container, services) -> { getInjection(), onMessage(text), destroy() }
// }
//
// getInjection(): null | string | { content, depth?, role? }

const WRAP_NAME = 'game';
const K_ACTIVE = 'host:active';
const K_ENABLED = 'host:enabled';
const K_DEPTH = 'host:depth';

function normalizeDepth(value, fallback = 1) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(99, Math.trunc(n)));
}

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
  let depth = 1;
  let instance = null;
  let view = 'grid';

  const root = document.createElement('div');
  root.className = 'gh';
  root.innerHTML = `
    <div class="gh-bar">
      <button class="gh-home" title="返回游戏列表">← 返回</button>
      <span class="gh-title">小游戏</span>
      <div class="gh-actions">
        <label class="gh-depth" title="注入深度：0=最贴近最新消息，数值越大越往上">
          深度 <input type="number" class="gh-depth-input" min="0" max="99" step="1">
        </label>
        <label class="gh-toggle" title="总开关：关掉则不注入、不处理 AI 消息">
          <input type="checkbox" class="gh-enabled"> 启用
        </label>
      </div>
    </div>
    <div class="gh-body"></div>`;
  container.replaceChildren(root);

  const barTitle = root.querySelector('.gh-title');
  const homeBtn = root.querySelector('.gh-home');
  const enabledBox = root.querySelector('.gh-enabled');
  const depthWrap = root.querySelector('.gh-depth');
  const depthInput = root.querySelector('.gh-depth-input');
  const body = root.querySelector('.gh-body');

  homeBtn.addEventListener('click', () => showGrid());
  enabledBox.addEventListener('change', async () => {
    enabled = enabledBox.checked;
    await io.write(K_ENABLED, enabled ? '1' : '0');
  });
  depthInput.addEventListener('change', async () => {
    depth = normalizeDepth(depthInput.value, depth);
    depthInput.value = String(depth);
    await io.write(K_DEPTH, String(depth));
  });

  function renderBar() {
    const game = games.find(x => x.id === activeId);
    homeBtn.style.visibility = view === 'game' ? 'visible' : 'hidden';
    barTitle.textContent = view === 'game' && game ? game.name : '小游戏';
    enabledBox.checked = enabled;
    depthWrap.style.visibility = view === 'game' && game ? 'visible' : 'hidden';
    depthInput.value = String(depth);
  }

  function showGrid() {
    view = 'grid';
    renderBar();
    const grid = document.createElement('div');
    grid.className = 'gh-grid';
    for (const game of games) {
      const tile = document.createElement('button');
      tile.className = 'gh-tile';
      tile.innerHTML = `<span class="gh-tile-icon">${game.icon || '🎮'}</span><span class="gh-tile-name">${game.name}</span>`;
      tile.addEventListener('click', () => enterGame(game.id));
      grid.appendChild(tile);
    }
    body.replaceChildren(grid);
  }

  async function enterGame(id) {
    const game = games.find(x => x.id === id);
    if (!game) return;
    if (instance) {
      try { instance.destroy?.(); } catch {}
      instance = null;
    }
    activeId = id;
    await io.write(K_ACTIVE, id);
    view = 'game';
    renderBar();
    const mountEl = document.createElement('div');
    mountEl.className = 'gh-mount';
    body.replaceChildren(mountEl);
    instance = game.mount(mountEl, { ...hostServices, io: scopedIo(io, id) });
  }

  return {
    registerGame(desc) {
      games.push(desc);
    },

    getInjection() {
      if (!enabled || !instance || !instance.getInjection) return null;
      const raw = instance.getInjection();
      if (!raw) return null;
      const game = games.find(x => x.id === activeId) || {};
      const obj = typeof raw === 'string' ? { content: raw } : raw;
      const content = `<plugin name="${WRAP_NAME}">\n${obj.content}\n</plugin>`;
      return {
        content,
        depth: normalizeDepth(obj.depth, depth),
        role: obj.role ?? game.defaultRole ?? 'system',
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
      const defaultDepth = games[0]?.defaultDepth ?? 1;
      depth = normalizeDepth(await io.read(K_DEPTH), normalizeDepth(defaultDepth, 1));

      const savedActive = await io.read(K_ACTIVE);
      renderBar();
      if (savedActive && games.some(game => game.id === savedActive)) {
        await enterGame(savedActive);
      } else {
        showGrid();
      }
    },
  };
}
