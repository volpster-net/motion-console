/**
 * Home Run Derby, the Wii Sports way: grip your phone like a bat and swing
 * when the pitch reaches the plate. Timing is everything. Ten pitches; hit as
 * many home runs as you can.
 *
 * Files in this folder:
 *   index.js   this file: settings, screens, pitches, and the game loop
 *   field.js   the ballpark and the ball: pitches, hits, flight (tested)
 *   swing.js   spotting a swing and when it really happened (tested)
 *   pitcher.js the pitcher's delivery, the Wii Sports way (tested)
 *   batter.js  your batter's swing, the Wii Sports way (tested)
 *   body.js    what the batter and pitcher share: size, maths, key poses
 *   players.js both players as 3D cartoon ballplayers (three.js)
 *   render.js  drawing the ballpark, the people, and the ball
 *   sounds.js  sound effects, made with the shared synthesizer
 */
import './baseball.css';
import { loadAimSettings } from '../../aim/index.js';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { createPersonalBest } from '../shared/personal-best.js';
import { choosePitch, contactFrom, launch, stepFlight, toFeet } from './field.js';
import meta from './meta.js';
import { RELEASE_AT } from './pitcher.js';
import { createRenderer } from './render.js';
import { createSounds } from './sounds.js';
import {
  createClockMatch,
  createSwingDetector,
  createTimingCalibration,
  createVerticalSpin,
  normalizeSwing,
} from './swing.js';

/**
 * Every number that shapes how the game feels, in one place. The physics
 * works in metres (the fence is set in feet, and the game shows feet); times
 * are in milliseconds.
 */
