/**
 * Your batter's stance and swing: a real major-league swing, played back from
 * the joints traced off a slow-motion video (swing-frames.js), and drawn by
 * batter-art.js.
 *
 * Positions are 2D "art units" (200 = 1 metre) as seen from behind the plate:
 * x right, y down, 0,0 = his spot on the ground.
 *
 * How the swing is played, in plain language
 * ------------------------------------------
 * The swing runs from 0 (stance) to 1 (finish). Each moment is matched to a
 * moment in the video, so the key positions line up with the game:
 *
 *   0     stance          (video 0.00 s)
 *   0.30  stride landed   (video 0.88 s: leg kick done, hands loaded)
 *   0.38  launch          (video 1.04 s: hips fire, hands start forward)
 *   0.45  CONTACT         (video 1.20 s)
 *   0.60  extension       (video 1.56 s)
 *   0.82  follow-through  (video 2.04 s)
 *   1     finish          (video 2.50 s)
 *
 * Between the video's poses the joints glide along smooth curves (a
 * spline), so the motion flows at any speed instead of stopping at each
 * pose. The leg kick and stride (0 to 0.30) play as the pitch comes in; the
 * rest plays when you swing.
 *
 * Around contact the swing bends a little to meet the ball: the hands rise or
 * drop towards the pitch's height and the bat tilts to pass right through the
 * ball, fading back to the video's swing either side.
 */

import { FRAMES } from './swing-frames.js';

/** The moment in the swing (0 to 1) when the bat meets the ball. */
export const CONTACT_AT = 0.45;

/** How far into the swing the stride has landed and the hands are loaded. */
export const LOADED_AT = 0.3;

/** Swing moments (0 to 1) and where they are in the video (seconds). */
const TIMELINE = [
  [0, 0],
  [LOADED_AT, 0.88],
  [0.38, 1.04],
  [CONTACT_AT, 1.2],
  [0.6, 1.56],
  [0.82, 2.04],
  [1, 2.5],
];

/** Where the top hand holds the bat, measured from the grip in the video. */
const GRIP = 6;
/** Distance between the two hands on the bat. */
const HANDS_APART = 17;

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

/** @typedef {[number, number]} P */
/** @typedef {Record<typeof JOINTS[number], P> & { bat: [number, number], batTip: P }} Pose */

