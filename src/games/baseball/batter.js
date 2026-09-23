/**
 * Your batter's stance and swing, in 3D, the Wii Sports way: a chunky,
 * cartoon ballplayer (big head, short body, slim arms and legs) with a big
 * snappy swing. batter-model.js draws him.
 *
 * Positions are in metres around the spot where he stands:
 *
 *   x  towards the plate (the way he faces in his stance)
 *   y  up
 *   z  towards the pitcher (his front, left side points this way)
 *
 * How the swing is built, in plain language
 * -----------------------------------------
 * A swing is the body turning and the bat whipping round with it. So rather
 * than moving every joint on its own, the swing is a few "controls" over
 * time, and the body is built from them:
 *
 *   turn             how far his shoulders have turned from facing the
 *                    plate towards the pitcher (degrees; his hips turn a
 *                    little less)
 *   hands            where his hands are
 *   batYaw, batTilt  which way the bat points: round him (0 = at the plate,
 *                    90 = at the pitcher, 180 = back behind him) and up/down
 *   stride           how far his front foot has stepped towards the pitcher
 *                    (negative: lifted in his leg kick)
 *   pivot            how far his back foot has spun up onto its toe (0 to 1)
 *
 * The controls glide through their key values on smooth curves (a spline),
 * so the swing flows, fastest through contact:
 *
 *   stance ─▶ load ─▶ launch ─▶ CONTACT ─▶ extension ─▶ wrap ─▶ finish
 *
 * The leg kick and load (0 to 0.30) play as the pitch comes in; the rest
 * plays when you swing. Around contact the swing bends a little to meet the
 * ball: the hands move towards the pitch and the bat turns to pass right
 * through it, fading back to the normal swing either side.
 */

/** The moment in the swing (0 to 1) when the bat meets the ball. */
export const CONTACT_AT = 0.45;

/** How far into the swing he's loaded and ready. */
export const LOADED_AT = 0.3;

/** Bat length, metres: big, like a cartoon bat. */
export const BAT = 0.95;

/** Where the top hand holds the bat, measured from the knob. */
export const GRIP = 0.16;

/** His body: the sizes of a chunky cartoon ballplayer, metres. */
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

/** How far along the bat (from the top hand) the ball is met: the sweet spot. */
const SWEET_SPOT = 0.55;

/**
 * The swing's key moments. Values not listed carry over from the previous key.
 */
const KEYS = fillIn([
  {
    // Stance: upright, turned a little away so we see his back, hands
    // together at shoulder height out beside his head, the bat leaning back
    // over his head.
    at: 0,
    turn: -25,
    hands: [0.24, 0.98, -0.14],
    batYaw: -150,
    batTilt: 68,
    stride: 0,
    pivot: 0,
  },
  {
    // Leg kick: the front foot lifts, he coils back, the bat tips back.
    at: 0.15,
    turn: -32,
    hands: [0.13, 1.0, -0.18],
    batYaw: -150,
    batTilt: 62,
    stride: -0.03,
  },
  {
    // Loaded: the front foot down a little further out, hands back, ready.
    at: LOADED_AT,
    turn: -38,
    hands: [0.08, 1.0, -0.22],
    batYaw: -155,
    batTilt: 50,
    stride: 0.08,
  },
  {
    // Launch: he turns, the hands drive forward and the bat flattens out
    // behind him.
    at: 0.38,
    turn: 10,
    hands: [0.04, 1.02, -0.14],
    batYaw: -160,
    batTilt: 14,
  },
  {
    // Contact: turned towards the pitcher, arms out over the plate, the bat
    // level and pointing at the plate.
    at: CONTACT_AT,
    turn: 62,
    hands: [0.22, 0.93, 0.06],
    batYaw: -4,
    batTilt: -6,
    pivot: 0.5,
  },
  {
    // Extension: arms out towards the pitcher, the bat still sweeping round.
    at: 0.58,
    turn: 105,
    hands: [0.24, 1.02, 0.26],
    batYaw: 75,
    batTilt: 8,
    pivot: 0.9,
  },
  {
    // Wrap: the bat carries on round behind him, hands rising.
    at: 0.78,
    turn: 140,
    hands: [0.06, 1.2, 0.24],
    batYaw: 175,
    batTilt: 24,
    pivot: 1,
  },
  {
    // Finish: hands up by his front shoulder, the bat over his shoulder,
    // pointing back behind him.
    at: 1,
    turn: 150,
    hands: [-0.02, 1.26, 0.18],
    batYaw: 262,
    batTilt: 38,
  },
]);

