/**
 * Input Monitor: shows each controller's raw rotation rate, button state, and
 * link health, plus a small aim preview driven by the shared aim tracker.
 * Open it with `?channel=monitor` on the console URL.
 */
import './monitor.css';
import { createAimTracker, loadAimSettings } from '../../aim/index.js';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { formatSigned } from '../../ui/format.js';

/** The preview box's shape, width ÷ height. */
const PREVIEW_ASPECT = 16 / 9;
/** Degrees per second that fill an axis bar. */
const AXIS_RANGE = 180;
const AXES = /** @type {const} */ (['alpha', 'beta', 'gamma']);
const AXIS_LABELS = { alpha: 'α', beta: 'β', gamma: 'γ' };
const IDLE_AFTER_MS = 1500;
const LOG_LIMIT = 12;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const BUTTON_LABELS = { [BUTTONS.FIRE]: 'Fire', [BUTTONS.RECENTER]: 'Re-center' };

/** @param {import('../../console/players.js').Player} player */
function createCard(player) {
  const el = document.createElement('article');
  el.className = 'card player-card';
  el.innerHTML = `
    <header>
      <span class="player-badge"></span>
      <span class="stats">–</span>
    </header>
    <div class="aim"><div class="aim-dot"></div></div>
    <dl class="axes">
      ${AXES.map(
        (axis) => `
        <div class="axis" data-axis="${axis}">
          <dt>${AXIS_LABELS[axis]}</dt>
          <span class="axis-bar"><span class="axis-fill"></span></span>
          <dd>–</dd>
        </div>`,
      ).join('')}
    </dl>
    <div class="lamps">
      ${Object.entries(BUTTON_LABELS)
        .map(([id, label]) => `<span class="lamp" data-button="${id}">${label}</span>`)
        .join('')}
    </div>`;

  const card = {
    el,
    badge: /** @type {HTMLElement} */ (el.querySelector('.player-badge')),
    stats: /** @type {HTMLElement} */ (el.querySelector('.stats')),
    dot: /** @type {HTMLElement} */ (el.querySelector('.aim-dot')),
    axes: Object.fromEntries(
      AXES.map((axis) => {
        const row = el.querySelector(`[data-axis="${axis}"]`);
        return [axis, { fill: row.querySelector('.axis-fill'), value: row.querySelector('dd') }];
      }),
    ),
    lamps: Object.fromEntries(
      [...el.querySelectorAll('.lamp')].map((lamp) => [lamp.dataset.button, lamp]),
    ),

    /** @type {{ alpha: number, beta: number, gamma: number } | null} */
    motion: null,
    /** @type {Record<string, boolean>} */
    buttons: {},
    lastInputAt: -Infinity,
    windowStart: performance.now(),
    windowCount: 0,
    rate: 0,
    lost: 0,
    dirty: true,
  };
  setSlot(card, player.slot);
  return card;
}

function setSlot(card, slot) {
  card.el.style.setProperty('--player', playerColor(slot));
  card.badge.textContent = playerLabel(slot);
}

/**
 * Writes card state to the DOM. Called once per animation frame, not per message.
 *
 * @param {ReturnType<typeof createCard>} card
 * @param {number} now
 * @param {import('../../aim/aim-tracker.js').Aim} aim
 */
function renderCard(card, now, aim) {
  const elapsed = now - card.windowStart;
  if (elapsed >= 1000) {
    card.rate = Math.round((card.windowCount * 1000) / elapsed);
    card.windowStart = now;
    card.windowCount = 0;
    card.dirty = true;
  }
  card.el.classList.toggle('is-idle', now - card.lastInputAt > IDLE_AFTER_MS);
  // The aim preview moves every frame (smoothing keeps it gliding between messages).
  card.dot.style.left = `${50 + (aim.x / PREVIEW_ASPECT) * 100}%`;
  card.dot.style.top = `${50 + aim.y * 100}%`;
  if (!card.dirty) return;
  card.dirty = false;

  card.stats.textContent = `${card.rate} msg/s · ${card.lost} lost`;
  for (const [id, lamp] of Object.entries(card.lamps)) {
    lamp.toggleAttribute('data-on', !!card.buttons[id]);
  }

  if (!card.motion) return;
  for (const axis of AXES) {
    const rate = card.motion[axis];
    card.axes[axis].value.textContent = formatSigned(rate);
    card.axes[axis].fill.style.setProperty('--v', String(clamp(rate / AXIS_RANGE, -1, 1)));
  }
}

