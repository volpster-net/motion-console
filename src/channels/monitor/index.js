/**
 * Input Monitor: the Milestone 1 channel. It shows each controller's live
 * orientation, button state, and link health. It uses only the public
 * ChannelApi, so it's also the reference for how a game plugs in.
 */
import './monitor.css';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { formatDegrees } from '../../ui/format.js';

/** Degrees from centre that put the aim dot at the edge of the preview. */
const AIM_RANGE = { yaw: 30, pitch: 20 };
/** Degrees that fill an axis bar. */
const AXIS_RANGE = 90;
const AXES = /** @type {const} */ (['yaw', 'pitch', 'roll']);
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
          <dt>${axis[0].toUpperCase()}${axis.slice(1)}</dt>
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

    /** @type {{ yaw: number, pitch: number, roll: number } | null} */
    orient: null,
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

/** Writes card state to the DOM. Called once per animation frame, not per message. */
function renderCard(card, now) {
  const elapsed = now - card.windowStart;
  if (elapsed >= 1000) {
    card.rate = Math.round((card.windowCount * 1000) / elapsed);
    card.windowStart = now;
    card.windowCount = 0;
    card.dirty = true;
  }
  card.el.classList.toggle('is-idle', now - card.lastInputAt > IDLE_AFTER_MS);
  if (!card.dirty) return;
  card.dirty = false;

  card.stats.textContent = `${card.rate} msg/s · ${card.lost} lost`;
  for (const [id, lamp] of Object.entries(card.lamps)) {
    lamp.toggleAttribute('data-on', !!card.buttons[id]);
  }

  if (!card.orient) return;
  for (const axis of AXES) {
    const deg = card.orient[axis];
    card.axes[axis].value.textContent = formatDegrees(deg);
    card.axes[axis].fill.style.setProperty('--v', String(clamp(deg / AXIS_RANGE, -1, 1)));
  }
  const x = clamp(card.orient.yaw / AIM_RANGE.yaw, -1, 1);
  const y = clamp(-card.orient.pitch / AIM_RANGE.pitch, -1, 1);
  card.dot.style.left = `${50 + x * 50}%`;
  card.dot.style.top = `${50 + y * 50}%`;
}

/** @type {import('../../console/channel-host.js').Channel} */
export default {
  title: 'Input Monitor',

  mount(root, api) {
    root.classList.add('monitor');
    root.innerHTML = `
      <header class="monitor-head">
        <h1>Input Monitor</h1>
        <p>Live data from every connected controller. Tilt the phone to move the dot.</p>
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

    function syncCards(players) {
      const present = new Set(players.map((p) => p.id));
      for (const [id, card] of cards) {
        if (!present.has(id)) {
          card.el.remove();
          cards.delete(id);
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

    api.onInput(INPUT.ORIENT, (data, { player, msg }) => {
      const card = record(player, msg);
      if (card) card.orient = /** @type {any} */ (data);
    });

    api.onInput(INPUT.BUTTON, (data, { player, msg }) => {
      const card = record(player, msg);
      if (card) card.buttons[data.id] = data.down;
      if (data.down) logPress(player, data.id);
    });

    let frame = requestAnimationFrame(function loop(now) {
      for (const card of cards.values()) renderCard(card, now);
      frame = requestAnimationFrame(loop);
    });

    return () => cancelAnimationFrame(frame);
  },
};
