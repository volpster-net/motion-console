/**
 * The launcher's menu screen: a tile per game, and a crosshair per player.
 *
 * Picking works like pointing a Wii Remote at a menu: each frame, we work out
 * which tile (if any) sits under each player's crosshair and highlight it.
 * When a player pulls the trigger, the tile under their crosshair starts.
 */
import {
  createAimDebugPanel,
  createAimTracker,
  loadAimSettings,
  toPixels,
} from '../../aim/index.js';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';

const CROSSHAIR_SVG = `
  <svg viewBox="-24 -24 48 48" aria-hidden="true">
    <circle r="12" />
    <path d="M0 -22v10M0 12v10M-22 0h10M12 0h10" />
    <circle class="launcher-dot" r="2" />
  </svg>`;

/** @param {string} text */
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * @param {{
 *   root: HTMLElement,
 *   api: import('../../console/channel-host.js').ChannelApi,
 *   games: import('../../games/game.js').GameMeta[],
 *   onPick: (id: string) => void,
 * }} options
 */
export function createMenu({ root, api, games, onPick }) {
  const view = document.createElement('div');
  view.className = 'launcher-menu card';
  view.innerHTML = `
    <header class="launcher-head">
      <h1>Choose a game</h1>
      <p class="launcher-hint"></p>
    </header>
    <ul class="launcher-tiles">
      ${games
        .map(
          (game) => `
        <li>
          <button type="button" class="launcher-tile" data-game="${escapeHtml(game.id)}">
            <span class="launcher-art">${game.art ?? ''}</span>
            <span class="launcher-name">${escapeHtml(game.name)}</span>
            <span class="launcher-desc">${escapeHtml(game.description)}</span>
            <span class="launcher-status"></span>
          </button>
        </li>`,
        )
        .join('')}
      <li>
        <div class="launcher-tile is-soon" aria-hidden="true">
          <span class="launcher-art"><span class="launcher-soon-mark">+</span></span>
          <span class="launcher-name">More games</span>
          <span class="launcher-desc">Coming soon.</span>
        </div>
      </li>
    </ul>
    <p class="launcher-error" role="alert" hidden></p>
    <div class="launcher-pointers"></div>`;
  root.append(view);

  const hint = /** @type {HTMLElement} */ (view.querySelector('.launcher-hint'));
  const errorBox = /** @type {HTMLElement} */ (view.querySelector('.launcher-error'));
  const pointers = /** @type {HTMLElement} */ (view.querySelector('.launcher-pointers'));
  /** @type {HTMLElement[]} */
  const tiles = [...view.querySelectorAll('button.launcher-tile')];
  const tracker = createAimTracker(loadAimSettings());
  const destroyPanel = createAimDebugPanel({ tracker, players: api.players });
  const offs = [];

  // Clicking a tile works too, for testing on a laptop without a phone.
  for (const tile of tiles) tile.addEventListener('click', () => onPick(tile.dataset.game));

  // ---- Layout -------------------------------------------------------------
  // Remember where each tile is (in pixels from the menu's top-left corner),
  // and re-measure only when something changes size or the text changes.
  let size = { width: 0, height: 0 };
  /** @type {Array<{ tile: HTMLElement, left: number, top: number, right: number, bottom: number }>} */
  let tileBoxes = [];
  function measure() {
    size = { width: view.clientWidth, height: view.clientHeight };
    const origin = view.getBoundingClientRect();
    tileBoxes = tiles.map((tile) => {
      const box = tile.getBoundingClientRect();
      return {
        tile,
        left: box.left - origin.left,
        top: box.top - origin.top,
        right: box.right - origin.left,
        bottom: box.bottom - origin.top,
      };
    });
  }
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(view);
  for (const tile of tiles) resizeObserver.observe(tile);

  /** The tile under a point, if any. */
  const tileAt = ({ x, y }) =>
    tileBoxes.find((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
      ?.tile;

  // ---- Players ------------------------------------------------------------
  // Only players with a slot (not spectators) get a crosshair and can pick.
  const playing = () => api.players.list().filter((player) => player.slot !== null);

  /** @type {Map<string, HTMLElement>} */
  const crosshairs = new Map();
  function syncPlayers() {
    const players = playing();
    const present = new Set(players.map((player) => player.id));
    for (const [id, el] of crosshairs) {
      if (!present.has(id)) {
        el.remove();
        crosshairs.delete(id);
        tracker.remove(id);
      }
    }
    for (const player of players) {
      let el = crosshairs.get(player.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'launcher-crosshair';
        el.innerHTML = `${CROSSHAIR_SVG}<span class="launcher-label"></span>`;
        pointers.append(el);
        crosshairs.set(player.id, el);
      }
      el.style.setProperty('--player', playerColor(player.slot));
      el.querySelector('.launcher-label').textContent = playerLabel(player.slot);
    }
    hint.textContent =
      players.length > 0
        ? 'Point at a game and pull the trigger. During a game, press Home on your phone to come back here.'
        : 'Scan the QR code with your phone to join, or click a game.';
    measure(); // the hint's length can move the tiles
  }
  offs.push(api.players.onChange(syncPlayers));
  syncPlayers();

  // ---- Input --------------------------------------------------------------
  offs.push(
    api.onInput(INPUT.MOTION, (sample, { player }) => {
      if (player.slot !== null) tracker.push(player.id, /** @type {any} */ (sample));
    }),
    api.onInput(INPUT.BUTTON, ({ id, down }, { player }) => {
      if (!down || player.slot === null) return;
      if (id === BUTTONS.RECENTER) tracker.recenter(player.id);
      if (id === BUTTONS.FIRE) {
        const tile = tileAt(toPixels(tracker.get(player.id), size));
        if (tile) {
          api.vibrate(player.id, 40);
          onPick(tile.dataset.game);
        }
      }
    }),
  );

  // ---- Each frame ---------------------------------------------------------
  // Move the crosshairs, then highlight the tile each one is over (in that
  // player's colour; if two players point at the same tile, the lower
  // player number wins).
  let frame = requestAnimationFrame(function loop(now) {
    if (size.height > 0) {
      tracker.update(now, size.width / size.height);
      /** @type {Map<HTMLElement, string>} */
      const hovered = new Map();
      for (const player of playing()) {
        const point = toPixels(tracker.get(player.id), size);
        const el = crosshairs.get(player.id);
        if (el) el.style.translate = `${point.x}px ${point.y}px`;
        const tile = tileAt(point);
        if (tile && !hovered.has(tile)) hovered.set(tile, playerColor(player.slot));
      }
      for (const tile of tiles) {
        const color = hovered.get(tile);
        tile.classList.toggle('is-hovered', !!color);
        if (color) tile.style.setProperty('--player', color);
      }
    }
    frame = requestAnimationFrame(loop);
  });

  return {
    /** Shows that a game is downloading. */
    showLoading(id) {
      errorBox.hidden = true;
      for (const tile of tiles) {
        const loading = tile.dataset.game === id;
        tile.classList.toggle('is-loading', loading);
        tile.querySelector('.launcher-status').textContent = loading ? 'Loading…' : '';
      }
    },

    /** @param {string} message */
    showError(message) {
      for (const tile of tiles) {
        tile.classList.remove('is-loading');
        tile.querySelector('.launcher-status').textContent = '';
      }
      errorBox.textContent = message;
      errorBox.hidden = false;
    },

    destroy() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      for (const off of offs) off();
      destroyPanel();
      view.remove();
    },
  };
}
