/**
 * The launcher's menu screen: a tile per game. Players pick one by pointing
 * and pulling the trigger (see picker.js), or by clicking it.
 */
import { createAimDebugPanel } from '../../aim/index.js';
import { createPicker } from './picker.js';

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
    <p class="launcher-error" role="alert" hidden></p>`;
  root.append(view);

  const hint = /** @type {HTMLElement} */ (view.querySelector('.launcher-hint'));
  const errorBox = /** @type {HTMLElement} */ (view.querySelector('.launcher-error'));
  /** @type {HTMLElement[]} */
  const tiles = [...view.querySelectorAll('button.launcher-tile')];

  const picker = createPicker({
    area: view,
    choices: tiles,
    api,
    onPick: (tile) => onPick(tile.dataset.game),
  });
  const destroyPanel = createAimDebugPanel({ tracker: picker.tracker, players: api.players });

  function updateHint() {
    const anyone = api.players.list().some((player) => player.slot !== null);
    hint.textContent = anyone
      ? 'Point at a game and pull the trigger. During a game, press Home on your phone to pause.'
      : 'Scan the QR code with your phone to join, or click a game.';
    picker.measure(); // the hint's length can move the tiles
  }
  const offPlayers = api.players.onChange(updateHint);
  updateHint();

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
      offPlayers();
      picker.destroy();
      destroyPanel();
      view.remove();
    },
  };
}
