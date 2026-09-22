import { describe, expect, it } from 'vitest';
import { createClientId, generateRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from './ids.js';

describe('room codes', () => {
  it('generates codes without ambiguous letters', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(code).toMatch(/^[A-HJ-NP-Z]+$/);
    }
  });

  it('normalizes typed input', () => {
    expect(normalizeRoomCode('abcd')).toBe('ABCD');
    expect(normalizeRoomCode(' ab-cd\n')).toBe('ABCD');
  });

  it('rejects invalid codes', () => {
    expect(normalizeRoomCode('ABC')).toBeNull();
    expect(normalizeRoomCode('ABCDE')).toBeNull();
    expect(normalizeRoomCode('ABCO')).toBeNull(); // O is never generated
    expect(normalizeRoomCode('')).toBeNull();
  });
});

describe('client ids', () => {
  it('are prefixed and unique', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createClientId('p')));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^p_[a-z0-9]{8}$/);
  });
});