/** @type {import('../../console/channel-host.js').Channel} */
export default {
  title: 'Input Monitor',

  mount(root, api) {
    root.classList.add('monitor');
    root.innerHTML = `
      <header class="monitor-head">
        <h1>Input Monitor</h1>
        <p>Raw rotation rate (°/s) from every connected controller. Turn the phone to move the dot.</p>
      </header>
      <div class="monitor-grid"></div>
      <p class="card monitor-empty">Scan the QR code with your phone to connect a controller.</p>
      <section class="card monitor-log" aria-live="polite">
        <h2 class="eyebrow">Button events</h2>
        <ol><li class="log-empty">No presses yet.</li></ol>
      </section>`;
    const grid = /** @type {HTMLElement} */ (root.querySelector('.monitor-grid'));
    const empty = /** @type {HTMLElement} */ (root.querySelector('.monitor-empty'));
    const log = /** @type {HTMLElement} */ (root.querySelector('.monitor-log ol'));
    /** @type {Map<string, ReturnType<typeof createCard>>} */
    const cards = new Map();
    const tracker = createAimTracker(loadAimSettings());

    function syncCards(players) {
      const present = new Set(players.map((p) => p.id));
      for (const [id, card] of cards) {
        if (!present.has(id)) {
          card.el.remove();
          cards.delete(id);
          tracker.remove(id);
        }
      }
      for (const player of players) {
        let card = cards.get(player.id);
        if (card) setSlot(card, player.slot);
        else cards.set(player.id, (card = createCard(player)));
        grid.append(card.el); // re-appending keeps cards in slot order
      }
      empty.hidden = cards.size > 0;
    }

    function record(player, msg) {
      const card = cards.get(player.id);
      if (!card) return null;
      card.windowCount += 1;
      card.lost += msg.lost;
      card.lastInputAt = performance.now();
      card.dirty = true;
      return card;
    }

    function logPress(player, buttonId) {
      log.querySelector('.log-empty')?.remove();
      const item = document.createElement('li');
      item.style.setProperty('--player', playerColor(player.slot));
      const badge = document.createElement('span');
      badge.className = 'player-badge';
      badge.textContent = playerLabel(player.slot);
      const label = document.createElement('span');
      label.textContent = BUTTON_LABELS[buttonId] ?? buttonId;
      const time = document.createElement('time');
      const now = new Date();
      time.dateTime = now.toISOString();
      time.textContent = `${now.toLocaleTimeString([], { hour12: false })}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      item.append(badge, label, time);
      log.prepend(item);
      while (log.children.length > LOG_LIMIT) log.lastElementChild.remove();
    }

    api.players.onChange(syncCards);
    syncCards(api.players.list());

    api.onInput(INPUT.MOTION, (data, { player, msg }) => {
      const card = record(player, msg);
      if (card) card.motion = /** @type {any} */ (data);
      tracker.push(player.id, /** @type {any} */ (data));
    });

    api.onInput(INPUT.BUTTON, (data, { player, msg }) => {
      const card = record(player, msg);
      if (card) card.buttons[data.id] = data.down;
      if (data.down) logPress(player, data.id);
      if (data.down && data.id === BUTTONS.RECENTER) tracker.recenter(player.id);
    });

    let frame = requestAnimationFrame(function loop(now) {
      tracker.update(now, PREVIEW_ASPECT);
      for (const [id, card] of cards) renderCard(card, now, tracker.get(id));
      frame = requestAnimationFrame(loop);
    });

    return () => cancelAnimationFrame(frame);
  },
};
