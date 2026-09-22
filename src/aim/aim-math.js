/**
 * Aiming math: turning a phone's spin into a crosshair position.
 *
 * The big idea, in plain language
 * -------------------------------
 * The phone's gyroscope doesn't say where the phone is pointing. It says how
 * fast the phone is turning right now, in degrees per second. That's like a
 * car's speedometer: it tells you your speed, not where you are.
 *
 * To work out where you are from a speedometer, you multiply speed by time:
 * 60 km/h for half an hour means you moved 30 km. We do the same thing, many
 * times a second: "turning right at 90°/s for 0.02 s" means the phone turned
 * 1.8° right, so the crosshair moves right by the distance that 1.8° is worth.
 * Adding up those tiny steps is called *integration*.
 *
 * All the functions here are pure: they take numbers and return numbers, with
 * no screen, network, or clock involved. That makes them easy to unit-test and
 * lets every game share them.
 *
 * Coordinates
 * -----------
 * Positions are measured in "screen heights" from the centre of the play
 * area, so the same wrist movement feels the same on a laptop and a TV:
 *
 *   x: 0 is the centre, negative is left, positive is right.
 *   y: 0 is the centre, negative is up, positive is down (like the screen).
 *
 * The top edge is y = -0.5 and the bottom is y = +0.5. On a 16:9 screen, the
 * left edge is x = -0.89 and the right edge x = +0.89 (half of 16/9).
 */

/**
 * At sensitivity 1, turning the phone this many degrees moves the crosshair
 * one full screen height. 30° is a comfortable wrist movement, so the whole
 * screen is reachable without contorting your arm.
 */
export const DEGREES_PER_SCREEN_HEIGHT = 30;

/**
 * If two samples are further apart than this, something went wrong in
 * between (a lost message, or the phone's browser paused). We skip that gap
 * rather than guess what the phone did during it, because a big wrong guess
 * would throw the crosshair across the screen.
 */
export const MAX_SAMPLE_GAP_MS = 100;

/**
 * @typedef {{ alpha: number, beta: number, gamma: number }} RotationRate
 *   Raw gyroscope reading from the phone, in degrees per second. Which
 *   physical axis each name refers to depends on the browser (see AXIS_ORDERS).
 *
 * @typedef {{ x: number, y: number, z: number }} Vector
 *   A direction or rotation measured along the phone's own three axes:
 *     x: runs left to right across the screen
 *     y: runs from the bottom edge to the top edge
 *     z: sticks straight out of the screen, towards your face
 *
 * @typedef {{ yaw: number, pitch: number }} AimRates
 *   The two turns that matter for aiming, in degrees per second:
 *     yaw:   turning left/right. Positive = turning right.
 *     pitch: tipping up/down. Positive = aiming higher.
 *
 * @typedef {{ x: number, y: number }} Position  In screen heights (see above).
 */

/**
 * Browsers disagree about which of alpha/beta/gamma is which axis.
 *
 * The W3C spec says alpha is the spin around z, beta around x, and gamma
 * around y. Chrome on Android instead reports them in plain x, y, z order.
 * Getting this wrong swaps "turning" with "twisting your wrist", so it's a
 * setting (in the D panel) rather than a guess buried in the code.
 */
export const AXIS_ORDERS = Object.freeze({
  /** Chrome on Android: alpha = x, beta = y, gamma = z. */
  xyz: (rate) => ({ x: rate.alpha, y: rate.beta, z: rate.gamma }),
  /** The W3C spec: alpha = z, beta = x, gamma = y. */
  zxy: (rate) => ({ x: rate.beta, y: rate.gamma, z: rate.alpha }),
});

/** Which way is "up" when we have no gravity reading: phone flat, screen facing the ceiling. */
export const SCREEN_UP = Object.freeze({ x: 0, y: 0, z: 1 });

/** @param {Vector} a @param {Vector} b */
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Scales a vector to length 1, so it describes only a direction.
 *
 * @param {Vector} v
 * @returns {Vector | null} null if the vector is too short to have a direction
 */
