/**
 * Spots a real shooting motion in the phone's movement, in three parts, like
 * a jump shot:
 *
 *   1. SET    Raise the phone and cock your wrist back, so the top edge
 *             points up (tilt), and hold it there for a moment.
 *   2. PUSH   Extend your arm upwards. The accelerometer feels the push
 *             (lift); the hardest push sets the shot's power.
 *   3. SNAP   Flick your wrist forwards and down. That's the release: the
 *             ball leaves the moment the snap is fast enough.
 *
 *            tilt ≥ setTilt         lift ≥ pushStart       pitch ≤ −snapRate
 *   ready ─── for setHoldMs ──▶ set ────────────────▶ pushing ─────────────▶ SHOT
 *     ▲                          │ │                       │
 *     │    tilt < unsetTilt ─────┘ │ snap, no push         │ no snap within windowMs
 *     │                            ▼                       ▼
 *     └──── cooldownMs ◀──────── fizzle ("push!")      fizzle ("snap!")
 *
 * Anything short of all three, like a tap, a wave, or a lazy wrist flick,
 * doesn't shoot. After a shot or a fizzle, movement is ignored for a moment
 * so bringing the phone back down can't count as another shot.
 *
 * The detector sees only numbers, so it's easy to test with made-up motions.
 */

/**
 * @typedef {typeof import('./index.js').CONFIG['shot']} ShotConfig
 *
 * @typedef {{ type: 'set', t: number }
 *   | { type: 'unset', t: number }
 *   | { type: 'push', t: number }
 *   | { type: 'shot', t: number, push: number, snap: number }
 *   | { type: 'fizzle', t: number, missing: 'push' | 'snap' }} ShotEvent
 *
 * @typedef {'ready' | 'set' | 'pushing' | 'cooldown'} ShotStage
 */

/**
 * @param {ShotConfig} config
 */
export function createShotDetector(config) {
  /**
   * @type {{ stage: 'ready', tiltedSince: number | null }
   *   | { stage: 'set' }
   *   | { stage: 'pushing', since: number, peak: number }
   *   | { stage: 'cooldown', until: number }}
   */
  let state = { stage: 'ready', tiltedSince: null };

  const cooldown = (t) => (state = { stage: 'cooldown', until: t + config.cooldownMs });

  return {
    /** @returns {ShotStage} */
    get stage() {
      return state.stage;
    },

    /**
     * Feeds one motion sample. Returns an event when something happens.
     *
     * @param {{ tilt: number, lift: number, pitchRate: number, t: number }} sample
     *   tilt in degrees, lift in m/s², pitchRate in degrees per second
     *   (negative = the top edge tipping forwards and down), t in ms
     * @returns {ShotEvent | null}
     */
    update({ tilt, lift, pitchRate, t }) {
      const snapping = pitchRate <= -config.snapRate;

      switch (state.stage) {
        case 'cooldown':
          if (t >= state.until) state = { stage: 'ready', tiltedSince: null };
          return null;

        case 'ready':
          // Set = top edge tilted up, held steady for a moment.
          if (tilt < config.setTilt) {
            state.tiltedSince = null;
            return null;
          }
          state.tiltedSince ??= t;
          if (t - state.tiltedSince < config.setHoldMs) return null;
          state = { stage: 'set' };
          return { type: 'set', t };

        case 'set':
          if (lift >= config.pushStart) {
            state = { stage: 'pushing', since: t, peak: lift };
            return { type: 'push', t };
          }
          if (snapping) {
            cooldown(t); // flicked the wrist without pushing with the arm
            return { type: 'fizzle', t, missing: 'push' };
          }
          if (tilt < config.unsetTilt) {
            state = { stage: 'ready', tiltedSince: null };
            return { type: 'unset', t };
          }
          return null;

        case 'pushing':
          state.peak = Math.max(state.peak, lift);
          if (snapping) {
            const push = state.peak;
            cooldown(t);
            return { type: 'shot', t, push, snap: -pitchRate };
          }
          if (t - state.since > config.windowMs) {
            cooldown(t); // pushed but never released
            return { type: 'fizzle', t, missing: 'snap' };
          }
          return null;
      }
      return null;
    },

    /** Starts over, e.g. after a pause. */
    reset() {
      state = { stage: 'ready', tiltedSince: null };
    },
  };
}

/**
 * Places a push between the weakest (0) and strongest (1) pushes we expect.
 *
 * @param {number} push  m/s²
 * @param {ShotConfig} config
 */
export function normalizePush(push, config) {
  return (push - config.weakest) / (config.strongest - config.weakest);
}
