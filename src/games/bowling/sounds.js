/**
 * Bowling's sound effects, made with the shared synthesizer
 * (src/games/shared/synth.js explains how tones and noise bursts work).
 */
import { createSynth, NOTE } from '../shared/synth.js';

/**
 * @param {{ volume: number }} options  0 to 1
 */
export function createSounds({ volume }) {
  const synth = createSynth({ volume });
  const { tone, noise } = synth;
  /** When the last pin clatter played, so a big crash doesn't become hundreds of sounds at once. */
  let lastClatterAt = -Infinity;

  return {
    get enabled() {
      return synth.enabled;
    },
    unlock: synth.unlock,
    onChange: synth.onChange,
    close: synth.close,

    /** Stepping along the foul line or turning the aim: a tiny tick. */
    step() {
      tone({ freq: 2200, type: 'sine', duration: 0.02, gain: 0.08 });
    },

    /** Picking up the ball: a soft click. */
    grab() {
      tone({ freq: 1400, type: 'triangle', duration: 0.03, gain: 0.15 });
    },

    /** The ball landing on the lane: a heavy, low thud. */
    release() {
      tone({ freq: 95, endFreq: 55, type: 'sine', duration: 0.25, gain: 0.7 });
      noise({ duration: 0.12, gain: 0.4, cutoff: 350 });
    },

    /**
     * One short slice of the ball's rumble down the lane. Called again and
     * again while it rolls; the slices overlap into one steady rumble.
     *
     * @param {number} speed  m/s: faster balls rumble a little higher and louder
     * @param {boolean} gutter  in the gutter, it rattles in a metal channel instead
     */
    roll(speed, gutter) {
      const level = Math.min(1, speed / 9);
      if (gutter) {
        noise({
          duration: 0.22,
          gain: 0.25 * level,
          cutoff: 700,
          filter: 'bandpass',
          resonance: 3,
        });
      } else {
        noise({ duration: 0.22, gain: 0.55 * level, cutoff: 120 + 80 * level });
      }
    },

    /**
     * Pins clattering: a hollow, woody knock (a sharply ringing filter on a
     * burst of static), louder for harder hits.
     *
     * @param {number} speed  how hard they hit, m/s
     * @param {number} now    ms, to space knocks out
     */
    clatter(speed, now) {
      if (now - lastClatterAt < 25) return;
      lastClatterAt = now;
      const gain = Math.min(0.7, 0.12 + speed * 0.09);
      const pitch = 1600 + Math.random() * 1400;
      noise({ duration: 0.09, gain, cutoff: pitch, filter: 'bandpass', resonance: 7 });
      tone({ freq: pitch / 3, type: 'triangle', duration: 0.05, gain: gain * 0.4 });
    },

    /** The ball smashing into the rack: a big crash on top of the knocks. */
    crash(speed) {
      const gain = Math.min(0.8, speed * 0.08);
      noise({ duration: 0.5, gain, cutoff: 2200, filter: 'bandpass', resonance: 1.5 });
      noise({ duration: 0.25, gain: gain * 0.8, cutoff: 500 });
    },

    /** The ball dropping into the gutter: a clunk. */
    gutter() {
      tone({ freq: 180, endFreq: 120, type: 'triangle', duration: 0.12, gain: 0.4 });
      noise({ duration: 0.08, gain: 0.3, cutoff: 1200, filter: 'bandpass', resonance: 4 });
    },

    /** Strike! A bright fanfare, longer for a run of them. */
    strike(streak) {
      const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6];
      const count = Math.min(notes.length, 3 + streak);
      notes
        .slice(0, count)
        .forEach((freq, i) =>
          tone({ freq, type: 'square', duration: 0.18, gain: 0.22, delay: 0.15 + i * 0.08 }),
        );
      tone({
        freq: notes[count - 1],
        type: 'triangle',
        duration: 0.6,
        gain: 0.4,
        delay: 0.15 + count * 0.08,
      });
    },

    /** Spare: a cheerful two-note chime. */
    spare() {
      tone({ freq: NOTE.G5, type: 'triangle', duration: 0.15, gain: 0.45, delay: 0.1 });
      tone({ freq: NOTE.C6, type: 'triangle', duration: 0.4, gain: 0.45, delay: 0.22 });
    },

    /** Gutter ball or a miss: a sad little slide down. */
    aww() {
      tone({ freq: 392, endFreq: 260, type: 'sawtooth', duration: 0.5, gain: 0.15, delay: 0.1 });
    },

    // ---- For the big-screen clips (clips.js) ----

    /** A rocket taking off, or a ball barrelling past: a rising rush. */
    whoosh() {
      tone({ freq: 140, endFreq: 900, type: 'sawtooth', duration: 0.6, gain: 0.08 });
      noise({ duration: 0.6, gain: 0.3, cutoff: 1800, filter: 'bandpass', resonance: 0.8 });
    },

    /** A firework bursting. */
    pop() {
      noise({ duration: 0.35, gain: 0.5, cutoff: 900 });
      tone({ freq: 1200, endFreq: 300, type: 'square', duration: 0.12, gain: 0.12 });
    },

    /** A broom swish. */
    sweep() {
      noise({ duration: 0.25, gain: 0.25, cutoff: 3000, filter: 'highpass' });
    },

    /** Two hands slapping together. */
    clap() {
      noise({ duration: 0.08, gain: 0.6, cutoff: 1500, filter: 'bandpass', resonance: 1.5 });
    },

    /** Gobble gobble: a quick warble. */
    gobble() {
      for (let i = 0; i < 7; i++) {
        tone({
          freq: i % 2 ? 360 : 520,
          endFreq: i % 2 ? 300 : 440,
          type: 'square',
          duration: 0.06,
          gain: 0.14,
          delay: i * 0.065,
        });
      }
    },

    /** End of the game. */
    finish() {
      [NOTE.G5, NOTE.E5, NOTE.C5].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.25, gain: 0.35, delay: i * 0.14 }),
      );
    },

    /** New personal best: a rising arpeggio. */
    newBest() {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) =>
        tone({ freq, type: 'triangle', duration: 0.3, gain: 0.45, delay: 0.7 + i * 0.1 }),
      );
    },
  };
}
