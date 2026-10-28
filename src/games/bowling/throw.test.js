import { describe, expect, it } from 'vitest';
import { createThrowMemory, releaseBall } from './throw.js';

const CONFIG = {
  swingWindowMs: 250,
  aimWindowMs: 100,
  spinWindowMs: 150,
  weakest: 100,
  strongest: 700,
  minSwing: 80,
  slowestBall: 4,
  fastestBall: 10,
  turnDeadzone: 20,
  degreesPerTurn: 0.02,
  maxAngle: 4,
  twistDeadzone: 50,
  fullTwist: 400,
};

describe('createThrowMemory', () => {
  it('reads the fastest forward swing just before letting go', () => {
    const memory = createThrowMemory(CONFIG);
    // Backswing (tipping down), then forward, peaking at 500°/s.
    const swing = [-300, -200, 0, 200, 400, 500, 450, 300];
    swing.forEach((speed, i) => memory.add({ t: i * 20, swing: speed, turn: 0, twist: 0 }));
    expect(memory.read().swing).toBe(500);
  });

  it('forgets a fast swing from too long ago', () => {
    const memory = createThrowMemory(CONFIG);
    memory.add({ t: 0, swing: 600, turn: 0, twist: 0 });
    memory.add({ t: 400, swing: 100, turn: 0, twist: 0 });
    expect(memory.read().swing).toBe(100);
  });

  it('averages turning and twisting over their windows', () => {
    const memory = createThrowMemory(CONFIG);
    memory.add({ t: 0, swing: 0, turn: 999, twist: 999 });
    memory.add({ t: 200, swing: 0, turn: 40, twist: 100 });
    memory.add({ t: 250, swing: 0, turn: 60, twist: 300 });
    expect(memory.read()).toEqual({ swing: 0, turn: 50, twist: 200 });
  });

  it('reads nothing once cleared', () => {
    const memory = createThrowMemory(CONFIG);
    memory.add({ t: 0, swing: 300, turn: 10, twist: 10 });
    memory.clear();
    expect(memory.read()).toEqual({ swing: 0, turn: 0, twist: 0 });
  });
});

describe('releaseBall', () => {
  it('rolls a plain swing straight, with no spin', () => {
    const ball = releaseBall({ swing: 400, turn: 10, twist: 30 }, CONFIG);
    expect(ball.speed).toBeCloseTo(7);
    expect(ball.angleDeg).toBe(0);
    expect(ball.spin).toBe(0);
  });

  it('keeps the speed between the slowest and fastest balls', () => {
    expect(releaseBall({ swing: 0, turn: 0, twist: 0 }, CONFIG).speed).toBe(4);
    expect(releaseBall({ swing: 5000, turn: 0, twist: 0 }, CONFIG).speed).toBe(10);
  });

  it('angles the ball the way the arm was turning, up to a limit', () => {
    expect(releaseBall({ swing: 400, turn: 70, twist: 0 }, CONFIG).angleDeg).toBeCloseTo(1);
    expect(releaseBall({ swing: 400, turn: -70, twist: 0 }, CONFIG).angleDeg).toBeCloseTo(-1);
    expect(releaseBall({ swing: 400, turn: 9000, twist: 0 }, CONFIG).angleDeg).toBe(4);
  });

  it('spins the ball the way the wrist twisted, up to full spin', () => {
    expect(releaseBall({ swing: 400, turn: 0, twist: 250 }, CONFIG).spin).toBeCloseTo(0.5);
    expect(releaseBall({ swing: 400, turn: 0, twist: -250 }, CONFIG).spin).toBeCloseTo(-0.5);
    expect(releaseBall({ swing: 400, turn: 0, twist: 2000 }, CONFIG).spin).toBe(1);
  });
});
