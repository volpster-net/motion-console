/**
 * Hoops: an arcade basketball shootout. Aim left and right with your phone,
 * then shoot with a real shooting motion: set, push, snap. Make as many
 * baskets as you can in 60 seconds.
 *
 * Files in this folder:
 *   index.js   this file: settings, screens, shooting, and the game loop
 *   court.js   the court and the ball's flight: physics, bounces, scoring (tested)
 *   shot.js    spotting the shooting motion in the phone's movement (tested)
 *   tuning.js  the shot-tuning graph (press D)
 *   render.js  drawing the court, hoop, and balls on a canvas
 *   sounds.js  sound effects, made with the shared synthesizer
 */
import './basketball.css';
import { createAimTracker, loadAimSettings } from '../../aim/index.js';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { createPersonalBest } from '../shared/personal-best.js';
import {
  ballIsDone,
  createBall,
  hoopXAt,
  launchVelocity,
  powerFromNorm,
  project,
  shotResult,
  stepBall,
} from './court.js';
import { createShotDetector, normalizePush } from './shot.js';
import { createShotTuning } from './tuning.js';
import meta from './meta.js';
import { createRenderer } from './render.js';
import { createSounds } from './sounds.js';

/**
 * Every number that shapes how the game feels, in one place. Distances are
 * in metres, like a real court; times are in milliseconds.
 */
export const CONFIG = {
  round: {
    durationMs: 60_000,
    countdownStepMs: 800,
    countdownFrom: 3,
    /** Ignore the trigger this long after the results appear. */
    resultsLockMs: 1200,
    /** Shortest time between two shots. */
    shotCooldownMs: 300,
  },

  scoring: {
    basket: 2,
    /** Nothing but net: no rim, no backboard. */
    swish: 3,
    /** Makes in a row before you're "on fire"… */
    onFireFrom: 3,
    /** …which multiplies points until you miss. */
    onFireMultiplier: 2,
  },

  /**
   * The shooting motion: set, push, snap (shot.js explains each step).
   * These are starting guesses. Press D in the game to see your real
   * numbers on a graph, then move these to suit.
   */
  shot: {
    /** SET: the top edge must point at least this many degrees above level… */
    setTilt: 35,
    /** …for this long. */
    setHoldMs: 120,
    /** Lowering the phone below this lets go of the set. */
    unsetTilt: 20,
    /** PUSH: an upward push harder than this (m/s²) starts the shot. */
    pushStart: 3,
    /** SNAP: the wrist flicking forwards faster than this (°/s) releases it… */
    snapRate: 250,
    /** …and it must come within this long of the push starting. */
    windowMs: 600,
    /** Ignore movement this long after a shot (bringing the phone back down). */
    cooldownMs: 500,
    /** Pushes (m/s²) that count as the weakest (0) and strongest (1) shots. */
    weakest: 4,
    strongest: 24,
    /** The perfect-power spot on that 0-to-1 scale… */
    sweetSpot: 0.5,
    /** …and how far either side of it still flies perfectly. */
    sweetBand: 0.12,
    /** Outside the band, how much each step off the sweet spot slows or speeds the ball. */
    powerGain: 0.35,
  },

  /**
   * Holding Fire charges a meter that swings up and down; let go to shoot.
   * 'auto' allows it only for phones that send no motion data (no gyroscope),
   * so everyone else has to make the shooting motion. 'always' or 'never' to override.
   */
  charge: {
    mode: 'auto',
    /** Time for the meter to go from empty to full and back. */
    cycleMs: 1600,
  },

  court: {
    gravity: 9.81,
    rimHeight: 3.05,
    /** Arcade-sized rim (a real one is 0.23 m). */
    rimRadius: 0.3,
    rimTube: 0.02,
    ballRadius: 0.12,
    /** From your hands to the middle of the rim. */
    distance: 4,
    releaseHeight: 1.5,
    /** Every shot leaves at this upward angle; the arm push sets the speed. */
    launchAngleDeg: 60,
    board: {
      /** Space between the back of the rim and the board. */
      gap: 0.15,
      width: 1.8,
      height: 1.05,
      /** Board's bottom edge relative to the rim (negative = below it). */
      bottomAboveRim: -0.15,
    },
    /** How bouncy each surface is: 1 = perfect bounce, 0 = dead stop. */
    rimBounce: 0.55,
    boardBounce: 0.6,
    floorBounce: 0.55,
    /** A ball is removed after this long, or this long after landing. */
    maxFlightMs: 4000,
    afterLandingMs: 700,
    /** The hoop starts sliding side to side partway through the round. */
    hoopMotion: {
      /** 0.5 = halfway through the round. */
      fromProgress: 0.5,
      /** How far it slides either side, growing over the rest of the round. */
      amplitude: { start: 0.25, end: 0.9 },
      /** Time for one full side-to-side swing. */
      periodMs: 3600,
    },
    /** Where we watch from: just behind and above the shooter. */
    camera: { height: 1.8, behind: 0.8, focal: 1.1, horizon: 0.58 },
  },

  vibration: {
    /** A tiny tick when you're set, so you can feel it without looking. */
    set: 12,
    shot: 15,
    make: [40, 30, 60],
    swish: [60, 30, 60, 30, 100],
    rim: 25,
  },

  effects: {
    textMs: 900,
  },

  sound: {
    volume: 0.4,
  },
};

