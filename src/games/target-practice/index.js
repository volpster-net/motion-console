/**
 * Target Practice: aim with your phone, pull the trigger (Fire) to hit the
 * rings before they vanish. 60-second rounds, streak multipliers, and a
 * personal best.
 *
 * Files in this folder:
 *   index.js          this file: settings, screens, and the game loop
 *   round.js          the rules: spawning, difficulty, scoring (no screen, easy to test)
 *   render.js         drawing targets, effects, and the crosshair on a canvas
 *   sounds.js         sound effects made with the Web Audio API
 *   personal-best.js  saving the best score in the browser
 */
import './target-practice.css';
import { createAimTracker, loadAimSettings } from '../../aim/index.js';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { loadPersonalBest, savePersonalBest } from './personal-best.js';
import { createRenderer } from './render.js';
import { createRound } from './round.js';
import { createSounds } from './sounds.js';

/**
 * Every number that shapes how the game feels, in one place. Change a value,
 * save, and the game reloads with it.
 *
 * Sizes and distances are in "screen heights": 0.1 means a tenth of the
 * play area's height, so the game looks the same on a laptop and a TV.
 * Settings with `start` and `end` change evenly over the round, which is how
 * the difficulty ramps up.
 */
export const CONFIG = {
  round: {
    durationMs: 60_000,
    /** Each step of the 3-2-1 countdown. */
    countdownStepMs: 800,
    countdownFrom: 3,
    /** Ignore the trigger this long after the results appear, so a late shot doesn't skip them. */
    resultsLockMs: 1200,
  },

  targets: {
    maxOnScreen: 3,
    /** Outer ring size, in screen heights. Targets shrink as the round goes on. */
    radius: { start: 0.09, end: 0.05 },
    /** How long a target stays up if nobody hits it. */
    lifetimeMs: { start: 2200, end: 1300 },
    /** How often a new target appears (while there's room for one). */
    spawnEveryMs: { start: 900, end: 550 },
    /** Keep targets this far from the edges of the play area. */
    edgeMargin: 0.03,
    /** Minimum space between two targets. */
    gapBetween: 0.02,
    /** How many random spots to try before giving up on a crowded screen. */
    placementAttempts: 20,
    /** Does letting a target expire break your streak? */
    expiredBreaksStreak: false,
  },

  /**
   * Rings from the inside out. `upTo` is how far from the centre the ring
   * reaches, as a fraction of the target's size (1 = the outer edge).
   */
  rings: [
    { name: 'bullseye', upTo: 0.25, points: 50 },
    { name: 'middle', upTo: 0.6, points: 25 },
    { name: 'outer', upTo: 1, points: 10 },
  ],

  /** Consecutive hits needed for each score multiplier. A miss resets the streak. */
  streak: [
    { from: 5, multiplier: 2 },
    { from: 10, multiplier: 3 },
  ],

  /** Phone buzz patterns in ms: one number, or buzz/pause/buzz… */
  vibration: {
    hit: [70, 40, 90],
    miss: 20,
  },

  effects: {
    popInMs: 160,
    fadeOutMs: 250,
    burstMs: 450,
    burstParticles: 14,
    pointsMs: 800,
    puffMs: 300,
  },

  sound: {
    /** 0 to 1. */
    volume: 0.4,
  },
};

export const id = 'target-practice';
export const name = 'Target Practice';
export const description = 'Aim with your phone and hit the rings before they vanish.';

/** The running game, if any. Only one can run at a time. */
let session = null;

/**
 * Starts the game in `container`.
 *
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

/** @type {import('../game.js').Game} */
export default { id, name, description, start, stop };

/**
 * @param {HTMLElement} container
 * @param {import('../game.js').GameController} controller
 */
