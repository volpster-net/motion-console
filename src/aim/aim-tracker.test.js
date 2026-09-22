import { describe, expect, it } from 'vitest';
import { DEGREES_PER_SCREEN_HEIGHT, MAX_SAMPLE_GAP_MS } from './aim-math.js';
import { createAimTracker } from './aim-tracker.js';

const ASPECT = 16 / 9;
/** No deadzone or smoothing, so results are easy to predict. */
const exact = () =>
  createAimTracker({ sensitivity: 1, deadzone: 0, smoothing: 0, axisOrder: 'xyz' });

/**
 * A phone held flat (gravity along +z) turning right at `yawRate`°/s, sampled
 * every `stepMs` from `from` to `to`. With the default (Android Chrome) axis
 * order, gamma is the spin around z, and turning right is negative spin.
 */
function turnRight(tracker, id, { yawRate, from, to, stepMs = 10 }) {
  for (let t = from; t <= to; t += stepMs) {
    tracker.push(id, { alpha: 0, beta: 0, gamma: -yawRate, gx: 0, gy: 0, gz: 9.8, t });
  }
}

describe('createAimTracker', () => {
  it('starts every player at the centre', () => {
    const tracker = exact();
    tracker.update(0, ASPECT);
    expect(tracker.get('p1')).toMatchObject({ x: 0, y: 0 });
  });

  it('integrates using the phone timestamps, not when messages arrive', () => {
    const tracker = exact();
    // 300 ms of turning at 30°/s = 9°, which is 9/30 of a screen height,
    // delivered in one burst, all within a single frame.
    turnRight(tracker, 'p1', { yawRate: 30, from: 0, to: 300 });
    tracker.update(16, ASPECT);
    expect(tracker.get('p1').x).toBeCloseTo(9 / DEGREES_PER_SCREEN_HEIGHT);
  });

  it('gives the same result whether samples arrive all at once or frame by frame', () => {
    const burst = exact();
    turnRight(burst, 'p1', { yawRate: 45, from: 0, to: 200 });
    burst.update(0, ASPECT);

    const steady = exact();
    for (let t = 0; t <= 200; t += 10) {
      steady.push('p1', { alpha: 0, beta: 0, gamma: -45, gx: 0, gy: 0, gz: 9.8, t });
      steady.update(t, ASPECT);
    }
    expect(steady.get('p1').x).toBeCloseTo(burst.get('p1').x);
  });

  it('skips gaps too long to trust', () => {
    const tracker = exact();
    tracker.push('p1', { alpha: 0, beta: 0, gamma: -90, t: 0 });
    tracker.push('p1', { alpha: 0, beta: 0, gamma: -90, t: MAX_SAMPLE_GAP_MS + 1 });
    tracker.update(0, ASPECT);
    expect(tracker.get('p1').x).toBe(0);
  });

  it('stops at the edge of the play area', () => {
    const tracker = exact();
    turnRight(tracker, 'p1', { yawRate: 300, from: 0, to: 2000 });
    tracker.update(0, ASPECT);
    expect(tracker.get('p1').x).toBeCloseTo(ASPECT / 2);
  });

  it('snaps back to the centre on recenter', () => {
    const tracker = exact();
    turnRight(tracker, 'p1', { yawRate: 60, from: 0, to: 100 });
    tracker.update(0, ASPECT);
    tracker.recenter('p1');
    expect(tracker.get('p1')).toMatchObject({ x: 0, y: 0 });
  });

  it('ignores turning inside the deadzone', () => {
    const tracker = createAimTracker({
      sensitivity: 1,
      deadzone: 2,
      smoothing: 0,
      axisOrder: 'xyz',
    });
    turnRight(tracker, 'p1', { yawRate: 1.5, from: 0, to: 1000 });
    tracker.update(0, ASPECT);
    expect(tracker.get('p1').x).toBe(0);
  });

  it('glides towards the target when smoothing is on', () => {
    const tracker = createAimTracker({
      sensitivity: 1,
      deadzone: 0,
      smoothing: 50,
      axisOrder: 'xyz',
    });
    tracker.update(0, ASPECT);
    turnRight(tracker, 'p1', { yawRate: 30, from: 0, to: 300 });
    tracker.update(16, ASPECT);
    const x = tracker.get('p1').x;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(9 / DEGREES_PER_SCREEN_HEIGHT);
  });

  it('keeps players independent', () => {
    const tracker = exact();
    turnRight(tracker, 'p1', { yawRate: 30, from: 0, to: 100 });
    tracker.update(0, ASPECT);
    expect(tracker.get('p1').x).toBeGreaterThan(0);
    expect(tracker.get('p2').x).toBe(0);
  });

  it('picks up setting changes immediately', () => {
    const tracker = exact();
    tracker.settings.sensitivity = 2;
    turnRight(tracker, 'p1', { yawRate: 30, from: 0, to: 300 });
    tracker.update(0, ASPECT);
    expect(tracker.get('p1').x).toBeCloseTo((2 * 9) / DEGREES_PER_SCREEN_HEIGHT);
  });

  it('turns left/right correctly when the phone is held upright', () => {
    const tracker = exact();
    // Upright: gravity along +y, so turning right is negative spin around y (beta, in xyz order).
    for (let t = 0; t <= 300; t += 10) {
      tracker.push('p1', { alpha: 0, beta: -30, gamma: 0, gx: 0, gy: 9.8, gz: 0, t });
    }
    tracker.update(0, ASPECT);
    expect(tracker.get('p1').x).toBeCloseTo(9 / DEGREES_PER_SCREEN_HEIGHT);
    expect(tracker.get('p1').y).toBeCloseTo(0);
  });

  it('ignores wrist twists when held flat', () => {
    const tracker = exact();
    // Held flat, a twist is spin around y (beta, in xyz order).
    for (let t = 0; t <= 300; t += 10) {
      tracker.push('p1', { alpha: 0, beta: 90, gamma: 0, gx: 0, gy: 0, gz: 9.8, t });
    }
    tracker.update(0, ASPECT);
    expect(tracker.get('p1')).toMatchObject({ x: 0, y: 0 });
  });

  it('follows the axis order setting', () => {
    const tracker = exact();
    tracker.settings.axisOrder = 'zxy';
    // In spec order, alpha is the spin around z.
    for (let t = 0; t <= 300; t += 10) {
      tracker.push('p1', { alpha: -30, beta: 0, gamma: 0, gx: 0, gy: 0, gz: 9.8, t });
    }
    tracker.update(0, ASPECT);
    expect(tracker.get('p1').x).toBeCloseTo(9 / DEGREES_PER_SCREEN_HEIGHT);
  });
});
