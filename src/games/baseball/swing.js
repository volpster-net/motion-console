/**
 * Spotting a bat swing, and working out exactly when it happened.
 *
 * The swing
 * ---------
 * A bat swing is the biggest, fastest motion you can make with a phone, so
 * it's easy to spot: we watch the gyroscope's total spin speed (all three
 * axes combined, so it works however you grip the phone). A burst of spin
 * starts when that speed shoots past `startRate`, and ends once it has clearly
 * peaked (dropped well below its fastest) or slowed right down. The moment of
 * fastest spin is when the bat would meet the ball.
 *
 * The load: a real swing starts by cocking the bat back, and with a phone in
 * your hands that's a quick burst of spin too. It comes just before the swing,
 * with a dip in between as the phone changes direction. So after each burst
 * we wait a moment (`settleMs`) to see whether a stronger one follows. The
 * strongest burst is the swing; anything weaker before it was the load.
 *
 *   speed
 *     ▲              swing ← this one counts
 *     │   load        ╱╲
 *     │    ╱╲        ╱  ╲
 *     │───╱──╲──────╱────╲───── startRate
 *     │  ╱    ╲____╱      ╲
 *     └─────────────────────────▶ time
 *                            └ settleMs ┘ then report
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
 * @typedef {{ t: number, peak: number }} Burst
 *   t: when it was fastest (phone clock, ms); peak: that speed (°/s)
 * @typedef {{ type: 'burst' | 'swing' } & Burst} SwingEvent
 *   burst: a burst of spin just ended; it might be the load, or the swing
 *          (good for starting the batter's animation straight away)
 *   swing: the settled answer: the strongest burst, which is the swing
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
   *   | { stage: 'swinging', since: number, peak: number, peakAt: number, best: Burst | null }
   *   | { stage: 'settling', best: Burst, until: number }
   *   | { stage: 'resting', until: number }}
   */
  let state = { stage: 'waiting' };

  return {
    /**
     * Feeds one sample. Returns an event when a burst ends or a swing is settled.
     *
     * @param {number} speed  total spin speed, °/s
     * @param {number} t      phone timestamp, ms
     * @returns {SwingEvent | null}
     */
    update(speed, t) {
      if (state.stage === 'resting') {
        if (t < state.until) return null;
        state = { stage: 'waiting' };
      }
      if (state.stage === 'waiting' || state.stage === 'settling') {
        if (speed >= config.startRate) {
          const best = state.stage === 'settling' ? state.best : null;
          state = { stage: 'swinging', since: t, peak: speed, peakAt: t, best };
          return null;
        }
        if (state.stage === 'settling' && t >= state.until) {
          // No stronger burst came: this was the swing.
          const swing = state.best;
          state = { stage: 'resting', until: t + config.restMs };
          return { type: 'swing', ...swing };
        }
        return null;
      }

      // Swinging: follow the burst to its fastest point.
      if (speed > state.peak) {
        state.peak = speed;
        state.peakAt = t;
      }
      const pastPeak = speed < state.peak * config.pastPeak;
      if (pastPeak || speed < config.endRate || t - state.since > config.maxMs) {
        const burst = { t: state.peakAt, peak: state.peak };
        // Keep the strongest burst so far, and wait to see if a stronger one follows.
        const best = state.best && state.best.peak >= burst.peak ? state.best : burst;
        state = { stage: 'settling', best, until: t + config.settleMs };
        return { type: 'burst', ...burst };
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
