/**
 * Target Practice's sound effects, made with the shared synthesizer
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

    /** The trigger: a short crack. */
    shoot() {
      noise({ duration: 0.06, gain: 0.35, cutoff: 3500 });
    },

    /**
     * A bright two-note chime. Closer to the centre = higher pitch.
     *
     * @param {number} ringIndex  0 = bullseye, 1 = middle, 2 = outer
     */
    hit(ringIndex) {
      const notes = [
        [NOTE.G6, NOTE.C6],
        [NOTE.E6, NOTE.G5],
        [NOTE.C6, NOTE.E5],
      ][Math.min(ringIndex, 2)];
      tone({ freq: notes[1], type: 'triangle', duration: 0.09, gain: 0.5 });
      tone({ freq: notes[0], type: 'triangle', duration: 0.18, gain: 0.5, delay: 0.06 });
    },

    /** Gold: a quick run up a sparkly scale, like a coin. */
    gold() {
      [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.16, gain: 0.45, delay: i * 0.05 }),
      );
    },

    /** Bomb: a deep boom (a long, low rumble of static plus a falling tone). */
    bomb() {
      noise({ duration: 0.6, gain: 0.8, cutoff: 500 });
      tone({ freq: 140, endFreq: 35, type: 'sine', duration: 0.5, gain: 0.8 });
    },

    /** A low, dull thud that drops in pitch. */
    miss() {
      tone({ freq: NOTE.E4, endFreq: 90, type: 'sine', duration: 0.14, gain: 0.5 });
      noise({ duration: 0.08, gain: 0.2, cutoff: 600 });
    },

    /** Countdown: 3, 2, 1… */
    tick() {
      tone({ freq: NOTE.C5, type: 'square', duration: 0.12, gain: 0.25 });
    },

    /** …Go! */
    go() {
      tone({ freq: NOTE.C6, type: 'square', duration: 0.3, gain: 0.25 });
    },

    /** Round over: three falling notes. */
    roundEnd() {
      [NOTE.G5, NOTE.E5, NOTE.C5].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.25, gain: 0.45, delay: i * 0.14 }),
      );
    },

    /** New personal best: a rising arpeggio. */
    newBest() {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.3, gain: 0.45, delay: 0.5 + i * 0.1 }),
      );
    },
  };
}
