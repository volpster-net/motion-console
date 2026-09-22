/**
 * A tiny sound synthesizer for games, built on the Web Audio API. No audio
 * files: every sound is made on the fly from two ingredients.
 *
 * - A *tone*: an oscillator (a pure electronic note) whose pitch can slide,
 *   shaped by a volume envelope that snaps up and then fades out, so it
 *   sounds like a "blip" rather than a flat beep.
 * - A *noise burst*: a split second of random static, run through a filter
 *   to sound like a "pff", a "tss", or a "whoosh".
 *
 * Browsers only let a page make sound after someone clicks or presses a key
 * *on that page*. Phone buttons don't count, because they happen on a
 * different device. So sound starts switched off, and `unlock()` must be
 * called from a click or key press on the console.
 */

/** Musical notes, in hertz (vibrations per second). */
export const NOTE = {
  C5: 523,
  E5: 659,
  G5: 784,
  C6: 1047,
  E6: 1319,
  G6: 1568,
  C7: 2093,
  E4: 330,
};

/**
 * @param {{ volume: number }} options  0 to 1
 */
export function createSynth({ volume }) {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return silentSynth();

  const context = new AudioContextClass();
  // Everything plays through one volume knob.
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);

  /** One second of random static, reused by every noise burst. */
  const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  const ready = () => context.state === 'running';

  return {
    /** True once the browser allows sound. */
    get enabled() {
      return ready();
    },

    /** Call from a click or key press on the console page. */
    unlock() {
      return context.resume().catch(() => {});
    },

    /** @param {() => void} fn  Called when sound is switched on or off. */
    onChange(fn) {
      context.addEventListener('statechange', fn);
    },

    /**
     * Plays one note.
     *
     * @param {{
     *   freq: number,            starting pitch in Hz
     *   endFreq?: number,        pitch to slide to by the end
     *   type?: OscillatorType,   'sine' is soft, 'square' is buzzy, 'triangle' in between
     *   duration: number,        seconds
     *   gain?: number,           loudness, 0 to 1
     *   delay?: number,          seconds from now
     * }} options
     */
    tone({ freq, endFreq, type = 'sine', duration, gain = 0.6, delay = 0 }) {
      if (!ready()) return;
      const start = context.currentTime + delay;
      const end = start + duration;
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, start);
      if (endFreq) oscillator.frequency.exponentialRampToValueAtTime(endFreq, end);

      // The envelope: silent → full volume in 5 ms (a crisp start) → fade to silent.
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(envelope).connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    },

    /**
     * Plays a burst of filtered static.
     *
     * @param {{
     *   duration: number,
     *   gain?: number,
     *   cutoff: number,           the filter's pitch in Hz
     *   filter?: BiquadFilterType, 'lowpass' keeps sounds below the cutoff (dull),
     *                              'highpass' keeps sounds above it (hissy)
     *   delay?: number,
     * }} options
     */
    noise({ duration, gain = 0.5, cutoff, filter = 'lowpass', delay = 0 }) {
      if (!ready()) return;
      const start = context.currentTime + delay;
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      const shaper = context.createBiquadFilter();
      shaper.type = filter;
      shaper.frequency.value = cutoff;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(gain, start);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(shaper).connect(envelope).connect(master);
      source.start(start);
      source.stop(start + duration + 0.02);
    },

    /** Releases the audio hardware. Nothing plays after this. */
    close() {
      context.close().catch(() => {});
    },
  };
}

/** Stand-in for browsers without Web Audio: every sound is silent. */
function silentSynth() {
  const nothing = () => {};
  return {
    enabled: false,
    unlock: () => Promise.resolve(),
    onChange: nothing,
    tone: nothing,
    noise: nothing,
    close: nothing,
  };
}
