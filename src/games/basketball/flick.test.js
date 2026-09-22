import { describe, expect, it } from 'vitest';
import { createFlickDetector, normalizeFlick } from './flick.js';
import { CONFIG } from './index.js';

/** Feeds a list of pitch rates at 16 ms apart and collects the events. */
function feed(detector, rates, startT = 0) {
  return rates
    .map((rate, i) => detector.update(rate, startT + i * 16))
    .filter((event) => event !== null);
}

describe('createFlickDetector', () => {
  it('reports a flick with its peak speed when the tip-up slows down', () => {
    const detector = createFlickDetector(CONFIG.flick);
    const events = feed(detector, [0, 20, 200, 480, 610, 350, 40, 0]);
    expect(events).toEqual([
      { type: 'start', t: 32 },
      { type: 'flick', t: 96, peak: 610 },
    ]);
  });

  it('ignores slow tilting', () => {
    const detector = createFlickDetector(CONFIG.flick);
    expect(feed(detector, [30, 80, 120, 140, 90, 20])).toEqual([]);
  });

  it('ignores tipping downwards', () => {
    const detector = createFlickDetector(CONFIG.flick);
    expect(feed(detector, [-200, -600, -300, 0])).toEqual([]);
  });

  it('ignores the wobble right after a flick, then accepts the next one', () => {
    const detector = createFlickDetector(CONFIG.flick);
    feed(detector, [300, 500, 20]); // flick ends at t = 32
    const wobble = feed(detector, [400, 20], 48);
    expect(wobble).toEqual([]);
    const later = 32 + CONFIG.flick.cooldownMs + 10;
    expect(feed(detector, [400, 20], later).map((e) => e.type)).toEqual(['start', 'flick']);
  });

  it('ends a flick that runs too long', () => {
    const detector = createFlickDetector(CONFIG.flick);
    const steady = Array(40).fill(300); // never slows down
    const events = feed(detector, steady);
    expect(events.map((e) => e.type)).toEqual(['start', 'flick']);
    expect(events[1].t - events[0].t).toBeGreaterThan(CONFIG.flick.maxMs);
  });

  it('forgets a half-finished flick on reset', () => {
    const detector = createFlickDetector(CONFIG.flick);
    feed(detector, [300, 500]);
    detector.reset();
    expect(feed(detector, [20], 100)).toEqual([]);
  });
});

describe('normalizeFlick', () => {
  it('maps the weakest flick to 0 and the strongest to 1', () => {
    expect(normalizeFlick(CONFIG.flick.weakest, CONFIG.flick)).toBe(0);
    expect(normalizeFlick(CONFIG.flick.strongest, CONFIG.flick)).toBe(1);
  });
});
