import { describe, expect, it } from 'vitest';
import {
  applyDeadzone,
  clampToArea,
  DEGREES_PER_SCREEN_HEIGHT,
  integrate,
  smoothingFactor,
  smoothToward,
  toAimRates,
  toPixels,
} from './aim-math.js';

describe('toAimRates', () => {
  it('turns anticlockwise alpha (turning left) into negative yaw, and passes beta through as pitch', () => {
    expect(toAimRates({ alpha: 10, beta: 5, gamma: 99 })).toEqual({ yaw: -10, pitch: 5 });
  });
});

describe('applyDeadzone', () => {
  it('zeroes turning slower than the deadzone', () => {
    expect(applyDeadzone({ yaw: 1, pitch: 1 }, 2)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('subtracts the deadzone from the combined speed, keeping the direction', () => {
    // A 3-4-5 triangle: speed 5, minus deadzone 2 leaves 3, so each axis keeps 3/5.
    const out = applyDeadzone({ yaw: 3, pitch: 4 }, 2);
    expect(out.yaw).toBeCloseTo(1.8);
    expect(out.pitch).toBeCloseTo(2.4);
  });

  it('does nothing with a zero deadzone', () => {
    expect(applyDeadzone({ yaw: 3, pitch: -4 }, 0)).toEqual({ yaw: 3, pitch: -4 });
  });
});

describe('integrate', () => {
  it('moves one screen height for DEGREES_PER_SCREEN_HEIGHT degrees at sensitivity 1', () => {
    // Turning right at that many degrees per second, for one second.
    const out = integrate({ x: 0, y: 0 }, { yaw: DEGREES_PER_SCREEN_HEIGHT, pitch: 0 }, 1000, 1);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
  });

  it('moves up (smaller y) when tipping up, and scales with time and sensitivity', () => {
    const out = integrate({ x: 0, y: 0 }, { yaw: 0, pitch: 30 }, 500, 2);
    expect(out.y).toBeCloseTo(-(30 * 0.5 * 2) / DEGREES_PER_SCREEN_HEIGHT);
  });
});

describe('clampToArea', () => {
  it('keeps positions inside the play area', () => {
    expect(clampToArea({ x: 5, y: -5 }, 2)).toEqual({ x: 1, y: -0.5 });
    expect(clampToArea({ x: -0.3, y: 0.2 }, 2)).toEqual({ x: -0.3, y: 0.2 });
  });
});

describe('smoothing', () => {
  it('jumps straight to the target with smoothing off', () => {
    expect(smoothingFactor(16, 0)).toBe(1);
  });

  it('closes about 63% of the gap after `smoothingMs`, whatever the frame rate', () => {
    // One long frame...
    const once = smoothToward({ x: 0, y: 0 }, { x: 1, y: 0 }, smoothingFactor(40, 40));
    // ...or four short ones covering the same time.
    let position = { x: 0, y: 0 };
    for (let i = 0; i < 4; i++) {
      position = smoothToward(position, { x: 1, y: 0 }, smoothingFactor(10, 40));
    }
    expect(once.x).toBeCloseTo(1 - Math.exp(-1));
    expect(position.x).toBeCloseTo(once.x);
  });
});

describe('toPixels', () => {
  it('maps the centre to the middle, and screen heights to pixels', () => {
    expect(toPixels({ x: 0, y: 0 }, { width: 1600, height: 900 })).toEqual({ x: 800, y: 450 });
    expect(toPixels({ x: 0.5, y: -0.5 }, { width: 1600, height: 900 })).toEqual({ x: 1250, y: 0 });
  });
});