function createSession(container, controller) {
  container.innerHTML = `
    <div class="tp card">
      <canvas class="tp-canvas"></canvas>
      <header class="tp-hud">
        <span class="tp-stat"><small>Score</small><b data-hud="score">0</b></span>
        <span class="tp-stat tp-streak"><small>Streak</small><b data-hud="streak">0</b><i data-hud="multiplier"></i></span>
        <span class="tp-stat tp-time"><small>Time</small><b data-hud="time">60</b></span>
      </header>
      <div class="tp-screen"></div>
      <button type="button" class="tp-sound">Sound is off. Click here to turn it on.</button>
    </div>`;
  const root = /** @type {HTMLElement} */ (container.querySelector('.tp'));
  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('.tp-canvas'));
  const hud = /** @type {HTMLElement} */ (root.querySelector('.tp-hud'));
  const screen = /** @type {HTMLElement} */ (root.querySelector('.tp-screen'));
  const soundButton = /** @type {HTMLElement} */ (root.querySelector('.tp-sound'));
  const hudValues = {
    score: hud.querySelector('[data-hud="score"]'),
    streak: hud.querySelector('[data-hud="streak"]'),
    multiplier: hud.querySelector('[data-hud="multiplier"]'),
    time: hud.querySelector('[data-hud="time"]'),
  };

  const tracker = createAimTracker(loadAimSettings());
  const renderer = createRenderer(canvas, CONFIG);
  const sounds = createSounds(CONFIG.sound);
  /** Everything to undo in destroy(). */
  const cleanups = [];

  // ---- Layout -------------------------------------------------------------
  // Measure the play area and the top bar only when they change size.
  let size = { width: 0, height: 0 };
  let topReserved = 0;
  const resizeObserver = new ResizeObserver(() => {
    size = { width: root.clientWidth, height: root.clientHeight };
    topReserved = size.height > 0 ? hud.offsetHeight / size.height : 0;
    renderer.resize(size.width, size.height);
  });
  resizeObserver.observe(root);
  cleanups.push(() => resizeObserver.disconnect());

  // ---- Sound switch -------------------------------------------------------
  // Browsers only allow sound after a click or key press on this page.
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
  // Version 1 is single-player: the lowest-numbered player plays. If they
  // leave, the next one takes over.
  const activePlayer = () => controller.players.list().find((player) => player.slot !== null);

  // ---- Phases -------------------------------------------------------------
  // The game is always in exactly one phase. Each phase decides what the
  // trigger does and what's on screen.
  //
  //   title ──trigger──▶ countdown ──3, 2, 1──▶ playing ──60 s──▶ results
  //                         ▲                                      │
  //                         └──────────────── trigger ─────────────┘
  //
  /**
   * @type {{ name: 'title' }
   *   | { name: 'countdown', startedAt: number, shown: number }
   *   | { name: 'playing', round: ReturnType<typeof createRound> }
   *   | { name: 'results', at: number, round: ReturnType<typeof createRound> }}
   */
  let phase = { name: 'title' };
  let personalBest = loadPersonalBest();

  function showTitle() {
    phase = { name: 'title' };
    root.dataset.phase = 'title';
    const player = activePlayer();
    const rings = CONFIG.rings.map((ring) => `${ring.points}`).join(' / ');
    screen.innerHTML = `
      <h1>${name}</h1>
      <p>${description}</p>
      <p class="tp-rules">
        Bullseye, middle, outer: <b>${rings}</b> points.
        ${CONFIG.streak.map((rule) => `<b>${rule.from}</b> hits in a row: <b>×${rule.multiplier}</b>`).join(', ')}.
      </p>
      <p class="tp-cta">${
        player
          ? `<span class="tp-player" style="--player: ${playerColor(player.slot)}">${playerLabel(player.slot)}</span> Pull the trigger to start`
          : 'Scan the QR code with your phone to join'
      }</p>
      <p class="tp-hint">Point at the middle of the screen and press Re-center any time.</p>`;
  }

  function startCountdown(now) {
    phase = { name: 'countdown', startedAt: now, shown: -1 };
    root.dataset.phase = 'countdown';
    renderer.clearEffects();
  }

  function startRound(now) {
    phase = { name: 'playing', round: createRound({ config: CONFIG, startedAt: now }) };
    root.dataset.phase = 'playing';
    screen.innerHTML = '';
    sounds.go();
  }

  function showResults(round, now) {
    const results = round.results();
    const isNewBest = results.score > personalBest;
    if (isNewBest) {
      personalBest = results.score;
      savePersonalBest(personalBest);
    }
    phase = { name: 'results', at: now, round };
    root.dataset.phase = 'results';
    sounds.roundEnd();
    if (isNewBest) sounds.newBest();
    screen.innerHTML = `
      <p class="eyebrow">Time's up</p>
      <h1 class="tp-final">${results.score}</h1>
      ${isNewBest ? '<p class="tp-best">New personal best!</p>' : ''}
      <dl class="tp-results">
        <div><dt>Accuracy</dt><dd>${Math.round(results.accuracy * 100)}%</dd></div>
        <div><dt>Hits</dt><dd>${results.hits} / ${results.shots}</dd></div>
        <div><dt>Best streak</dt><dd>${results.bestStreak}</dd></div>
        <div><dt>Personal best</dt><dd>${personalBest}</dd></div>
      </dl>
      <p class="tp-cta">Pull the trigger to play again</p>`;
  }

  // ---- Input --------------------------------------------------------------
  // Phone messages arrive whenever the network delivers them. Motion goes
  // straight to the aim tracker, which catches up once per frame. Buttons act
  // immediately.
  cleanups.push(
    controller.onInput(INPUT.MOTION, (sample, { player }) => {
      tracker.push(player.id, /** @type {any} */ (sample));
    }),
    controller.onInput(INPUT.BUTTON, ({ id: button, down }, { player }) => {
      if (!down) return;
      if (button === BUTTONS.RECENTER) tracker.recenter(player.id);
      if (button === BUTTONS.FIRE && player.id === activePlayer()?.id) pullTrigger(player);
    }),
    controller.players.onChange(() => {
      if (phase.name === 'title') showTitle(); // update "scan to join" / "pull the trigger"
    }),
  );

  /** What the trigger does depends on the phase. */
  function pullTrigger(player) {
    const now = performance.now();
    if (phase.name === 'title') {
      startCountdown(now);
    } else if (phase.name === 'results' && now - phase.at >= CONFIG.round.resultsLockMs) {
      startCountdown(now);
    } else if (phase.name === 'playing') {
      shoot(phase.round, player, now);
    }
  }

  function shoot(round, player, now) {
    const aim = tracker.get(player.id);
    const shot = round.shoot(aim);
    sounds.shoot();
    if (shot.hit) {
      const color = playerColor(player.slot);
      renderer.burst(shot.target, color, now);
      const text = shot.multiplier > 1 ? `+${shot.points} ×${shot.multiplier}` : `+${shot.points}`;
      renderer.points(shot.target, text, color, now);
      sounds.hit(CONFIG.rings.indexOf(shot.ring));
      controller.vibrate(player.id, CONFIG.vibration.hit);
    } else {
      renderer.puff(aim, now);
      sounds.miss();
      controller.vibrate(player.id, CONFIG.vibration.miss);
    }
  }

  // ---- The game loop ------------------------------------------------------
  // The browser calls `frame` just before it repaints the screen, about 60
  // times a second (more on fast screens). Each call:
  //   1. lets the aim tracker catch up on phone movement;
  //   2. moves the game forward to the current time (countdown, targets
  //      appearing and expiring, the round ending);
  //   3. redraws everything.
  // All timing compares `now` with timestamps we stored earlier, rather than
  // using setTimeout. So there are no timers to forget in stop(), and a
  // paused or slow tab can't make the game's clock drift.
  let frameRequest = requestAnimationFrame(function frame(now) {
    if (size.height > 0) {
      tracker.update(now, size.width / size.height);
      advance(now);
      draw(now);
    }
    frameRequest = requestAnimationFrame(frame);
  });
  cleanups.push(() => cancelAnimationFrame(frameRequest));

  /** Step 2: move the current phase forward in time. */
  function advance(now) {
    if (phase.name === 'countdown') {
      const { countdownStepMs, countdownFrom } = CONFIG.round;
      const step = Math.floor((now - phase.startedAt) / countdownStepMs);
      const count = countdownFrom - step;
      if (count <= 0) return startRound(now);
      if (count !== phase.shown) {
        phase.shown = count;
        screen.innerHTML = `<p class="tp-count">${count}</p>`;
        sounds.tick();
      }
    } else if (phase.name === 'playing') {
      const { round } = phase;
      round.update(now, { aspect: size.width / size.height, topReserved });
      if (round.isOver(now)) showResults(round, now);
    }
  }

  /** Step 3: draw the targets, effects, and crosshair, and refresh the top bar. */
  const shownHud = { score: '', streak: '', multiplier: '', time: '' };
  function draw(now) {
    // The top bar shows the current round, or the one that just ended.
    const round = phase.name === 'playing' || phase.name === 'results' ? phase.round : null;
    const player = activePlayer();
    renderer.draw({
      now,
      targets: phase.name === 'playing' ? phase.round.targets : [],
      crosshair: player ? { ...tracker.get(player.id), color: playerColor(player.slot) } : null,
    });

    const secondsLeft = Math.ceil((round ? round.timeLeftMs(now) : CONFIG.round.durationMs) / 1000);
    setHud('score', String(round?.score ?? 0));
    setHud('streak', String(round?.streak ?? 0));
    setHud('multiplier', round && round.multiplier > 1 ? `×${round.multiplier}` : '');
    setHud('time', String(secondsLeft));
    hud.classList.toggle('is-hurry', phase.name === 'playing' && secondsLeft <= 10);
  }

  /** Updates a top-bar value only when it changes, to avoid needless page work. */
  function setHud(key, text) {
    if (shownHud[key] === text) return;
    shownHud[key] = text;
    hudValues[key].textContent = text;
  }

  showTitle();

  return {
    destroy() {
      for (const cleanup of cleanups) cleanup();
      container.replaceChildren();
    },
  };
}
