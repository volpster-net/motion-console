/**
 * Your batter's stance and swing, in 3D.
 *
 * You're a right-handed batter in the left-hand batter's box. Positions are
 * in metres around the spot where you stand:
 *
 *   x  towards the plate (the way you face)
 *   y  up
 *   z  towards the pitcher (your front, left shoulder points this way)
 *
 * How the swing is built, in plain language
 * -----------------------------------------
 * A real swing is a chain: the hips turn first, the shoulders follow, then
 * the arms and bat whip round. So rather than moving every joint on its own,
 * the swing is described by a few "controls" over time:
 *
 *   hipTurn, shoulderTurn  how far the hips and shoulders have turned from
 *                          facing the plate towards the pitcher (degrees)
 *   hands                  where the hands are
 *   batYaw, batTilt        which way the bat points: round the batter
 *                          (0 = at the plate, 90 = at the pitcher) and up/down
 *
 * The body is then built from those: shoulders and hips sit either side of
 * the turning body, elbows between shoulders and hands, and the bat is always
 * exactly one bat-length long, so it swings in a true arc instead of
 * shrinking and stretching.
 *
 * The controls glide smoothly through their key values (a spline), rather
 * than easing to a stop at each one. So the swing flows, fastest through
 * contact, then slowing into the follow-through, like a real one.
 *
 *   stance ─▶ load ─▶ launch ─▶ CONTACT ─▶ extension ─▶ follow-through
 */

/** The moment in the swing (0 to 1) when the bat meets the ball. */
export const CONTACT_AT = 0.45;

/** Bat length, metres. */
const BAT = 0.84;

/**
 * Key values of the swing's controls, plus the legs and head, modelled on a
 * real swing sequence (stance, stride, contact, extension, follow-through).
 * Values not listed carry over from the previous key.
 */
const KEYS = fillIn([
  {
    // Stance: feet wide, knees bent, hands up by the back ear, the bat
    // nearly upright, tipped slightly back.
    at: 0,
    hipTurn: 0,
    shoulderTurn: -8,
    chest: [0.04, 1.36, -0.02],
    head: [0.1, 1.64, 0.08],
    hands: [-0.08, 1.58, -0.22],
    batYaw: -150,
    batTilt: 75,
    lKnee: [0.16, 0.5, 0.34],
    lFoot: [0.02, 0.02, 0.4],
    rKnee: [0.12, 0.5, -0.34],
    rFoot: [0, 0.02, -0.4],
  },
  {
    // Stride: the front foot reaches towards the pitcher and lands, hips and
    // shoulders coil back, hands stay back at shoulder height, and the bat
    // lays back almost flat, pointing towards the catcher.
    at: 0.3,
    hipTurn: -10,
    shoulderTurn: -22,
    hands: [-0.12, 1.45, -0.32],
    batYaw: -165,
    batTilt: 12,
    lKnee: [0.14, 0.5, 0.46],
    lFoot: [0.04, 0.02, 0.52],
  },
  {
    // Launch: the hips fire open first, the hands start forwards, and the bat
    // stays flat as it comes round.
    at: 0.38,
    hipTurn: 20,
    shoulderTurn: -5,
    chest: [0.05, 1.33, 0],
    hands: [-0.02, 1.3, -0.25],
    batYaw: -120,
    batTilt: 5,
  },
  {
    // Contact: front leg firm, back knee driving in with the heel up, hips
    // open, arms extending, head down on the ball, and the bat level out
    // front over the plate.
    at: CONTACT_AT,
    hipTurn: 55,
    shoulderTurn: 35,
    chest: [0.03, 1.32, 0],
    head: [0.1, 1.58, 0.06],
    hands: [0.32, 1.05, -0.1],
    batYaw: 0,
    batTilt: -6,
    lKnee: [0.07, 0.5, 0.47],
    rKnee: [0.22, 0.42, -0.2],
    rFoot: [0.04, 0.08, -0.4],
  },
  {
    // Extension: arms reach out towards the pitcher, the bat rising as it
    // carries on round.
    at: 0.6,
    hipTurn: 85,
    shoulderTurn: 85,
    chest: [0.04, 1.35, 0.06],
    head: [0.08, 1.6, 0.1],
    hands: [0.45, 1.3, 0.35],
    batYaw: 60,
    batTilt: 30,
  },
  {
    // Follow-through: chest facing the pitcher, hands up by the front
    // shoulder, the bat wrapped flat round behind the neck, back foot up on
    // its toe.
    at: 0.82,
    hipTurn: 95,
    shoulderTurn: 120,
    chest: [0.03, 1.38, 0.05],
    head: [0.08, 1.62, 0.14],
    hands: [0.02, 1.5, 0.28],
    batYaw: 170,
    batTilt: 8,
    rKnee: [0.14, 0.5, -0.12],
    rFoot: [0.06, 0.1, -0.3],
  },
  {
    // Settling: the bat dropping a little behind the back.
    at: 1,
    shoulderTurn: 118,
    hands: [0.05, 1.45, 0.25],
    batYaw: 180,
    batTilt: -5,
  },
]);

