/**
 * Spotting a bat swing, and working out exactly when it happened.
 *
 * The swing
 * ---------
 * A bat swing is the biggest, fastest motion you can make with a phone, so
 * it's easy to spot: we watch the gyroscope's total spin speed (all three
 * axes combined, so it works however you grip the phone). A swing starts when
 * that speed shoots past `startRate`, and is reported as soon as it has
 * clearly peaked (dropped well below its fastest) or slowed right down. The
 * moment of fastest spin is when the bat would meet the ball.
 *
 * The timing
 * ----------
 * Messages from the phone take a varying time to arrive (tens of
 * milliseconds, more on a busy network). If we judged a swing by when its
 * message *arrived*, the same swing could count as on time or late depending
 * on the network. Instead, each sample carries the time the phone measured
 * it, on the phone's own clock, and we translate that into the console's clock.
 *
 * To translate, we need the difference between the two clocks. Every sample
 * tells us "arrived at A (console clock), measured at T (phone clock)", so
 * A − T = clock difference + travel time. Travel time is never negative, so the
 * smallest A − T we ever see is the clock difference plus the quickest trip.
 * We keep that smallest value, and subtract an assumed quickest trip.
 */

/**
 * @typedef {typeof import('./index.js').CONFIG['swing']} SwingConfig
 * @typedef {{ t: number, peak: number }} Swing
 *   t: when the swing was fastest (phone clock, ms); peak: that speed (°/s)
 */

/** Total spin speed, however the phone is held: Pythagoras across all three axes. */
export function spinSpeed({ alpha, beta, gamma }) {
  return Math.hypot(alpha, beta, gamma);
}

/**
 * @param {SwingConfig} config
 */
export function createSwingDetector(config) {
  /**
   * @type {{ stage: 'waiting' }
   *   | { stage: 'swinging', since: number, peak: number, peakAt: number }
   *   | { stage: 'resting', until: number }}
   */
  let state = { stage: 'waiting' };

  return {
    /**
     * Feeds one sample. Returns a swing once it's finished.
     *
     * @param {number} speed  total spin speed, °/s
     * @param {number} t      phone timestamp, ms
     * @returns {Swing | null}
     */
    update(speed, t) {
      if (state.stage === 'resting') {
        if (t < state.until) return null;
        state = { stage: 'waiting' };
      }
      if (state.stage === 'waiting') {
        if (speed >= config.startRate)
          state = { stage: 'swinging', since: t, peak: speed, peakAt: t };
        return null;
      }
      if (speed > state.peak) {
        state.peak = speed;
        state.peakAt = t;
      }
      const pastPeak = speed < state.peak * config.pastPeak;
      if (pastPeak || speed < config.endRate || t - state.since > config.maxMs) {
        const swing = { t: state.peakAt, peak: state.peak };
        // Ignore the follow-through and resetting the bat.
        state = { stage: 'resting', until: t + config.restMs };
        return swing;
      }
      return null;
    },

    reset() {
      state = { stage: 'waiting' };
    },
  };
}

/**
 * Translates phone timestamps into console time (see "The timing" above).
 *
 * @param {{ quickestTripMs: number }} config
 */
export function createClockMatch(config) {
  /** The smallest "arrived minus measured" seen so far. */
  let smallest = Infinity;
  let lastPhoneT = -Infinity;

  return {
    /**
     * Learns from one sample.
     *
     * @param {number} phoneT    when the phone measured it
     * @param {number} arrivedAt when it reached the console (console clock)
     */
    observe(phoneT, arrivedAt) {
      // The phone's clock went backwards: its page reloaded. Start over.
      if (phoneT < lastPhoneT) smallest = Infinity;
      lastPhoneT = phoneT;
      smallest = Math.min(smallest, arrivedAt - phoneT);
    },

    /** Whether we've seen enough to translate. */
    get ready() {
      return smallest !== Infinity;
    },

    /**
     * @param {number} phoneT
     * @returns {number} the same moment on the console's clock
     */
    toConsole(phoneT) {
      return phoneT + smallest - config.quickestTripMs;
    },
  };
}

/**
 * Places a swing between the weakest (0) and strongest (1) we expect.
 *
 * @param {number} peak
 * @param {SwingConfig} config
 */
export function normalizeSwing(peak, config) {
  return Math.min(1, Math.max(0, (peak - config.weakest) / (config.strongest - config.weakest)));
}
