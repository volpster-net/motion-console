import { describe, expect, it } from 'vitest';
import { CONFIG } from './index.js';
import {
  createClockMatch,
  createSwingDetector,
  createTimingCalibration,
  createVerticalSpin,
  normalizeSwing,
  spinSpeed,
} from './swing.js';

const config = CONFIG.swing;

/** Feeds speeds 16 ms apart; returns the swings found. */
function feed(detector, speeds, startT = 0) {
  return speeds
    .map((speed, i) => detector.update(speed, startT + i * 16))
    .filter((swing) => swing !== null);
}

describe('spinSpeed', () => {
  it('combines all three axes, so any grip works', () => {
    expect(spinSpeed({ alpha: 300, beta: 400, gamma: 0 })).toBe(500);
    expect(spinSpeed({ alpha: 0, beta: 0, gamma: -500 })).toBe(500);
  });
});

describe('createSwingDetector', () => {
  const swings = (events) => events.filter((event) => event.type === 'swing');

  it('reports when a swing starts, and when it peaks', () => {
    const detector = createSwingDetector(config);
    const events = feed(detector, [0, 100, 600, 1400, 1800, 1200, 500, 80]);
    expect(events).toEqual([
      { type: 'start', t: 32 },
      { type: 'swing', t: 64, peak: 1800 },
    ]);
  });

  it('ignores adjusting your grip or wiggling the phone', () => {
    const detector = createSwingDetector(config);
    expect(feed(detector, [50, 150, 300, -200, 90, 250, 60])).toEqual([]);
  });

  it('ignores the load: it turns the other way', () => {
    const detector = createSwingDetector(config);
    const load = [-300, -700, -900, -500, -100];
    const swing = [800, 1600, 2100, 1300, 400, 60];
    const events = feed(detector, [...load, 40, ...swing]);
    expect(swings(events)).toEqual([{ type: 'swing', t: 8 * 16, peak: 2100 }]);
    expect(events.filter((e) => e.type === 'start')).toEqual([{ type: 'start', t: 6 * 16 }]);
  });

  it('counts one swing, not the follow-through or bringing the bat back', () => {
    const detector = createSwingDetector(config);
    const swing = [700, 1500, 900, 100];
    const back = [-600, -800, -200];
    expect(swings(feed(detector, [...swing, ...back, 700, 1200, 100]))).toHaveLength(1);
  });

  it('ends a swing that never slows down', () => {
    const detector = createSwingDetector(config);
    expect(swings(feed(detector, Array(40).fill(900)))).toHaveLength(1);
  });

  it('switches to left-handed when the other way keeps coming out much harder', () => {
    const detector = createSwingDetector(config);
    const lefty = [-800, -1700, -2200, -1200, -300, -60];
    feed(detector, [...lefty, ...Array(60).fill(0)]);
    expect(detector.direction).toBe(-1);
    expect(swings(feed(detector, lefty, 5000))).toHaveLength(1);
  });
});

describe('createVerticalSpin', () => {
  it('measures spin round the true vertical, whatever the grip', () => {
    // Phone upright like a bat handle: gravity along its y axis.
    const spin = createVerticalSpin({ axisOrder: 'xyz', calmRate: 120 });
    spin.read({ alpha: 0, beta: 0, gamma: 0, gx: 0, gy: 9.8, gz: 0 });
    // Turning left round the vertical = spin round the phone's y axis (beta, in xyz order).
    expect(spin.read({ alpha: 0, beta: 900, gamma: 0, gx: 3, gy: 9.8, gz: 2 })).toBeCloseTo(900);
    // A wrist roll round another axis isn't vertical spin.
    expect(spin.read({ alpha: 900, beta: 0, gamma: 0, gx: 0, gy: 9.8, gz: 0 })).toBeCloseTo(0);
  });

  it('falls back to total spin without a gravity reading', () => {
    const spin = createVerticalSpin({ axisOrder: 'xyz', calmRate: 120 });
    expect(spin.read({ alpha: 300, beta: 400, gamma: 0 })).toBeCloseTo(500);
  });
});

describe('createClockMatch', () => {
  it('translates phone time using the quickest trip it has seen', () => {
    const clock = createClockMatch({ quickestTripMs: 30 });
    expect(clock.ready).toBe(false);
    // The phone's clock is 5000 ms behind the console's; trips take 30–120 ms.
    const trips = [80, 30, 120, 55];
    trips.forEach((trip, i) => clock.observe(i * 16, i * 16 + 5000 + trip));
    expect(clock.ready).toBe(true);
    expect(clock.toConsole(1000)).toBe(6000);
  });

  it('starts over when the phone reloads and its clock restarts', () => {
    const clock = createClockMatch({ quickestTripMs: 0 });
    clock.observe(10_000, 10_100);
    clock.observe(5, 20_000);
    expect(clock.toConsole(5)).toBe(20_000);
  });
});

describe('normalizeSwing', () => {
  it('maps the weakest swing to 0 and the strongest to 1, and clamps', () => {
    expect(normalizeSwing(config.weakest, config)).toBe(0);
    expect(normalizeSwing(config.strongest, config)).toBe(1);
    expect(normalizeSwing(config.strongest * 3, config)).toBe(1);
  });
});

describe('createTimingCalibration', () => {
  const make = () =>
    createTimingCalibration({ samples: 5, maxMs: 250, storageKey: `test-${Math.random()}` });

  it('starts with no shift', () => {
    expect(make().offset).toBe(0);
  });

  it('shifts timing to the middle of your recent swings', () => {
    const calibration = make();
    for (const error of [-150, -130, -170]) calibration.learn(error);
    expect(calibration.offset).toBe(-150);
  });

  it('is not thrown off by one wild swing', () => {
    const calibration = make();
    for (const error of [-150, -140, -160, 400]) calibration.learn(error);
    expect(calibration.offset).toBe(-145);
  });

  it('only remembers the last few swings, and never shifts too far', () => {
    const calibration = make();
    for (const error of [-600, -600, -600, -600, -600]) calibration.learn(error);
    expect(calibration.offset).toBe(-250);
    for (const error of [0, 0, 0]) calibration.learn(error);
    expect(calibration.offset).toBe(0);
  });
});
