/**
 * Spotting a bat swing, and working out exactly when it happened.
 *
 * The swing
 * ---------
 * A right-handed swing turns your body to the left, towards the pitcher: seen
 * from above, the bat whips round anticlockwise. The load before it (cocking
 * the bat back) turns the other way, and so does bringing the bat back to
 * your shoulder afterwards. So we measure how fast the phone is spinning
 * round the *vertical* (using its gravity reading to know which way is up,
 * so any grip works), with a sign: positive one way, negative the other.
 * Only a burst in the swing's direction counts; the load simply doesn't.
 *
 *   spin round the vertical
 *     ▲                swing ← counts
 *     │                 ╱╲
 *     │────────────────╱──╲───── startRate
 *     │               ╱    ╲
 *     │──────╲──────╱────────────▶ time
 *     │       ╲__╱ load (the other way): ignored
 *
 * We report two moments: when a swing *starts* (crossing `startRate`), so
 * the batter on screen can start swinging straight away, and when it has
 * peaked. The moment of fastest spin is when the bat meets the ball.
 *
 * Which way is "the swing's direction"? Right-handed is the default. If a
 * player keeps swinging the other way much harder (a lefty), we switch.
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
import { AXIS_ORDERS, normalize } from '../../aim/aim-math.js';

/**
 * @typedef {typeof import('./index.js').CONFIG['swing']} SwingConfig
 * @typedef {{ type: 'start', t: number } | { type: 'swing', t: number, peak: number }} SwingEvent
 *   start: a swing just began (t = phone time);
 *   swing: it peaked at t (phone time) at `peak` degrees per second
 */

/** Total spin speed, however the phone is held: Pythagoras across all three axes. */
export function spinSpeed({ alpha, beta, gamma }) {
  return Math.hypot(alpha, beta, gamma);
}

/**
 * Measures spin round the vertical, however the phone is held.
 *
 * The gravity reading says which way is up, but a swing flings the phone
 * about, which the accelerometer feels too. So we only update our idea of
 * "up" while the phone is fairly still, and keep it steady through a swing.
 *
 * @param {{ axisOrder: keyof typeof AXIS_ORDERS, calmRate: number }} options
 */
export function createVerticalSpin({ axisOrder, calmRate }) {
  /** @type {{ x: number, y: number, z: number } | null} */
  let up = null;
  const toAxes = AXIS_ORDERS[axisOrder] ?? AXIS_ORDERS.xyz;

  return {
    /**
     * @param {{ alpha: number, beta: number, gamma: number, gx?: number, gy?: number, gz?: number }} sample
     * @returns {number} degrees per second round the vertical: positive = turning left
     *   (a right-handed swing). Without a gravity reading, the total spin speed.
     */
    read(sample) {
      const spin = toAxes(sample);
      const total = Math.hypot(spin.x, spin.y, spin.z);
      if (sample.gx !== undefined && total < calmRate) {
        const reading = normalize({ x: sample.gx, y: sample.gy, z: sample.gz });
        if (reading) {
          up = up
            ? (normalize({
                x: up.x + (reading.x - up.x) * 0.1,
                y: up.y + (reading.y - up.y) * 0.1,
                z: up.z + (reading.z - up.z) * 0.1,
              }) ?? reading)
            : reading;
        }
      }
      if (!up) return total;
      return spin.x * up.x + spin.y * up.y + spin.z * up.z;
    },
  };
}

/**
 * @param {SwingConfig} config
 */
