/**
 * The pitcher's delivery, in 3D, the Wii Sports way: the same chunky cartoon
 * ballplayer as your batter (body.js), with a simple, readable windup.
 * players.js draws him.
 *
 *   set ─▶ turn ─▶ leg kick ─▶ stride ─▶ arm cocked ─▶ RELEASE ─▶ follow-through ─▶ fielding stance
 *
 * He's right-handed, standing on the mound. The delivery is described in his
 * own space:
 *
 *   x  his right, when he's square to the plate
 *   y  up
 *   z  towards the plate
 *
 * `turn` uses body.js's convention: 90 = square to the plate, 0 = side-on
 * with his glove side to the plate. `pitcherPose` then places him in the
 * ballpark. At the release, his throwing hand is exactly where the pitch
 * starts (CONFIG.pitch.release), which a test checks.
 */
import { BODY, add, bend, clamp, facing, keyPoses, leftSide, mix, mul, unit } from './body.js';

/** @typedef {import('./body.js').V} V */

/** How far the mound's rubber is from the plate (metres): he starts here. */
export const MOUND = 18.4;

/** The moment in the delivery (0 to 1) when the ball leaves his hand. */
export const RELEASE_AT = 0.75;

/**
 * The delivery's key moments. `pelvis`, hands and feet (ankles) are where
 * they are in his own space; `lean` tips his upper body towards the plate;
 * `lFootTurn`/`rFootTurn` are which way each foot points (like `turn`).
 * Values not listed carry over from the key before.
 */
const deliveryAt = keyPoses([
  {
    // Set: square to the plate, hands together at his chest, ball in the glove.
    at: 0,
    turn: 90,
    pelvis: [0, 0.6, 0],
    lean: 0,
    rHand: [0.04, 0.93, 0.2],
    lHand: [-0.04, 0.93, 0.22],
    lFoot: [-0.12, 0.06, 0.02],
    rFoot: [0.12, 0.06, -0.02],
    lFootTurn: 90,
    rFootTurn: 90,
  },
  {
    // Turn: he rocks back and turns side-on, his back foot swivelling to
    // lie along the rubber.
    at: 0.16,
    turn: 35,
    pelvis: [0.03, 0.6, -0.03],
    rHand: [0.14, 0.96, 0.12],
    lHand: [0.1, 0.96, 0.16],
    lFoot: [-0.06, 0.1, 0.06],
    rFoot: [0.1, 0.06, -0.04],
    rFootTurn: 5,
  },
  {
    // Leg kick: the front knee comes up high, balanced on his back leg,
    // hands still together.
    at: 0.36,
    turn: 0,
    pelvis: [0.05, 0.62, -0.04],
    rHand: [0.2, 1.0, 0.02],
    lHand: [0.18, 1.0, 0.06],
    lFoot: [0.12, 0.36, 0.06],
    lFootTurn: 30,
  },
  {
    // Stride: the front foot reaches out and lands towards the plate, the
    // glove points at it, and the ball goes back and up.
    at: 0.56,
    turn: -5,
    pelvis: [0.02, 0.55, 0.3],
    rHand: [0.06, 1.12, -0.32],
    lHand: [0.08, 1.0, 0.56],
    lFoot: [-0.05, 0.06, 0.72],
    lFootTurn: 70,
  },
  {
    // Arm cocked: hips open, the ball high behind his head, glove tucking in.
    at: 0.67,
    turn: 40,
    pelvis: [0.02, 0.55, 0.38],
    lean: 0.08,
    rHand: [0.26, 1.3, -0.04],
    lHand: [-0.06, 0.92, 0.5],
  },
  {
    // Release: square to the plate, leaning in, arm high out in front.
    at: RELEASE_AT,
    turn: 100,
    pelvis: [0, 0.53, 0.45],
    lean: 0.18,
    rHand: [0.28, 1.27, 0.75],
    lHand: [-0.18, 0.9, 0.42],
    rFoot: [0.1, 0.12, 0],
    rFootTurn: 30,
  },
  {
    // Follow-through: the arm whips down across his body, back leg coming round.
    at: 0.88,
    turn: 125,
    pelvis: [0, 0.5, 0.55],
    lean: 0.3,
    rHand: [-0.2, 0.7, 0.85],
    lHand: [-0.26, 0.86, 0.45],
    rFoot: [0.12, 0.24, 0.3],
    rFootTurn: 60,
  },
  {
    // Fielding stance: square to the plate, feet apart, hands ready.
    at: 1,
    turn: 90,
    pelvis: [0, 0.57, 0.62],
    lean: 0.05,
    rHand: [0.12, 0.8, 0.82],
    lHand: [-0.12, 0.82, 0.84],
    lFoot: [-0.16, 0.06, 0.72],
    rFoot: [0.16, 0.06, 0.55],
    lFootTurn: 90,
    rFootTurn: 90,
  },
]);

