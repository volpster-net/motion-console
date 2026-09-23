import { describe, expect, it } from 'vitest';
import { CONFIG } from './index.js';
import { createClockMatch, createSwingDetector, normalizeSwing, spinSpeed } from './swing.js';

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
  it('reports a swing at its fastest moment', () => {
    const detector = createSwingDetector(config);
    const swings = feed(detector, [0, 100, 600, 1400, 1800, 1200, 500, 80]);
    expect(swings).toEqual([{ t: 64, peak: 1800 }]);
  });

  it('ignores adjusting your grip or wiggling the phone', () => {
    const detector = createSwingDetector(config);
    expect(feed(detector, [50, 150, 300, 200, 90, 250, 60])).toEqual([]);
  });

  it('counts one swing, not the follow-through', () => {
    const detector = createSwingDetector(config);
    const swing = [700, 1500, 900, 100];
    const followThrough = [800, 1200, 100];
    expect(feed(detector, [...swing, ...followThrough])).toHaveLength(1);
    const later = config.restMs + 200;
    expect(feed(detector, swing, later)).toHaveLength(1);
  });

  it('ends a swing that never slows down', () => {
    const detector = createSwingDetector(config);
    expect(feed(detector, Array(60).fill(900))).toHaveLength(1);
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
