/**
 * Aim: the Milestone 2 channel. Each player gets a crosshair that follows
 * their phone. Fire flashes at the crosshair, and Re-center snaps it back to
 * the middle. Press D on the console to open the tuning panel.
 *
 * All the aiming logic lives in src/aim. This file only wires messages into
 * the tracker and draws the result, which is all a game has to do.
 */
import './aim.css';
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
    <circle class="crosshair-dot" r="2" />
  </svg>`;

/** @type {import('../../console/channel-host.js').Channel} */
export default {
  title: 'Aim',

  mount(root, api) {
    root.classList.add('aim');
    root.innerHTML = `
      <header class="aim-head">
        <h1>Aim</h1>
        <p>
          Point the top of your phone at the screen. <strong>Fire</strong> flashes,
          <strong>Re-center</strong> snaps back to the middle. Press <kbd>D</kbd> to tune.
        </p>
      </header>
      <div class="aim-area card">
        <p class="aim-empty">Scan the QR code with your phone to get a crosshair.</p>
      </div>`;
    const area = /** @type {HTMLElement} */ (root.querySelector('.aim-area'));
    const empty = /** @type {HTMLElement} */ (root.querySelector('.aim-empty'));

    const tracker = createAimTracker(loadAimSettings());
    const destroyPanel = createAimDebugPanel({ tracker, players: api.players });

    // Measure the play area only when it changes size, not every frame.
    let size = { width: area.clientWidth, height: area.clientHeight };
    const resizeObserver = new ResizeObserver(() => {
      size = { width: area.clientWidth, height: area.clientHeight };
    });
    resizeObserver.observe(area);

    /** @type {Map<string, HTMLElement>} player id → crosshair element */
    const crosshairs = new Map();

    function syncPlayers(players) {
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
          el.className = 'crosshair';
          el.innerHTML = `${CROSSHAIR_SVG}<span class="crosshair-label"></span>`;
          area.append(el);
          crosshairs.set(player.id, el);
        }
        el.style.setProperty('--player', playerColor(player.slot));
        el.querySelector('.crosshair-label').textContent = playerLabel(player.slot);
      }
      empty.hidden = crosshairs.size > 0;
    }

    /** A burst at the player's crosshair that fades out and removes itself. */
    function flash(player) {
      const { x, y } = toPixels(tracker.get(player.id), size);
      const el = document.createElement('div');
      el.className = 'aim-flash';
      el.style.setProperty('--player', playerColor(player.slot));
      el.style.translate = `${x}px ${y}px`;
      el.addEventListener('animationend', () => el.remove());
      area.append(el);
    }

    api.players.onChange(syncPlayers);
    syncPlayers(api.players.list());

    api.onInput(INPUT.MOTION, (data, { player }) => {
      tracker.push(player.id, /** @type {any} */ (data));
    });

    api.onInput(INPUT.BUTTON, ({ id, down }, { player }) => {
      if (!down) return;
      if (id === BUTTONS.RECENTER) tracker.recenter(player.id);
      if (id === BUTTONS.FIRE) flash(player);
    });

    // Every frame: let the tracker catch up on queued samples, then move each crosshair.
    let frame = requestAnimationFrame(function loop(now) {
      if (size.height > 0) {
        tracker.update(now, size.width / size.height);
        for (const [id, el] of crosshairs) {
          const { x, y } = toPixels(tracker.get(id), size);
          el.style.translate = `${x}px ${y}px`;
        }
      }
      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      destroyPanel();
    };
  },
};
