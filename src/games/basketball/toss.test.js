import { describe, expect, it } from 'vitest';
import { CONFIG } from './index.js';
import { createSwingMemory, normalizeSwing } from './toss.js';

describe('createSwingMemory', () => {
  it('reports the fastest swing just before the release', () => {
    const memory = createSwingMemory({ windowMs: 250 });
    [0, 120, 380, 610, 450, 200].forEach((speed, i) => memory.add(i * 16, speed));
    expect(memory.peak()).toBe(610);
  });

  it('ignores swings from well before the release', () => {
    const memory = createSwingMemory({ windowMs: 250 });
    memory.add(0, 900); // an old swing…
    for (let t = 16; t <= 600; t += 16) memory.add(t, 50); // …then holding still
    expect(memory.peak()).toBe(50);
  });

  it('counts tipping down as no swing at all', () => {
    const memory = createSwingMemory({ windowMs: 250 });
    [-300, -500, -100].forEach((speed, i) => memory.add(i * 16, speed));
    expect(memory.peak()).toBe(0);
  });

  it('is empty after clear, and before anything happens', () => {
    const memory = createSwingMemory({ windowMs: 250 });
    expect(memory.peak()).toBe(0);
    memory.add(0, 500);
    memory.clear();
    expect(memory.peak()).toBe(0);
  });
});

describe('normalizeSwing', () => {
  it('maps the weakest swing to 0 and the strongest to 1', () => {
    expect(normalizeSwing(CONFIG.toss.weakest, CONFIG.toss)).toBe(0);
    expect(normalizeSwing(CONFIG.toss.strongest, CONFIG.toss)).toBe(1);
  });
});
