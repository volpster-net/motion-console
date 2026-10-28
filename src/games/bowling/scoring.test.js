import { describe, expect, it } from 'vitest';
import { nextRoll, scorecard, totalScore } from './scoring.js';

const repeat = (pins, times) => Array(times).fill(pins);

describe('totalScore', () => {
  it('scores a perfect game as 300', () => {
    expect(totalScore(repeat(10, 12))).toBe(300);
  });

  it('scores all gutter balls as 0', () => {
    expect(totalScore(repeat(0, 20))).toBe(0);
  });

  it('scores all 5-spares with a 5 bonus as 150', () => {
    expect(totalScore(repeat(5, 21))).toBe(150);
  });

  it('scores open frames as pins knocked down', () => {
    expect(totalScore(repeat(4, 20))).toBe(80);
  });

  it('adds the next two balls to a strike', () => {
    expect(totalScore([10, 3, 4, ...repeat(0, 16)])).toBe(24);
  });

  it('adds the next ball to a spare', () => {
    expect(totalScore([7, 3, 4, 2, ...repeat(0, 16)])).toBe(20);
  });
});

describe('scorecard', () => {
  it('leaves a strike unscored until its two bonus balls are known', () => {
    const card = scorecard([10, 3]);
    expect(card[0].total).toBeNull();
    expect(card[1].total).toBeNull();
    expect(scorecard([10, 3, 4])[0].total).toBe(17);
    expect(scorecard([10, 3, 4])[1].total).toBe(24);
  });

  it('marks strikes, spares, and misses', () => {
    const card = scorecard([10, 7, 3, 0, 5]);
    expect(card[0].marks).toEqual(['', 'X']);
    expect(card[1].marks).toEqual(['7', '/']);
    expect(card[2].marks).toEqual(['-', '5']);
  });

  it('marks a 10th frame of strike, strike, spare-free nine', () => {
    const card = scorecard([...repeat(0, 18), 10, 10, 9]);
    expect(card[9].marks).toEqual(['X', 'X', '9']);
    expect(card[9].total).toBe(29);
  });

  it('marks a 10th frame strike then a spare', () => {
    expect(scorecard([...repeat(0, 18), 10, 6, 4])[9].marks).toEqual(['X', '6', '/']);
  });

  it('always has 10 frames', () => {
    expect(scorecard([])).toHaveLength(10);
  });
});

describe('nextRoll', () => {
  it('starts on frame 1, ball 1, with a full rack', () => {
    expect(nextRoll([])).toEqual({ frame: 0, ball: 0, freshRack: true });
  });

  it('gives a second ball at the pins left standing', () => {
    expect(nextRoll([6])).toEqual({ frame: 0, ball: 1, freshRack: false });
  });

  it('moves to the next frame after a strike', () => {
    expect(nextRoll([10])).toEqual({ frame: 1, ball: 0, freshRack: true });
  });

  it('gives a third ball in the 10th after a spare, with a fresh rack', () => {
    expect(nextRoll([...repeat(0, 18), 4, 6])).toEqual({ frame: 9, ball: 2, freshRack: true });
  });

  it('gives a third ball in the 10th after a strike and a split leave', () => {
    expect(nextRoll([...repeat(0, 18), 10, 3])).toEqual({ frame: 9, ball: 2, freshRack: false });
  });

  it('ends after two balls in an open 10th', () => {
    expect(nextRoll([...repeat(0, 18), 4, 3])).toBeNull();
  });

  it('ends after 12 strikes', () => {
    expect(nextRoll(repeat(10, 12))).toBeNull();
    expect(nextRoll(repeat(10, 11))).toEqual({ frame: 9, ball: 2, freshRack: true });
  });
});
