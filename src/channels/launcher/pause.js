/**
 * The pause screen, drawn over a paused game: Resume or Quit to menu.
 * Players pick by pointing and pulling the trigger, like the menu.
 *
 * Resuming doesn't drop you straight back in: a short 3-2-1 countdown
 * gives everyone a moment to get their aim back first.
 */
import { createPicker } from './picker.js';

/** How long each step of the resume countdown lasts. */
const COUNTDOWN_STEP_MS = 700;
const COUNTDOWN_FROM = 3;

/** @param {string} text */
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * @param {{
 *   container: HTMLElement,     the game's container; the overlay covers it
 *   api: import('../../console/channel-host.js').ChannelApi,
 *   gameName: string,
 *   reason?: string,            why it paused, if it wasn't the Home button
 *   onResume: () => void,       called after the countdown
 *   onQuit: () => void,
 * }} options
 */
export function createPauseOverlay({ container, api, gameName, reason, onResume, onQuit }) {
  const overlay = document.createElement('div');
  overlay.className = 'launcher-pause';
  overlay.innerHTML = `
    <div class="launcher-pause-panel card">
      <p class="eyebrow">Paused</p>
      <h2>${escapeHtml(gameName)}</h2>
      ${reason ? `<p class="launcher-pause-reason">${escapeHtml(reason)}</p>` : ''}
      <div class="launcher-pause-choices">
        <button type="button" class="launcher-choice" data-action="resume">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          Resume
        </button>
        <button type="button" class="launcher-choice" data-action="quit">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5.5 9v11h13V9" /></svg>
          Quit to menu
        </button>
      </div>
      <p class="launcher-pause-hint">Point and pull the trigger, or press Home again to resume.</p>
    </div>
    <p class="launcher-count" hidden></p>`;
  container.append(overlay);

  const panel = /** @type {HTMLElement} */ (overlay.querySelector('.launcher-pause-panel'));
  const count = /** @type {HTMLElement} */ (overlay.querySelector('.launcher-count'));
  /** @type {HTMLElement[]} */
  const choices = [...overlay.querySelectorAll('.launcher-choice')];

  let picker = createPicker({
    area: overlay,
    choices,
    api,
    onPick: (choice) => (choice.dataset.action === 'resume' ? startCountdown() : onQuit()),
  });

  let timer = null;
  let counting = false;

  /** 3, 2, 1… then hand control back to the game. */
  function startCountdown() {
    if (counting) return;
    counting = true;
    picker?.destroy();
    picker = null;
    panel.hidden = true;
    overlay.classList.add('is-counting');
    count.hidden = false;

    let n = COUNTDOWN_FROM;
    const step = () => {
      if (n === 0) {
        timer = null;
        onResume();
        return;
      }
      count.textContent = String(n);
      // Restart the pop-in animation for each number.
      count.classList.remove('is-pop');
      void count.offsetWidth;
      count.classList.add('is-pop');
      n -= 1;
      timer = setTimeout(step, COUNTDOWN_STEP_MS);
    };
    step();
  }

  return {
    /** Home or Esc while paused: same as picking Resume. */
    resume: startCountdown,

    get counting() {
      return counting;
    },

    destroy() {
      clearTimeout(timer);
      picker?.destroy();
      overlay.remove();
    },
  };
}