/** Builds his whole body, in his own space, from the delivery's values. */
function bodyFrom(c) {
  const B = BODY;
  const side = leftSide(c.turn);
  const front = facing(c.turn);
  const pelvis = /** @type {V} */ (c.pelvis);
  // Hips turn a little less than the shoulders.
  const hipSide = leftSide(90 + (c.turn - 90) * 0.75);
  const lHip = add(pelvis, mul(hipSide, B.hipWidth / 2));
  const rHip = add(pelvis, mul(hipSide, -B.hipWidth / 2));
  const chest = add(pelvis, [0, B.torso, c.lean]);
  const lSh = add(chest, mul(side, B.shoulderWidth / 2));
  const rSh = add(chest, mul(side, -B.shoulderWidth / 2));
  // His head stays up, eyes on the plate.
  const head = add(chest, [0, B.headAbove, c.lean * 0.4]);
  const nose = add(head, mul(unit([0, -0.08, 1]), B.headRadius));
  // Elbows bend down and out, away from his body.
  const elbow = (shoulder, hand, out) =>
    bend(
      shoulder,
      hand,
      B.upperArm,
      B.foreArm,
      add(mix(shoulder, hand, 0.5), add(mul(out, 0.2), [0, -0.15, 0])),
    );
  const lHand = /** @type {V} */ (c.lHand);
  const rHand = /** @type {V} */ (c.rHand);
  // Knees bend forward, the way he faces.
  const knee = (hip, ankle) =>
    bend(hip, ankle, B.thigh, B.shin, add(mix(hip, ankle, 0.5), mul(front, 0.3)));
  const lAnkle = /** @type {V} */ (c.lFoot);
  const rAnkle = /** @type {V} */ (c.rFoot);
  const foot = (ankle, deg) => {
    const along = facing(deg);
    return {
      heel: add(ankle, add(mul(along, -0.05), [0, -0.03, 0])),
      toe: add(ankle, add(mul(along, 0.13), [0, -0.04, 0])),
    };
  };
  const lFoot = foot(lAnkle, c.lFootTurn);
  const rFoot = foot(rAnkle, c.rFootTurn);
  return {
    head,
    nose,
    lSh,
    rSh,
    lEl: elbow(lSh, lHand, side),
    rEl: elbow(rSh, rHand, mul(side, -1)),
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

/**
 * The pitcher's pose `progress` of the way through the delivery (0 to 1):
 * every joint as a point in the ballpark (metres; x across, y up, z out
 * from home plate).
 *
 * @param {number} progress
 * @returns {Record<string, V>}
 */
export function pitcherPose(progress) {
  const body = bodyFrom(deliveryAt(clamp(progress, 0, 1)));
  // His own space → the ballpark: he faces the plate, so his right is our
  // left, and "towards the plate" is back down the field.
  const place = ([x, y, z]) => /** @type {V} */ ([-x, y, MOUND - z]);
  return Object.fromEntries(Object.entries(body).map(([name, point]) => [name, place(point)]));
}
