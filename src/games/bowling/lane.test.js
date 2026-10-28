import { describe, expect, it } from 'vitest';
import { CONFIG } from './index.js';
import {
  isSplit,
  laneSettled,
  pinSpots,
  rackPins,
  rollBall,
  standingPins,
  stepLane,
} from './lane.js';

const LANE = CONFIG.lane;

/** A repeatable stand-in for Math.random, so every run bounces the same way. */
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Rolls a ball at a full rack (or `standing` pins) in 60 Hz frames until everything stops. */
function bowl(release, { standing, seed = 1 } = {}) {
  const lane = rollBall(release, rackPins(LANE, standing));
  const random = seeded(seed);
  const events = [];
  for (let t = 0; t < 12 && !laneSettled(lane, LANE); t += 1 / 60) {
    events.push(...stepLane(lane, 1 / 60, LANE, random));
  }
  return { lane, events, standing: standingPins(lane.pins) };
}

const straight = (x, speed = 7.5) => ({ x, angleDeg: 0, speed, spin: 0 });

describe('the rack', () => {
  it('stands the head pin in the middle and pins 7 and 10 in the back corners', () => {
    const spots = pinSpots(LANE);
    const pin = (n) => spots.find((spot) => spot.n === n);
    expect(spots).toHaveLength(10);
    expect(pin(1)).toMatchObject({ x: 0, z: LANE.headPinZ });
    expect(pin(7).x).toBeCloseTo(-1.5 * LANE.pinSpacing);
    expect(pin(10).x).toBeCloseTo(1.5 * LANE.pinSpacing);
    expect(pin(7).z).toBeCloseTo(pin(10).z);
  });

  it('racks only the pins still standing for a second ball', () => {
    expect(rackPins(LANE, [7, 10]).map((pin) => pin.n)).toEqual([7, 10]);
  });
});

describe('rolling', () => {
  it('strikes from the pocket, just right of the head pin', () => {
    for (const seed of [1, 2, 3]) expect(bowl(straight(0.06), { seed }).standing).toEqual([]);
  });

  it('knocks nothing down from the gutter', () => {
    const { standing, events, lane } = bowl({ x: 0.45, angleDeg: 1.5, speed: 8, spin: 0 });
    expect(lane.ball.gutter).toBe(true);
    expect(standing).toHaveLength(10);
    expect(events).toContainEqual({ type: 'gutter' });
  });

  it('leaves pins standing on a light hit', () => {
    expect(bowl(straight(0.3)).standing.length).toBeGreaterThan(2);
  });

  it('hooks a spinning ball only once it reaches the dry end of the lane', () => {
    const lane = rollBall({ x: 0, angleDeg: 0, speed: 7.5, spin: 1 }, []);
    while (lane.ball.z < LANE.oilLength) stepLane(lane, 1 / 60, LANE);
    expect(Math.abs(lane.ball.x)).toBeLessThan(0.01);
    while (lane.ball.z < LANE.headPinZ) stepLane(lane, 1 / 60, LANE);
    expect(lane.ball.x).toBeGreaterThan(0.2);
  });

  it('hooks the other way with the opposite spin', () => {
    const lane = rollBall({ x: 0, angleDeg: 0, speed: 7.5, spin: -1 }, []);
    while (lane.ball.z < LANE.headPinZ) stepLane(lane, 1 / 60, LANE);
    expect(lane.ball.x).toBeLessThan(-0.2);
  });

  it('can pick up a spare', () => {
    // The 10 pin alone, back right: roll right at it.
    const tenPin = pinSpots(LANE).find((spot) => spot.n === 10);
    expect(bowl(straight(tenPin.x), { standing: [10] }).standing).toEqual([]);
  });

  it('settles in a few seconds', () => {
    const { lane } = bowl(straight(0));
    expect(laneSettled(lane, LANE)).toBe(true);
    expect(lane.time).toBeLessThan(8);
  });
});

describe('isSplit', () => {
  it('spots the 7-10 split', () => {
    expect(isSplit([7, 10])).toBe(true);
  });

  it('does not call it a split while the head pin stands', () => {
    expect(isSplit([1, 7, 10])).toBe(false);
  });

  it('does not call neighbouring pins a split', () => {
    expect(isSplit([2, 4])).toBe(false);
    expect(isSplit([10])).toBe(false);
  });
});
