/**
 * The three tuning knobs for aiming, their slider ranges, and saving them in
 * this browser so a tuned console stays tuned after a reload.
 */

/**
 * @typedef {object} AimSettings
 * @property {number} sensitivity  Multiplier on how far the crosshair moves per degree turned.
 * @property {number} deadzone     Turning slower than this (degrees per second) counts as still.
 * @property {number} smoothing    Milliseconds for the crosshair to close ~63% of the gap to its target.
 * @property {keyof typeof import('./aim-math.js').AXIS_ORDERS} axisOrder
 *   Which physical axis the browser means by alpha, beta, and gamma.
 */

/** @type {Readonly<AimSettings>} */
export const DEFAULT_AIM_SETTINGS = Object.freeze({
  sensitivity: 1,
  deadzone: 2,
  smoothing: 40,
  axisOrder: 'xyz',
});

/** Slider ranges for the debug panel. */
export const AIM_SETTING_RANGES = Object.freeze({
  sensitivity: { label: 'Sensitivity', min: 0.2, max: 3, step: 0.1, unit: '×' },
  deadzone: { label: 'Deadzone', min: 0, max: 20, step: 0.5, unit: '°/s' },
  smoothing: { label: 'Smoothing', min: 0, max: 200, step: 5, unit: 'ms' },
});

/** Choices for the debug panel's axis order menu. */
export const AXIS_ORDER_CHOICES = Object.freeze({
  xyz: 'Android Chrome (α=x β=y γ=z)',
  zxy: 'W3C spec (α=z β=x γ=y)',
});

const STORAGE_KEY = 'motion-console.aim-settings';

/**
 * Returns saved settings, or the defaults. Browser storage can be missing or
 * blocked (private windows, strict privacy settings), so every access is
 * guarded and falls back to the defaults.
 *
 * @returns {AimSettings}
 */
export function loadAimSettings() {
  const settings = { ...DEFAULT_AIM_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    for (const [key, range] of Object.entries(AIM_SETTING_RANGES)) {
      const value = saved?.[key];
      if (typeof value === 'number' && value >= range.min && value <= range.max) {
        settings[key] = value;
      }
    }
    if (Object.hasOwn(AXIS_ORDER_CHOICES, saved?.axisOrder)) settings.axisOrder = saved.axisOrder;
  } catch {
    // Unreadable storage: use the defaults.
  }
  return settings;
}

/** @param {AimSettings} settings */
export function saveAimSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: the settings still apply until the page reloads.
  }
}
