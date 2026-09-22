/**
 * Hoops' sound effects, made with the shared synthesizer
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

    /** The ball leaving your hands: a soft whoosh. */
    shoot() {
      noise({ duration: 0.18, gain: 0.3, cutoff: 900, filter: 'bandpass' });
    },

    /** Hitting the rim: a metallic clank (two clashing high notes and a tick). */
    rim() {
      tone({ freq: 880, type: 'square', duration: 0.12, gain: 0.18 });
      tone({ freq: 1330, type: 'square', duration: 0.09, gain: 0.12 });
      noise({ duration: 0.04, gain: 0.25, cutoff: 5000, filter: 'highpass' });
    },

    /** Hitting the backboard: a hollow thud. */
    board() {
      tone({ freq: 190, endFreq: 120, type: 'triangle', duration: 0.12, gain: 0.5 });
      noise({ duration: 0.06, gain: 0.3, cutoff: 900 });
    },

    /** Nothing but net: a soft, airy "swish". */
    swish() {
      noise({ duration: 0.3, gain: 0.35, cutoff: 4500, filter: 'highpass' });
    },

    /**
     * A basket: a bright two-note chime, higher when you're on fire.
     *
     * @param {boolean} onFire
     */
    make(onFire) {
      const [low, high] = onFire ? [NOTE.E6, NOTE.C7] : [NOTE.C6, NOTE.G6];
      tone({ freq: low, type: 'triangle', duration: 0.1, gain: 0.45, delay: 0.05 });
      tone({ freq: high, type: 'triangle', duration: 0.22, gain: 0.45, delay: 0.12 });
    },

    /** Countdown: 3, 2, 1… */
    tick() {
      tone({ freq: NOTE.C5, type: 'square', duration: 0.12, gain: 0.25 });
    },

    /** …Go! */
    go() {
      tone({ freq: NOTE.C6, type: 'square', duration: 0.3, gain: 0.25 });
    },

    /** The end-of-round buzzer. */
    buzzer() {
      tone({ freq: 220, type: 'sawtooth', duration: 0.8, gain: 0.3 });
      tone({ freq: 227, type: 'sawtooth', duration: 0.8, gain: 0.3 });
    },

    /** New personal best: a rising arpeggio. */
    newBest() {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.3, gain: 0.45, delay: 0.9 + i * 0.1 }),
      );
    },
  };
}
