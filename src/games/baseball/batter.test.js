import { describe, expect, it } from 'vitest';
import { CONTACT_AT, LOADED_AT, createBatter, swingPose } from './batter.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const JOINTS = [
  'head',
  'lSh',
  'rSh',
  'lHand',
  'rHand',
  'lHip',
  'rHip',
  'lAnkle',
  'rAnkle',
  'batTip',
];

/** How far a point is from the bat, and whether it's between the hands and the end. */
function offBat(pose, point) {
  const [hx, hy] = pose.rHand;
  const [dx, dy] = [pose.batTip[0] - hx, pose.batTip[1] - hy];
  const along = ((point[0] - hx) * dx + (point[1] - hy) * dy) / (dx * dx + dy * dy);
  const nearest = [hx + dx * along, hy + dy * along];
  return { gap: distance(nearest, point), along };
}

describe('the swing', () => {
  it('moves smoothly, with no jumps from one moment to the next', () => {
    for (let t = 0; t < 1; t += 0.004) {
      const [a, b] = [swingPose(t), swingPose(t + 0.004)];
      for (const joint of JOINTS) expect(distance(a[joint], b[joint])).toBeLessThan(25);
    }
  });

  it('has the bat out in front, angled down over the plate, at contact', () => {
    const pose = swingPose(CONTACT_AT);
    expect(pose.batTip[0]).toBeGreaterThan(pose.rHand[0]);
    expect(pose.batTip[1]).toBeGreaterThan(pose.rHand[1]);
  });

  it('is fastest through contact, not stopping there', () => {
    const speed = (t) => distance(swingPose(t + 0.01).batTip, swingPose(t - 0.01).batTip);
    expect(speed(CONTACT_AT)).toBeGreaterThan(speed(0.1));
    expect(speed(CONTACT_AT)).toBeGreaterThan(speed(0.97));
  });

  it('meets the ball: the bat passes right through a high, middle or low pitch at contact', () => {
    for (const ball of [
      [140, -210],
      [150, -170],
      [140, -120],
    ]) {
      const { gap, along } = offBat(swingPose(CONTACT_AT, ball), ball);
      expect(gap).toBeLessThan(1);
      expect(along).toBeGreaterThan(0.3);
      expect(along).toBeLessThan(1);
    }
  });

  it('only bends to meet the ball around contact', () => {
    expect(swingPose(0.2, [150, -170])).toEqual(swingPose(0.2));
    expect(swingPose(0.9, [150, -170])).toEqual(swingPose(0.9));
  });
});

describe('the batter', () => {
  const timing = { swingMs: 540, holdMs: 500, returnMs: 650, startAt: 0.38 };

  it('waits in his stance before any swing', () => {
    const pose = createBatter(timing).pose(-Infinity, 0);
    expect(pose.lAnkle).toEqual(swingPose(0).lAnkle);
    expect(pose.head).toEqual(swingPose(0).head);
  });

  it('lifts his leg and strides as the pitch comes in', () => {
    const batter = createBatter(timing);
    expect(batter.pose(-Infinity, 0, null, 1)).toEqual(swingPose(LOADED_AT));
    expect(batter.pose(-Infinity, 0, null, 0.5)).toEqual(swingPose(LOADED_AT / 2));
  });

  it('blends into a swing from wherever he was, instead of jumping', () => {
    const batter = createBatter(timing);
    const striding = batter.pose(-Infinity, 0, null, 0.5);
    expect(batter.pose(0, 1000)).toEqual(striding);
    const t = timing.startAt + (1 - timing.startAt) * (100 / timing.swingMs);
    expect(batter.pose(100, 1100)).toEqual(swingPose(t));
  });

  it('holds the finish, then settles back into his stance without spinning the bat', () => {
    const batter = createBatter(timing);
    batter.pose(0, 0);
    expect(batter.pose(timing.swingMs + 10, 0)).toEqual(swingPose(1));
    const { swingMs, holdMs, returnMs } = timing;
    let previous = batter.pose(swingMs + holdMs, 0).bat[0];
    for (let ms = swingMs + holdMs; ms <= swingMs + holdMs + returnMs + 20; ms += 10) {
      const angle = batter.pose(ms, 0).bat[0];
      // Compare directions: an angle and the same angle a full turn on point the same way.
      const turn = Math.abs(angle - previous) % (Math.PI * 2);
      expect(Math.min(turn, Math.PI * 2 - turn)).toBeLessThan(0.3);
      previous = angle;
    }
    const settled = batter.pose(swingMs + holdMs + returnMs + 1, 0);
    expect(settled.lAnkle).toEqual(swingPose(0).lAnkle);
  });
});
