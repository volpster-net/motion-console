import { describe, expect, it } from 'vitest';
import { CLIPS, pickClip } from './clips.js';
import { readFileSync } from 'node:fs';

/** A stand-in 2D context that accepts every drawing call, and fails on bad numbers. */
function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'createLinearGradient') return () => gradient;
        return (...args) => {
          for (const arg of args) {
            if (typeof arg === 'number' && !Number.isFinite(arg)) {
              throw new Error(`${String(key)} got ${arg}`);
            }
          }
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
}

describe('celebration clips', () => {
  it('has a choice of strikes and spares, and a turkey', () => {
    const count = (kind) => CLIPS.filter((clip) => clip.kind === kind).length;
    expect(count('strike')).toBeGreaterThan(1);
    expect(count('spare')).toBeGreaterThan(1);
    expect(count('turkey')).toBeGreaterThan(0);
  });

  it('draws every frame of every clip', () => {
    for (const clip of CLIPS) {
      const ctx = fakeContext();
      for (let ms = 0; ms <= clip.ms; ms += 1000 / 60) {
        expect(() => clip.draw(/** @type {any} */ (ctx), ms / 1000), clip.id).not.toThrow();
      }
    }
  });

  it('only cues sounds that exist, while the clip is playing', () => {
    // The sounds need a browser to make, so look for them in sounds.js itself.
    const source = readFileSync(new URL('./sounds.js', import.meta.url), 'utf8');
    for (const clip of CLIPS) {
      for (const cue of clip.cues) {
        expect(source, `${clip.id}: ${cue.sound}`).toContain(`\n    ${cue.sound}() {`);
        expect(cue.at * 1000).toBeLessThan(clip.ms);
      }
    }
  });

  it("doesn't show the same clip twice in a row", () => {
    let last = null;
    for (let i = 0; i < 20; i++) {
      const clip = pickClip('strike', last, () => (i * 0.37) % 1);
      expect(clip.kind).toBe('strike');
      expect(clip.id).not.toBe(last);
      last = clip.id;
    }
    expect(pickClip('turkey', 'turkey-trot').kind).toBe('turkey');
  });
});