export const CONFIG = {
  round: {
    pitches: 10,
    countdownStepMs: 800,
    countdownFrom: 3,
    /** Ignore the trigger this long after the results appear. */
    resultsLockMs: 1200,
    /** The pitcher's delivery, from the set position to letting go of the ball… */
    windupMs: 1500,
    /** …and from the release to his fielding stance. */
    followMs: 500,
    /** How long a miss (or a pitch you didn't swing at) stays on screen. */
    afterMissMs: 1200,
    /** How long a hit's result stays up after the ball comes down. */
    afterHitMs: 1400,
  },

  pitch: {
    /** Where the ball leaves the pitcher's hand (pitcher.js poses him to match). */
    release: { x: -0.28, y: 1.27, z: 17.65 },
    /**
     * The strike zone (m): as wide as the plate (17 in), from the knees to
     * the chest. Pitches cross anywhere within `use` of it (1 = right to the edges).
     */
    zone: { left: -0.22, right: 0.22, bottom: 0.5, top: 1.1, use: 0.85 },
    /** A fastball's time from hand to plate: slow at first, quicker by the last pitch. */
    travelMs: { slowest: 880, fastest: 640 },
    /** The first few pitches are all fastballs, to find your timing; then the mix starts. */
    mixFrom: 3,
  },

  /**
   * The pitcher's repertoire. `weight` is how often he throws it; `speed`
   * multiplies the fastball's travel time (bigger = slower); `mph` is shown on
   * the radar; `bend` is how far off target it first seems to head (m, x = our
   * right, y = up) before breaking back in; `breakPower` is how late it breaks.
   */
  pitchTypes: {
    fastball: {
      name: 'Fastball',
      weight: 4,
      speed: 1,
      mph: [92, 97],
      bend: { x: 0, y: -0.05 },
      breakPower: 2,
    },
    sinker: {
      name: 'Sinker',
      weight: 2,
      speed: 1.04,
      mph: [89, 93],
      bend: { x: 0.25, y: 0.25 },
      breakPower: 2.5,
    },
    slider: {
      name: 'Slider',
      weight: 2,
      speed: 1.1,
      mph: [83, 88],
      bend: { x: -0.45, y: 0.1 },
      breakPower: 3,
    },
    curveball: {
      name: 'Curveball',
      weight: 2,
      speed: 1.22,
      mph: [75, 81],
      bend: { x: -0.3, y: 0.7 },
      breakPower: 2.5,
    },
    changeup: {
      name: 'Changeup',
      weight: 2,
      speed: 1.2,
      mph: [81, 86],
      bend: { x: 0.25, y: 0.3 },
      breakPower: 2.5,
    },
  },

  /** Your batter (batter.js): where he stands, and how his swing is timed. */
  batter: {
    /** In the left-hand batter's box, beside the plate. */
    stands: { x: -0.8, y: 0, z: 0.1 },
    /** The swing, from where it starts on screen to the follow-through. */
    swingMs: 540,
    /**
     * The batter starts swinging the moment your swing begins, from the
     * launch (after the stance and stride, with the barrel dropped back
     * behind him), so the bat meets the ball about when yours does.
     */
    startAt: 0.38,
    /** Hold the follow-through, then settle back into the stance. */
    holdMs: 500,
    returnMs: 650,
    /**
     * His leg kick and stride as the pitch comes in, at the speed a real
     * hitter does it: it takes `ms`, and the stride lands `readyMs` before
     * the ball reaches the plate, so he's loaded and ready to swing.
     */
    load: { ms: 380, readyMs: 120 },
  },

  /**
   * Spotting a swing from how fast the phone spins round the vertical (°/s),
   * in the swing's direction (see swing.js).
   */
  swing: {
    /** Spinning faster than this starts a swing. Adjusting your grip stays well below it. */
    startRate: 450,
    /** The swing is over once it slows below this… */
    endRate: 200,
    /** …or drops below this fraction of its fastest (it has clearly peaked). */
    pastPeak: 0.6,
    /** A swing can't last longer than this. */
    maxMs: 400,
    /** After a swing, ignore the follow-through and getting set again. */
    restMs: 700,
    /** Only update which way is up while spinning slower than this (the phone is fairly still). */
    calmRate: 120,
    /** Switch to left-handed after a swing the other way at least this fast… */
    leftyFrom: 1400,
    /** …and this many times faster than any right-handed one. */
    switchHandsAt: 1.3,
    /** Swing speeds that count as the weakest (0) and strongest (1). */
    weakest: 450,
    strongest: 1500,
  },

  /** Judging when you swung, relative to the ball reaching the plate. */
  timing: {
    /** Within this of perfect, it's a perfect swing. */
    perfectMs: 60,
    /** More than this early or late, you miss the ball completely. */
    windowMs: 240,
    /** Shifts all timing: raise it if swings keep registering late, lower it if early. */
    biasMs: 0,
    /**
     * Learning each player's natural timing (swing.js): from their last
     * `samples` swings, shifting by at most `maxMs`; only swings within
     * `learnWithinMs` of the timing window count (not wild ones).
     */
    calibration: { samples: 5, maxMs: 250, learnWithinMs: 150 },
    /** The quickest a message could possibly reach the console (see swing.js). */
    quickestTripMs: 30,
    /** How long after the ball passes the plate we still wait for a swing's message. */
    lateGraceMs: 350,
  },

  /** What a hit does, from dead on (best) to barely touched (worst). */
  hit: {
    /** How fast the ball leaves the bat, m/s. */
    exitSpeed: { worst: 18, best: 53 },
    /** How steeply it leaves the bat, degrees. */
    launchDeg: { worst: 6, best: 30 },
    /** At the edge of the timing window, the ball goes this far left or right… */
    sprayAtEdgeDeg: 60,
    /** …and beyond this, it's foul. */
    foulBeyondDeg: 45,
    /** How much swing speed adds or takes away from the exit speed (0.15 = ±7.5%). */
    powerBonus: 0.15,
    /**
     * Where the pitch was nudges the hit: degrees of direction per metre
     * inside/outside, and of launch angle per metre high/low.
     */
    locationEffect: { sprayDegPerM: 35, launchDegPerM: 18 },
  },

  field: {
    gravity: 9.81,
    /** Air resistance. Bigger = hits come down sooner. */
    drag: 0.004,
    /** A real ballpark's shape: shortest down the lines, deepest in centre. */
    fence: { linesFt: 330, centreFt: 400, heightFt: 10 },
    /** The stands behind the fence: they start this far back, run this deep, and rise to this height (m). */
    stands: { startM: 2, depthM: 28, topM: 22 },
    /** Fans in the stands: rows of seats, and how many seats are filled. */
    crowd: { rows: 9, filled: 0.85 },
    /** The ball is drawn this many times its real size, so it's easy to see. */
    ballScale: 3,
    /**
     * Where we watch from: behind home plate, a little zoomed in. Close
     * enough that the pitch visibly grows as it comes at you (which is how
     * you judge when to swing), far enough to see the pitcher clearly.
     */
    camera: { height: 1.15, behind: 3.0, focal: 1.5, horizon: 0.34 },
  },

  vibration: {
    hit: [40, 20, 90],
    homer: [60, 40, 60, 40, 160],
    miss: 25,
  },

  effects: {
    batSwingMs: 260,
    textMs: 1600,
  },

  sound: {
    volume: 0.4,
  },
};

