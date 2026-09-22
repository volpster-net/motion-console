/**
 * Sound effects, made on the fly with the Web Audio API. No audio files.
 *
 * Every sound is built from two ingredients:
 * - a *tone*: an oscillator (a pure electronic note) whose pitch can slide,
 *   shaped by a volume envelope that snaps up and then fades out, so it
 *   sounds like a "blip" rather than a flat beep;
 * - a *noise burst*: a split second of random static, filtered to sound like
 *   a "pff" or a "crack".
 *
 * Browsers only let a page make sound after someone clicks or presses a key
 * *on that page*. Phone buttons don't count, because they happen on a
 * different device. So sound starts switched off, and `unlock()` must be
 * called from a click or key press on the console.
 */

/** Musical notes used below, in hertz (vibrations per second). */
const NOTE = { C5: 523, E5: 659, G5: 784, C6: 1047, E6: 1319, G6: 1568, A3: 220, E4: 330 };

/**
 * @param {{ volume: number }} options  0 to 1
 */
export function createSounds({ volume }) {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return silentSounds();

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
  function tone({ freq, endFreq, type = 'sine', duration, gain = 0.6, delay = 0 }) {
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
  }

  /**
   * Plays a short burst of filtered static.
   *
   * @param {{ duration: number, gain?: number, cutoff: number, delay?: number }} options
   *   cutoff: the filter lets through only sounds lower than this pitch (Hz);
   *   low = a dull "pff", high = a sharp "tss".
   */
  function noise({ duration, gain = 0.5, cutoff, delay = 0 }) {
    if (!ready()) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
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
      [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C6 * 2].forEach((freq, i) =>
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

    /** Releases the audio hardware. Nothing plays after this. */
    close() {
      context.close().catch(() => {});
    },
  };
}

/** Stand-in for browsers without Web Audio: every sound is silent. */
function silentSounds() {
  const nothing = () => {};
  return {
    enabled: false,
    unlock: () => Promise.resolve(),
    onChange: nothing,
    shoot: nothing,
    hit: nothing,
    gold: nothing,
    bomb: nothing,
    miss: nothing,
    tick: nothing,
    go: nothing,
    roundEnd: nothing,
    newBest: nothing,
    close: nothing,
  };
}
