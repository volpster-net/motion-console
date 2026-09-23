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
 * It can also play recorded sounds (`load` a file, then `play` it).
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

  /**
   * A handle on a playing sound (its sources, and the gain its loudness goes
   * through), to fade it out and stop it.
   *
   * @returns {Playing}
   */
  function playing(sources, level, endsAt) {
    let stopped = false;
    return {
      get playing() {
        return !stopped && context.currentTime < endsAt;
      },
      stop(fade = 0.3) {
        if (stopped) return;
        stopped = true;
        const now = context.currentTime;
        level.gain.cancelScheduledValues(now);
        level.gain.setValueAtTime(Math.max(0.0001, level.gain.value), now);
        level.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        for (const source of sources) {
          try {
            source.stop(now + fade + 0.02);
          } catch {
            // Already stopped.
          }
        }
      },
    };
  }

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
     *   resonance?: number,        how sharply the filter rings at its pitch: 1 is
     *                              gentle, 5 or more gives a woody, knocking ring
     *   delay?: number,
     * }} options
     */
    noise({ duration, gain = 0.5, cutoff, filter = 'lowpass', resonance = 1, delay = 0 }) {
      if (!ready()) return;
      const start = context.currentTime + delay;
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      const shaper = context.createBiquadFilter();
      shaper.type = filter;
      shaper.frequency.value = cutoff;
      shaper.Q.value = resonance;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(gain, start);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(shaper).connect(envelope).connect(master);
      // Start somewhere random in the static, so bursts played together don't
      // cancel each other out, and no two sound quite the same.
      source.start(start, Math.random() * Math.max(0, 1 - duration - 0.05));
      source.stop(start + duration + 0.02);
    },

    /**
     * Loads a recorded sound (an audio file's URL), ready to `play`.
     * Resolves to null if it can't be loaded, so callers can fall back.
     *
     * @param {string} url
     * @returns {Promise<AudioBuffer | null>}
     */
    async load(url) {
      try {
        const response = await fetch(url);
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch {
        return null;
      }
    },

    /**
     * Plays a recorded sound once.
     *
     * @param {AudioBuffer} sound  from `load`
     * @param {{
     *   gain?: number,   loudness, 0 to 1 (or more to boost)
     *   rate?: number,   playback speed: below 1 is slower and lower, above 1 quicker and higher
     *   delay?: number,  seconds from now
     * }} [options]
     * @returns {Playing | null}  null if nothing played
     */
    play(sound, { gain = 1, rate = 1, delay = 0 } = {}) {
      if (!ready() || !sound) return null;
      const start = context.currentTime + delay;
      const source = context.createBufferSource();
      source.buffer = sound;
      source.playbackRate.value = rate;
      const level = context.createGain();
      level.gain.value = gain;
      source.connect(level).connect(master);
      source.start(start);
      return playing([source], level, start + sound.duration / rate);
    },

    /**
     * A continuous bed of filtered static, like the murmur of a crowd or wind,
     * fading in. Its loudness can swell and ebb: each `swell` is a slow wave
     * (`rate` times a second) that raises and lowers it by up to `depth`
     * (0 to 1). Plays until stopped.
     *
     * @param {{
     *   cutoff: number,
     *   filter?: BiquadFilterType,
     *   resonance?: number,
     *   gain?: number,
     *   swells?: Array<{ rate: number, depth: number }>,
     *   fadeIn?: number,  seconds
     * }} options
     * @returns {Playing | null}
     */
    bed({ cutoff, filter = 'bandpass', resonance = 1, gain = 0.2, swells = [], fadeIn = 1 }) {
      if (!ready()) return null;
      const now = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      const shaper = context.createBiquadFilter();
      shaper.type = filter;
      shaper.frequency.value = cutoff;
      shaper.Q.value = resonance;
      // The swells wobble a gain in the middle; the outer gain fades in and out.
      const wobble = context.createGain();
      const depthTotal = swells.reduce((sum, swell) => sum + swell.depth, 0);
      wobble.gain.value = 1 - depthTotal / 2;
      const waves = swells.map(({ rate, depth }) => {
        const wave = context.createOscillator();
        wave.frequency.value = rate;
        const amount = context.createGain();
        amount.gain.value = depth / 2;
        wave.connect(amount).connect(wobble.gain);
        wave.start(now);
        return wave;
      });
      const level = context.createGain();
      level.gain.setValueAtTime(0.0001, now);
      level.gain.exponentialRampToValueAtTime(gain, now + fadeIn);
      source.connect(shaper).connect(wobble).connect(level).connect(master);
      source.start(now, Math.random() * 0.9);
      return playing([source, ...waves], level, Infinity);
    },

    /** Releases the audio hardware. Nothing plays after this. */
    close() {
      context.close().catch(() => {});
    },
  };
}

/**
 * @typedef {{ stop: (fade?: number) => void, readonly playing: boolean }} Playing
 *   a sound that's playing: `stop` fades it out over `fade` seconds
 */

/** Stand-in for browsers without Web Audio: every sound is silent. */
function silentSynth() {
  const nothing = () => {};
  return {
    enabled: false,
    unlock: () => Promise.resolve(),
    onChange: nothing,
    tone: nothing,
    noise: nothing,
    load: () => Promise.resolve(null),
    play: () => null,
    bed: () => null,
    close: nothing,
  };
}
