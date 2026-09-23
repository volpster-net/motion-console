/**
 * Your batter's swing, as key poses in 3D (see figure.js).
 *
 * You're a right-handed batter in the left-hand batter's box. Every joint is
 * placed in the ballpark around the spot where you stand, in metres:
 *
 *   x  towards the plate (the way you face)
 *   y  up
 *   z  towards the pitcher (your front, left shoulder points this way)
 *
 * The camera behind home plate sees you mostly side-on, as on TV: facing the
 * plate, front shoulder towards the pitcher, bat up over your back shoulder.
 * As you swing, your hips and shoulders turn to face the pitcher and the bat
 * sweeps round through the zone.
 *
 *   stance ─▶ load ─▶ CONTACT ─▶ extension ─▶ follow-through ─▶ (back to stance)
 */
import { completeKeyframes, lerpPose, poseAt } from './figure.js';

/** The moment in the swing (0 to 1) when the bat meets the ball. */
export const CONTACT_AT = 0.45;

const SWING = completeKeyframes([
  {
    // Stance: feet apart along the line to the pitcher, knees soft, leaning a
    // little over the plate, hands up by the back shoulder, bat angled back.
    at: 0,
    head: [0.1, 1.66, 0.06],
    neck: [0.05, 1.52, 0],
    chest: [0.05, 1.38, 0],
    lShoulder: [0.06, 1.42, 0.19],
    rShoulder: [0.02, 1.43, -0.19],
    lElbow: [0.12, 1.26, -0.02],
    rElbow: [-0.12, 1.32, -0.4],
    hands: [-0.02, 1.5, -0.24],
    batTip: [-0.2, 2.18, -0.5],
    lHip: [0.02, 0.95, 0.13],
    rHip: [-0.02, 0.95, -0.13],
    lKnee: [0.14, 0.52, 0.32],
    rKnee: [0.1, 0.52, -0.32],
    lFoot: [0.04, 0.02, 0.38],
    rFoot: [0, 0.02, -0.38],
  },
  {
    // Load: hands drift back, the front foot lifts and strides towards the pitcher.
    at: 0.25,
    lShoulder: [0.08, 1.42, 0.17],
    rShoulder: [0, 1.43, -0.21],
    hands: [-0.08, 1.52, -0.33],
    batTip: [-0.3, 2.1, -0.7],
    lKnee: [0.14, 0.6, 0.4],
    lFoot: [0.05, 0.1, 0.48],
  },
  {
    // Contact: front foot down, hips and shoulders turning, hands out in
    // front, and the bat level through the zone over the plate.
    at: CONTACT_AT,
    head: [0.12, 1.62, 0.08],
    chest: [0.07, 1.36, 0.02],
    lShoulder: [-0.02, 1.4, 0.18],
    rShoulder: [0.12, 1.4, -0.14],
    lElbow: [0.15, 1.2, 0.12],
    rElbow: [0.18, 1.1, -0.12],
    hands: [0.32, 1.02, -0.02],
    batTip: [1.1, 0.95, -0.05],
    lHip: [-0.04, 0.95, 0.12],
    rHip: [0.06, 0.95, -0.1],
    lKnee: [0.12, 0.5, 0.45],
    lFoot: [0.05, 0.02, 0.5],
    rKnee: [0.2, 0.48, -0.25],
    rFoot: [0.02, 0.06, -0.38],
  },
  {
    // Extension: arms long, the bat carrying on round towards left field.
    at: 0.62,
    chest: [0.05, 1.36, 0.06],
    lShoulder: [-0.12, 1.4, 0.14],
    rShoulder: [0.18, 1.4, -0.05],
    lElbow: [0.1, 1.28, 0.3],
    rElbow: [0.3, 1.2, 0.05],
    hands: [0.4, 1.18, 0.25],
    batTip: [0.75, 1.35, 0.95],
  },
  {
    // Follow-through: chest facing the pitcher, hands over the front
    // shoulder, the bat wrapped round behind the neck, back foot up on its toe.
    at: 1,
    head: [0.05, 1.64, 0.12],
    chest: [0.02, 1.38, 0.05],
    lShoulder: [-0.18, 1.42, 0.05],
    rShoulder: [0.18, 1.42, -0.02],
    lElbow: [-0.2, 1.35, 0.2],
    rElbow: [0.15, 1.45, 0.15],
    hands: [-0.05, 1.55, 0.25],
    batTip: [-0.55, 1.75, -0.2],
    lHip: [-0.1, 0.95, 0.06],
    rHip: [0.1, 0.95, -0.06],
    rKnee: [0.12, 0.5, -0.15],
    rFoot: [0.05, 0.08, -0.32],
  },
]);

/**
 * @param {{ swingMs: number, holdMs: number, returnMs: number, startAt: number }} timing
 *   swingMs: how long the swing takes from `startAt` to the follow-through;
 *   startAt: where in the swing the animation begins when you swing (the
 *   phone reports a swing a moment after it happens, so we skip ahead to keep
 *   the bat in step with you)
 */
export function createBatter(timing) {
  const stance = poseAt(SWING, 0);
  const finish = poseAt(SWING, 1);

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
        return poseAt(SWING, startAt + (1 - startAt) * (sinceSwing / swingMs));
      }
      if (sinceSwing < swingMs + holdMs) return finish;
      if (sinceSwing < swingMs + holdMs + returnMs) {
        return lerpPose(finish, stance, (sinceSwing - swingMs - holdMs) / returnMs);
      }
      // Waiting: a gentle waggle of the bat.
      const waggle = Math.sin(now / 260) * 0.06;
      const [x, y, z] = /** @type {number[]} */ (stance.batTip);
      return { ...stance, batTip: [x + waggle, y - waggle * 0.4, z - waggle * 0.5] };
    },
  };
}