/** Fills in each key from the ones before it, so keys only list what changes. */
function fillIn(keys) {
  let previous = {};
  return keys.map((key) => (previous = { ...previous, ...key }));
}

const CONTROLS = Object.keys(KEYS[0]).filter((key) => key !== 'at');

/**
 * A smooth curve through the keys (a cubic Hermite spline): at each key, the
 * value keeps moving at the average speed of the stretches either side, so
 * nothing stops dead at a key.
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

/** @typedef {[number, number, number]} V */
/**
 * @typedef {{
 *   head: V, nose: V, lSh: V, rSh: V, lEl: V, rEl: V, lHand: V, rHand: V,
 *   lHip: V, rHip: V, lKnee: V, rKnee: V, lAnkle: V, rAnkle: V,
 *   lHeel: V, rHeel: V, lToe: V, rToe: V, bat: V, batTip: V,
 * }} Pose
 */

const JOINTS = /** @type {const} */ ([
  'head',
  'nose',
  'lSh',
  'rSh',
  'lEl',
  'rEl',
  'lHand',
  'rHand',
  'lHip',
  'rHip',
  'lKnee',
  'rKnee',
  'lAnkle',
  'rAnkle',
  'lHeel',
  'rHeel',
  'lToe',
  'rToe',
]);

const add = (a, b) => /** @type {V} */ (a.map((v, i) => v + b[i]));
const sub = (a, b) => /** @type {V} */ (a.map((v, i) => v - b[i]));
const mul = (a, k) => /** @type {V} */ (a.map((v) => v * k));
const mix = (a, b, k) => /** @type {V} */ (a.map((v, i) => v + (b[i] - v) * k));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) =>
  /** @type {V} */ ([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]);
const length = (a) => Math.hypot(...a);
const unit = (a) => mul(a, 1 / (length(a) || 1));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toRad = (deg) => (deg * Math.PI) / 180;

