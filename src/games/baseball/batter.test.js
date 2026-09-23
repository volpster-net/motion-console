import { describe, expect, it } from 'vitest';
import { BAT, CONTACT_AT, GRIP, LOADED_AT, createBatter, swingPose } from './batter.js';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
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

/** How far a point is from the bat, and how far along the bat (0 = top hand, 1 = end) it is. */
function offBat(pose, point) {
  const along3 = pose.batTip.map((v, i) => v - pose.rHand[i]);
  const rel = point.map((v, i) => v - pose.rHand[i]);
  const k =
    rel.reduce((sum, v, i) => sum + v * along3[i], 0) / along3.reduce((sum, v) => sum + v * v, 0);
  const nearest = pose.rHand.map((v, i) => v + along3[i] * k);
  return { gap: distance(nearest, point), along: k };
}

describe('the swing', () => {
  it('moves smoothly, with no jumps from one moment to the next', () => {
    for (let t = 0; t < 1; t += 0.004) {
      const [a, b] = [swingPose(t), swingPose(t + 0.004)];
      for (const joint of JOINTS) expect(distance(a[joint], b[joint])).toBeLessThan(0.2);
    }
  });

  it('keeps the bat its real length all the way round', () => {
    for (let t = 0; t <= 1; t += 0.01) {
      const pose = swingPose(t, [0.8, 0.85, -0.1]);
      expect(distance(pose.rHand, pose.batTip)).toBeCloseTo(BAT - GRIP);
    }
  });

  it('has the bat out towards the plate, angled down, at contact', () => {
    const pose = swingPose(CONTACT_AT);
    expect(pose.batTip[0]).toBeGreaterThan(pose.rHand[0]);
    expect(pose.batTip[1]).toBeLessThan(pose.rHand[1]);
  });

  it('is fastest through contact, not stopping there', () => {
    const speed = (t) => distance(swingPose(t + 0.01).batTip, swingPose(t - 0.01).batTip);
    expect(speed(CONTACT_AT)).toBeGreaterThan(speed(0.1));
    expect(speed(CONTACT_AT)).toBeGreaterThan(speed(0.97));
  });

  it('meets the ball: the bat passes right through a high, middle or low pitch at contact', () => {
    // Around the batter: x towards the plate, y up, z towards the pitcher.
    for (const ball of [
      [0.8, 1.05, -0.1],
      [0.8, 0.8, -0.1],
      [0.65, 0.55, -0.1],
      [0.95, 0.8, -0.1],
    ]) {
      const { gap, along } = offBat(swingPose(CONTACT_AT, ball), ball);
      expect(gap).toBeLessThan(0.005);
      expect(along).toBeGreaterThan(0.3);
      expect(along).toBeLessThan(1);
    }
  });

  it('only bends to meet the ball around contact', () => {
    expect(swingPose(0.2, [0.8, 0.8, -0.1])).toEqual(swingPose(0.2));
    expect(swingPose(0.9, [0.8, 0.8, -0.1])).toEqual(swingPose(0.9));
  });
});

/** Two poses are the same, give or take rounding. */
function expectSamePose(a, b) {
  for (const joint of Object.keys(b)) expect(distance(a[joint], b[joint])).toBeLessThan(1e-9);
}

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
    expectSamePose(batter.pose(0, 1000), striding);
    const t = timing.startAt + (1 - timing.startAt) * (100 / timing.swingMs);
    expectSamePose(batter.pose(100, 1100), swingPose(t));
  });

  it('holds the finish, then settles back into his stance without spinning the bat', () => {
    const batter = createBatter(timing);
    batter.pose(0, 0);
    expectSamePose(batter.pose(timing.swingMs + 10, 0), swingPose(1));
    const { swingMs, holdMs, returnMs } = timing;
    let previous = batter.pose(swingMs + holdMs, 0).bat;
    for (let ms = swingMs + holdMs; ms <= swingMs + holdMs + returnMs + 20; ms += 10) {
      const bat = batter.pose(ms, 0).bat;
      // The angle the bat turns through in 10 ms stays small: no spinning.
      const cos = bat.reduce((sum, v, i) => sum + v * previous[i], 0);
      expect(Math.acos(Math.min(1, cos))).toBeLessThan(0.3);
      previous = bat;
    }
    const settled = batter.pose(swingMs + holdMs + returnMs + 1, 0);
    expect(settled.lAnkle).toEqual(swingPose(0).lAnkle);
  });
});
