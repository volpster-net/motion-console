/**
 * A hidden tuning panel for aiming. Press the toggle key (D by default) on the
 * console to show it. It has a slider for each setting, which applies
 * instantly and is saved in this browser, plus live raw values from every
 * controller.
 *
 * Any game that uses the aim tracker can add it with one call:
 *
 *   const destroy = createAimDebugPanel({ tracker, players: api.players });
 */
import './debug-panel.css';
import { playerColor, playerLabel } from '../core/players.js';
import { formatSigned as signed } from '../ui/format.js';
import { AIM_SETTING_RANGES, DEFAULT_AIM_SETTINGS, saveAimSettings } from './aim-settings.js';

/**
 * @param {{
 *   tracker: ReturnType<typeof import('./aim-tracker.js').createAimTracker>,
 *   players: { list: () => import('../console/players.js').Player[] },
 *   key?: string,
 * }} options
 * @returns {() => void} removes the panel
 */
export function createAimDebugPanel({ tracker, players, key = 'd' }) {
  const { settings } = tracker;
  const panel = document.createElement('aside');
  panel.className = 'aim-debug card';
  panel.hidden = true;
  panel.innerHTML = `
    <header>
      <h2 class="eyebrow">Aim tuning</h2>
      <kbd>${key.toUpperCase()}</kbd>
    </header>
    <div class="aim-debug-sliders"></div>
    <button type="button" class="aim-debug-reset">Reset to defaults</button>
    <table class="aim-debug-raw">
      <thead>
        <tr><th></th><th>α</th><th>β</th><th>γ</th><th>x</th><th>y</th><th>Hz</th></tr>
      </thead>
      <tbody></tbody>
    </table>
    <p class="aim-debug-note">α β γ: raw rotation rate in °/s. x y: crosshair, in screen heights.</p>`;
  document.body.append(panel);

  // One slider per setting. Moving it changes `settings` directly; the
  // tracker reads `settings` every frame, so the change applies at once.
  const sliders = panel.querySelector('.aim-debug-sliders');
  /** @type {Array<() => void>} */
  const refreshers = [];
  for (const [name, range] of Object.entries(AIM_SETTING_RANGES)) {
    const row = document.createElement('label');
    row.className = 'aim-debug-slider';
    row.innerHTML = `<span>${range.label}</span><output></output><input type="range" />`;
    const input = /** @type {HTMLInputElement} */ (row.querySelector('input'));
    const output = /** @type {HTMLOutputElement} */ (row.querySelector('output'));
    Object.assign(input, { min: range.min, max: range.max, step: range.step });
    const refresh = () => {
      input.value = String(settings[name]);
      output.textContent = `${settings[name]}${range.unit}`;
    };
    input.addEventListener('input', () => {
      settings[name] = Number(input.value);
      refresh();
      saveAimSettings(settings);
    });
    refresh();
    refreshers.push(refresh);
    sliders.append(row);
  }

  panel.querySelector('.aim-debug-reset').addEventListener('click', () => {
    Object.assign(settings, DEFAULT_AIM_SETTINGS);
    saveAimSettings(settings);
    for (const refresh of refreshers) refresh();
  });

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    if (event.key.toLowerCase() !== key || event.ctrlKey || event.metaKey || event.altKey) return;
    panel.hidden = !panel.hidden;
  }
  window.addEventListener('keydown', onKey);

  // Live values, redrawn every frame while the panel is open.
  const body = panel.querySelector('tbody');
  let frame = requestAnimationFrame(function loop() {
    if (!panel.hidden) {
      body.replaceChildren(
        ...players.list().map((player) => {
          const aim = tracker.get(player.id);
          const sample = aim.lastSample;
          const row = document.createElement('tr');
          row.style.setProperty('--player', playerColor(player.slot));
          const cells = [
            playerLabel(player.slot),
            sample ? signed(sample.alpha) : '–',
            sample ? signed(sample.beta) : '–',
            sample ? signed(sample.gamma) : '–',
            signed(aim.x, 2),
            signed(aim.y, 2),
            String(aim.sampleRate),
          ];
          for (const text of cells) {
            const cell = document.createElement('td');
            cell.textContent = text;
            row.append(cell);
          }
          return row;
        }),
      );
    }
    frame = requestAnimationFrame(loop);
  });

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey);
    panel.remove();
  };
}