// The name and description live in meta.js, so the launcher can show them
// without loading the game.
export const { id, name, description } = meta;

/** The running game, if any. */
let session = null;

/**
 * @param {HTMLElement} container
 * @param {import('../game.js').GameController} controller
 */
export function start(container, controller) {
  stop();
  session = createSession(container, controller);
}

/** Stops the game and removes every trace of it: loops, listeners, sounds, and elements. */
export function stop() {
  session?.destroy();
  session = null;
}

/** Freezes the game until resume(). */
export function pause() {
  session?.pause();
}

/** Carries on from exactly where pause() stopped. */
export function resume() {
  session?.resume();
}

/** @type {import('../game.js').Game} */
export default { id, name, description, start, stop, pause, resume };

/**
 * @param {HTMLElement} container
 * @param {import('../game.js').GameController} controller
 */
function createSession(container, controller) {
  container.innerHTML = `
    <div class="hr card">
      <canvas class="hr-canvas"></canvas>
      <div class="hr-radar" hidden><small>Pitch</small><b data-radar="name"></b><span data-radar="mph"></span></div>
      <header class="hr-hud">
        <span class="hr-stat"><small>Home runs</small><b data-hud="homers">0</b></span>
        <span class="hr-stat hr-mid"><small>Pitch</small><b data-hud="pitch">–</b></span>
        <span class="hr-stat hr-end"><small>Longest</small><b data-hud="longest">–</b></span>
      </header>
      <div class="hr-screen"></div>
      <button type="button" class="hr-sound">Sound is off. Click here to turn it on.</button>
    </div>`;
  const root = /** @type {HTMLElement} */ (container.querySelector('.hr'));
  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('.hr-canvas'));
  const screen = /** @type {HTMLElement} */ (root.querySelector('.hr-screen'));
  const soundButton = /** @type {HTMLElement} */ (root.querySelector('.hr-sound'));
  const radar = {
    root: /** @type {HTMLElement} */ (root.querySelector('.hr-radar')),
    name: root.querySelector('[data-radar="name"]'),
    mph: root.querySelector('[data-radar="mph"]'),
  };
  const hud = {
    homers: root.querySelector('[data-hud="homers"]'),
    pitch: root.querySelector('[data-hud="pitch"]'),
    longest: root.querySelector('[data-hud="longest"]'),
  };

  const renderer = createRenderer(canvas, CONFIG);
  const sounds = createSounds(CONFIG.sound);
  const bestHomers = createPersonalBest(id);
  const bestLongest = createPersonalBest(`${id}.longestFt`);
  const cleanups = [];

  // ---- Layout -------------------------------------------------------------
  let size = { width: 0, height: 0 };
  const resizeObserver = new ResizeObserver(() => {
    size = { width: root.clientWidth, height: root.clientHeight };
    renderer.resize(size.width, size.height);
  });
  resizeObserver.observe(root);
  cleanups.push(() => resizeObserver.disconnect());

  // ---- Sound switch -------------------------------------------------------
  const unlockSound = () => sounds.unlock();
  const showSoundState = () => (soundButton.hidden = sounds.enabled);
  window.addEventListener('pointerdown', unlockSound);
  window.addEventListener('keydown', unlockSound);
  sounds.onChange(showSoundState);
  showSoundState();
  cleanups.push(() => {
    window.removeEventListener('pointerdown', unlockSound);
    window.removeEventListener('keydown', unlockSound);
    sounds.close();
  });

  // ---- Players ------------------------------------------------------------
  // Single-player: the lowest-numbered player bats.
  const activePlayer = () => controller.players.list().find((player) => player.slot !== null);

  // ---- The round ----------------------------------------------------------
  // The game moves through phases:
  //
  //   title ──trigger──▶ countdown ──3, 2, 1──▶ batting ──10 pitches──▶ results
  //                         ▲                                              │
  //                         └──────────────────trigger─────────────────────┘
  //
  // While batting, each pitch goes: windup → pitch (ball on its way) → result.
  /**
   * @typedef {{
   *   index: number,
   *   stage: 'windup' | 'pitch' | 'result',
   *   stageAt: number,
   *   type: string,
   *   name: string,
   *   mph: number,
   *   travelMs: number,
   *   path: import('./field.js').Pitch,
   *   releaseAt: number,
   *   plateAt: number,
   *   contact: import('./field.js').Contact | null,
   *   flight: import('./field.js').Flight | null,
   *   endedAt: number | null,
   * }} Pitch
   *
   * @type {{ name: 'title' }
   *   | { name: 'countdown', startedAt: number, shown: number }
   *   | { name: 'batting', pitch: Pitch }
   *   | { name: 'results', at: number }}
   */
  let phase = { name: 'title' };
  let stats = freshStats();
  let recordHomers = bestHomers.load();
  let recordLongest = bestLongest.load();

  function freshStats() {
    return { homers: 0, hits: 0, longest: 0, total: 0, done: 0, landings: [] };
  }

  function showTitle() {
    phase = { name: 'title' };
    root.dataset.phase = 'title';
    const player = activePlayer();
    screen.innerHTML = `
      <h1>${name}</h1>
      <p>${description}</p>
      <p class="hr-rules">
        Grip your phone like a bat, <b>both hands, over your shoulder</b>. When the pitch
        reaches the plate, <b>swing</b>. Timing is everything: early pulls the ball to left
        field, late sends it to right, and dead on sends it over the fence.
        <b>${CONFIG.round.pitches} pitches</b>: hit as many home runs as you can.
      </p>
      <p class="hr-cta">${
        player
          ? `<span class="hr-player" style="--player: ${playerColor(player.slot)}">${playerLabel(player.slot)}</span> Pull the trigger to start`
          : 'Scan the QR code with your phone to join'
      }</p>
      <p class="hr-hint">Keep a firm grip on your phone when you swing!</p>`;
  }

  function startCountdown(now) {
    phase = { name: 'countdown', startedAt: now, shown: -1 };
    root.dataset.phase = 'countdown';
    stats = freshStats();
    renderer.clearEffects();
  }

  /** Sets up pitch number `index` (0-based), starting with the windup. */
  function newPitch(index, now) {
    const chosen = choosePitch({
      index,
      count: CONFIG.round.pitches,
      random: Math.random,
      config: CONFIG,
    });
    radar.root.hidden = true;
    return {
      index,
      stage: /** @type {const} */ ('windup'),
      stageAt: now,
      ...chosen,
      releaseAt: 0,
      plateAt: 0,
      contact: null,
      flight: null,
      endedAt: null,
    };
  }

  function startBatting(now) {
    phase = { name: 'batting', pitch: newPitch(0, now) };
    root.dataset.phase = 'batting';
    screen.innerHTML = '';
    sounds.go();
  }

  function showResults(now) {
    const newHomerBest = stats.homers > recordHomers;
    const longestFt = Math.round(toFeet(stats.longest));
    const newLongestBest = longestFt > recordLongest;
    if (newHomerBest) bestHomers.save((recordHomers = stats.homers));
    if (newLongestBest) bestLongest.save((recordLongest = longestFt));
    phase = { name: 'results', at: now };
    root.dataset.phase = 'results';
    sounds.roundEnd();
    if (newHomerBest || newLongestBest) sounds.newBest();
    screen.innerHTML = `
      <p class="eyebrow">Derby over</p>
      <h1 class="hr-final">${stats.homers} <span>home run${stats.homers === 1 ? '' : 's'}</span></h1>
      ${newHomerBest ? '<p class="hr-best">New personal best!</p>' : ''}
      ${newLongestBest && !newHomerBest ? '<p class="hr-best">New longest home run!</p>' : ''}
      <dl class="hr-results">
        <div><dt>Hits</dt><dd>${stats.hits} / ${CONFIG.round.pitches}</dd></div>
        <div><dt>Longest</dt><dd>${stats.longest ? `${longestFt} ft` : '–'}</dd></div>
        <div><dt>Total distance</dt><dd>${Math.round(toFeet(stats.total))} ft</dd></div>
        <div><dt>Best (home runs)</dt><dd>${recordHomers}</dd></div>
        <div><dt>Best (longest)</dt><dd>${recordLongest ? `${recordLongest} ft` : '–'}</dd></div>
      </dl>
      <p class="hr-cta">Pull the trigger to play again</p>`;
  }

  // ---- Swinging -----------------------------------------------------------
  const detector = createSwingDetector(CONFIG.swing);
  const verticalSpin = createVerticalSpin({
    axisOrder: loadAimSettings().axisOrder,
    calmRate: CONFIG.swing.calmRate,
  });
  const clock = createClockMatch(CONFIG.timing);
  const calibration = createTimingCalibration({
    ...CONFIG.timing.calibration,
    storageKey: `motion-console.${id}.timing`,
  });
  let paused = false;
  let pausedAt = 0;

  /**
   * A swing, at `at` on the console's clock, with `power` from 0 to 1.
   * It only counts once per pitch, while the ball is on its way.
   */
  function swingAt(at, power, player) {
    const now = performance.now();
    if (phase.name !== 'batting') return;
    const { pitch } = phase;
    if (pitch.stage !== 'pitch' || pitch.contact) return;

    // Judge the swing against your own natural timing (see createTimingCalibration).
    const raw = at - pitch.plateAt - CONFIG.timing.biasMs;
    const error = raw - calibration.offset;
    if (Math.abs(raw) < CONFIG.timing.windowMs + CONFIG.timing.calibration.learnWithinMs) {
      calibration.learn(raw);
    }
    pitch.contact = contactFrom(error, power, CONFIG, pitch.path.target);
    if (pitch.contact.kind === 'miss') {
      sounds.whiff();
      return; // the ball carries on to the catcher; the result shows when it gets there
    }
    // Contact! The ball leaves the bat.
    pitch.flight = launch(pitch.contact, CONFIG);
    pitch.stage = 'result';
    pitch.stageAt = now;
    stats.hits += pitch.contact.foul ? 0 : 1;
    sounds.crack(pitch.contact.quality);
    renderer.impact(now, pitch.path.target, pitch.contact.quality);
    controller.vibrate(player.id, CONFIG.vibration.hit);
    if (Math.abs(pitch.contact.error) <= CONFIG.timing.perfectMs) {
      renderer.text('Perfect!', now, 'timing');
    }
  }

  /** Plays the batter's swing on screen, once per swing. */
  let lastAnimatedAt = -Infinity;
  function animateSwing() {
    const now = performance.now();
    if (now - lastAnimatedAt < CONFIG.swing.restMs) return;
    lastAnimatedAt = now;
    renderer.swingBat(now);
  }

  cleanups.push(
    controller.onInput(INPUT.MOTION, (sample, { player }) => {
      if (paused || player.id !== activePlayer()?.id) return;
      const reading = /** @type {any} */ (sample);
      clock.observe(reading.t, performance.now());
      const event = detector.update(verticalSpin.read(reading), reading.t);
      if (!event) return;
      if (event.type === 'start') {
        // The swing has begun: start the batter's swing now, so the bat comes
        // through with you rather than after you.
        animateSwing();
      } else {
        animateSwing(); // in case the start was missed
        swingAt(clock.toConsole(event.t), normalizeSwing(event.peak, CONFIG.swing), player);
      }
    }),
    controller.onInput(INPUT.BUTTON, ({ id: button, down }, { player }) => {
      if (paused || !down || button !== BUTTONS.FIRE || player.id !== activePlayer()?.id) return;
      const now = performance.now();
      if (phase.name === 'title') return startCountdown(now);
      if (phase.name === 'results' && now - phase.at >= CONFIG.round.resultsLockMs) {
        return startCountdown(now);
      }
      // No gyroscope? Then Fire swings, timed by when the press arrived.
      if (!clock.ready) {
        animateSwing();
        swingAt(now - CONFIG.timing.quickestTripMs, 0.5, player);
      }
    }),
    controller.players.onChange(() => {
      if (phase.name === 'title') showTitle();
    }),
  );

  // ---- The game loop ------------------------------------------------------
  // About 60 times a second: move the game forward to the current time (the
  // countdown, the pitcher, the pitch, a hit ball in flight), then redraw.
  // While paused, frames are skipped, so the picture freezes.
  let lastFrameAt = null;
  let frameRequest = requestAnimationFrame(function frame(now) {
    if (size.height > 0 && !paused) {
      advance(now);
      draw(now);
    }
    lastFrameAt = now;
    frameRequest = requestAnimationFrame(frame);
  });
  cleanups.push(() => cancelAnimationFrame(frameRequest));

  function advance(now) {
    if (phase.name === 'countdown') {
      const { countdownStepMs, countdownFrom } = CONFIG.round;
      const count = countdownFrom - Math.floor((now - phase.startedAt) / countdownStepMs);
      if (count <= 0) return startBatting(now);
      if (count !== phase.shown) {
        phase.shown = count;
        screen.innerHTML = `<p class="hr-count">${count}</p>`;
        sounds.tick();
      }
      return;
    }
    if (phase.name !== 'batting') return;

    const { pitch } = phase;
    const seconds = Math.min(0.05, (lastFrameAt === null ? 0 : now - lastFrameAt) / 1000);

    if (pitch.stage === 'windup' && now - pitch.stageAt >= CONFIG.round.windupMs) {
      // The pitcher lets go.
      pitch.stage = 'pitch';
      pitch.stageAt = now;
      pitch.releaseAt = now;
      pitch.plateAt = now + pitch.travelMs;
      sounds.pitch();
      // The radar gun, like on TV.
      radar.name.textContent = pitch.name;
      radar.mph.textContent = `${pitch.mph} mph`;
      radar.root.hidden = false;
    } else if (pitch.stage === 'pitch') {
      // The ball has passed the plate, and no swing message can still be on its way.
      const { windowMs, lateGraceMs } = CONFIG.timing;
      if (now > pitch.plateAt + windowMs + lateGraceMs) {
        pitch.stage = 'result';
        pitch.stageAt = now;
        pitch.endedAt = now;
        sounds.mitt();
        const swung = pitch.contact?.kind === 'miss';
        renderer.text(swung ? 'Swing and a miss!' : 'Watched it go by', now, 'miss');
        const player = activePlayer();
        if (swung && player) controller.vibrate(player.id, CONFIG.vibration.miss);
      }
    } else if (pitch.stage === 'result') {
      if (pitch.flight && pitch.endedAt === null) {
        const wasHomer = pitch.flight.homer;
        stepFlight(pitch.flight, seconds, CONFIG);
        if (pitch.flight.homer && !wasHomer) {
          sounds.homer();
          renderer.cheer(now);
          const player = activePlayer();
          if (player) controller.vibrate(player.id, CONFIG.vibration.homer);
        }
        if (pitch.flight.state !== 'flying') finishHit(pitch, now);
      }
      const hold = pitch.flight ? CONFIG.round.afterHitMs : CONFIG.round.afterMissMs;
      if (pitch.endedAt !== null && now - pitch.endedAt >= hold) nextPitch(pitch, now);
    }
  }

  /** A hit ball has come down (or hit the wall): score it and say how far it went. */
  function finishHit(pitch, now) {
    pitch.endedAt = now;
    const { flight, contact } = pitch;
    const feet = Math.round(toFeet(flight.distance));
    if (contact.kind !== 'hit') return;
    if (contact.foul) {
      renderer.text('Foul ball', now, 'miss');
      stats.landings.push({ ...flight.p, kind: 'foul' });
      return;
    }
    stats.total += flight.distance;
    stats.landings.push({ ...flight.p, kind: flight.homer ? 'homer' : 'fair' });
    if (flight.homer) {
      stats.homers += 1;
      stats.longest = Math.max(stats.longest, flight.distance);
      renderer.text(`HOME RUN! ${feet} ft`, now, 'homer');
    } else if (flight.state === 'wall') {
      sounds.wall();
      renderer.text(`Off the wall! ${feet} ft`, now, 'hit');
    } else {
      renderer.text(`${feet} ft`, now, 'hit');
    }
  }

  function nextPitch(pitch, now) {
    stats.done = pitch.index + 1;
    if (stats.done >= CONFIG.round.pitches) return showResults(now);
    phase = { name: 'batting', pitch: newPitch(pitch.index + 1, now) };
  }

  function draw(now) {
    const pitch = phase.name === 'batting' ? phase.pitch : null;
    // The current pitch's stage and plate time, on the element: handy for debugging and tests.
    root.dataset.stage = pitch?.stage ?? '';
    root.dataset.plateAt = pitch?.stage === 'pitch' ? String(pitch.plateAt) : '';
    const player = activePlayer();
    renderer.draw({
      now,
      pitcher: pitcherProgress(pitch, now),
      holdingBall: !pitch || pitch.stage === 'windup',
      pitch: pitch?.path ?? null,
      pitchT: pitch ? shownPitchT(pitch, now) : null,
      flight: pitch?.flight ?? null,
      batterLoad: batterLoad(pitch, now),
      landings: stats.landings,
      batterColor: playerColor(player?.slot ?? 1),
      // The strike zone during play, marking where the pitch crossed once it has.
      zone:
        phase.name === 'batting'
          ? {
              mark:
                pitch && pitch.stage !== 'windup' && now >= pitch.plateAt
                  ? pitch.path.target
                  : null,
            }
          : null,
    });

    const pitchNumber = pitch ? Math.min(pitch.index + 1, CONFIG.round.pitches) : null;
    setHud('homers', String(stats.homers));
    setHud('pitch', pitchNumber ? `${pitchNumber} / ${CONFIG.round.pitches}` : '–');
    setHud('longest', stats.longest ? `${Math.round(toFeet(stats.longest))} ft` : '–');
  }

  /**
   * How far along its path to draw the pitch (1 = at the plate), or null.
   *
   * At the plate, the ball waits right where it crossed while a swing's
   * message could still be on its way from the phone. So when a hit comes in a
   * moment late, the ball is exactly where the strike-zone dot marks it, and
   * the bat meets it there. If nobody swings, it then carries on to the catcher.
   */
  function shownPitchT(pitch, now) {
    if (pitch.stage === 'windup' || pitch.flight) return null;
    const t = (now - pitch.releaseAt) / pitch.travelMs;
    if (t <= 1) return t;
    const { windowMs, lateGraceMs } = CONFIG.timing;
    const hang = (windowMs + lateGraceMs) / pitch.travelMs;
    return 1 + Math.max(0, t - 1 - hang);
  }

  /**
   * How far through his leg kick and stride the batter is (0 to 1), timed so
   * the stride lands just before the ball reaches the plate. Once the pitch
   * has gone by, it drops back to 0 and he settles into his stance again.
   */
  function batterLoad(pitch, now) {
    if (!pitch || pitch.flight) return 0;
    const plateAt =
      pitch.stage === 'windup'
        ? pitch.stageAt + CONFIG.round.windupMs + pitch.travelMs
        : pitch.plateAt;
    const toPlate = plateAt - now;
    if (toPlate < -CONFIG.timing.lateGraceMs) return 0;
    const { ms, readyMs } = CONFIG.batter.load;
    return Math.min(1, Math.max(0, (ms - (toPlate - readyMs)) / ms));
  }

  /**
   * How far through his delivery the pitcher is (0 to 1): the windup leads up
   * to the release, then the follow-through plays out while the ball is on its way.
   */
  function pitcherProgress(pitch, now) {
    if (!pitch) return 0;
    const { windupMs, followMs } = CONFIG.round;
    if (pitch.stage === 'windup') return ((now - pitch.stageAt) / windupMs) * RELEASE_AT;
    return Math.min(1, RELEASE_AT + ((now - pitch.releaseAt) / followMs) * (1 - RELEASE_AT));
  }

  const shownHud = { homers: '', pitch: '', longest: '' };
  function setHud(key, text) {
    if (shownHud[key] === text) return;
    shownHud[key] = text;
    hud[key].textContent = text;
  }

  showTitle();

  return {
    pause() {
      if (paused) return;
      paused = true;
      pausedAt = performance.now();
    },

    /**
     * Everything is timed by comparing "now" with saved timestamps, so to
     * resume we move every saved timestamp later by the length of the pause.
     */
    resume() {
      if (!paused) return;
      const pausedFor = performance.now() - pausedAt;
      if (phase.name === 'countdown') phase.startedAt += pausedFor;
      if (phase.name === 'results') phase.at += pausedFor;
      if (phase.name === 'batting') {
        const { pitch } = phase;
        pitch.stageAt += pausedFor;
        pitch.releaseAt += pausedFor;
        pitch.plateAt += pausedFor;
        if (pitch.endedAt !== null) pitch.endedAt += pausedFor;
      }
      renderer.shift(pausedFor);
      detector.reset();
      lastFrameAt = null;
      paused = false;
    },

    destroy() {
      for (const cleanup of cleanups) cleanup();
      container.replaceChildren();
    },
  };
}
