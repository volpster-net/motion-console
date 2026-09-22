import { describe, expect, it } from 'vitest';
import { CONFIG } from './index.js';
import {
  chooseKind,
  createRound,
  findSpawnPosition,
  multiplierFor,
  ramp,
  ringAt,
} from './round.js';

const BOUNDS = { aspect: 16 / 9, topReserved: 0.1 };
/** The game's settings with gold and bombs switched off, for tests about normal targets. */
const PLAIN = {
  ...CONFIG,
  specials: {
    gold: { ...CONFIG.specials.gold, chance: 0 },
    bomb: { ...CONFIG.specials.bomb, chance: 0 },
  },
};

/** A predictable stand-in for Math.random: cycles through the given values. */
function sequence(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** A round with one target already up, at a known spot. */
function roundWithTarget() {
  const round = createRound({ config: PLAIN, startedAt: 0, random: sequence(0.5) });
  round.update(0, BOUNDS);
  const [target] = round.targets;
  return { round, target };
}

describe('ramp', () => {
  it('slides from start to end over the round', () => {
    expect(ramp({ start: 10, end: 20 }, 0)).toBe(10);
    expect(ramp({ start: 10, end: 20 }, 0.5)).toBe(15);
    expect(ramp({ start: 10, end: 20 }, 1)).toBe(20);
    expect(ramp({ start: 10, end: 20 }, 3)).toBe(20);
  });
});

describe('ringAt', () => {
  it('finds the ring from the centre outwards', () => {
    expect(ringAt(0, 1, CONFIG.rings)?.name).toBe('bullseye');
    expect(ringAt(0.5, 1, CONFIG.rings)?.name).toBe('middle');
    expect(ringAt(0.9, 1, CONFIG.rings)?.name).toBe('outer');
    expect(ringAt(1.01, 1, CONFIG.rings)).toBeNull();
  });
});

describe('multiplierFor', () => {
  it('doubles at 5 in a row and triples at 10', () => {
    expect(multiplierFor(4, CONFIG.streak)).toBe(1);
    expect(multiplierFor(5, CONFIG.streak)).toBe(2);
    expect(multiplierFor(9, CONFIG.streak)).toBe(2);
    expect(multiplierFor(10, CONFIG.streak)).toBe(3);
    expect(multiplierFor(25, CONFIG.streak)).toBe(3);
  });
});

describe('findSpawnPosition', () => {
  const place = (random, existing = []) =>
    findSpawnPosition({ radius: 0.1, bounds: BOUNDS, existing, config: CONFIG, random });

  it('keeps the whole target on screen and below the top bar', () => {
    const { edgeMargin } = CONFIG.targets;
    const topLeft = place(sequence(0));
    expect(topLeft.x).toBeCloseTo(-BOUNDS.aspect / 2 + edgeMargin + 0.1);
    expect(topLeft.y).toBeCloseTo(-0.5 + BOUNDS.topReserved + edgeMargin + 0.1);
    const bottomRight = place(sequence(1));
    expect(bottomRight.x).toBeCloseTo(BOUNDS.aspect / 2 - edgeMargin - 0.1);
    expect(bottomRight.y).toBeCloseTo(0.5 - edgeMargin - 0.1);
  });

  it("doesn't overlap existing targets", () => {
    const existing = [{ id: 1, x: 0, y: 0.05, radius: 0.1, bornAt: 0, expiresAt: 1 }];
    // The first try lands on the existing target; the second is clear.
    const spot = place(sequence(0.5, 0.5, 0, 0), existing);
    expect(spot.x).toBeLessThan(0);
  });

  it('gives up on a crowded screen', () => {
    const existing = [{ id: 1, x: 0, y: 0.05, radius: 0.1, bornAt: 0, expiresAt: 1 }];
    expect(place(sequence(0.5), existing)).toBeNull();
  });
});

describe('createRound', () => {
  it('puts a target up straight away and adds more over time, up to the maximum', () => {
    const round = createRound({ config: PLAIN, startedAt: 0 });
    round.update(0, BOUNDS);
    expect(round.targets).toHaveLength(1);
    round.update(CONFIG.targets.spawnEveryMs.start - 1, BOUNDS);
    expect(round.targets).toHaveLength(1);
    round.update(CONFIG.targets.spawnEveryMs.start, BOUNDS);
    expect(round.targets).toHaveLength(2);
    for (let t = 1000; t < 1100; t += 1) round.update(t + 2000, BOUNDS);
    expect(round.targets.length).toBeLessThanOrEqual(CONFIG.targets.maxOnScreen);
  });

  it('makes targets smaller and shorter-lived as the round goes on', () => {
    const round = createRound({ config: PLAIN, startedAt: 0 });
    round.update(0, BOUNDS);
    const early = round.targets[0];
    const late = CONFIG.round.durationMs - 1;
    round.update(late, BOUNDS); // the early target has expired; a new one appears
    const lateTarget = round.targets.at(-1);
    expect(lateTarget.radius).toBeLessThan(early.radius);
    expect(lateTarget.expiresAt - lateTarget.bornAt).toBeLessThan(early.expiresAt - early.bornAt);
  });

  it('removes targets when their time is up', () => {
    const { round, target } = roundWithTarget();
    const { expired } = round.update(target.expiresAt, BOUNDS);
    expect(expired).toEqual([target]);
    expect(round.targets).not.toContain(target);
  });

  it('scores by ring', () => {
    const { round, target } = roundWithTarget();
    const shot = round.shoot({ x: target.x, y: target.y });
    expect(shot).toMatchObject({ outcome: 'hit', points: 50, multiplier: 1 });
    expect(round.score).toBe(50);
    expect(round.targets).toHaveLength(0);
  });

  it('builds a streak multiplier and resets it on a miss', () => {
    const round = createRound({ config: PLAIN, startedAt: 0 });
    const hitNext = (t) => {
      round.update(t, BOUNDS);
      const target = round.targets[0];
      return round.shoot({ x: target.x + target.radius * 0.9, y: target.y }); // outer ring: 10
    };
    const points = [];
    for (let i = 0; i < 10; i++) points.push(hitNext(i).points);
    // Hits 1–4 score 10, hits 5–9 are doubled, the 10th is tripled.
    expect(points).toEqual([10, 10, 10, 10, 20, 20, 20, 20, 20, 30]);
    expect(round.multiplier).toBe(3);

    expect(round.shoot({ x: 5, y: 5 })).toEqual({ outcome: 'miss' });
    expect(round.streak).toBe(0);
    expect(round.multiplier).toBe(1);
    expect(round.results()).toMatchObject({ hits: 10, shots: 11, bestStreak: 10 });
    expect(round.results().accuracy).toBeCloseTo(10 / 11);
  });

  it("doesn't break the streak when a target expires (by default)", () => {
    const { round, target } = roundWithTarget();
    round.shoot({ x: target.x, y: target.y });
    round.update(1, BOUNDS);
    round.update(round.targets[0].expiresAt, BOUNDS);
    expect(round.streak).toBe(1);
  });

  it('ends after the round duration and stops adding targets', () => {
    const round = createRound({ config: PLAIN, startedAt: 1000 });
    const end = 1000 + CONFIG.round.durationMs;
    expect(round.isOver(end - 1)).toBe(false);
    expect(round.isOver(end)).toBe(true);
    expect(round.timeLeftMs(end + 500)).toBe(0);
    round.update(end, BOUNDS);
    expect(round.targets).toHaveLength(0);
  });

  it('reports 0% accuracy when no shots were fired', () => {
    const round = createRound({ config: PLAIN, startedAt: 0 });
    expect(round.results().accuracy).toBe(0);
  });
});

describe('chooseKind', () => {
  const { gold, bomb } = CONFIG.specials;
  const later = bomb.notBeforeMs;

  it('splits one random roll into gold, bomb, or normal', () => {
    expect(chooseKind(0, later, CONFIG)).toBe('gold');
    expect(chooseKind(gold.chance - 0.001, later, CONFIG)).toBe('gold');
    expect(chooseKind(gold.chance, later, CONFIG)).toBe('bomb');
    expect(chooseKind(gold.chance + bomb.chance - 0.001, later, CONFIG)).toBe('bomb');
    expect(chooseKind(gold.chance + bomb.chance, later, CONFIG)).toBe('normal');
  });

  it('holds bombs back at the start of the round', () => {
    expect(chooseKind(gold.chance, later - 1, CONFIG)).toBe('normal');
  });
});

describe('special targets', () => {
  const { gold, bomb } = CONFIG.specials;
  const GOLD_ROLL = 0;
  const BOMB_ROLL = gold.chance;
  const NORMAL_ROLL = 0.99;

  /**
   * A stand-in for Math.random for a round. Each new target asks for three
   * numbers: its kind roll, then x, then y. Targets get the kind rolls in
   * order (the last one repeats) and are placed at left, right, then middle,
   * so they never overlap.
   */
  function scripted(...kindRolls) {
    const xs = [0.1, 0.9, 0.5];
    let call = 0;
    let spawn = 0;
    return () => {
      const step = call++ % 3;
      if (step === 0) return kindRolls[Math.min(spawn, kindRolls.length - 1)];
      if (step === 1) return xs[spawn % xs.length];
      spawn += 1;
      return 0.5;
    };
  }
  const roundAt = (startedAt, ...kindRolls) =>
    createRound({ config: CONFIG, startedAt, random: scripted(...kindRolls) });

  it('makes gold smaller, shorter-lived, and worth more', () => {
    const round = roundAt(0, GOLD_ROLL);
    round.update(0, BOUNDS);
    const [target] = round.targets;
    expect(target.kind).toBe('gold');
    expect(target.radius).toBeCloseTo(CONFIG.targets.radius.start * gold.sizeScale);
    expect(target.expiresAt).toBeCloseTo(CONFIG.targets.lifetimeMs.start * gold.lifetimeScale);
    const shot = round.shoot({ x: target.x, y: target.y });
    expect(shot).toMatchObject({ outcome: 'hit', points: 50 * gold.pointsMultiplier });
    expect(round.results().goldHits).toBe(1);
  });

  it('never makes a bomb the only target on screen', () => {
    const round = roundAt(-bomb.notBeforeMs, BOMB_ROLL);
    round.update(0, BOUNDS);
    expect(round.targets.map((t) => t.kind)).toEqual(['normal']);
  });

  it('costs points and the streak when you shoot a bomb, but never goes below zero', () => {
    const round = roundAt(-bomb.notBeforeMs, NORMAL_ROLL, NORMAL_ROLL, BOMB_ROLL);
    round.update(0, BOUNDS);
    const [first] = round.targets;
    round.shoot({ x: first.x, y: first.y }); // bullseye: +50, streak 1
    round.update(0, BOUNDS); // the screen was empty, so a normal target appears
    round.update(CONFIG.targets.spawnEveryMs.start, BOUNDS); // then a bomb
    const bombTarget = round.targets.find((t) => t.kind === 'bomb');
    expect(bombTarget).toBeDefined();

    const shot = round.shoot({ x: bombTarget.x, y: bombTarget.y });
    // The penalty is 100, but only 50 points were left to lose.
    expect(shot).toEqual({ outcome: 'bomb', target: bombTarget, points: -50 });
    expect(round.score).toBe(0);
    expect(round.streak).toBe(0);
    expect(round.results()).toMatchObject({ bombsHit: 1, hits: 1, shots: 2 });
  });

  it("doesn't count a bomb expiring as a missed target", () => {
    const config = { ...CONFIG, targets: { ...CONFIG.targets, expiredBreaksStreak: true } };
    const round = createRound({
      config,
      startedAt: -bomb.notBeforeMs,
      random: scripted(NORMAL_ROLL, NORMAL_ROLL, BOMB_ROLL),
    });
    round.update(0, BOUNDS);
    const [first] = round.targets;
    round.shoot({ x: first.x, y: first.y });
    round.update(0, BOUNDS);
    round.update(CONFIG.targets.spawnEveryMs.start, BOUNDS);
    const bombTarget = round.targets.find((t) => t.kind === 'bomb');
    const second = round.targets.find((t) => t.kind !== 'bomb');
    round.shoot({ x: second.x, y: second.y });
    round.update(bombTarget.expiresAt, BOUNDS); // only the bomb was left, and it expires
    expect(round.streak).toBe(2);
  });
});

describe('pausing a round', () => {
  it('moves the end of the round and every target later by the paused time', () => {
    const round = createRound({ config: PLAIN, startedAt: 0 });
    round.update(0, BOUNDS);
    const before = { ...round.targets[0] };
    const pausedFor = 10_000;
    round.shift(pausedFor);

    const [after] = round.targets;
    expect(after.bornAt).toBe(before.bornAt + pausedFor);
    expect(after.expiresAt).toBe(before.expiresAt + pausedFor);
    expect(round.timeLeftMs(pausedFor)).toBe(CONFIG.round.durationMs);
    // The target is still up just before its shifted expiry.
    round.update(after.expiresAt - 1, BOUNDS);
    expect(round.targets).toContainEqual(after);
  });
});
