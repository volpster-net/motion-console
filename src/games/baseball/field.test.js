import { describe, expect, it } from 'vitest';
import {
  choosePitch,
  contactFrom,
  fenceAt,
  flyToEnd,
  pitchPosition,
  project,
  toFeet,
} from './field.js';
import { CONFIG } from './index.js';
import { pitcherPose, RELEASE_AT } from './pitcher.js';

const { perfectMs, windowMs } = CONFIG.timing;

/** A predictable stand-in for Math.random: cycles through the given values. */
function sequence(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('the fence', () => {
  it('is 330 ft down the lines and 400 ft to centre', () => {
    expect(toFeet(fenceAt(0, CONFIG))).toBeCloseTo(400);
    expect(toFeet(fenceAt(45, CONFIG))).toBeCloseTo(330);
    expect(toFeet(fenceAt(-45, CONFIG))).toBeCloseTo(330);
    const alley = toFeet(fenceAt(22, CONFIG));
    expect(alley).toBeGreaterThan(330);
    expect(alley).toBeLessThan(400);
  });
});

describe('pitches', () => {
  const curve = choosePitch({ index: 5, count: 10, random: sequence(0.5), config: CONFIG });
  const path = { ...curve.path, bend: CONFIG.pitchTypes.curveball.bend, breakPower: 2.5 };

  it('fly from the pitcher’s hand to the target over the plate', () => {
    expect(pitchPosition(0, path)).toEqual(CONFIG.pitch.release);
    const end = pitchPosition(1, path);
    expect(end.x).toBeCloseTo(path.target.x);
    expect(end.y).toBeCloseTo(path.target.y);
    expect(end.z).toBeCloseTo(0);
  });

  it('break late: a curveball looks high halfway, then drops onto the target', () => {
    const straight = { ...path, bend: { x: 0, y: 0 } };
    expect(pitchPosition(0.5, path).y).toBeGreaterThan(pitchPosition(0.5, straight).y);
  });

  it('carry on past the plate into the catcher’s mitt', () => {
    expect(pitchPosition(1.1, path).z).toBeLessThan(0);
  });

  it('start with fastballs, then mix it up, getting quicker', () => {
    for (let index = 0; index < CONFIG.pitch.mixFrom; index++) {
      expect(choosePitch({ index, count: 10, random: sequence(0.99), config: CONFIG }).type).toBe(
        'fastball',
      );
    }
    const kinds = new Set(
      Array.from(
        { length: 50 },
        (_, i) =>
          choosePitch({
            index: CONFIG.pitch.mixFrom + (i % 5),
            count: 10,
            random: sequence(i / 50),
            config: CONFIG,
          }).type,
      ),
    );
    expect(kinds.size).toBeGreaterThan(3);
    const early = choosePitch({ index: 0, count: 10, random: sequence(0.5), config: CONFIG });
    const late = choosePitch({ index: 9, count: 10, random: sequence(0), config: CONFIG });
    expect(late.type).toBe('fastball');
    expect(late.travelMs).toBeLessThan(early.travelMs);
  });

  it('make slow pitches take longer than fastballs', () => {
    const at = (type) => CONFIG.pitchTypes[type].speed;
    expect(at('changeup')).toBeGreaterThan(at('fastball'));
    expect(at('curveball')).toBeGreaterThan(at('fastball'));
  });
});

describe('the pitcher', () => {
  it('lets go of the ball exactly where the pitch starts', () => {
    const pose = pitcherPose(RELEASE_AT);
    const [x, y, z] = pose.rHand;
    expect(x).toBeCloseTo(CONFIG.pitch.release.x);
    expect(y).toBeCloseTo(CONFIG.pitch.release.y);
    expect(z).toBeCloseTo(CONFIG.pitch.release.z);
  });
});

describe('contactFrom', () => {
  it('misses when the swing is too early or too late', () => {
    expect(contactFrom(-(windowMs + 1), 0.5, CONFIG).kind).toBe('miss');
    expect(contactFrom(windowMs + 1, 0.5, CONFIG).kind).toBe('miss');
  });

  it('hits dead on straight to centre field, at full quality', () => {
    expect(contactFrom(perfectMs / 2, 0.5, CONFIG)).toMatchObject({
      kind: 'hit',
      quality: 1,
      foul: false,
    });
  });

  it('pulls early swings to left field and pushes late ones to right field', () => {
    expect(contactFrom(-100, 0.5, CONFIG).sprayDeg).toBeLessThan(0);
    expect(contactFrom(100, 0.5, CONFIG).sprayDeg).toBeGreaterThan(0);
  });

  it('goes foul when very early or late', () => {
    expect(contactFrom(-(windowMs - 5), 0.5, CONFIG).foul).toBe(true);
    expect(contactFrom(windowMs - 5, 0.5, CONFIG).foul).toBe(true);
  });

  it('hits a little further with a faster swing', () => {
    expect(contactFrom(0, 1, CONFIG).speed).toBeGreaterThan(contactFrom(0, 0, CONFIG).speed);
  });
});

describe('flight', () => {
  const fly = (error, power = 0.5) => flyToEnd(contactFrom(error, power, CONFIG), CONFIG);

  it('sends a perfectly timed swing over the 400 ft centre-field fence', () => {
    const result = fly(0);
    expect(result.homer).toBe(true);
    expect(toFeet(result.distance)).toBeGreaterThan(400);
  });

  it('keeps a mistimed swing in the park', () => {
    const result = fly(-130);
    expect(result.homer).toBe(false);
  });

  it('lands a home run up in the stands, not on the ground behind the fence', () => {
    const result = fly(0);
    expect(result.inStands).toBe(true);
    expect(result.landedAt.y).toBeGreaterThan(CONFIG.field.fence.heightFt / 3.28084 - 0.01);
  });

  it('never counts a foul ball as a home run', () => {
    expect(fly(windowMs - 5, 1).homer).toBe(false);
  });

  it('flies further the better the timing', () => {
    expect(fly(0).distance).toBeGreaterThan(fly(100).distance);
    expect(fly(100).distance).toBeGreaterThan(fly(150).distance);
  });
});

describe('project', () => {
  it('puts things at eye height on the horizon, and shrinks them with distance', () => {
    const size = { width: 1600, height: 900 };
    const { height, horizon } = CONFIG.field.camera;
    const near = project({ x: 0, y: height, z: 1 }, size, CONFIG);
    const far = project({ x: 0, y: height, z: 90 }, size, CONFIG);
    expect(near.y).toBeCloseTo(horizon * size.height);
    expect(far.scale).toBeLessThan(near.scale);
  });
});

describe('pitch location', () => {
  const middle = { x: 0, y: (CONFIG.pitch.zone.bottom + CONFIG.pitch.zone.top) / 2 };

  it('lands every pitch inside the strike zone', () => {
    const { left, right, bottom, top } = CONFIG.pitch.zone;
    for (let i = 0; i < 50; i++) {
      const { path } = choosePitch({
        index: i % 10,
        count: 10,
        random: Math.random,
        config: CONFIG,
      });
      expect(path.target.x).toBeGreaterThanOrEqual(left);
      expect(path.target.x).toBeLessThanOrEqual(right);
      expect(path.target.y).toBeGreaterThanOrEqual(bottom);
      expect(path.target.y).toBeLessThanOrEqual(top);
    }
  });

  it('pulls inside pitches and lifts high ones, a little', () => {
    const at = (location) => contactFrom(0, 0.5, CONFIG, location);
    expect(at({ ...middle, x: -0.2 }).sprayDeg).toBeLessThan(at(middle).sprayDeg);
    expect(at({ ...middle, x: 0.2 }).sprayDeg).toBeGreaterThan(at(middle).sprayDeg);
    expect(at({ ...middle, y: middle.y + 0.25 }).launchDeg).toBeGreaterThan(at(middle).launchDeg);
  });
});

describe('difficulty', () => {
  const fly = (error) => flyToEnd(contactFrom(error, 0.5, CONFIG), CONFIG);

  it('gives a home run for timing within about 90 ms, either way', () => {
    for (const error of [-85, -40, 0, 40, 85]) expect(fly(error).homer).toBe(true);
  });

  it('keeps the ball fair out to about 180 ms, then fouls it off', () => {
    expect(contactFrom(-170, 0.5, CONFIG).foul).toBe(false);
    expect(contactFrom(-190, 0.5, CONFIG).foul).toBe(true);
  });
});
