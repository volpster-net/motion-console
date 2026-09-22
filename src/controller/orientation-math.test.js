import { describe, expect, it } from 'vitest';
import { relativeOrientation, roundOrientation, wrap180 } from './orientation-math.js';

describe('wrap180', () => {
  it.each([
    [0, 0],
    [179, 179],
    [180, -180],
    [190, -170],
    [-190, 170],
    [360, 0],
    [725, 5],
  ])('wraps %d to %d', (input, expected) => {
    expect(wrap180(input)).toBe(expected);
  });
});

describe('relativeOrientation', () => {
  const zero = { alpha: 10, beta: 30, gamma: 0 };

  it('is zero at the centre pose', () => {
    expect(roundOrientation(relativeOrientation(zero, zero))).toEqual({
      yaw: 0,
      pitch: 0,
      roll: 0,
    });
  });

  it('treats turning right (alpha decreasing) as positive yaw, across the 0/360 seam', () => {
    expect(relativeOrientation({ ...zero, alpha: 350 }, zero).yaw).toBe(20);
    expect(relativeOrientation({ ...zero, alpha: 30 }, zero).yaw).toBe(-20);
  });

  it('maps raising the top edge to positive pitch and dipping right to positive roll', () => {
    const turned = relativeOrientation({ alpha: 10, beta: 45, gamma: 12 }, zero);
    expect(turned.pitch).toBe(15);
    expect(turned.roll).toBe(12);
  });
});

describe('roundOrientation', () => {
  it('rounds to 0.1° and never yields -0', () => {
    const rounded = roundOrientation({ yaw: 12.345, pitch: -0.04, roll: -7.06 });
    expect(rounded).toEqual({ yaw: 12.3, pitch: 0, roll: -7.1 });
    expect(Object.is(rounded.pitch, -0)).toBe(false);
  });
});