// The name and description live in meta.js, so the launcher can show them
// without loading the game.
export const { id, name, description } = meta;

/** The running game, if any. Only one can run at a time. */
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

const RESULT_TEXT = {
  swish: 'Swish!',
  bank: 'Bank shot!',
  make: 'Nice!',
  rimmed: 'Off the rim',
  board: 'Off the board',
  short: 'Short',
  long: 'Long',
  wide: 'Wide',
};

/**
 * @param {HTMLElement} container
 * @param {import('../game.js').GameController} controller
 */
function createSession(container, controller) {
  container.innerHTML = `
    <div class="bb card">
      <canvas class="bb-canvas"></canvas>
      <header class="bb-hud">
        <span class="bb-stat"><small>Score</small><b data-hud="score">0</b></span>
        <span class="bb-stat bb-streak"><small>Streak</small><b data-hud="streak">0</b><i data-hud="fire"></i></span>
        <span class="bb-stat bb-time"><small>Time</small><b data-hud="time">60</b></span>
      </header>
      <div class="bb-meter" aria-hidden="true">
        <small>Power</small>
        <div class="bb-meter-bar">
          <span class="bb-meter-sweet"></span>
          <span class="bb-meter-mark"></span>
        </div>
        <small class="bb-meter-note"></small>
      </div>
      <div class="bb-screen"></div>
      <button type="button" class="bb-sound">Sound is off. Click here to turn it on.</button>
    </div>`;
  const root = /** @type {HTMLElement} */ (container.querySelector('.bb'));
  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('.bb-canvas'));
  const hud = /** @type {HTMLElement} */ (root.querySelector('.bb-hud'));
  const screen = /** @type {HTMLElement} */ (root.querySelector('.bb-screen'));
  const soundButton = /** @type {HTMLElement} */ (root.querySelector('.bb-sound'));
  const meter = {
    root: /** @type {HTMLElement} */ (root.querySelector('.bb-meter')),
    sweet: /** @type {HTMLElement} */ (root.querySelector('.bb-meter-sweet')),
    mark: /** @type {HTMLElement} */ (root.querySelector('.bb-meter-mark')),
    note: /** @type {HTMLElement} */ (root.querySelector('.bb-meter-note')),
  };
  const hudValues = {
    score: hud.querySelector('[data-hud="score"]'),
    streak: hud.querySelector('[data-hud="streak"]'),
    fire: hud.querySelector('[data-hud="fire"]'),
    time: hud.querySelector('[data-hud="time"]'),
  };

  const tracker = createAimTracker(loadAimSettings());
  const renderer = createRenderer(canvas, CONFIG);
  const sounds = createSounds(CONFIG.sound);
  const best = createPersonalBest(id);
  const cleanups = [];

  // The sweet spot on the power meter.
  const { sweetSpot, sweetBand } = CONFIG.shot;
  meter.sweet.style.left = `${(sweetSpot - sweetBand) * 100}%`;
  meter.sweet.style.width = `${sweetBand * 2 * 100}%`;

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
  // Single-player: the lowest-numbered player shoots.
  const activePlayer = () => controller.players.list().find((player) => player.slot !== null);

  // ---- Round state --------------------------------------------------------
  /**
   * @type {{ name: 'title' }
   *   | { name: 'countdown', startedAt: number, shown: number }
   *   | { name: 'playing', startedAt: number }
   *   | { name: 'results', at: number }}
   */
  let phase = { name: 'title' };
  let stats = freshStats();
  /** @type {import('./court.js').Ball[]} */
  let balls = [];
  let nextBallId = 1;
  let lastShotAt = -Infinity;
  let hoopX = 0;
  let personalBest = best.load();
  /** When the player started holding Fire to charge a shot, if they are. */
  let chargingSince = null;

  function freshStats() {
    return { score: 0, shots: 0, makes: 0, swishes: 0, streak: 0, bestStreak: 0 };
  }

  const onFire = () => stats.streak >= CONFIG.scoring.onFireFrom;
  /** The buzzer has gone: no more shots, but balls already in the air still count. */
  const timeUp = (now) =>
    phase.name === 'playing' && now - phase.startedAt >= CONFIG.round.durationMs;

  function showTitle() {
    phase = { name: 'title' };
    root.dataset.phase = 'title';
    const player = activePlayer();
    screen.innerHTML = `
      <h1>${name}</h1>
      <p>${description}</p>
      <p class="bb-rules">
        Point your phone to line up with the rim. Then shoot like it's the ball:
        <b>raise it and cock your wrist back</b>, <b>push your arm up</b>, and
        <b>snap your wrist forwards</b> to release. Push harder to shoot further.
        A basket is <b>${CONFIG.scoring.basket}</b>, a swish (nothing but net) is <b>${CONFIG.scoring.swish}</b>.
        Make <b>${CONFIG.scoring.onFireFrom}</b> in a row and you're on fire: <b>×${CONFIG.scoring.onFireMultiplier}</b>.
      </p>
      <p class="bb-cta">${
        player
          ? `<span class="bb-player" style="--player: ${playerColor(player.slot)}">${playerLabel(player.slot)}</span> Pull the trigger to start`
          : 'Scan the QR code with your phone to join'
      }</p>
      <p class="bb-hint">Press D on this screen to see your shooting motion on a graph.</p>`;
  }

  function startCountdown(now) {
    phase = { name: 'countdown', startedAt: now, shown: -1 };
    root.dataset.phase = 'countdown';
    stats = freshStats();
    balls = [];
    hoopX = 0;
    renderer.clearEffects();
  }

  function startRound(now) {
    phase = { name: 'playing', startedAt: now };
    root.dataset.phase = 'playing';
    screen.innerHTML = '';
    lastShotAt = -Infinity;
    sounds.go();
  }

  function showResults(now) {
    const isNewBest = stats.score > personalBest;
    if (isNewBest) {
      personalBest = stats.score;
      best.save(personalBest);
    }
    phase = { name: 'results', at: now };
    root.dataset.phase = 'results';
    chargingSince = null;
    sounds.buzzer();
    if (isNewBest) sounds.newBest();
    const accuracy = stats.shots > 0 ? Math.round((stats.makes / stats.shots) * 100) : 0;
    screen.innerHTML = `
      <p class="eyebrow">Time's up</p>
      <h1 class="bb-final">${stats.score}</h1>
      ${isNewBest ? '<p class="bb-best">New personal best!</p>' : ''}
      <dl class="bb-results">
        <div><dt>Baskets</dt><dd>${stats.makes} / ${stats.shots}</dd></div>
        <div><dt>Accuracy</dt><dd>${accuracy}%</dd></div>
        <div><dt>Swishes</dt><dd>${stats.swishes}</dd></div>
        <div><dt>Best streak</dt><dd>${stats.bestStreak}</dd></div>
        <div><dt>Personal best</dt><dd>${personalBest}</dd></div>
      </dl>
      <p class="bb-cta">Pull the trigger to play again</p>`;
  }

  // ---- Shooting -----------------------------------------------------------
  /**
   * Where the player is aiming, as metres left or right at the rim's
   * distance. The crosshair is drawn at rim height, so only left/right matters.
   */
  function aimX(playerId) {
    const aim = tracker.get(playerId);
    const rim = project(
      { x: 0, y: CONFIG.court.rimHeight, z: CONFIG.court.distance },
      size,
      CONFIG,
    );
    return (aim.x * size.height) / rim.scale;
  }

  /**
   * Where the player was aiming when they got set. Raising and cocking the
   * phone jiggles the aim, so the shot uses the aim from just before.
   */
  let lockedAimX = null;

  /**
   * Launches a ball.
   *
   * @param {import('../../console/players.js').Player} player
   * @param {number} norm  shot strength, 0 (weakest) to 1 (strongest)
   * @param {number} targetX
   * @param {number} now
   * @param {string} note  shown under the power meter
   */
  function shoot(player, norm, targetX, now, note) {
    if (phase.name !== 'playing' || timeUp(now)) return;
    if (now - lastShotAt < CONFIG.round.shotCooldownMs) return;
    lastShotAt = now;
    const power = powerFromNorm(norm, CONFIG);
    balls.push(
      createBall({
        id: nextBallId++,
        velocity: launchVelocity(targetX, power.speedError, CONFIG),
        now,
        config: CONFIG,
      }),
    );
    stats.shots += 1;
    showPower(power.norm, note);
    sounds.shoot();
    controller.vibrate(player.id, CONFIG.vibration.shot);
  }

  /** Marks a shot's strength on the power meter. */
  function showPower(norm, note) {
    meter.mark.style.left = `${norm * 100}%`;
    const inSweet = Math.abs(norm - sweetSpot) <= sweetBand;
    meter.root.classList.toggle('is-sweet', inSweet);
    meter.note.textContent = note;
  }

  /** Scores or describes a ball once its shot is decided. */
  function settle(ball, now) {
    const result = shotResult(ball);
    const player = activePlayer();
    // Results float up from just below the net, clear of the top bar.
    const at = { x: hoopX, y: CONFIG.court.rimHeight - 0.8, z: CONFIG.court.distance };
    if (ball.scored) {
      stats.makes += 1;
      stats.streak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
      if (result === 'swish') stats.swishes += 1;
      const base = result === 'swish' ? CONFIG.scoring.swish : CONFIG.scoring.basket;
      const multiplier = onFire() ? CONFIG.scoring.onFireMultiplier : 1;
      stats.score += base * multiplier;
      const bonus = multiplier > 1 ? ` ×${multiplier}` : '';
      renderer.text(at, `${RESULT_TEXT[result]} +${base * multiplier}${bonus}`, now, 'make');
      if (result === 'swish') sounds.swish();
      sounds.make(onFire());
      if (player) {
        controller.vibrate(
          player.id,
          result === 'swish' ? CONFIG.vibration.swish : CONFIG.vibration.make,
        );
      }
      if (stats.streak === CONFIG.scoring.onFireFrom) {
        renderer.text({ ...at, y: at.y + 0.35 }, "You're on fire!", now, 'fire');
      }
    } else {
      stats.streak = 0;
      renderer.text(at, RESULT_TEXT[result], now, 'miss');
    }
  }

  // ---- Input --------------------------------------------------------------
  let paused = false;
  let pausedAt = 0;

  // Shot detection runs on every motion sample the tracker processes.
  const detector = createShotDetector(CONFIG.shot);
  const tuning = createShotTuning({ root, config: CONFIG.shot });
  cleanups.push(() => tuning.destroy());
  /** Short hints shown when a shot fizzles. */
  const FIZZLE_TEXT = { push: 'Push with your arm!', snap: 'Snap your wrist to release!' };

  cleanups.push(
    tracker.onMotion((playerId, rates, t, body) => {
      const player = activePlayer();
      if (!player || player.id !== playerId) return;
      tuning.record({ t, tilt: body.tilt, lift: body.lift, snap: -rates.pitch });
      const event = detector.update({
        tilt: body.tilt,
        lift: body.lift,
        pitchRate: rates.pitch,
        t,
      });
      if (!event) return;
      tuning.mark(event);
      const now = performance.now();

      if (event.type === 'set') {
        lockedAimX = aimX(playerId);
        controller.vibrate(player.id, CONFIG.vibration.set);
      } else if (event.type === 'unset') {
        lockedAimX = null;
      } else if (event.type === 'fizzle') {
        lockedAimX = null;
        if (phase.name === 'playing') renderer.hint(FIZZLE_TEXT[event.missing], now);
      } else if (event.type === 'shot') {
        const norm = normalizePush(event.push, CONFIG.shot);
        tuning.describeShot(event, norm);
        const targetX = lockedAimX ?? aimX(playerId);
        lockedAimX = null;
        shoot(player, norm, targetX, now, `Push ${event.push.toFixed(1)} m/s²`);
      }
    }),
  );

  /** May this player use the hold-Fire charged shot? */
  function mayCharge(player) {
    if (CONFIG.charge.mode === 'always') return true;
    if (CONFIG.charge.mode === 'never') return false;
    return tracker.get(player.id).lastSample === null; // no motion data: no gyroscope
  }

  cleanups.push(
    controller.onInput(INPUT.MOTION, (sample, { player }) => {
      if (!paused) tracker.push(player.id, /** @type {any} */ (sample));
    }),
    controller.onInput(INPUT.BUTTON, ({ id: button, down }, { player }) => {
      if (paused) return;
      if (button === BUTTONS.RECENTER && down) tracker.recenter(player.id);
      if (button === BUTTONS.FIRE && player.id === activePlayer()?.id) trigger(player, down);
    }),
    controller.players.onChange(() => {
      if (phase.name === 'title') showTitle();
    }),
  );

  /** The trigger: starts rounds, or charges and releases a shot during play. */
  function trigger(player, down) {
    const now = performance.now();
    if (phase.name === 'title' && down) return startCountdown(now);
    if (phase.name === 'results' && down && now - phase.at >= CONFIG.round.resultsLockMs) {
      return startCountdown(now);
    }
    if (phase.name !== 'playing' || !mayCharge(player)) return;
    if (down) {
      chargingSince = now;
    } else if (chargingSince !== null) {
      const norm = chargeAt(now);
      chargingSince = null;
      shoot(player, norm, aimX(player.id), now, 'Charged shot');
    }
  }

  /** The charge meter swings from empty to full and back, over and over. */
  function chargeAt(now) {
    const t = ((now - chargingSince) % CONFIG.charge.cycleMs) / CONFIG.charge.cycleMs;
    return t < 0.5 ? t * 2 : 2 - t * 2;
  }

  // ---- The game loop ------------------------------------------------------
  // About 60 times a second:
  //   1. the aim tracker catches up on phone movement (and spots shots);
  //   2. the game moves forward to the current time: the countdown, the
  //      hoop sliding, every ball in the air, and the round ending;
  //   3. everything is redrawn.
  // While paused, frames are skipped, so the picture freezes.
  let lastFrameAt = null;
  let frameRequest = requestAnimationFrame(function frame(now) {
    if (size.height > 0 && !paused) {
      tracker.update(now, size.width / size.height);
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
      if (count <= 0) return startRound(now);
      if (count !== phase.shown) {
        phase.shown = count;
        screen.innerHTML = `<p class="bb-count">${count}</p>`;
        sounds.tick();
      }
      return;
    }

    const playing = phase.name === 'playing';
    if (playing && !timeUp(now)) {
      const elapsed = now - phase.startedAt;
      hoopX = hoopXAt(elapsed / CONFIG.round.durationMs, elapsed, CONFIG);
    }

    // Balls keep flying after the buzzer, so a last-second shot still counts.
    const seconds = Math.min(0.05, (lastFrameAt === null ? 0 : now - lastFrameAt) / 1000);
    for (const ball of balls) {
      const decidedBefore = ball.scored || ball.landedAt !== undefined;
      for (const event of stepBall(ball, seconds, hoopX, now, CONFIG)) {
        if (event === 'rim') {
          sounds.rim();
          const player = activePlayer();
          if (player) controller.vibrate(player.id, CONFIG.vibration.rim);
        }
        if (event === 'board') sounds.board();
      }
      // A shot is decided when it goes in, or when it first hits the floor.
      const decided = ball.scored || ball.landedAt !== undefined;
      if (decided && !decidedBefore) settle(ball, now);
    }
    balls = balls.filter((ball) => !ballIsDone(ball, now, CONFIG));

    // After the buzzer, wait for every ball in the air to be decided, then show the results.
    const allDecided = balls.every((ball) => ball.scored || ball.landedAt !== undefined);
    if (timeUp(now) && allDecided) showResults(now);
  }

  /** The crosshair's position, in screen heights: locked in place once the player is set. */
  function aimScreenX(liveX) {
    if (lockedAimX === null) return liveX;
    const rim = project(
      { x: 0, y: CONFIG.court.rimHeight, z: CONFIG.court.distance },
      size,
      CONFIG,
    );
    return (lockedAimX * rim.scale) / size.height;
  }

  const shownHud = { score: '', streak: '', fire: '', time: '' };
  function draw(now) {
    const player = activePlayer();
    const aim = player ? tracker.get(player.id) : null;
    renderer.draw({
      now,
      hoopX,
      balls,
      aim:
        aim && phase.name === 'playing'
          ? { x: aimScreenX(aim.x), color: playerColor(player.slot), locked: lockedAimX !== null }
          : null,
      hands: phase.name === 'playing' ? detector.stage : null,
      onFire: phase.name === 'playing' && onFire(),
    });
    tuning.draw();

    if (chargingSince !== null && phase.name === 'playing') showPower(chargeAt(now), 'Charging…');

    const remaining =
      phase.name === 'playing'
        ? CONFIG.round.durationMs - (now - phase.startedAt)
        : phase.name === 'results'
          ? 0
          : CONFIG.round.durationMs;
    const secondsLeft = Math.max(0, Math.ceil(remaining / 1000));
    setHud('score', String(stats.score));
    setHud('streak', String(stats.streak));
    setHud('fire', phase.name === 'playing' && onFire() ? 'On fire!' : '');
    setHud('time', String(secondsLeft));
    hud.classList.toggle('is-hurry', phase.name === 'playing' && secondsLeft <= 10);
  }

  function setHud(key, text) {
    if (shownHud[key] === text) return;
    shownHud[key] = text;
    hudValues[key].textContent = text;
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
      if (phase.name === 'countdown' || phase.name === 'playing') phase.startedAt += pausedFor;
      if (phase.name === 'results') phase.at += pausedFor;
      for (const ball of balls) {
        ball.launchedAt += pausedFor;
        if (ball.landedAt !== undefined) ball.landedAt += pausedFor;
        ball.lastClankAt += pausedFor;
      }
      lastShotAt += pausedFor;
      if (chargingSince !== null) chargingSince += pausedFor;
      renderer.shift(pausedFor);
      detector.reset();
      lockedAimX = null;
      lastFrameAt = null;
      paused = false;
    },

    destroy() {
      for (const cleanup of cleanups) cleanup();
      container.replaceChildren();
    },
  };
}
