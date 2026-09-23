/**
 * Home Run Derby's sound effects, made with the shared synthesizer
 * (src/games/shared/synth.js explains how tones and noise bursts work).
 */
import { createSynth, NOTE } from '../shared/synth.js';

/**
 * @param {{ volume: number }} options  0 to 1
 */
export function createSounds({ volume }) {
  const synth = createSynth({ volume });
  const { tone, noise } = synth;

  return {
    get enabled() {
      return synth.enabled;
    },
    unlock: synth.unlock,
    onChange: synth.onChange,
    close: synth.close,

    /** The pitch leaving the pitcher's hand: a quick whoosh. */
    pitch() {
      noise({ duration: 0.25, gain: 0.2, cutoff: 1400, filter: 'bandpass' });
    },

    /**
     * Bat on ball: a sharp crack, fuller the better you hit it.
     *
     * @param {number} quality  0 (barely) to 1 (dead on)
     */
    crack(quality) {
      noise({
        duration: 0.05 + quality * 0.04,
        gain: 0.5 + quality * 0.3,
        cutoff: 2500,
        filter: 'highpass',
      });
      tone({ freq: 1400 + quality * 600, endFreq: 700, type: 'square', duration: 0.07, gain: 0.2 });
    },

    /** Swinging through nothing. */
    whiff() {
      noise({ duration: 0.22, gain: 0.3, cutoff: 800, filter: 'bandpass' });
    },

    /** The ball popping into the catcher's mitt. */
    mitt() {
      noise({ duration: 0.07, gain: 0.5, cutoff: 700 });
      tone({ freq: 160, endFreq: 90, type: 'sine', duration: 0.08, gain: 0.4 });
    },

    /** Off the outfield wall: a dull thud. */
    wall() {
      tone({ freq: 120, endFreq: 70, type: 'triangle', duration: 0.15, gain: 0.5 });
    },

    /** A home run: the crowd roars and a little fanfare plays. */
    homer() {
      noise({ duration: 1.8, gain: 0.35, cutoff: 1100, filter: 'bandpass' });
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.22, gain: 0.4, delay: 0.1 + i * 0.12 }),
      );
    },

    tick() {
      tone({ freq: NOTE.C5, type: 'square', duration: 0.12, gain: 0.25 });
    },

    go() {
      tone({ freq: NOTE.C6, type: 'square', duration: 0.3, gain: 0.25 });
    },

    roundEnd() {
      [NOTE.G5, NOTE.E5, NOTE.C5].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.25, gain: 0.45, delay: i * 0.14 }),
      );
    },

    newBest() {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.3, gain: 0.45, delay: 0.6 + i * 0.1 }),
      );
    },
  };
}
