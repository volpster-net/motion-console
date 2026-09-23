/**
 * Home Run Derby's sound effects, made with the shared synthesizer
 * (src/games/shared/synth.js explains how tones and noise bursts work),
 * plus recordings: the crack of the bat (audio/bat-crack.mp3), and the music,
 * ballpark organ (audio/organ.mp3) and the "Charge!" call (audio/charge.mp3),
 * and the crowd clapping and chattering while you bat (audio/crowd.mp3).
 *
 * When there's music: the organ on the title and results screens, "Charge!"
 * as a round starts, and no music while you bat (just the crowd), so you can
 * hear the pitch and the crack of the bat.
 */
import { createSynth, NOTE } from '../shared/synth.js';
import batCrackUrl from './audio/bat-crack.mp3';
import chargeUrl from './audio/charge.mp3';
import crowdUrl from './audio/crowd.mp3';
import organUrl from './audio/organ.mp3';

/**
 * @param {{ volume: number }} options  0 to 1
 */
export function createSounds({ volume }) {
  const synth = createSynth({ volume });
  const { tone, noise } = synth;
  /** The recorded crack of the bat, once it has loaded. */
  let batCrack = null;
  synth.load(batCrackUrl).then((sound) => (batCrack = sound));
  /** The music, once loaded. */
  const tracks = { organ: null, charge: null };
  synth.load(organUrl).then((sound) => (tracks.organ = sound));
  synth.load(chargeUrl).then((sound) => (tracks.charge = sound));
  /** How loud each track plays (the "Charge!" recording is much louder than the organ). */
  const TRACK_GAIN = { organ: 0.7, charge: 0.45 };
  /** The music playing now, and which track it is. */
  let music = null;
  let musicName = '';

  /** The crowd's noise while you bat: the recording, once loaded, and the loop playing it. */
  let crowdSound = null;
  synth.load(crowdUrl).then((sound) => (crowdSound = sound));
  let crowdLoop = null;
  /** How loud the crowd plays under everything else. */
  const CROWD_GAIN = 1;
  /** Whether the crowd should be heard now (it may still be loading). */
  let wantCrowd = false;

  return {
    get enabled() {
      return synth.enabled;
    },
    unlock: synth.unlock,
    onChange: synth.onChange,
    close: synth.close,

    /**
     * Plays a music track once (stopping any other). Asking for the track
     * that's already playing leaves it playing. If the track hasn't loaded
     * yet, it waits for it (briefly).
     *
     * @param {'organ' | 'charge'} name
     */
    music(name) {
      if (music?.playing && musicName === name) return;
      music?.stop(0.4);
      musicName = name;
      const start = () => {
        if (musicName !== name) return; // something else was asked for meanwhile
        music = synth.play(tracks[name], { gain: TRACK_GAIN[name] });
      };
      if (tracks[name]) start();
      else
        synth.load(name === 'organ' ? organUrl : chargeUrl).then((sound) => {
          tracks[name] = sound;
          start();
        });
    },

    /** True while a music track is playing. */
    get musicPlaying() {
      return Boolean(music?.playing);
    },

    /** Fades out any music. */
    stopMusic() {
      music?.stop(0.6);
      music = null;
      musicName = '';
    },

    /**
     * The crowd while you bat: a real ballpark crowd clapping and chattering,
     * looped for as long as you're batting.
     */
    crowd() {
      if (crowdLoop?.playing || !synth.enabled) return;
      const start = () => {
        if (!crowdLoop) crowdLoop = synth.loop(crowdSound, { gain: CROWD_GAIN, fadeIn: 1.5 });
      };
      crowdLoop = null;
      if (crowdSound) start();
      else
        synth.load(crowdUrl).then((sound) => {
          crowdSound = sound;
          if (wantCrowd) start();
        });
      wantCrowd = true;
    },

    /** The crowd quietens down. */
    stopCrowd() {
      wantCrowd = false;
      crowdLoop?.stop(1);
      crowdLoop = null;
    },

    /** The pitch leaving the pitcher's hand: a quick whoosh. */
    pitch() {
      noise({ duration: 0.25, gain: 0.2, cutoff: 1400, filter: 'bandpass' });
    },

    /**
     * Bat on ball: the crack of a wooden bat. Plays the recording; the
     * synthesized crack below is matched to recordings of real wood bats. A real crack is over in a flash (about a hundredth of a
     * second), has almost no bass, and is a bright click centred around
     * 1,500 Hz, followed by the bat ringing briefly at about 1,700 Hz.
     * (Checked by measuring recordings of real bats against this one.)
     * Dead on (quality 1) is loud and rings clean; a poor hit is quieter,
     * duller and barely rings.
     *
     * @param {number} quality  0 (barely) to 1 (dead on)
     */
    crack(quality) {
      const q = Math.min(1, Math.max(0, quality));
      if (batCrack) {
        // The recording: full and bright for a dead-on hit; quieter and a touch
        // lower and duller for a poor one. A tiny random change in speed means
        // no two hits sound exactly alike.
        const rate = 0.9 + q * 0.1 + (Math.random() - 0.5) * 0.04;
        synth.play(batCrack, { gain: 0.45 + q * 0.55, rate });
        return;
      }
      // Until the recording has loaded, a synthesized crack stands in.
      // The click: very short bursts of static, spread from about 600 to
      // 5,000 Hz like a real crack, loudest around 1,000 to 2,000 Hz.
      noise({
        duration: 0.02,
        gain: 3.0 + q * 0.9,
        cutoff: 1650,
        filter: 'bandpass',
        resonance: 1.4,
      });
      noise({
        duration: 0.02,
        gain: 4.2 + q * 1.3,
        cutoff: 950,
        filter: 'bandpass',
        resonance: 1.6,
      });
      noise({
        duration: 0.012,
        gain: 0.6 + q * 0.4,
        cutoff: 3000,
        filter: 'bandpass',
        resonance: 2.5,
      });
      // The bat ringing: a brief tuned ring at about 1,700 Hz, and a fainter one
      // higher up; a clean hit rings a little longer and clearer.
      noise({
        duration: 0.025 + q * 0.03,
        gain: 0.05 + q * 0.09,
        cutoff: 1720,
        filter: 'bandpass',
        resonance: 14,
      });
      tone({ freq: 1720, type: 'sine', duration: 0.025 + q * 0.03, gain: 0.008 + q * 0.02 });
      tone({ freq: 2500, type: 'sine', duration: 0.02 + q * 0.02, gain: 0.004 + q * 0.01 });
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