const add = (a, b) => /** @type {P} */ ([a[0] + b[0], a[1] + b[1]]);
const sub = (a, b) => /** @type {P} */ ([a[0] - b[0], a[1] - b[1]]);
const mul = (a, k) => /** @type {P} */ ([a[0] * k, a[1] * k]);
const mix = (a, b, k) => /** @type {P} */ ([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The video time (seconds) at swing moment `t` (0 to 1). */
function videoTime(t) {
  const i = TIMELINE.findIndex(([at]) => at >= t);
  if (i <= 0) return TIMELINE[Math.max(0, i)][1];
  const [a, va] = TIMELINE[i - 1];
  const [b, vb] = TIMELINE[i];
  return va + ((t - a) / (b - a)) * (vb - va);
}

/** Where the end of the bat is, from the top hand and the bat's [angle, length]. */
function batTipOf(rHand, [angle, length]) {
  return add(rHand, mul([Math.cos(angle), Math.sin(angle)], length - GRIP));
}

/**
 * Blends two poses, `k` of the way from `a` to `b`. The bat turns the short
 * way round (its angle can have wound round a few times during the swing).
 */
function blend(a, b, k) {
  const out = /** @type {Pose} */ ({});
  for (const name of JOINTS) out[name] = mix(a[name], b[name], k);
  let turn = (b.bat[0] - a.bat[0]) % (Math.PI * 2);
  if (turn > Math.PI) turn -= Math.PI * 2;
  if (turn < -Math.PI) turn += Math.PI * 2;
  out.bat = [a.bat[0] + turn * k, a.bat[1] + (b.bat[1] - a.bat[1]) * k];
  out.batTip = batTipOf(out.rHand, out.bat);
  return out;
}

/**
 * The video's pose at `seconds`, on a smooth curve through its poses (a
 * cubic Hermite spline): at each pose, every joint keeps moving at the
 * average speed of the stretches either side, so nothing stops dead.
 */
function videoPose(seconds) {
  const last = FRAMES.length - 1;
  const at = clamp(seconds, FRAMES[0].t, FRAMES[last].t);
  const next = FRAMES.findIndex((f) => f.t > at);
  const i = next < 0 ? last - 1 : Math.max(0, next - 1);
  const [a, b] = [FRAMES[i], FRAMES[i + 1]];
  const before = FRAMES[Math.max(0, i - 1)];
  const after = FRAMES[Math.min(last, i + 2)];
  const span = b.t - a.t;
  const u = (at - a.t) / span;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const slope = (lo, hi, v) => (v(hi) - v(lo)) / (hi.t - lo.t);
  const one = (v) =>
    h00 * v(a) + h10 * span * slope(before, b, v) + h01 * v(b) + h11 * span * slope(a, after, v);
  const pair = (name) => /** @type {P} */ ([0, 1].map((k) => one((f) => f[name][k])));
  const pose = /** @type {Pose} */ ({});
  for (const name of JOINTS) pose[name] = pair(name);
  pose.bat = pair('bat');
  pose.batTip = batTipOf(pose.rHand, pose.bat);
  return pose;
}

/**
 * Bends the swing around contact to meet the ball at `reach` (art units).
 *
 * Works out, at the moment of contact, how much the hands need to rise or
 * drop and how much the bat needs to tilt (and lengthen) to pass right
 * through the ball. Those corrections are then added to the video's swing,
 * strongest at contact and fading either side, so the bat keeps sweeping
 * round naturally instead of pointing at the ball and waiting for it.
 *
 * @param {Pose} pose
 * @param {number} t  swing moment
 * @param {P | null} reach  where the pitch crosses the plate, around the batter
 */
function reachFor(pose, t, reach) {
  if (!reach) return pose;
  const weight = Math.exp(-(((t - CONTACT_AT) / 0.08) ** 2));
  if (weight < 0.01) return pose;
  const fix = correctionFor(reach);
  const rHand = add(pose.rHand, [0, fix.lift * weight]);
  const bat = /** @type {[number, number]} */ ([
    pose.bat[0] + fix.tilt * weight,
    pose.bat[1] * (1 + (fix.stretch - 1) * weight),
  ]);
  const along = [Math.cos(bat[0]), Math.sin(bat[0])];
  const lHand = sub(rHand, mul(along, HANDS_APART));
  // The elbows follow the hands halfway.
  return {
    ...pose,
    rHand,
    lHand,
    bat,
    batTip: batTipOf(rHand, bat),
    rEl: add(pose.rEl, mul(sub(rHand, pose.rHand), 0.5)),
    lEl: add(pose.lEl, mul(sub(lHand, pose.lHand), 0.5)),
  };
}

/**
 * At contact, what it takes to meet a ball at `reach`: how far the hands
 * rise (or drop), how far the bat tilts (radians), and how much longer it
 * looks.
 *
 * @param {P} reach
 */
function correctionFor(reach) {
  const contact = videoPose(videoTime(CONTACT_AT));
  const [angle, length] = contact.bat;
  const u = [Math.cos(angle), Math.sin(angle)];
  // How high the bat is where the ball is; the hands go part of the way there.
  const across = reach[0] - contact.rHand[0];
  const batHeight = u[0] > 0.2 ? contact.rHand[1] + (across / u[0]) * u[1] : reach[1];
  const lift = clamp((reach[1] - batHeight) * 0.3, -25, 25);
  const toBall = sub(reach, add(contact.rHand, [0, lift]));
  let tilt = Math.atan2(toBall[1], toBall[0]) - angle;
  while (tilt > Math.PI) tilt -= Math.PI * 2;
  while (tilt < -Math.PI) tilt += Math.PI * 2;
  const stretch = Math.max(length, Math.hypot(toBall[0], toBall[1]) + 55) / length;
  return { lift, tilt, stretch };
}

/**
 * The pose at moment `t` of the swing (0 to 1), optionally meeting a pitch at
 * `reach` (see reachFor); exported for tests.
 *
 * @param {number} t
 * @param {P | null} [reach]
 * @returns {Pose}
 */
export function swingPose(t, reach = null) {
  const at = clamp(t, 0, 1);
  return reachFor(videoPose(videoTime(at)), at, reach);
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
    const move = (point, x, y) => /** @type {P} */ ([point[0] + x, point[1] + y]);
    const hands = (point) => move(point, rock * 3, breathe * 2);
    const upper = (point) => move(point, 0, breathe * 1.5);
    const bat = /** @type {[number, number]} */ ([pose.bat[0] + rock * 0.06, pose.bat[1]]);
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
    const { swingMs, holdMs, returnMs, startAt, blendMs = 80 } = timing;
    if (sinceSwing >= 0) {
      if (sinceSwing < swingMs) {
        // A new swing starts from wherever he was (mid-stride, say), blending
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
     * The batter's pose now (art units, see above).
     *
     * @param {number} sinceSwing  ms since a swing was detected (negative, or -Infinity,
     *                             if there hasn't been one yet)
     * @param {number} now         ms, for his small movements while waiting
     * @param {P | null} [reach]   where this pitch crosses the plate, around the batter
     * @param {number} [load]      0 to 1: how far through his leg kick and stride
     *                             he is as the pitch comes in
     * @returns {Pose}
     */
    pose(sinceSwing, now, reach = null, load = 0) {
      last = poseNow(sinceSwing, now, reach, load);
      return last;
    },
  };
}
