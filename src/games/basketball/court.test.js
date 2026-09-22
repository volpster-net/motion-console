import { describe, expect, it } from 'vitest';
import {
  ballIsDone,
  createBall,
  hoopXAt,
  launchVelocity,
  powerFromNorm,
  project,
  shotResult,
  stepBall,
} from './court.js';
import { CONFIG } from './index.js';

/** Flies a shot at `targetX` with a speed error, in 16 ms frames, until it's done. */
function fly(targetX, speedError, hoopX = 0) {
  const ball = createBall({
    id: 1,
    velocity: launchVelocity(targetX, speedError, CONFIG),
    now: 0,
    config: CONFIG,
  });
  const events = [];
  for (let now = 16; now < 5000 && !ballIsDone(ball, now, CONFIG); now += 16) {
    events.push(...stepBall(ball, 0.016, hoopX, now, CONFIG));
  }
  return { ball, events, result: shotResult(ball) };
}

describe('shots', () => {
  it('swishes a perfect shot at the middle of the rim', () => {
    const { ball, events, result } = fly(0, 0);
    expect(ball.scored).toBe(true);
    expect(result).toBe('swish');
    expect(events).toContain('score');
    expect(events).not.toContain('rim');
  });

  it('falls short when thrown too softly', () => {
    const { ball, result } = fly(0, -0.15);
    expect(ball.scored).toBe(false);
    expect(result).toBe('short');
  });

  it('misses long when thrown too hard', () => {
    const { ball, result } = fly(0, 0.2);
    expect(ball.scored).toBe(false);
    expect(['long', 'board', 'rimmed']).toContain(result);
  });

  it('misses when aimed well to the side', () => {
    const { ball } = fly(1.2, 0);
    expect(ball.scored).toBe(false);
  });

  it('clips the rim when aimed a little off-centre', () => {
    const { ball } = fly(0.3, 0);
    expect(ball.touchedRim).toBe(true);
  });

  it('follows a moving hoop: a perfect shot at where the hoop is still goes in', () => {
    const { ball } = fly(0.5, 0, 0.5);
    expect(ball.scored).toBe(true);
  });
});

describe('powerFromNorm', () => {
  const { sweetSpot, sweetBand, powerGain } = CONFIG.flick;

  it('flies perfectly anywhere in the sweet spot', () => {
    expect(powerFromNorm(sweetSpot, CONFIG).speedError).toBe(0);
    expect(powerFromNorm(sweetSpot + sweetBand * 0.9, CONFIG).speedError).toBe(0);
  });

  it('is too slow below it and too fast above it', () => {
    expect(powerFromNorm(0, CONFIG).speedError).toBeCloseTo(-(sweetSpot - sweetBand) * powerGain);
    expect(powerFromNorm(1, CONFIG).speedError).toBeCloseTo(
      (1 - sweetSpot - sweetBand) * powerGain,
    );
  });

  it('clamps flicks outside the expected range', () => {
    expect(powerFromNorm(3, CONFIG)).toEqual(powerFromNorm(1, CONFIG));
  });
});

describe('hoopXAt', () => {
  it('stays in the middle for the first part of the round, then slides', () => {
    const { durationMs } = CONFIG.round;
    const { fromProgress, periodMs } = CONFIG.court.hoopMotion;
    expect(hoopXAt(fromProgress - 0.01, durationMs * (fromProgress - 0.01), CONFIG)).toBe(0);
    const quarterSwing = durationMs * fromProgress + periodMs / 4;
    expect(Math.abs(hoopXAt(quarterSwing / durationMs, quarterSwing, CONFIG))).toBeGreaterThan(0.2);
  });
});

describe('project', () => {
  const size = { width: 1600, height: 900 };

  it('puts things at eye height on the horizon, and shrinks them with distance', () => {
    const { height, horizon } = CONFIG.court.camera;
    const near = project({ x: 0, y: height, z: 1 }, size, CONFIG);
    const far = project({ x: 0, y: height, z: 10 }, size, CONFIG);
    expect(near.y).toBeCloseTo(horizon * size.height);
    expect(far.y).toBeCloseTo(horizon * size.height);
    expect(far.scale).toBeLessThan(near.scale);
  });

  it('puts the middle of the court in the middle of the screen', () => {
    expect(project({ x: 0, y: 0, z: 5 }, size, CONFIG).x).toBe(size.width / 2);
  });
});
