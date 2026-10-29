/**
 * The bowler's body, pose by pose: the same chunky cartoon player as Home Run
 * Derby (../baseball/body.js sizes, ../baseball/players.js draws), right-handed,
 * bowling a four-step approach.
 *
 *   stance ─(hold A)─▶ step, step, step, step ─▶ slide ─(let go)─▶ follow-through
 *
 * The bowling arm isn't animated on a timer: it swings to `armDeg`, which
 * the game takes from the phone's own swing. Hang the phone down and the
 * bowler's arm hangs down; swing back and it swings back.
 *
 * Positions are lane coordinates, in metres (see lane.js): x across the lane
 * (right positive, facing the pins), y up, z down the lane (0 at the foul line).
 *
 *          armDeg:  90 (straight out in front)
 *                    ╲
 *     -60 (behind) ── o ── shoulder
 *                    │
 *                    0 (hanging down)
 */
import { BODY, add, bend, clamp, mix, mul } from '../baseball/body.js';

/** @typedef {import('../baseball/body.js').V} V */

/** How far the bowling hand is to the right of the bowler's middle, so the ball swings past the hip. */
export const HAND_OFFSET = BODY.shoulderWidth / 2 + 0.03;
/** Where the bowler stands to line up, and where the slide ends (pelvis z). */
export const STANCE_Z = -2.3;
export const SLIDE_Z = -0.5;
/** The arm's angle while holding the ball at the chest, before the swing. */
export const STANCE_ARM = 70;

const ARM = BODY.upperArm + BODY.foreArm;
const STEPS = 4;

/**
 * Every joint of the bowler.
 *
 * @param {{
 *   x: number,          where the ball is lined up across the lane: the bowler stands just left of it
 *   walk: number,       0 standing at the stance, 1 at the end of the slide
 *   armDeg: number,     the bowling arm's swing (see the top of this file)
 *   holding: boolean,   swinging the ball one-handed (A held, or just let go), rather than cradling it
 * }} state
 * @returns {Record<string, V>}
 */
export function bowlerPose({ x, walk, armDeg, holding }) {
  const B = BODY;
  const w = clamp(walk, 0, 1);
  const steps = w * STEPS;
  // The last step blends into the slide: lower, leaning in, legs split.
  const slide = clamp(steps - (STEPS - 1), 0, 1);
  const midX = x - HAND_OFFSET;

  // ---- Feet: right, left, right, then the long left slide ----------------
  const stride = (SLIDE_Z - STANCE_Z) / STEPS;
  const footZ = (first) => {
    // Each foot moves on alternate steps, easing in and out of each one.
    let z = STANCE_Z;
    for (let k = first; k < STEPS; k += 2) {
      const moving = clamp(steps - k, 0, 1);
      z += stride * 2 * ease(moving);
    }
    return z;
  };
  const lift = (first) => {
    // Raised mid-step.
    const k = Math.floor(steps);
    if (k >= STEPS || (k - first) % 2 !== 0) return 0;
    return Math.sin((steps - k) * Math.PI) * 0.08;
  };
  // The right foot steps first and stops a stride behind; the left slides past it.
  let rZ = footZ(0) - stride;
  let lZ = footZ(1);
  // Sliding: the left foot glides on to the line and the right trails back.
  lZ += slide * 0.35;
  rZ -= slide * 0.25;
  const lAnkle = /** @type {V} */ ([midX - B.hipWidth / 2 + slide * 0.06, 0.08 + lift(1), lZ]);
  const rAnkle = /** @type {V} */ ([
    midX + B.hipWidth / 2 - slide * 0.1,
    0.08 + lift(0) + slide * 0.06,
    rZ,
  ]);

  // ---- Body: over the feet, bobbing with each step, sinking into the slide ----
  const bob = Math.abs(Math.sin(steps * Math.PI)) * 0.03 * (1 - slide);
  const pelvisZ = mix([0, 0, STANCE_Z], [0, 0, SLIDE_Z], ease(w))[2];
  const pelvis = /** @type {V} */ ([midX, 0.6 - bob - slide * 0.14, pelvisZ]);
  const lean = 0.06 + w * 0.08 + slide * 0.16;
  const lHip = add(pelvis, [-B.hipWidth / 2, 0, 0]);
  const rHip = add(pelvis, [B.hipWidth / 2, 0, 0]);
  const chest = add(pelvis, [0, B.torso - lean * 0.3, lean]);
  const lSh = add(chest, [-B.shoulderWidth / 2, 0, 0]);
  const rSh = add(chest, [B.shoulderWidth / 2, 0, 0]);
  const head = add(chest, [0, B.headAbove, lean * 0.5]);
  const nose = add(head, [0, -0.06, B.headRadius]);

  // ---- The bowling arm: a pendulum from the shoulder, nearly straight ----
  const a = (clamp(armDeg, -110, 170) * Math.PI) / 180;
  // Reach a hair short of a straight arm, so the elbow still has a soft bend.
  const reach = ARM * 0.97;
  const rHand = /** @type {V} */ ([
    rSh[0] + 0.03,
    rSh[1] - Math.cos(a) * reach,
    rSh[2] + Math.sin(a) * reach,
  ]);
  const rEl = bend(rSh, rHand, B.upperArm, B.foreArm, add(mix(rSh, rHand, 0.5), [0.15, 0, -0.1]));

  // ---- The other arm: cradling the ball, or out wide for balance ----------
  const cradle = add(rHand, [-0.13, 0.02, 0.02]);
  const balance = add(lSh, [-0.32, -0.12 - slide * 0.08, 0.12]);
  const lHand = holding ? mix(cradle, balance, 0.4 + 0.6 * ease(clamp(w * 2, 0, 1))) : cradle;
  const lEl = bend(lSh, lHand, B.upperArm, B.foreArm, add(mix(lSh, lHand, 0.5), [-0.2, -0.1, 0]));

  // ---- Knees forward; feet point down the lane ----------------------------
  const knee = (hip, ankle) =>
    bend(hip, ankle, B.thigh, B.shin, add(mix(hip, ankle, 0.5), [0, 0, 0.3]));
  const foot = (ankle, toeDown) => ({
    heel: add(ankle, [0, -0.03, -0.05]),
    toe: add(ankle, [0, -0.04 - toeDown, 0.13]),
  });
  const lFoot = foot(lAnkle, 0);
  const rFoot = foot(rAnkle, slide * 0.04);

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
    lKnee: knee(lHip, lAnkle),
    rKnee: knee(rHip, rAnkle),
    lAnkle,
    rAnkle,
    lHeel: lFoot.heel,
    lToe: lFoot.toe,
    rHeel: rFoot.heel,
    rToe: rFoot.toe,
  };
}

/** Where the ball sits in the bowling hand: just below the palm. */
export function ballInHand(pose, ballRadius) {
  return add(pose.rHand, mul([0, -1, 0], ballRadius * 0.6));
}

/** Smooth start and stop. */
const ease = (t) => t * t * (3 - 2 * t);