export function normalize(v) {
  const length = Math.hypot(v.x, v.y, v.z);
  return length < 1e-6 ? null : { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * Works out how fast the phone is aiming left/right and up/down, however
 * it's held.
 *
 * The gyroscope measures spin around the phone's own axes. But "left/right"
 * and "up/down" belong to the room, not the phone: tilt the phone 45° and a
 * pure left/right turn shows up partly on one phone axis and partly on another.
 * So we use gravity to find the room's directions, then measure the spin
 * around those instead.
 *
 * - Left/right (yaw) is spin around the room's vertical axis, the `up`
 *   direction from gravity. The dot product measures how much of the spin is
 *   around that axis. Spin counts anticlockwise (seen from above) as positive,
 *   which is turning *left*, so we flip the sign to make "right" positive.
 * - Up/down (pitch) is spin around the room's horizontal left-to-right axis.
 *   The phone's own x axis runs left to right across the screen, so we take
 *   that and remove any tilt it has towards vertical (that's the
 *   `x - (x·up) up` step), leaving a flat left-to-right line.
 * - Twisting your wrist spins the phone around the direction it points,
 *   which is neither of those axes, so it doesn't move the crosshair.
 *
 * This works whether you hold the phone flat like a TV remote, upright like a
 * camera, or anywhere in between.
 *
 * @param {Vector} spin  rotation rate around the phone's x, y, z axes (see AXIS_ORDERS)
 * @param {Vector} up    unit vector pointing at the ceiling, in phone axes
 * @returns {AimRates}
 */
export function toAimRates(spin, up) {
  const flatRight = normalize({ x: 1 - up.x * up.x, y: -up.x * up.y, z: -up.x * up.z });
  return {
    yaw: -dot(spin, up),
    // If the phone's x axis points straight up (phone held sideways), there's no
    // sensible "left to right", so up/down aiming pauses rather than going haywire.
    pitch: flatRight ? dot(spin, flatRight) : 0,
  };
}

/**
 * Ignores very slow turning.
 *
 * Even a phone lying still on a table reports a tiny bit of spin, because the
 * sensor is noisy and hands shake. Added up over time, that noise makes the
 * crosshair creep. The deadzone says: "if the phone is turning slower than
 * this, treat it as still."
 *
 * Two details make it feel smooth:
 * - It looks at the combined speed of both axes (using Pythagoras), so a
 *   slow diagonal movement isn't cut off on one axis but not the other.
 * - Above the deadzone it subtracts the deadzone rather than switching on
 *   abruptly. Speed 1°/s over the line becomes 1°/s, not a sudden jump.
 *
 * @param {AimRates} rates
 * @param {number} deadzone  degrees per second
 * @returns {AimRates}
 */
export function applyDeadzone(rates, deadzone) {
  const speed = Math.hypot(rates.yaw, rates.pitch);
  if (speed <= deadzone) return { yaw: 0, pitch: 0 };
  const keep = (speed - deadzone) / speed;
  return { yaw: rates.yaw * keep, pitch: rates.pitch * keep };
}

/**
 * Moves a position by "turning speed × time" (the speedometer idea above).
 *
 * @param {Position} position
 * @param {AimRates} rates        degrees per second
 * @param {number} dtMs           how long the phone turned at that speed
 * @param {number} sensitivity    multiplier: 2 = crosshair moves twice as far
 * @returns {Position}
 */
export function integrate(position, rates, dtMs, sensitivity) {
  const seconds = dtMs / 1000;
  // How many screen heights one degree of turning is worth.
  const heightsPerDegree = sensitivity / DEGREES_PER_SCREEN_HEIGHT;
  return {
    x: position.x + rates.yaw * seconds * heightsPerDegree,
    // Screens count y downwards, so tipping up (positive pitch) must make y smaller.
    y: position.y - rates.pitch * seconds * heightsPerDegree,
  };
}

/**
 * Keeps a position inside the play area.
 *
 * If you keep turning past the edge, the crosshair waits at the edge, and it
 * moves back as soon as you turn back. (The phone and the crosshair then
 * disagree about where "centre" is, which is what the Re-center button fixes.)
 *
 * @param {Position} position
 * @param {number} aspect  play area width ÷ height, e.g. 16/9
 * @returns {Position}
 */
export function clampToArea(position, aspect) {
  const halfWidth = aspect / 2;
  return {
    x: Math.min(halfWidth, Math.max(-halfWidth, position.x)),
    y: Math.min(0.5, Math.max(-0.5, position.y)),
  };
}

/**
 * How far to move the displayed crosshair towards its target this frame.
 *
 * Smoothing hides jitter by letting the crosshair you see glide towards the
 * true position instead of jumping. Each frame it closes a fraction of the
 * remaining distance: 1 means "jump all the way", 0.2 means "a fifth of the way".
 *
 * The fraction depends on how long the frame took. On a 120 Hz screen frames
 * are half as long as at 60 Hz, so each one should close less of the gap;
 * otherwise the same setting would feel different on different screens. The
 * exponential formula below gets this exactly right: `smoothingMs` is how
 * long it takes to close about two-thirds (63%) of any gap, whatever the frame rate.
 *
 * @param {number} dtMs         time since the last frame
 * @param {number} smoothingMs  0 = no smoothing
 * @returns {number} between 0 and 1
 */
export function smoothingFactor(dtMs, smoothingMs) {
  if (smoothingMs <= 0) return 1;
  return 1 - Math.exp(-dtMs / smoothingMs);
}

/**
 * @param {Position} current
 * @param {Position} target
 * @param {number} factor  from smoothingFactor()
 * @returns {Position}
 */
export function smoothToward(current, target, factor) {
  return {
    x: current.x + (target.x - current.x) * factor,
    y: current.y + (target.y - current.y) * factor,
  };
}

/**
 * Converts a position to pixels, for drawing.
 *
 * @param {Position} position
 * @param {{ width: number, height: number }} area  play area size in pixels
 * @returns {Position} pixels from the play area's top-left corner
 */
export function toPixels(position, { width, height }) {
  return { x: width / 2 + position.x * height, y: height / 2 + position.y * height };
}
