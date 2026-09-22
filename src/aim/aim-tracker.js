/**
 * Tracks one crosshair per player. This is the piece games use.
 *
 * How a game uses it:
 *   1. Every motion message from a phone → tracker.push(playerId, data)
 *   2. Every animation frame              → tracker.update(frameTime, aspect)
 *   3. Then draw each player at           → tracker.get(playerId).x / .y
 *
 * Why queue samples instead of moving the crosshair as each message arrives?
 * Messages cross the internet in uneven bursts: sometimes none arrive for a
 * frame, then three at once. What matters is the time between the moments the
 * phone *measured* each sample, which the phone stamps on every message (`t`).
 * So we queue samples as they arrive and, once per frame, replay them in
 * order using the phone's own timestamps. The bursty network then doesn't
 * make the crosshair speed up or slow down.
 *
 * The tracker never touches the screen, so it works for DOM, canvas, or WebGL
 * games alike, and it can be unit-tested.
 */
import {
  applyDeadzone,
  clampToArea,
  integrate,
  MAX_SAMPLE_GAP_MS,
  smoothingFactor,
  smoothToward,
  toAimRates,
} from './aim-math.js';
import { DEFAULT_AIM_SETTINGS } from './aim-settings.js';

/** Frames longer than this (e.g. the tab was in the background) are treated as this long. */
const MAX_FRAME_MS = 100;
/** How often the per-player sample rate shown in the debug panel is recalculated. */
const RATE_WINDOW_MS = 1000;

/**
 * @typedef {import('./aim-math.js').RotationRate & { t: number }} MotionSample
 *   One gyroscope reading, stamped with the phone's clock in milliseconds.
 *
 * @typedef {object} Aim
 * @property {number} x  Displayed (smoothed) position, in screen heights from the centre.
 * @property {number} y
 * @property {MotionSample | null} lastSample  The most recent raw reading, for debugging.
 * @property {number} sampleRate  Samples received per second, for debugging.
 */

/**
 * @param {import('./aim-settings.js').AimSettings} [settings]
 *   Read afresh every frame, so changing a value (say, from a slider) takes effect immediately.
 */
export function createAimTracker(settings = { ...DEFAULT_AIM_SETTINGS }) {
  /** @type {Map<string, ReturnType<typeof createAimer>>} */
  const aimers = new Map();

  function createAimer() {
    return {
      /** Where the phone's movements say the crosshair is. */
      target: { x: 0, y: 0 },
      /** Where we draw it: glides towards `target` (see smoothing). */
      shown: { x: 0, y: 0 },
      /** @type {MotionSample[]} arrived since the last frame */
      queue: [],
      /** @type {MotionSample | null} */
      previous: null,
      /** @type {MotionSample | null} */
      lastSample: null,
      windowStart: null,
      windowCount: 0,
      sampleRate: 0,
    };
  }

  /** @param {string} id */
  function aimerFor(id) {
    let aimer = aimers.get(id);
    if (!aimer) aimers.set(id, (aimer = createAimer()));
    return aimer;
  }

  /**
   * Adds the turning between two samples to the target position.
   *
   * The phone was turning at `previous`'s speed at the start of the gap and
   * at `sample`'s speed at the end. We use the average of the two, which is
   * more accurate than using either one alone when the speed is changing.
   */
  function step(aimer, previous, sample, aspect) {
    const dtMs = sample.t - previous.t;
    // Zero or negative: a duplicate, or the phone reloaded and its clock restarted.
    // Too long: a gap we can't trust. Either way, skip it.
    if (dtMs <= 0 || dtMs > MAX_SAMPLE_GAP_MS) return;

    const start = toAimRates(previous);
    const end = toAimRates(sample);
    const average = { yaw: (start.yaw + end.yaw) / 2, pitch: (start.pitch + end.pitch) / 2 };
    const rates = applyDeadzone(average, settings.deadzone);
    const moved = integrate(aimer.target, rates, dtMs, settings.sensitivity);
    aimer.target = clampToArea(moved, aspect);
  }

  let lastFrameAt = null;

  return {
    settings,

    /**
     * Queues a motion sample. Call this from your motion message handler.
     *
     * @param {string} id  player id
     * @param {MotionSample} sample
     */
    push(id, sample) {
      aimerFor(id).queue.push(sample);
    },

    /**
     * Snaps a player's crosshair back to the centre. The phone's current
     * direction becomes the new "pointing at the middle of the screen".
     *
     * @param {string} id
     */
    recenter(id) {
      const aimer = aimerFor(id);
      aimer.target = { x: 0, y: 0 };
      aimer.shown = { x: 0, y: 0 };
    },

    /** @param {string} id  Forget a player who left. */
    remove(id) {
      aimers.delete(id);
    },

    /**
     * Runs once per animation frame: replays queued samples, then glides
     * each displayed crosshair towards its target.
     *
     * @param {number} now     frame time in ms (the requestAnimationFrame timestamp)
     * @param {number} aspect  play area width ÷ height
     */
    update(now, aspect) {
      const frameMs = lastFrameAt === null ? 0 : Math.min(now - lastFrameAt, MAX_FRAME_MS);
      lastFrameAt = now;
      const glide = smoothingFactor(frameMs, settings.smoothing);

      for (const aimer of aimers.values()) {
        for (const sample of aimer.queue) {
          if (aimer.previous) step(aimer, aimer.previous, sample, aspect);
          aimer.previous = sample;
        }
        if (aimer.queue.length > 0) aimer.lastSample = aimer.queue[aimer.queue.length - 1];

        aimer.windowStart ??= now;
        aimer.windowCount += aimer.queue.length;
        if (now - aimer.windowStart >= RATE_WINDOW_MS) {
          aimer.sampleRate = Math.round((aimer.windowCount * 1000) / (now - aimer.windowStart));
          aimer.windowStart = now;
          aimer.windowCount = 0;
        }
        aimer.queue = [];

        // Clamp again in case the play area changed shape (a window resize).
        aimer.target = clampToArea(aimer.target, aspect);
        aimer.shown = smoothToward(aimer.shown, aimer.target, glide);
      }
    },

    /**
     * @param {string} id
     * @returns {Aim}
     */
    get(id) {
      const aimer = aimerFor(id);
      return {
        x: aimer.shown.x,
        y: aimer.shown.y,
        lastSample: aimer.lastSample,
        sampleRate: aimer.sampleRate,
      };
    },
  };
}