export function createSwingDetector(config) {
  /** +1: a right-handed swing (turning left); −1: left-handed. */
  let direction = 1;
  /** The hardest swing seen each way, to spot a lefty. */
  const hardest = { 1: 0, [-1]: 0 };
  /**
   * @type {{ stage: 'waiting' }
   *   | { stage: 'swinging', sign: number, since: number, peak: number, peakAt: number }
   *   | { stage: 'resting', until: number }}
   */
  let state = { stage: 'waiting' };

  return {
    get direction() {
      return direction;
    },

    /**
     * Feeds one sample.
     *
     * @param {number} spin  degrees per second round the vertical (signed; see createVerticalSpin)
     * @param {number} t     phone timestamp, ms
     * @returns {SwingEvent | null}
     */
    update(spin, t) {
      if (state.stage === 'resting') {
        if (t < state.until) return null;
        state = { stage: 'waiting' };
      }
      const speed = Math.abs(spin);
      const sign = spin >= 0 ? 1 : -1;

      if (state.stage === 'waiting') {
        if (speed < config.startRate) return null;
        state = { stage: 'swinging', sign, since: t, peak: speed, peakAt: t };
        return sign === direction ? { type: 'start', t } : null;
      }

      // Swinging: follow the burst to its fastest point.
      if (sign === state.sign && speed > state.peak) {
        state.peak = speed;
        state.peakAt = t;
      }
      const along = sign === state.sign ? speed : 0;
      const pastPeak = along < state.peak * config.pastPeak;
      if (!(pastPeak || along < config.endRate || t - state.since > config.maxMs)) return null;

      const burst = { sign: state.sign, t: state.peakAt, peak: state.peak };
      hardest[burst.sign] = Math.max(hardest[burst.sign], burst.peak);
      // A lefty: a real, hard swing the other way, much harder than any our way.
      const other = hardest[-direction];
      if (other >= config.leftyFrom && other > hardest[direction] * config.switchHandsAt) {
        direction = -direction;
      }

      if (burst.sign !== direction) {
        // The load, or bringing the bat back: not a swing.
        state = { stage: 'waiting' };
        return null;
      }
      // Ignore the follow-through and getting set again.
      state = { stage: 'resting', until: t + config.restMs };
      return { type: 'swing', t: burst.t, peak: burst.peak };
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

/**
 * Learns your natural timing, so a swing that feels on time *is* on time.
 *
 * Everyone's swing, phone, and network put the moment we measure a little
 * earlier or later than the moment it feels like the bat meets the ball. So
 * the game keeps your last few swings' timing and finds their middle value
 * (the median: the one in the middle when they're lined up in order, which
 * a single wild swing can't drag around). That's your personal offset: each
 * swing is judged against it. Pulling the ball then means swinging earlier
 * than *you* usually do, just as in real baseball.
 *
 * It's saved in the browser, so the next round starts already calibrated.
 *
 * @param {{ samples: number, maxMs: number, storageKey: string }} options
 *   samples: how many recent swings to learn from; maxMs: the most it will
 *   ever shift timing, either way
 */
export function createTimingCalibration({ samples, maxMs, storageKey }) {
  /** @type {number[]} */
  let recent = [];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) recent = saved.filter(Number.isFinite).slice(-samples);
  } catch {
    // Storage unreadable: start fresh.
  }

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return {
    /** How much to shift each swing's timing, ms (0 until we've seen a swing). */
    get offset() {
      if (recent.length === 0) return 0;
      return Math.max(-maxMs, Math.min(maxMs, median(recent)));
    },

    /**
     * Learns from a swing.
     *
     * @param {number} rawError  the swing's timing before calibration, ms
     */
    learn(rawError) {
      recent = [...recent, rawError].slice(-samples);
      try {
        localStorage.setItem(storageKey, JSON.stringify(recent));
      } catch {
        // Storage blocked: it still works for this visit.
      }
    },
  };
}

/**
 * Wiggling the bat with the phone while you wait for the pitch.
 *
 * Tip the phone and the batter's bat tips the same way. It follows how far
 * the phone has tipped from the way you've been holding it lately, not from
 * some fixed "straight up", so however you like to hold it, holding still
 * lets the bat settle back to its stance, and small wiggles show up right
 * away. It only follows the phone while it's fairly still, so a swing
 * doesn't fling the bat about before the swing itself takes over.
 *
 * @param {{ calmRate: number, settleMs: number, degreesPerTip: number, maxDegrees: number }} options
 *   calmRate: only follow the phone while it's spinning slower than this (°/s);
 *   settleMs: how long the bat takes to settle back when you hold a new tilt;
 *   degreesPerTip: how many degrees the bat tips for each degree the phone does;
 *   maxDegrees: the most the bat tips either way
 */
export function createBatWaggle({ calmRate, settleMs, degreesPerTip, maxDegrees }) {
  /** @type {{ x: number, y: number, z: number } | null} */
  let usual = null;
  let lastT = null;
  let waggle = { side: 0, forward: 0 };

  return {
    /**
     * @param {{ alpha: number, beta: number, gamma: number, gx?: number, gy?: number, gz?: number, t: number }} sample
     * @returns {{ side: number, forward: number }} degrees: `side` tips the bat
     *   left or right as you see the screen, `forward` tips it towards or away from you
     */
    update(sample) {
      if (sample.gx === undefined) return waggle;
      const down = normalize({ x: sample.gx, y: sample.gy, z: sample.gz });
      const spinning = spinSpeed(sample) > calmRate;
      const seconds = lastT === null ? 0 : Math.max(0, Math.min(0.2, (sample.t - lastT) / 1000));
      lastT = sample.t;
      if (!down || spinning) return waggle;
      if (!usual) usual = down;
      // Slowly settle "the usual" towards how the phone's held now.
      const k = Math.min(1, (seconds * 1000) / settleMs);
      usual =
        normalize({
          x: usual.x + (down.x - usual.x) * k,
          y: usual.y + (down.y - usual.y) * k,
          z: usual.z + (down.z - usual.z) * k,
        }) ?? down;
      // How far it's tipped from the usual: across the screen (x) and in and out of it (z).
      const toDegrees = (v) =>
        Math.max(-maxDegrees, Math.min(maxDegrees, ((v * 180) / Math.PI) * degreesPerTip));
      waggle = { side: toDegrees(down.x - usual.x), forward: toDegrees(down.z - usual.z) };
      return waggle;
    },
  };
}
