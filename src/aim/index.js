/**
 * Shared aiming for every game: phone gyroscope in, crosshair position out.
 *
 *   aim-math.js      the maths, as small pure functions
 *   aim-tracker.js   one crosshair per player; the part games use
 *   aim-settings.js  sensitivity, deadzone, smoothing (defaults and saving)
 *   debug-panel.js   hidden tuning panel with sliders and live values
 *
 * See src/channels/aim for a complete example.
 */
export { toPixels } from './aim-math.js';
export { createAimTracker } from './aim-tracker.js';
export { DEFAULT_AIM_SETTINGS, loadAimSettings } from './aim-settings.js';
export { createAimDebugPanel } from './debug-panel.js';
