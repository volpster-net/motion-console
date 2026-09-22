/**
 * Point-and-shoot picking, shared by the launcher's menu and pause screen.
 *
 * It works like pointing a Wii Remote at a menu: every player gets a
 * crosshair over `area`, each frame we work out which choice (if any) sits
 * under each crosshair and highlight it, and when a player pulls the trigger
 * the choice under their crosshair is picked. Choices can also be clicked.
 */
import { createAimTracker, loadAimSettings, toPixels } from '../../aim/index.js';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';

const CROSSHAIR_SVG = `
  <svg viewBox="-24 -24 48 48" aria-hidden="true">
    <circle r="12" />
    <path d="M0 -22v10M0 12v10M-22 0h10M12 0h10" />
    <circle class="launcher-dot" r="2" />
  </svg>`;

/**
 * @param {{
 *   area: HTMLElement,          crosshairs are drawn over this element
 *   choices: HTMLElement[],     what can be picked
 *   api: import('../../console/channel-host.js').ChannelApi,
 *   onPick: (choice: HTMLElement) => void,
 * }} options
 */
export function createPicker({ area, choices, api, onPick }) {
  const pointers = document.createElement('div');
  pointers.className = 'launcher-pointers';
  area.append(pointers);
  const tracker = createAimTracker(loadAimSettings());
  const offs = [];

  const pick = (choice) => onPick(choice);
  for (const choice of choices) choice.addEventListener('click', () => pick(choice));

  // ---- Layout -------------------------------------------------------------
  // Remember where each choice is (in pixels from the area's top-left corner),
  // and re-measure only when something changes size.
  let size = { width: 0, height: 0 };
  /** @type {Array<{ choice: HTMLElement, left: number, top: number, right: number, bottom: number }>} */
  let boxes = [];
  function measure() {
    size = { width: area.clientWidth, height: area.clientHeight };
    const origin = area.getBoundingClientRect();
    boxes = choices.map((choice) => {
      const box = choice.getBoundingClientRect();
      return {
        choice,
        left: box.left - origin.left,
        top: box.top - origin.top,
        right: box.right - origin.left,
        bottom: box.bottom - origin.top,
      };
    });
  }
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(area);
  for (const choice of choices) resizeObserver.observe(choice);

  /** The choice under a point, if any. */
  const choiceAt = ({ x, y }) =>
    boxes.find((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)?.choice;

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
        const choice = choiceAt(toPixels(tracker.get(player.id), size));
        if (choice) {
          api.vibrate(player.id, 40);
          pick(choice);
        }
      }
    }),
  );

  // ---- Each frame ---------------------------------------------------------
  // Move the crosshairs, then highlight the choice each one is over (in that
  // player's colour; if two players point at the same one, the lower player
  // number wins).
  let frame = requestAnimationFrame(function loop(now) {
    if (size.height > 0) {
      tracker.update(now, size.width / size.height);
      /** @type {Map<HTMLElement, string>} */
      const hovered = new Map();
      for (const player of playing()) {
        const point = toPixels(tracker.get(player.id), size);
        const el = crosshairs.get(player.id);
        if (el) el.style.translate = `${point.x}px ${point.y}px`;
        const choice = choiceAt(point);
        if (choice && !hovered.has(choice)) hovered.set(choice, playerColor(player.slot));
      }
      for (const choice of choices) {
        const color = hovered.get(choice);
        choice.classList.toggle('is-hovered', !!color);
        if (color) choice.style.setProperty('--player', color);
      }
    }
    frame = requestAnimationFrame(loop);
  });

  return {
    tracker,
    /** Call after changing the layout (e.g. text that can move the choices). */
    measure,

    destroy() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      for (const off of offs) off();
      pointers.remove();
    },
  };
}
