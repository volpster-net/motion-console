/**
 * Home Run Derby, the Wii Sports way: grip your phone like a bat and swing
 * when the pitch reaches the plate. Timing is everything. Ten pitches; hit as
 * many home runs as you can.
 *
 * Files in this folder:
 *   index.js   this file: settings, screens, pitches, and the game loop
 *   field.js   the ballpark and the ball: pitches, hits, flight (tested)
 *   swing.js   spotting a swing and when it really happened (tested)
 *   render.js  drawing the ballpark, pitcher, bat, and ball
 *   sounds.js  sound effects, made with the shared synthesizer
 */
import './baseball.css';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { createPersonalBest } from '../shared/personal-best.js';
import { contactFrom, launch, pitchTravelMs, stepFlight } from './field.js';
import meta from './meta.js';
import { createRenderer } from './render.js';
import { createSounds } from './sounds.js';
import { createClockMatch, createSwingDetector, normalizeSwing, spinSpeed } from './swing.js';

/**
 * Every number that shapes how the game feels, in one place. Distances are
 * in metres; times are in milliseconds.
 */
export const CONFIG = {
  round: {
    pitches: 10,
    countdownStepMs: 800,
    countdownFrom: 3,
    /** Ignore the trigger this long after the results appear. */
    resultsLockMs: 1200,
    /** The pitcher's windup before each pitch. */
    windupMs: 1500,
    /** How long a miss (or a pitch you didn't swing at) stays on screen. */
    afterMissMs: 1200,
    /** How long a hit's result stays up after the ball comes down. */
    afterHitMs: 1400,
  },

  pitch: {
    /** From the pitcher's hand to home plate. */
    distance: 18.4,
    releaseHeight: 1.8,
    /** Where the ball crosses the plate. */
    plateHeight: 0.9,
    /** Time from release to the plate: slow at first, quicker by the last pitch, ± a little variety. */
    travelMs: { slowest: 900, fastest: 620, variety: 0.08 },
  },

  /** Spotting a swing from the gyroscope's total spin speed (°/s). */
  swing: {
    /** Spinning faster than this starts a swing. Adjusting your grip stays well below it. */
    startRate: 500,
    /** The swing is over once it slows below this… */
    endRate: 200,
    /** …or drops below this fraction of its fastest (it has clearly peaked). */
    pastPeak: 0.6,
    /** A swing can't last longer than this. */
    maxMs: 400,
    /** Ignore the follow-through and getting set again. */
    restMs: 700,
    /** Swing speeds that count as the weakest (0) and strongest (1). */
    weakest: 500,
    strongest: 1600,
  },

  /** Judging when you swung, relative to the ball reaching the plate. */
  timing: {
    /** Within this of perfect, it's a perfect swing. */
    perfectMs: 45,
    /** More than this early or late, you miss the ball completely. */
    windowMs: 180,
    /** Shifts all timing: positive if swings keep registering early. */
    biasMs: 0,
    /** The quickest a message could possibly reach the console (see swing.js). */
    quickestTripMs: 30,
    /** How long after the ball passes the plate we still wait for a swing's message. */
    lateGraceMs: 350,
  },

  /** What a hit does, from dead on (best) to barely touched (worst). */
  hit: {
    /** How fast the ball leaves the bat, m/s. */
    exitSpeed: { worst: 18, best: 50 },
    /** How steeply it leaves the bat, degrees. */
    launchDeg: { worst: 6, best: 30 },
    /** At the edge of the timing window, the ball goes this far left or right… */
    sprayAtEdgeDeg: 60,
    /** …and beyond this, it's foul. */
    foulBeyondDeg: 45,
    /** How much swing speed adds or takes away from the exit speed (0.15 = ±7.5%). */
    powerBonus: 0.15,
  },

  field: {
    gravity: 9.81,
    /** Air resistance. Bigger = hits come down sooner. */
    drag: 0.004,
    fenceDistance: 100,
    fenceHeight: 3,
    /** The ball is drawn this many times its real size, so it's easy to see. */
    ballScale: 2.4,
    /** Where we watch from: just behind home plate. */
    camera: { height: 1.4, behind: 3, focal: 1.25, horizon: 0.45 },
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
  const hud = {
    homers: root.querySelector('[data-hud="homers"]'),
    pitch: root.querySelector('[data-hud="pitch"]'),
    longest: root.querySelector('[data-hud="longest"]'),
  };

  const renderer = createRenderer(canvas, CONFIG);
  const sounds = createSounds(CONFIG.sound);
  const bestHomers = createPersonalBest(id);
  const bestLongest = createPersonalBest(`${id}.longest`);
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
   *   travelMs: number,
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
    const travelMs = pitchTravelMs(index, CONFIG.round.pitches, Math.random(), CONFIG);
    return {
      index,
      stage: /** @type {const} */ ('windup'),
      stageAt: now,
      travelMs,
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
    const newLongestBest = stats.longest > recordLongest;
    if (newHomerBest) bestHomers.save((recordHomers = stats.homers));
    if (newLongestBest) bestLongest.save((recordLongest = Math.round(stats.longest)));
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
        <div><dt>Longest</dt><dd>${stats.longest ? `${Math.round(stats.longest)} m` : '–'}</dd></div>
        <div><dt>Total distance</dt><dd>${Math.round(stats.total)} m</dd></div>
        <div><dt>Best (home runs)</dt><dd>${recordHomers}</dd></div>
        <div><dt>Best (longest)</dt><dd>${recordLongest ? `${recordLongest} m` : '–'}</dd></div>
      </dl>
      <p class="hr-cta">Pull the trigger to play again</p>`;
  }

  // ---- Swinging -----------------------------------------------------------
  const detector = createSwingDetector(CONFIG.swing);
  const clock = createClockMatch(CONFIG.timing);
  let paused = false;
  let pausedAt = 0;

  /**
   * A swing, at `at` on the console's clock, with `power` from 0 to 1.
   * The bat always swings on screen; it only counts once per pitch, while
   * the ball is on its way.
   */
  function swingAt(at, power, player) {
    const now = performance.now();
    renderer.swingBat(now);
    if (phase.name !== 'batting') return;
    const { pitch } = phase;
    if (pitch.stage !== 'pitch' || pitch.contact) return;

    const error = at - pitch.plateAt - CONFIG.timing.biasMs;
    pitch.contact = contactFrom(error, power, CONFIG);
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
    controller.vibrate(player.id, CONFIG.vibration.hit);
    renderer.text(timingLabel(pitch.contact), now, 'timing');
  }

  /** "Perfect!", "Early", or "Late", from how far off the swing was. */
  function timingLabel(contact) {
    if (Math.abs(contact.error) <= CONFIG.timing.perfectMs) return 'Perfect!';
    return contact.error < 0 ? 'Early' : 'Late';
  }

  cleanups.push(
    controller.onInput(INPUT.MOTION, (sample, { player }) => {
      if (paused || player.id !== activePlayer()?.id) return;
      const { alpha, beta, gamma, t } = /** @type {any} */ (sample);
      clock.observe(t, performance.now());
      const swing = detector.update(spinSpeed({ alpha, beta, gamma }), t);
      if (swing)
        swingAt(clock.toConsole(swing.t), normalizeSwing(swing.peak, CONFIG.swing), player);
    }),
    controller.onInput(INPUT.BUTTON, ({ id: button, down }, { player }) => {
      if (paused || !down || button !== BUTTONS.FIRE || player.id !== activePlayer()?.id) return;
      const now = performance.now();
      if (phase.name === 'title') return startCountdown(now);
      if (phase.name === 'results' && now - phase.at >= CONFIG.round.resultsLockMs) {
        return startCountdown(now);
      }
      // No gyroscope? Then Fire swings, timed by when the press arrived.
      if (!clock.ready) swingAt(now - CONFIG.timing.quickestTripMs, 0.5, player);
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
    } else if (pitch.stage === 'pitch') {
      // The ball has passed the plate, and no swing message can still be on its way.
      const { windowMs, lateGraceMs } = CONFIG.timing;
      if (now > pitch.plateAt + windowMs + lateGraceMs) {
        pitch.stage = 'result';
        pitch.stageAt = now;
        pitch.endedAt = now;
        sounds.mitt();
        const swung = pitch.contact?.kind === 'miss';
        const label = !swung
          ? 'Watched it go by'
          : pitch.contact.error < 0
            ? 'Too early!'
            : 'Too late!';
        renderer.text(swung ? `Swing and a miss! ${label}` : label, now, 'miss');
        const player = activePlayer();
        if (swung && player) controller.vibrate(player.id, CONFIG.vibration.miss);
      }
    } else if (pitch.stage === 'result') {
      if (pitch.flight && pitch.endedAt === null) {
        const wasHomer = pitch.flight.homer;
        stepFlight(pitch.flight, seconds, CONFIG);
        if (pitch.flight.homer && !wasHomer) {
          sounds.homer();
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
    const metres = Math.round(flight.distance);
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
      renderer.text(`HOME RUN! ${metres} m`, now, 'homer');
    } else if (flight.state === 'wall') {
      sounds.wall();
      renderer.text(`Off the wall! ${metres} m`, now, 'hit');
    } else {
      renderer.text(`${metres} m`, now, 'hit');
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
    renderer.draw({
      now,
      pitcher: pitch
        ? pitch.stage === 'windup'
          ? (now - pitch.stageAt) / CONFIG.round.windupMs
          : 1
        : 0,
      pitchT:
        pitch && (pitch.stage === 'pitch' || (pitch.stage === 'result' && !pitch.flight))
          ? (now - pitch.releaseAt) / pitch.travelMs
          : null,
      flight: pitch?.flight ?? null,
      landings: stats.landings,
    });

    const pitchNumber = pitch ? Math.min(pitch.index + 1, CONFIG.round.pitches) : null;
    setHud('homers', String(stats.homers));
    setHud('pitch', pitchNumber ? `${pitchNumber} / ${CONFIG.round.pitches}` : '–');
    setHud('longest', stats.longest ? `${Math.round(stats.longest)} m` : '–');
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