/** Fills in each key from the ones before it, so keys only list what changes. */
function fillIn(keys) {
  let previous = {};
  return keys.map((key) => (previous = { ...previous, ...key }));
}

/**
 * A smooth curve through the keys (a Catmull-Rom spline): at each key, the
 * value keeps moving at the average speed of the stretches either side, so
 * nothing stops dead at a key the way easing in and out would.
 *
 * @param {string} name  which control
 * @param {number} t     0 to 1
 */
function glide(name, t) {
  const n = KEYS.length;
  if (t <= KEYS[0].at) return KEYS[0][name];
  if (t >= KEYS[n - 1].at) return KEYS[n - 1][name];
  const i = KEYS.findIndex((key) => key.at > t) - 1;
  const [a, b] = [KEYS[i], KEYS[i + 1]];
  const before = KEYS[Math.max(0, i - 1)];
  const after = KEYS[Math.min(n - 1, i + 2)];
  const span = b.at - a.at;
  const u = (t - a.at) / span;
  // Cubic Hermite blend of the two keys and their slopes.
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  // How fast the value is changing at a key: across the stretches either side of it.
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

const toRad = (deg) => (deg * Math.PI) / 180;
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, k) => a.map((v) => v * k);
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

/** Which way the batter's left side points, when his body has turned `turnDeg` from facing the plate. */
const leftSide = (turnDeg) => [-Math.sin(toRad(turnDeg)), 0, Math.cos(toRad(turnDeg))];

/**
 * Builds the full body from the swing's controls.
 *
 * @param {Record<string, any>} c  control values at one moment
 */
function bodyFrom(c) {
  const shoulders = leftSide(c.shoulderTurn);
  const hips = leftSide(c.hipTurn);
  const pelvis = [0, 0.95, 0];
  const lShoulder = add(c.chest, add(scale(shoulders, 0.19), [0, 0.04, 0]));
  const rShoulder = add(c.chest, add(scale(shoulders, -0.19), [0, 0.05, 0]));
  // Elbows: between shoulder and hands, dropped a little and bowed outwards.
  const elbow = (shoulder, side) =>
    add(mix(shoulder, c.hands, 0.5), add([0, -0.09, 0], scale(side, 0.07)));
  const yaw = toRad(c.batYaw);
  const tilt = toRad(c.batTilt);
  const batDirection = [
    Math.cos(tilt) * Math.cos(yaw),
    Math.sin(tilt),
    Math.cos(tilt) * Math.sin(yaw),
  ];
  return {
    head: c.head,
    neck: mix(c.chest, c.head, 0.5),
    chest: c.chest,
    lShoulder,
    rShoulder,
    lElbow: elbow(lShoulder, shoulders),
    rElbow: elbow(rShoulder, scale(shoulders, -1)),
    hands: c.hands,
    batTip: add(c.hands, scale(batDirection, BAT)),
    lHip: add(pelvis, scale(hips, 0.13)),
    rHip: add(pelvis, scale(hips, -0.13)),
    lKnee: c.lKnee,
    rKnee: c.rKnee,
    lFoot: c.lFoot,
    rFoot: c.rFoot,
  };
}

const CONTROLS = Object.keys(KEYS[0]).filter((key) => key !== 'at');

