/**
 * What the batter and the pitcher share: the size of a cartoon ballplayer,
 * a little 3D vector maths, bending an arm or leg at its elbow or knee, and
 * gliding smoothly through key poses.
 *
 * Positions are [x, y, z] in metres, y up.
 */

/** @typedef {[number, number, number]} V */

/** A chunky cartoon ballplayer, like a Wii Sports Mii: sizes in metres. */
export const BODY = {
  hipHeight: 0.6,
  hipWidth: 0.2,
  torso: 0.4,
  shoulderWidth: 0.34,
  headAbove: 0.27,
  headRadius: 0.19,
  upperArm: 0.2,
  foreArm: 0.2,
  thigh: 0.29,
  shin: 0.28,
};

export const add = (a, b) => /** @type {V} */ (a.map((v, i) => v + b[i]));
export const sub = (a, b) => /** @type {V} */ (a.map((v, i) => v - b[i]));
export const mul = (a, k) => /** @type {V} */ (a.map((v) => v * k));
export const mix = (a, b, k) => /** @type {V} */ (a.map((v, i) => v + (b[i] - v) * k));
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const cross = (a, b) =>
  /** @type {V} */ ([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]);
export const length = (a) => Math.hypot(...a);
export const unit = (a) => mul(a, 1 / (length(a) || 1));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const toRad = (deg) => (deg * Math.PI) / 180;

/** Turns `v` round `axis` (a unit vector) by `angle` radians. */
export function turn(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

/**
 * A player stands with his left side along +z and faces +x. When he has
 * turned `deg` (towards +z), these are which way his left side points and
 * which way he faces.
 */
export const leftSide = (deg) =>
  /** @type {V} */ ([-Math.sin(toRad(deg)), 0, Math.cos(toRad(deg))]);
export const facing = (deg) => /** @type {V} */ ([Math.cos(toRad(deg)), 0, Math.sin(toRad(deg))]);

/**
 * Where an elbow (or knee) goes so both bones keep their length, bending
 * towards `pole`.
 */
export function bend(root, end, first, second, pole) {
  const d = sub(end, root);
  const reach = Math.min(length(d), first + second - 1e-4);
  const u = unit(d);
  const along = (first * first - second * second + reach * reach) / (2 * reach);
  const out = Math.sqrt(Math.max(0, first * first - along * along));
  const toPole = sub(pole, root);
  let side = sub(toPole, mul(u, dot(toPole, u)));
  if (length(side) < 1e-6) side = [0, -1, 0];
  return add(add(root, mul(u, along)), mul(unit(side), out));
}

/**
 * Key poses, played smoothly. Each key lists the moment it happens (`at`, 0
 * to 1) and the values that change; values not listed carry over from the
 * key before. Between keys the values glide along smooth curves (a cubic
 * Hermite spline): at each key they keep moving at the average speed of the
 * stretches either side, so nothing stops dead at a key.
 *
 * @param {Array<{ at: number } & Record<string, number | number[]>>} list
 * @returns {(t: number) => Record<string, any>}  the values at moment `t`
 */
export function keyPoses(list) {
  let previous = {};
  const keys = list.map((key) => (previous = { ...previous, ...key }));
  const names = Object.keys(keys[0]).filter((name) => name !== 'at');
  const n = keys.length;
  function glide(name, t) {
    if (t <= keys[0].at) return keys[0][name];
    if (t >= keys[n - 1].at) return keys[n - 1][name];
    const i = keys.findIndex((key) => key.at > t) - 1;
    const [a, b] = [keys[i], keys[i + 1]];
    const before = keys[Math.max(0, i - 1)];
    const after = keys[Math.min(n - 1, i + 2)];
    const span = b.at - a.at;
    const u = (t - a.at) / span;
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
    const h10 = u ** 3 - 2 * u ** 2 + u;
    const h01 = -2 * u ** 3 + 3 * u ** 2;
    const h11 = u ** 3 - u ** 2;
    const slope = (lo, hi, value) => (value(hi) - value(lo)) / (hi.at - lo.at);
    const one = (value) =>
      h00 * value(a) +
      h10 * span * slope(before, b, value) +
      h01 * value(b) +
      h11 * span * slope(a, after, value);
    const first = a[name];
    return Array.isArray(first)
      ? first.map((_, k) => one((key) => key[name][k]))
      : one((key) => key[name]);
  }
  return (t) => Object.fromEntries(names.map((name) => [name, glide(name, t)]));
}
