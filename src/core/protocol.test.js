import { describe, expect, it } from 'vitest';
import { createEnvelope, parseEnvelope, parseVibration, PROTOCOL_VERSION } from './protocol.js';

describe('protocol envelopes', () => {
  const base = { ch: 'input', type: 'motion', from: 'p_abc', seq: 7, data: { alpha: 1 } };

  it('round-trips a broadcast envelope', () => {
    const envelope = createEnvelope(base);
    expect(envelope).toEqual({
      v: PROTOCOL_VERSION,
      ch: 'input',
      type: 'motion',
      from: 'p_abc',
      seq: 7,
      d: { alpha: 1 },
    });
    expect(parseEnvelope(envelope)).toEqual({
      ch: 'input',
      type: 'motion',
      from: 'p_abc',
      to: null,
      seq: 7,
      d: { alpha: 1 },
    });
  });

  it('only includes `to` for unicasts', () => {
    expect(createEnvelope(base)).not.toHaveProperty('to');
    expect(parseEnvelope(createEnvelope({ ...base, to: 'console_x' }))?.to).toBe('console_x');
  });

  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['a wrong version', { ...createEnvelope(base), v: 99 }],
    ['a missing type', { ...createEnvelope(base), type: undefined }],
    ['a non-integer seq', { ...createEnvelope(base), seq: 1.5 }],
    ['an array payload', { ...createEnvelope(base), d: [] }],
    ['a numeric recipient', { ...createEnvelope(base), to: 42 }],
  ])('rejects %s', (_, raw) => {
    expect(parseEnvelope(raw)).toBeNull();
  });
});

describe('parseVibration', () => {
  it('accepts a duration or a pattern', () => {
    expect(parseVibration(30)).toBe(30);
    expect(parseVibration([60, 40, 90])).toEqual([60, 40, 90]);
  });

  it.each([
    ['a string', 'buzz'],
    ['a negative duration', -5],
    ['an empty pattern', []],
    ['too long in total', [800, 100, 800]],
    ['too many steps', Array(11).fill(10)],
  ])('rejects %s', (_, pattern) => {
    expect(parseVibration(pattern)).toBeNull();
  });
});