/** The controls at moment `t` of the swing (0 to 1). */
function controlsAt(t) {
  return Object.fromEntries(CONTROLS.map((name) => [name, glide(name, t)]));
}

/** Blends two sets of controls, `k` of the way from `a` to `b`. */
function blend(a, b, k) {
  return Object.fromEntries(
    CONTROLS.map((name) => [
      name,
      Array.isArray(a[name]) ? mix(a[name], b[name], k) : a[name] + (b[name] - a[name]) * k,
    ]),
  );
}

/**
 * Adjusts the swing to meet the ball.
 *
 * Pitches cross the plate high or low, in or out, so around contact the
 * hands shift until the part of the bat over the ball's spot passes right
 * through it. The shift is strongest at contact and fades smoothly either
 * side, so the rest of the swing is untouched.
 *
 * @param {Record<string, any>} c  controls at moment `t`
 * @param {number} t
 * @param {number[] | null} reach  where the ball crosses the plate, [x, y, z] around the batter
 */
function reachFor(c, t, reach) {
  if (!reach) return c;
  const weight = Math.exp(-(((t - CONTACT_AT) / 0.1) ** 2));
  if (weight < 0.01) return c;
  // Where the bat is at contact without adjusting, at the ball's distance out over the plate.
  const contact = controlsAt(CONTACT_AT);
  const yaw = toRad(contact.batYaw);
  const tilt = toRad(contact.batTilt);
  const along = Math.min(
    BAT,
    Math.max(BAT * 0.4, (reach[0] - contact.hands[0]) / (Math.cos(tilt) * Math.cos(yaw))),
  );
  const barrel = [
    contact.hands[0] + along * Math.cos(tilt) * Math.cos(yaw),
    contact.hands[1] + along * Math.sin(tilt),
    contact.hands[2] + along * Math.cos(tilt) * Math.sin(yaw),
  ];
  // Move the hands up/down and in/out by the gap (not along the bat).
  const shift = [0, (reach[1] - barrel[1]) * weight, (reach[2] - barrel[2]) * weight];
  return { ...c, hands: add(c.hands, shift) };
}

/**
 * The pose at moment `t` of the swing (0 to 1), optionally reaching for a
 * pitch at `reach` (see reachFor); exported for tests.
 *
 * @param {number} t
 * @param {number[] | null} [reach]
 */
export function swingPose(t, reach = null) {
  const at = Math.min(1, Math.max(0, t));
  return bodyFrom(reachFor(controlsAt(at), at, reach));
}

/**
 * @param {{ swingMs: number, holdMs: number, returnMs: number, startAt: number }} timing
 *   swingMs: how long the swing takes from `startAt` to the end;
 *   startAt: where in the swing the animation begins when you swing (the
 *   phone reports a swing a moment after it happens, so we skip ahead to keep
 *   the bat in step with you)
 */
export function createBatter(timing) {
  const stance = controlsAt(0);
  const finish = controlsAt(1);
  /** Eases out: quick to leave the follow-through, gentle arriving back in the stance. */
  const settle = (k) => 1 - (1 - k) ** 2;

  return {
    /**
     * The batter's pose now, with joints as [x, y, z] (see above).
     *
     * @param {number} sinceSwing  ms since a swing was detected (Infinity if none yet)
     * @param {number} now         ms, for the little bat waggle while waiting
     * @param {number[] | null} [reach]  where this pitch crosses the plate, around the batter
     */
    pose(sinceSwing, now, reach = null) {
      const { swingMs, holdMs, returnMs, startAt } = timing;
      if (sinceSwing < swingMs) {
        return swingPose(startAt + (1 - startAt) * (sinceSwing / swingMs), reach);
      }
      if (sinceSwing < swingMs + holdMs) return bodyFrom(finish);
      if (sinceSwing < swingMs + holdMs + returnMs) {
        return bodyFrom(blend(finish, stance, settle((sinceSwing - swingMs - holdMs) / returnMs)));
      }
      // Waiting: a gentle waggle of the bat.
      const waggle = Math.sin(now / 260);
      return bodyFrom({
        ...stance,
        batYaw: stance.batYaw + waggle * 6,
        batTilt: stance.batTilt - waggle * 3,
      });
    },
  };
}
