/**
 * The pitcher's delivery, as key poses (see figure.js).
 *
 * Seen from home plate, so the pitcher faces us. He's right-handed: his
 * throwing arm is on our left (negative x), his glove on our right.
 *
 *   set ─▶ leg kick ─▶ stride ─▶ arm cocked ─▶ RELEASE ─▶ follow-through ─▶ fielding stance
 *
 * `z` is how far from home plate he is: he strides towards us as he throws.
 * At the release, the throwing hand must be exactly where the pitch starts
 * (CONFIG.pitch.release), which a test checks.
 */
import { completeKeyframes, poseAt } from './figure.js';

/** The moment in the delivery (0 to 1) when the ball leaves his hand. */
export const RELEASE_AT = 0.75;

const DELIVERY = completeKeyframes([
  {
    // Set: standing tall, hands together at the chest.
    at: 0,
    z: 18.4,
    head: [0, 1.74],
    neck: [0, 1.58],
    chest: [0, 1.46],
    rShoulder: [-0.21, 1.47],
    rElbow: [-0.2, 1.22],
    rHand: [-0.04, 1.16],
    lShoulder: [0.21, 1.47],
    lElbow: [0.2, 1.22],
    lHand: [0.04, 1.16],
    rHip: [-0.12, 0.98],
    rKnee: [-0.15, 0.52],
    rFoot: [-0.18, 0.02],
    lHip: [0.12, 0.98],
    lKnee: [0.15, 0.52],
    lFoot: [0.18, 0.02],
  },
  {
    // Leg kick: the front knee comes up high, balancing on the back leg.
    at: 0.28,
    head: [-0.02, 1.75],
    neck: [-0.01, 1.59],
    chest: [-0.01, 1.47],
    rShoulder: [-0.17, 1.48],
    rHand: [-0.02, 1.22],
    lShoulder: [0.2, 1.47],
    lHand: [0.03, 1.22],
    rHip: [-0.14, 0.99],
    rKnee: [-0.16, 0.53],
    lHip: [0.1, 1.0],
    lKnee: [0.12, 1.04],
    lFoot: [0.05, 0.6],
  },
  {
    // Stride: the front foot lands, hands break, glove points at the plate,
    // and the ball goes back and up.
    at: 0.52,
    z: 18.0,
    head: [0, 1.56],
    neck: [0, 1.42],
    chest: [0, 1.3],
    rShoulder: [-0.2, 1.32],
    rElbow: [-0.46, 1.42],
    rHand: [-0.46, 1.72],
    lShoulder: [0.2, 1.32],
    lElbow: [0.42, 1.34],
    lHand: [0.6, 1.3],
    rHip: [-0.12, 0.84],
    rKnee: [-0.24, 0.44],
    rFoot: [-0.3, 0.08],
    lHip: [0.12, 0.84],
    lKnee: [0.36, 0.42],
    lFoot: [0.42, 0.02],
  },
  {
    // Arm cocked: the ball as far back as it goes, the glove tucking in.
    at: 0.66,
    z: 17.7,
    head: [0.04, 1.5],
    neck: [0.03, 1.37],
    chest: [0.03, 1.26],
    rElbow: [-0.42, 1.5],
    rHand: [-0.55, 1.62],
    lElbow: [0.35, 1.2],
    lHand: [0.3, 1.05],
  },
  {
    // Release: over the top, leaning in towards the plate.
    at: RELEASE_AT,
    z: 17.4,
    head: [0.08, 1.45],
    neck: [0.06, 1.32],
    chest: [0.05, 1.2],
    rShoulder: [-0.18, 1.26],
    rElbow: [-0.34, 1.48],
    rHand: [-0.35, 1.75],
    lShoulder: [0.24, 1.2],
    lElbow: [0.3, 1.02],
    lHand: [0.18, 0.98],
    rHip: [-0.1, 0.82],
    rKnee: [-0.22, 0.46],
    rFoot: [-0.3, 0.12],
    lHip: [0.14, 0.8],
    lKnee: [0.36, 0.4],
  },
  {
    // Follow-through: the arm whips down across the body, back leg swinging round.
    at: 0.88,
    z: 17.3,
    head: [0.15, 1.32],
    neck: [0.12, 1.2],
    chest: [0.1, 1.08],
    rShoulder: [-0.1, 1.12],
    rElbow: [0.05, 0.95],
    rHand: [0.32, 0.72],
    lShoulder: [0.3, 1.1],
    lElbow: [0.38, 0.95],
    lHand: [0.3, 0.85],
    rHip: [-0.06, 0.8],
    rKnee: [0.02, 0.62],
    rFoot: [-0.05, 0.32],
  },
  {
    // Fielding stance: square to the plate, ready.
    at: 1,
    head: [0.05, 1.62],
    neck: [0.05, 1.47],
    chest: [0.05, 1.36],
    rShoulder: [-0.16, 1.36],
    rElbow: [-0.22, 1.1],
    rHand: [-0.12, 0.98],
    lShoulder: [0.26, 1.36],
    lElbow: [0.3, 1.12],
    lHand: [0.2, 1.02],
    rHip: [-0.07, 0.9],
    rKnee: [-0.2, 0.47],
    rFoot: [-0.25, 0.02],
    lHip: [0.17, 0.9],
    lKnee: [0.33, 0.45],
    lFoot: [0.4, 0.02],
  },
]);

/**
 * The pitcher's pose `progress` of the way through the delivery (0 to 1).
 *
 * @param {number} progress
 */
export function pitcherPose(progress) {
  return poseAt(DELIVERY, Math.min(1, Math.max(0, progress)));
}
