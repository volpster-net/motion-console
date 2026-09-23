import { describe, expect, it } from 'vitest';
import { contactFrom, flyToEnd, pitchPosition, pitchTravelMs, project } from './field.js';
import { CONFIG } from './index.js';

const { perfectMs, windowMs } = CONFIG.timing;

describe('pitches', () => {
  it('fly from the pitcher to the plate', () => {
    expect(pitchPosition(0, CONFIG)).toMatchObject({
      z: CONFIG.pitch.distance,
      y: CONFIG.pitch.releaseHeight,
    });
    expect(pitchPosition(1, CONFIG).z).toBeCloseTo(0);
    expect(pitchPosition(1, CONFIG).y).toBeCloseTo(CONFIG.pitch.plateHeight);
  });

  it('get quicker through the round', () => {
    const first = pitchTravelMs(0, 10, 0.5, CONFIG);
    const last = pitchTravelMs(9, 10, 0.5, CONFIG);
    expect(first).toBe(CONFIG.pitch.travelMs.slowest);
    expect(last).toBe(CONFIG.pitch.travelMs.fastest);
  });
});

describe('contactFrom', () => {
  it('misses when the swing is too early or too late', () => {
    expect(contactFrom(-(windowMs + 1), 0.5, CONFIG).kind).toBe('miss');
    expect(contactFrom(windowMs + 1, 0.5, CONFIG).kind).toBe('miss');
  });

  it('hits dead on straight to centre field, at full quality', () => {
    const contact = contactFrom(perfectMs / 2, 0.5, CONFIG);
    expect(contact).toMatchObject({ kind: 'hit', quality: 1, foul: false });
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

  it('sends a perfectly timed swing over the fence', () => {
    const result = fly(0);
    expect(result.homer).toBe(true);
    expect(result.distance).toBeGreaterThan(CONFIG.field.fenceDistance);
  });

  it('keeps a slightly mistimed swing in the park', () => {
    const result = fly(-110);
    expect(result.homer).toBe(false);
    expect(result.distance).toBeLessThan(CONFIG.field.fenceDistance);
  });

  it('never counts a foul ball as a home run', () => {
    expect(fly(windowMs - 5, 1).homer).toBe(false);
  });

  it('flies further the better the timing', () => {
    expect(fly(0).distance).toBeGreaterThan(fly(80).distance);
    expect(fly(80).distance).toBeGreaterThan(fly(120).distance);
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
