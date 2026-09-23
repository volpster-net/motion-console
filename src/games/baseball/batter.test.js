import { describe, expect, it } from 'vitest';
import { CONTACT_AT, swingPose } from './batter.js';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
/** Which way the bat points, round the batter: 0° = at the plate, 90° = at the pitcher. */
const batYaw = (pose) => {
  const [x, , z] = pose.batTip.map((v, i) => v - pose.hands[i]);
  return (Math.atan2(z, x) * 180) / Math.PI;
};

describe('the swing', () => {
  const moments = Array.from({ length: 101 }, (_, i) => i / 100);

  it('keeps the bat the same length all the way round', () => {
    for (const t of moments) {
      const pose = swingPose(t);
      expect(distance(pose.hands, pose.batTip)).toBeCloseTo(0.84);
    }
  });

  it('has the bat level and out over the plate at contact', () => {
    const pose = swingPose(CONTACT_AT);
    expect(Math.abs(batYaw(pose))).toBeLessThan(15);
    expect(Math.abs(pose.batTip[1] - pose.hands[1])).toBeLessThan(0.1);
  });

  it('sweeps the bat round one way from the load to the follow-through, never back', () => {
    // Unwrap the angle so going past 180° keeps counting up.
    let previous = batYaw(swingPose(0.3));
    let total = previous;
    for (let t = 0.31; t <= 1; t += 0.01) {
      let yaw = batYaw(swingPose(t));
      while (yaw - previous < -180) yaw += 360;
      while (yaw - previous > 180) yaw -= 360;
      expect(yaw).toBeGreaterThanOrEqual(previous - 0.5);
      previous = yaw;
      total = yaw;
    }
    expect(total).toBeGreaterThan(150);
  });

  it('is fastest through contact, not stopping there', () => {
    const speed = (t) => distance(swingPose(t + 0.01).batTip, swingPose(t - 0.01).batTip);
    expect(speed(CONTACT_AT)).toBeGreaterThan(speed(0.2));
    expect(speed(CONTACT_AT)).toBeGreaterThan(speed(0.95));
    expect(speed(CONTACT_AT)).toBeGreaterThan(0.05);
  });
});
