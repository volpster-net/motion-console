import { describe, expect, it } from 'vitest';
import { CONFIG } from './index.js';
import { createShotDetector, normalizePush } from './shot.js';

const config = CONFIG.shot;
const STEP = 16;

/**
 * Feeds a motion script to a detector, one sample every 16 ms, and returns
 * the events. Each entry is [tilt, lift, pitchRate], repeated `times`.
 */
function play(detector, script, startT = 0) {
  const events = [];
  let t = startT;
  for (const [tilt, lift, pitchRate, times = 1] of script) {
    for (let i = 0; i < times; i++) {
      const event = detector.update({ tilt, lift, pitchRate, t });
      if (event) events.push(event);
      t += STEP;
    }
  }
  return events;
}

const holdSteps = Math.ceil(config.setHoldMs / STEP) + 1;
/** Level, then cocked back and held until set. */
const SET = [
  [0, 0, 0, 3],
  [60, 0, 0, holdSteps],
];

describe('createShotDetector', () => {
  it('shoots on set → push → snap, with the push as the power', () => {
    const detector = createShotDetector(config);
    const events = play(detector, [
      ...SET,
      [60, 8, 0],
      [55, 15, 0],
      [50, 11, 0],
      [30, 6, -(config.snapRate + 50)],
    ]);
    expect(events.map((e) => e.type)).toEqual(['set', 'push', 'shot']);
    const shot = events.at(-1);
    expect(shot).toMatchObject({ push: 15, snap: config.snapRate + 50 });
  });

  it('ignores a wrist flick from the normal pointing position', () => {
    const detector = createShotDetector(config);
    expect(play(detector, [[0, 2, -600, 5]])).toEqual([]);
  });

  it('ignores a push without being set first', () => {
    const detector = createShotDetector(config);
    expect(
      play(detector, [
        [10, 20, 0, 5],
        [10, 5, -600],
      ]),
    ).toEqual([]);
  });

  it('needs the set pose held for a moment, not just passed through', () => {
    const detector = createShotDetector(config);
    const quick = Math.max(1, Math.floor(config.setHoldMs / STEP) - 2);
    expect(
      play(detector, [
        [60, 0, 0, quick],
        [0, 0, 0],
      ]),
    ).toEqual([]);
  });

  it('fizzles when the wrist snaps without an arm push', () => {
    const detector = createShotDetector(config);
    const events = play(detector, [...SET, [55, 1, -600]]);
    expect(events.at(-1)).toMatchObject({ type: 'fizzle', missing: 'push' });
  });

  it('fizzles when the arm pushes but the wrist never snaps', () => {
    const detector = createShotDetector(config);
    const wait = Math.ceil(config.windowMs / STEP) + 2;
    const events = play(detector, [...SET, [60, 12, 0], [60, 4, 0, wait]]);
    expect(events.map((e) => e.type)).toEqual(['set', 'push', 'fizzle']);
    expect(events.at(-1)).toMatchObject({ missing: 'snap' });
  });

  it('lets go of the set pose if the phone is lowered', () => {
    const detector = createShotDetector(config);
    const events = play(detector, [...SET, [config.unsetTilt - 5, 0, 0]]);
    expect(events.map((e) => e.type)).toEqual(['set', 'unset']);
    expect(detector.stage).toBe('ready');
  });

  it('ignores movement right after a shot, then allows the next one', () => {
    const detector = createShotDetector(config);
    const shoot = [...SET, [60, 12, 0], [40, 8, -600]];
    play(detector, shoot);
    expect(detector.stage).toBe('cooldown');
    const soon = play(detector, [[60, 12, -600, 3]], 1000);
    expect(soon).toEqual([]);
    const later = 1000 + config.cooldownMs + 100;
    expect(play(detector, shoot, later).map((e) => e.type)).toEqual(['set', 'push', 'shot']);
  });

  it('starts over on reset', () => {
    const detector = createShotDetector(config);
    play(detector, SET);
    detector.reset();
    expect(detector.stage).toBe('ready');
  });
});

describe('normalizePush', () => {
  it('maps the weakest push to 0 and the strongest to 1', () => {
    expect(normalizePush(config.weakest, config)).toBe(0);
    expect(normalizePush(config.strongest, config)).toBe(1);
  });
});
