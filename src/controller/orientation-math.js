/**
 * Pure orientation helpers, kept free of DOM so they can be unit tested.
 *
 * Raw DeviceOrientationEvent angles (W3C spec, device in portrait):
 *   alpha   0..360  rotation around the screen's normal; increases counter-clockwise from above
 *   beta -180..180  front/back tilt; increases as the top edge rises
 *   gamma  -90..90  left/right tilt; increases as the right edge dips
 *
 * Re-centering is a simple per-axis offset. That's plenty for pointing-style
 * input; true 3D re-centering would use quaternions (see README roadmap).
 */

/** Wraps any angle into [-180, 180). */
export function wrap180(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * @typedef {{ alpha: number, beta: number, gamma: number }} RawOrientation
 * @typedef {{ yaw: number, pitch: number, roll: number }} Orientation
 */

/**
 * @param {RawOrientation} raw
 * @param {RawOrientation} zero the reading captured at the last re-center
 * @returns {Orientation}
 */
export function relativeOrientation(raw, zero) {
  return {
    yaw: wrap180(zero.alpha - raw.alpha), // flipped so turning right is positive
    pitch: wrap180(raw.beta - zero.beta),
    roll: wrap180(raw.gamma - zero.gamma),
  };
}

/** Rounds to 0.1° (plenty for input, and a smaller payload). Avoids -0. */
export function roundOrientation({ yaw, pitch, roll }) {
  const round = (n) => Math.round(n * 10) / 10 || 0;
  return { yaw: round(yaw), pitch: round(pitch), roll: round(roll) };
}

/** @param {Orientation} a @param {Orientation} b */
export function sameOrientation(a, b) {
  return a.yaw === b.yaw && a.pitch === b.pitch && a.roll === b.roll;
}
