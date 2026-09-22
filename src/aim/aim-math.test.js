import { describe, expect, it } from 'vitest';
import {
  applyDeadzone,
  AXIS_ORDERS,
  clampToArea,
  DEGREES_PER_SCREEN_HEIGHT,
  integrate,
  smoothingFactor,
  smoothToward,
  toAimRates,
  toPixels,
} from './aim-math.js';

describe('AXIS_ORDERS', () => {
  const rate = { alpha: 1, beta: 2, gamma: 3 };
  it('reads alpha, beta, gamma as x, y, z (Android Chrome)', () => {
    expect(AXIS_ORDERS.xyz(rate)).toEqual({ x: 1, y: 2, z: 3 });
  });
  it('reads alpha, beta, gamma as z, x, y (W3C spec)', () => {
    expect(AXIS_ORDERS.zxy(rate)).toEqual({ x: 2, y: 3, z: 1 });
  });
});

describe('toAimRates', () => {
  // Phone flat like a TV remote: screen faces the ceiling, top edge points at the TV.
  const flat = { x: 0, y: 0, z: 1 };
  // Phone upright like a camera: top edge faces the ceiling, screen faces you.
  const upright = { x: 0, y: 1, z: 0 };
  // Halfway between: tilted 45°.
  const tilted = { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 };

  it('turns right into positive yaw, whatever the grip', () => {
    // Turning right = clockwise seen from above = negative spin around "up".
    for (const up of [flat, upright, tilted]) {
      const spin = { x: -20 * up.x, y: -20 * up.y, z: -20 * up.z };
      const rates = toAimRates(spin, up);
      expect(rates.yaw).toBeCloseTo(20);
      expect(rates.pitch).toBeCloseTo(0);
    }
  });

  it('turns aiming higher into positive pitch, whatever the grip', () => {
    // Aiming higher is positive spin around the phone's left-to-right (x) axis.
    for (const up of [flat, upright, tilted]) {
      const rates = toAimRates({ x: 15, y: 0, z: 0 }, up);
      expect(rates.yaw).toBeCloseTo(0);
      expect(rates.pitch).toBeCloseTo(15);
    }
  });

  it('ignores twisting the wrist', () => {
    // Held flat, the phone points along its y axis, so a wrist twist is spin around y.
    expect(toAimRates({ x: 0, y: 40, z: 0 }, flat)).toEqual({ yaw: -0, pitch: 0 });
  });

  it('pauses up/down aiming when the phone is on its side', () => {
    expect(toAimRates({ x: 15, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).pitch).toBe(0);
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
