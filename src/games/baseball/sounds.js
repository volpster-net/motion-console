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
     * Bat on ball: the crack of a wooden bat, built in layers like the real
     * thing. A split-second snap of the ball hitting, the wood ringing with a
     * short knock, a thump you feel in your chest, then the sound echoing
     * back off the stands. Dead on (quality 1) is loud, sharp and high; a
     * poor hit off the end or handle is a duller, buzzing "thunk".
     *
     * @param {number} quality  0 (barely) to 1 (dead on)
     */
    crack(quality) {
      const q = Math.min(1, Math.max(0, quality));
      // The snap: a very short, bright burst.
      noise({ duration: 0.012 + q * 0.008, gain: 0.5 + q * 0.4, cutoff: 3000, filter: 'highpass' });
      // The wood ringing: static tuned to ring like a knock on wood, higher and
      // cleaner for a good hit.
      noise({
        duration: 0.07 + q * 0.05,
        gain: 0.55 + q * 0.3,
        cutoff: 900 + q * 1100,
        filter: 'bandpass',
        resonance: 4 + q * 6,
      });
      tone({
        freq: 520 + q * 380,
        endFreq: 380 + q * 200,
        type: 'triangle',
        duration: 0.07,
        gain: 0.25 + q * 0.15,
      });
      // The thump.
      tone({ freq: 150, endFreq: 70, type: 'sine', duration: 0.12, gain: 0.35 + q * 0.25 });
      // A poor hit buzzes (the bat vibrating in your hands).
      if (q < 0.5) {
        tone({ freq: 180, endFreq: 140, type: 'sawtooth', duration: 0.14, gain: (0.5 - q) * 0.25 });
      }
      // The echo off the stands, a moment later, softer and duller each time.
      [0.11, 0.23].forEach((delay, i) =>
        noise({
          duration: 0.09,
          gain: (0.18 + q * 0.12) / (i + 1),
          cutoff: 1400 - i * 400,
          filter: 'bandpass',
          resonance: 3,
          delay,
        }),
      );
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
