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
 * Key values of the swing's controls, plus the legs and head.
 * Values not listed carry over from the previous key.
 */
const KEYS = fillIn([
  {
    // Stance: facing the plate, knees soft, hands up by the back shoulder,
    // bat up and angled back over the shoulder.
    at: 0,
    hipTurn: 0,
    shoulderTurn: -5,
    chest: [0.05, 1.38, 0],
    head: [0.1, 1.66, 0.06],
    hands: [-0.02, 1.5, -0.24],
    batYaw: -115,
    batTilt: 62,
    lKnee: [0.14, 0.52, 0.32],
    lFoot: [0.04, 0.02, 0.38],
    rKnee: [0.1, 0.52, -0.32],
    rFoot: [0, 0.02, -0.38],
  },
  {
    // Load: hips and shoulders coil back, hands drift back, front foot strides.
    at: 0.25,
    hipTurn: -8,
    shoulderTurn: -18,
    hands: [-0.1, 1.52, -0.32],
    batYaw: -128,
    batTilt: 55,
    lKnee: [0.14, 0.6, 0.4],
    lFoot: [0.05, 0.1, 0.48],
  },
  {
    // Launch: front foot down, hips start to open, the bat drops into the slot.
    at: 0.36,
    hipTurn: 15,
    shoulderTurn: -5,
    hands: [-0.02, 1.35, -0.28],
    batYaw: -95,
    batTilt: 35,
    lKnee: [0.12, 0.5, 0.45],
    lFoot: [0.05, 0.02, 0.5],
  },
  {
    // Contact: hips well open, shoulders following, hands out front, the bat
    // level and pointing at the plate.
    at: CONTACT_AT,
    hipTurn: 45,
    shoulderTurn: 30,
    chest: [0.07, 1.36, 0.02],
    head: [0.12, 1.62, 0.08],
    hands: [0.3, 1.05, -0.02],
    batYaw: 0,
    batTilt: -4,
    rKnee: [0.2, 0.48, -0.25],
    rFoot: [0.02, 0.06, -0.38],
  },
  {
    // Extension: arms long, the bat carrying on round towards left field.
    at: 0.6,
    hipTurn: 75,
    shoulderTurn: 75,
    hands: [0.4, 1.15, 0.28],
    batYaw: 75,
    batTilt: 14,
  },
  {
    // Follow-through: chest facing the pitcher, hands over the front
    // shoulder, the bat wrapped round behind, back foot up on its toe.
    at: 0.85,
    hipTurn: 90,
    shoulderTurn: 105,
    chest: [0.03, 1.38, 0.05],
    head: [0.07, 1.64, 0.12],
    hands: [0.02, 1.52, 0.26],
    batYaw: 160,
    batTilt: 30,
    rKnee: [0.12, 0.5, -0.15],
    rFoot: [0.05, 0.08, -0.32],
  },
  {
    // Settling at the end of the follow-through.
    at: 1,
    shoulderTurn: 108,
    hands: [0, 1.54, 0.26],
    batYaw: 170,
    batTilt: 33,
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

/** The pose at moment `t` of the swing (0 to 1); exported for tests. */
export function swingPose(t) {
  return bodyFrom(controlsAt(Math.min(1, Math.max(0, t))));
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
     */
    pose(sinceSwing, now) {
      const { swingMs, holdMs, returnMs, startAt } = timing;
      if (sinceSwing < swingMs) {
        return bodyFrom(controlsAt(startAt + (1 - startAt) * (sinceSwing / swingMs)));
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
