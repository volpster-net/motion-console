/**
 * Your batter's swing, as key poses (see figure.js).
 *
 * You're a right-handed batter in the left-hand batter's box, seen from
 * behind the plate: you face the plate (to the right of the screen), your
 * back shoulder nearest us, both hands on the bat (`hands`), and `batTip`
 * where the end of the bat is.
 *
 *   stance ─▶ load ─▶ CONTACT ─▶ extension ─▶ follow-through ─▶ (back to stance)
 *
 * At contact the bat is level, reaching out over the plate.
 */
import { completeKeyframes, poseAt } from './figure.js';

/** The moment in the swing (0 to 1) when the bat meets the ball. */
export const CONTACT_AT = 0.45;

const SWING = completeKeyframes([
  {
    // Stance: knees bent, hands up by the back shoulder, bat angled back.
    at: 0,
    head: [0.02, 1.66],
    neck: [0, 1.52],
    chest: [0.02, 1.4],
    rShoulder: [-0.12, 1.42],
    rElbow: [-0.3, 1.3],
    lShoulder: [0.14, 1.42],
    lElbow: [0, 1.3],
    hands: [-0.18, 1.52],
    batTip: [-0.45, 2.2],
    rHip: [-0.08, 0.92],
    rKnee: [-0.22, 0.5],
    rFoot: [-0.25, 0],
    lHip: [0.06, 0.92],
    lKnee: [0.22, 0.5],
    lFoot: [0.3, 0],
  },
  {
    // Load: hands go back, front foot lifts for the stride.
    at: 0.25,
    chest: [-0.02, 1.4],
    hands: [-0.3, 1.52],
    batTip: [-0.75, 2.05],
    lKnee: [0.25, 0.55],
    lFoot: [0.36, 0.08],
  },
  {
    // Contact: hips turn, hands drive through, the bat level over the plate.
    at: CONTACT_AT,
    head: [0.05, 1.62],
    chest: [0.08, 1.36],
    rElbow: [0.05, 1.12],
    lElbow: [0.3, 1.2],
    hands: [0.25, 1.05],
    batTip: [1.05, 0.98],
    rKnee: [-0.12, 0.46],
    rFoot: [-0.22, 0.04],
    lKnee: [0.32, 0.48],
    lFoot: [0.36, 0],
  },
  {
    // Extension: arms long, the bat carrying on up and round.
    at: 0.62,
    chest: [0.1, 1.38],
    rElbow: [0.2, 1.2],
    lElbow: [0.4, 1.28],
    hands: [0.4, 1.2],
    batTip: [0.95, 1.55],
  },
  {
    // Follow-through: hands over the front shoulder, the bat wrapped behind.
    at: 1,
    chest: [0.08, 1.38],
    rElbow: [0.2, 1.4],
    lElbow: [0.35, 1.45],
    hands: [0.15, 1.55],
    batTip: [-0.55, 1.85],
    rFoot: [-0.15, 0.08],
    rKnee: [-0.05, 0.48],
  },
]);

/**
 * @param {{ swingMs: number, holdMs: number, returnMs: number, startAt: number }} timing
 *   swingMs: how long the swing takes from `startAt` to the follow-through;
 *   startAt: where in the swing the animation begins when you swing (the
 *   phone reports a swing a moment after it starts, so we skip the start of
 *   the load to keep the bat in step with you)
 */
export function createBatter(timing) {
  return {
    /**
     * The batter's pose now.
     *
     * @param {number} sinceSwing  ms since a swing was detected (Infinity if none yet)
     * @param {number} now         ms, for the little bat waggle while waiting
     */
    pose(sinceSwing, now) {
      const { swingMs, holdMs, returnMs, startAt } = timing;
      if (sinceSwing < swingMs) {
        return poseAt(SWING, startAt + (1 - startAt) * (sinceSwing / swingMs));
      }
      if (sinceSwing < swingMs + holdMs) return poseAt(SWING, 1);
      if (sinceSwing < swingMs + holdMs + returnMs) {
        // Back to the stance, by blending the follow-through towards it.
        const k = (sinceSwing - swingMs - holdMs) / returnMs;
        const from = poseAt(SWING, 1);
        const to = poseAt(SWING, 0);
        const pose = {};
        for (const key of Object.keys(to)) {
          const a = from[key];
          const b = to[key];
          pose[key] = Array.isArray(b)
            ? [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
            : a + (b - a) * k;
        }
        return pose;
      }
      // Waiting: a gentle waggle of the bat.
      const stance = { ...poseAt(SWING, 0) };
      const waggle = Math.sin(now / 260) * 0.06;
      stance.batTip = [stance.batTip[0] + waggle, stance.batTip[1] - waggle * 0.4];
      return stance;
    },
  };
}
