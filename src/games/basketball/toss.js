/**
 * Measures a throw the Wii Sports Resort way: hold the button to grab the
 * ball, swing your arm up, and let go of the button to release it.
 *
 * While the button is held, we keep a short memory of how fast the phone is
 * swinging upwards (its tip-up speed, from the gyroscope). When the button is
 * let go, the fastest swing in the moment just before is the throw's
 * strength. A tap with no swing is a feeble toss, so the motion is what counts.
 *
 *   swing
 *   speed ▲            peak ← strength
 *         │           ╱╲
 *         │         ╱    ╲
 *         │───────╱────────┊── let go
 *         └────────[window]┴──▶ time
 */

/**
 * @param {{ windowMs: number }} config  how far back from the release to look
 */
export function createSwingMemory(config) {
  /** @type {Array<{ t: number, speed: number }>} */
  let recent = [];

  return {
    /**
     * Remembers one motion sample.
     *
     * @param {number} t      the sample's timestamp (ms)
     * @param {number} speed  upward swing speed, degrees per second (tipping up is positive)
     */
    add(t, speed) {
      recent.push({ t, speed });
      // Keep a little more than the window, and drop anything from before a clock restart.
      const oldest = t - config.windowMs * 2;
      if (recent[0].t < oldest || t < recent[0].t) {
        recent = recent.filter((s) => s.t >= oldest && s.t <= t);
      }
    },

    /**
     * The fastest upward swing in the window before the latest sample, or 0.
     *
     * @returns {number}
     */
    peak() {
      const latest = recent.at(-1);
      if (!latest) return 0;
      let peak = 0;
      for (const s of recent) {
        if (latest.t - s.t <= config.windowMs) peak = Math.max(peak, s.speed);
      }
      return peak;
    },

    /** Forgets everything, e.g. when the ball is grabbed again. */
    clear() {
      recent = [];
    },
  };
}

/**
 * Places a swing between the weakest (0) and strongest (1) swings we expect.
 *
 * @param {number} speed
 * @param {{ weakest: number, strongest: number }} config
 */
export function normalizeSwing(speed, config) {
  return (speed - config.weakest) / (config.strongest - config.weakest);
}