/** Turns `v` round `axis` (a unit vector) by `angle` radians. */
function turn(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

/** Which way his left side points when he has turned `deg` from facing the plate. */
const leftSide = (deg) => /** @type {V} */ ([-Math.sin(toRad(deg)), 0, Math.cos(toRad(deg))]);
/** Which way he faces when he has turned `deg`. */
const facing = (deg) => /** @type {V} */ ([Math.cos(toRad(deg)), 0, Math.sin(toRad(deg))]);

/**
 * Where an elbow (or knee) goes so both bones keep their length, bending
 * towards `pole`.
 */
function bend(root, end, first, second, pole) {
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

/** Where the end of the bat is, from the top hand and which way the bat points. */
function batTipOf(rHand, bat) {
  return add(rHand, mul(bat, BAT - GRIP));
}

/** Builds his whole body from the swing's controls. */
function bodyFrom(c) {
  const B = BODY;
  // Hips turn a little less than the shoulders, and shift forward a touch as he strides.
  const pelvis = /** @type {V} */ ([0, B.hipHeight, Math.max(0, c.stride) * 0.4]);
  const hipSide = leftSide(c.turn * 0.75);
  const lHip = add(pelvis, mul(hipSide, B.hipWidth / 2));
  const rHip = add(pelvis, mul(hipSide, -B.hipWidth / 2));
  // Shoulders: up his spine (leaning a little over the plate), turned.
  const chest = add(pelvis, [0.04, B.torso, 0]);
  const shoulderSide = leftSide(c.turn);
  const lSh = add(chest, mul(shoulderSide, B.shoulderWidth / 2));
  const rSh = add(chest, mul(shoulderSide, -B.shoulderWidth / 2));
  // Head: no neck, like a cartoon. He keeps his eyes on the pitcher.
  const head = add(chest, [0.02, B.headAbove, 0]);
  const look = unit(add(mul(facing(c.turn * 0.4), 0.5), [0, -0.12, 0.85]));
  const nose = add(head, mul(look, B.headRadius));
  // The bat, and the hands on it: the top (right) hand just above the bottom one.
  const yaw = toRad(c.batYaw);
  const tilt = toRad(c.batTilt);
  const bat = unit([
    Math.cos(tilt) * Math.cos(yaw),
    Math.sin(tilt),
    Math.cos(tilt) * Math.sin(yaw),
  ]);
  const rHand = /** @type {V} */ ([...c.hands]);
  const lHand = sub(rHand, mul(bat, 0.09));
  // Elbows bend down and out, away from his body.
  const lEl = bend(lSh, lHand, B.upperArm, B.foreArm, add(mix(lSh, lHand, 0.5), [0, -0.2, 0.05]));
  const rEl = bend(
    rSh,
    rHand,
    B.upperArm,
    B.foreArm,
    add(mix(rSh, rHand, 0.5), [-0.05, -0.2, -0.1]),
  );
  // Feet: the front one lifts and steps towards the pitcher, the back one
  // spins up onto its toe as he turns.
  const lAnkle = /** @type {V} */ ([
    0.02,
    0.06 + Math.max(0, -c.stride) * 2.5,
    0.26 + Math.max(0, c.stride),
  ]);
  const rAnkle = /** @type {V} */ ([-0.02, 0.06 + c.pivot * 0.05, -0.24]);
  const foot = (deg, ankle, heelUp) => {
    const along = facing(deg);
    return {
      heel: add(ankle, add(mul(along, -0.05), [0, -0.03 + heelUp, 0])),
      toe: add(ankle, add(mul(along, 0.13), [0, -0.04, 0])),
    };
  };
  const front = foot(20, lAnkle, 0);
  const back = foot(c.pivot * 70, rAnkle, c.pivot * 0.05);
  const forward = (hip, ankle, extra) => add(mix(hip, ankle, 0.5), add([0.3, 0, 0], extra));
  const lKnee = bend(lHip, lAnkle, B.thigh, B.shin, forward(lHip, lAnkle, [0, 0, 0]));
  const rKnee = bend(rHip, rAnkle, B.thigh, B.shin, forward(rHip, rAnkle, [0, 0, c.pivot * 0.3]));
  return {
    head,
    nose,
    lSh,
    rSh,
    lEl,
    rEl,
    lHand,
    rHand,
    lHip,
    rHip,
    lKnee,
    rKnee,
    lAnkle,
    rAnkle,
    lHeel: front.heel,
    lToe: front.toe,
    rHeel: back.heel,
    rToe: back.toe,
    bat,
    batTip: batTipOf(rHand, bat),
  };
}

/** The controls at moment `t` of the swing (0 to 1). */
function controlsAt(t) {
  return Object.fromEntries(CONTROLS.map((name) => [name, glide(name, t)]));
}

/** Blends two poses, `k` of the way from `a` to `b`. */
function blend(a, b, k) {
  const out = /** @type {Pose} */ ({});
  for (const name of JOINTS) out[name] = mix(a[name], b[name], k);
  out.bat = unit(mix(a.bat, b.bat, k));
  out.batTip = batTipOf(out.rHand, out.bat);
  return out;
}

/**
 * At contact, what it takes to meet a ball at `reach`: how far the hands
 * move towards it, and how the bat turns (round an axis, by an angle) so
 * the ball is on the sweet spot.
 *
 * @param {V} reach
 */
function correctionFor(reach) {
  const contact = bodyFrom(controlsAt(CONTACT_AT));
  // The hands go most of the way to where the sweet spot would meet the ball.
  const toBall = sub(reach, contact.rHand);
  const extra = length(toBall) - SWEET_SPOT;
  let shift = mul(unit(toBall), extra * 0.8);
  if (length(shift) > 0.25) shift = mul(unit(shift), 0.25);
  // Then the bat turns to point through the ball.
  const aim = unit(sub(reach, add(contact.rHand, shift)));
  const axis = cross(contact.bat, aim);
  const angle = Math.atan2(length(axis), dot(contact.bat, aim));
  return { shift, axis: unit(axis), angle };
}

/**
 * Bends the swing around contact to meet the ball at `reach`. The
 * corrections worked out at contact are added to the normal swing, strongest
 * at contact and fading either side, so the bat keeps sweeping round
 * instead of pointing at the ball and waiting for it.
 *
 * @param {Pose} pose
 * @param {number} t  swing moment
 * @param {V | null} reach  where the pitch crosses the plate, around the batter
 */
function reachFor(pose, t, reach) {
  if (!reach) return pose;
  const weight = Math.exp(-(((t - CONTACT_AT) / 0.08) ** 2));
  if (weight < 0.01) return pose;
  const fix = correctionFor(reach);
  const move = mul(fix.shift, weight);
  const bat = unit(turn(pose.bat, fix.axis, fix.angle * weight));
  const rHand = add(pose.rHand, move);
  const lHand = sub(rHand, mul(bat, length(sub(pose.rHand, pose.lHand))));
  // The elbows follow the hands halfway.
  return {
    ...pose,
    rHand,
    lHand,
    bat,
    batTip: batTipOf(rHand, bat),
    rEl: add(pose.rEl, mul(move, 0.5)),
    lEl: add(pose.lEl, mul(sub(lHand, pose.lHand), 0.5)),
  };
}

/**
 * The pose at moment `t` of the swing (0 to 1), optionally meeting a pitch at
 * `reach` (see reachFor); exported for tests.
 *
 * @param {number} t
 * @param {V | null} [reach]
 * @returns {Pose}
 */
export function swingPose(t, reach = null) {
  const at = clamp(t, 0, 1);
  return reachFor(bodyFrom(controlsAt(at)), at, reach);
}

/**
 * @param {{ swingMs: number, holdMs: number, returnMs: number, startAt: number, blendMs?: number }} timing
 *   swingMs: how long the swing takes from `startAt` to the end;
 *   startAt: where in the swing the animation begins when you swing (the
 *   phone reports a swing a moment after it happens, so we skip ahead to keep
 *   the bat in step with you);
 *   blendMs: how long a new swing takes to blend in from wherever he was
 */
export function createBatter(timing) {
  const stance = swingPose(0);
  const finish = swingPose(1);
  /** Slow at the start and end, quick in the middle. */
  const smooth = (k) => k * k * (3 - 2 * k);
  /** The last pose shown, and when the current swing started, to blend into it. */
  let last = stance;
  let swingStartedAt = null;
  let swingFrom = stance;

  /**
   * A batter waiting for the pitch is never quite still: his hands and bat
   * rock gently, and his shoulders rise and fall with his breathing.
   * `amount` fades it out as he loads.
   */
  function alive(pose, now, amount) {
    if (amount <= 0) return pose;
    const rock = Math.sin(now / 260) * amount;
    const breathe = Math.sin(now / 900) * amount;
    const hands = (p) => add(p, [rock * 0.012, breathe * 0.008, 0]);
    const upper = (p) => add(p, [0, breathe * 0.006, 0]);
    // The bat rocks round the hands, towards and away from the catcher.
    const bat = unit(turn(pose.bat, [1, 0, 0], rock * 0.08));
    const rHand = hands(pose.rHand);
    return {
      ...pose,
      head: upper(pose.head),
      nose: upper(pose.nose),
      lSh: upper(pose.lSh),
      rSh: upper(pose.rSh),
      lEl: hands(pose.lEl),
      rEl: hands(pose.rEl),
      lHand: hands(pose.lHand),
      rHand,
      bat,
      batTip: batTipOf(rHand, bat),
    };
  }

  /** @returns {Pose} */
  function poseNow(sinceSwing, now, reach, load) {
    const { swingMs, holdMs, returnMs, startAt, blendMs = 60 } = timing;
    if (sinceSwing >= 0) {
      if (sinceSwing < swingMs) {
        // A new swing starts from wherever he was (mid-load, say), blending
        // into the swing over its first moment instead of jumping.
        const startedAt = now - sinceSwing;
        if (startedAt !== swingStartedAt) {
          swingStartedAt = startedAt;
          swingFrom = last;
        }
        const pose = swingPose(startAt + (1 - startAt) * (sinceSwing / swingMs), reach);
        return sinceSwing < blendMs ? blend(swingFrom, pose, smooth(sinceSwing / blendMs)) : pose;
      }
      if (sinceSwing < swingMs + holdMs) return alive(finish, now, 0.4);
      if (sinceSwing < swingMs + holdMs + returnMs) {
        const k = smooth((sinceSwing - swingMs - holdMs) / returnMs);
        return alive(blend(finish, stance, k), now, 0.4 + 0.6 * k);
      }
    }
    if (load > 0.001) {
      return alive(swingPose(LOADED_AT * clamp(load, 0, 1)), now, 1 - Math.min(1, load * 3));
    }
    return alive(stance, now, 1);
  }

  return {
    /**
     * The batter's pose now (metres, see above).
     *
     * @param {number} sinceSwing  ms since a swing was detected (negative, or -Infinity,
     *                             if there hasn't been one yet)
     * @param {number} now         ms, for his small movements while waiting
     * @param {V | null} [reach]   where this pitch crosses the plate, around the batter
     * @param {number} [load]      0 to 1: how far through his leg kick and load he is
     * @returns {Pose}
     */
    pose(sinceSwing, now, reach = null, load = 0) {
      last = poseNow(sinceSwing, now, reach, load);
      return last;
    },
  };
}
