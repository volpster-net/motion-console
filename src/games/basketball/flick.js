/**
 * Spots a shooting flick: a quick upward tip of the phone.
 *
 * It watches the phone's up/down turning speed (pitch rate, in degrees per
 * second, from the aim tracker). A flick starts when the phone tips up faster
 * than `startRate`, and ends when it slows below `endRate` (or runs too long).
 * The fastest speed reached in between is the flick's strength.
 *
 *   speed
 *     ▲        peak
 *     │       ╱╲
 *     │ start╱  ╲ end        ← one flick, reported at "end"
 *     │─────╱────╲──────────
 *     └─────────────────────▶ time
 *
 * After a flick, it ignores movement for `cooldownMs`, so the wobble of
 * bringing the phone back down isn't mistaken for a second shot.
 */

/**
 * @typedef {{ type: 'start', t: number } | { type: 'flick', t: number, peak: number }} FlickEvent
 */

/**
 * @param {typeof import('./index.js').CONFIG['flick']} config
 */
export function createFlickDetector(config) {
  /** @type {{ name: 'idle' } | { name: 'rising', startedAt: number, peak: number } | { name: 'cooldown', until: number }} */
  let state = { name: 'idle' };

  return {
    /**
     * Feeds one motion sample. Returns an event when a flick starts or ends.
     *
     * @param {number} pitchRate  degrees per second; positive = tipping up
     * @param {number} t          the sample's timestamp in ms
     * @returns {FlickEvent | null}
     */
    update(pitchRate, t) {
      if (state.name === 'cooldown') {
        if (t < state.until) return null;
        state = { name: 'idle' };
      }

      if (state.name === 'idle') {
        if (pitchRate < config.startRate) return null;
        state = { name: 'rising', startedAt: t, peak: pitchRate };
        return { type: 'start', t };
      }

      // Rising: keep the fastest speed until the flick slows down or runs too long.
      state.peak = Math.max(state.peak, pitchRate);
      const finished = pitchRate < config.endRate || t - state.startedAt > config.maxMs;
      if (!finished) return null;
      const { peak } = state;
      state = { name: 'cooldown', until: t + config.cooldownMs };
      return { type: 'flick', t, peak };
    },

    /** Forgets any flick in progress, e.g. after a pause. */
    reset() {
      state = { name: 'idle' };
    },
  };
}

/**
 * Places a flick's peak speed between the weakest (0) and strongest (1)
 * flicks we expect.
 *
 * @param {number} peak
 * @param {typeof import('./index.js').CONFIG['flick']} config
 */
export function normalizeFlick(peak, config) {
  return (peak - config.weakest) / (config.strongest - config.weakest);
}
