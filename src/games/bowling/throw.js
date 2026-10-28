/**
 * Reads a bowling throw from the phone: hold Fire to pick up the ball, swing
 * your arm back and then forward underhand, and let go of Fire to release.
 *
 * Three things are measured in the moments before you let go:
 *
 * - Speed: how fast the phone tips forward (the same upward tipping Hoops
 *   reads for a shot). An underhand swing forward tips the phone's top up.
 *   The fastest moment in the last ~quarter second sets the ball's speed.
 *
 * - Aim: whether your arm was also drifting left or right (turning). A
 *   straight swing goes straight; swinging across your body sends the ball off
 *   at an angle. We average the last tenth of a second, so one jolt doesn't
 *   decide it.
 *
 * - Spin: twisting your wrist like a doorknob as you let go. Twist clockwise
 *   and the ball hooks right; anticlockwise and it hooks left. Small twists
 *   are ignored, so a plain release rolls straight.
 *
 *   speed ▲        peak
 *         │       ╱╲         ← forward swing
 *         │──╲──╱────╲─┊──
 *         │   ╲╱       ┊     ← backswing
 *         └────────[ ]─┴─▶ time
 *                aim, spin  let go
 */

/**
 * @typedef {{ t: number, swing: number, turn: number, twist: number }} ThrowSample
 *   swing: forward tipping speed, °/s (rates.pitch). turn: left/right, °/s, right positive
 *   (rates.yaw). twist: wrist roll, °/s, clockwise positive (body.twist).
 *
 * @typedef {object} ThrowConfig
 * @property {number} swingWindowMs  look this far back for the fastest forward swing
 * @property {number} aimWindowMs    average the turning over this long
 * @property {number} spinWindowMs   average the twist over this long
 * @property {number} weakest        forward swing speeds (°/s) that count as the slowest (0)…
 * @property {number} strongest      …and fastest (1) throws
 * @property {number} minSwing       slower than this isn't a throw at all, just letting go
 * @property {number} slowestBall    ball speed (m/s) at the weakest swing…
 * @property {number} fastestBall    …and at the strongest
 * @property {number} turnDeadzone   turning slower than this (°/s) counts as straight
 * @property {number} degreesPerTurn launch angle (°) for each °/s of turning past the deadzone
 * @property {number} maxAngle       the widest launch angle, either side (°)
 * @property {number} twistDeadzone  twisting slower than this (°/s) adds no spin
 * @property {number} fullTwist      twisting this fast (°/s) past the deadzone is full spin
 */

/**
 * Keeps a short memory of the swing while the ball is held.
 *
 * @param {ThrowConfig} config
 */
export function createThrowMemory(config) {
  /** @type {ThrowSample[]} */
  let recent = [];
  const keepMs = Math.max(config.swingWindowMs, config.aimWindowMs, config.spinWindowMs) * 2;

  return {
    /** @param {ThrowSample} sample */
    add(sample) {
      recent.push(sample);
      const oldest = sample.t - keepMs;
      // Drop old samples, and anything from before a phone clock restart.
      if (recent[0].t < oldest || sample.t < recent[0].t) {
        recent = recent.filter((s) => s.t >= oldest && s.t <= sample.t);
      }
    },

    /**
     * What the swing looked like as the ball was let go.
     *
     * @returns {{ swing: number, turn: number, twist: number }}  peak swing, average turn and twist (°/s)
     */
    read() {
      const latest = recent.at(-1);
      if (!latest) return { swing: 0, turn: 0, twist: 0 };
      const within = (ms) => recent.filter((s) => latest.t - s.t <= ms);
      const average = (list, key) =>
        list.length === 0 ? 0 : list.reduce((total, s) => total + s[key], 0) / list.length;
      return {
        swing: Math.max(0, ...within(config.swingWindowMs).map((s) => s.swing)),
        turn: average(within(config.aimWindowMs), 'turn'),
        twist: average(within(config.spinWindowMs), 'twist'),
      };
    },

    /** Forgets everything, e.g. when the ball is picked up again. */
    clear() {
      recent = [];
    },
  };
}

/**
 * Turns the measured swing into a ball: speed, launch angle, and spin.
 *
 * @param {{ swing: number, turn: number, twist: number }} measured  from read()
 * @param {ThrowConfig} config
 * @returns {{ speed: number, angleDeg: number, spin: number, power: number }}
 *   speed in m/s, angle off straight (positive = right), spin -1 to 1, power 0 to 1
 */
export function releaseBall({ swing, turn, twist }, config) {
  const power = clamp((swing - config.weakest) / (config.strongest - config.weakest), 0, 1);
  const speed = config.slowestBall + power * (config.fastestBall - config.slowestBall);
  const angleDeg = clamp(
    pastDeadzone(turn, config.turnDeadzone) * config.degreesPerTurn,
    -config.maxAngle,
    config.maxAngle,
  );
  const spin = clamp(pastDeadzone(twist, config.twistDeadzone) / config.fullTwist, -1, 1);
  return { speed, angleDeg, spin, power };
}

/** Speeds inside the deadzone count as 0; outside it, the deadzone is subtracted so there's no jump. */
const pastDeadzone = (value, deadzone) =>
  Math.abs(value) <= deadzone ? 0 : value - Math.sign(value) * deadzone;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
