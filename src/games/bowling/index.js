/**
 * Bowling: a full 10-frame game on a 3D lane. Point your phone left or right
 * to line up along the foul line, then hold Fire to pick up the ball, swing
 * your arm back and forward underhand, and let go of Fire to roll. Swing
 * faster for a faster ball; twist your wrist as you let go to hook it.
 *
 * Files in this folder:
 *   index.js    this file: settings, screens, rolling, and the game loop
 *   lane.js     the ball and pins seen from above: physics, hooks, pins knocking pins (tested)
 *   throw.js    reading speed, aim, and spin from the swing (tested)
 *   scoring.js  ten-pin scoring: strikes, spares, the 10th frame (tested)
 *   render.js   drawing the alley in 3D with three.js
 *   sounds.js   sound effects, made with the shared synthesizer
 */
import './bowling.css';
import { createAimTracker, loadAimSettings } from '../../aim/index.js';
import { playerColor, playerLabel } from '../../core/players.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { createPersonalBest } from '../shared/personal-best.js';
import { isSplit, laneSettled, rackPins, rollBall, standingPins, stepLane } from './lane.js';
import meta from './meta.js';
import { createRenderer } from './render.js';
import { nextRoll, scorecard, totalScore } from './scoring.js';
import { createSounds } from './sounds.js';
import { createThrowMemory, releaseBall } from './throw.js';

/**
 * Every number that shapes how the game feels, in one place. Distances are
 * in metres and match a real lane; times are in milliseconds unless they say
 * otherwise.
 */
export const CONFIG = {
  /** The lane and the physics on it (lane.js explains each one). */
  lane: {
    laneWidth: 1.054,
    gutterWidth: 0.235,
    /** From the foul line to the head pin: 60 feet. */
    headPinZ: 18.29,
    /** Pins stand 12 inches apart. */
    pinSpacing: 0.3048,
    /** The back edge of the pin deck, where pins and the ball drop into the pit. */
    pitZ: 19.35,
    kickbackReach: 0.4,
    ballRadius: 0.108,
    ballMass: 6.8,
    ballDrag: 0.12,
    pinRadius: 0.0605,
    fallenPinRadius: 0.1,
    pinMass: 1.5,
    pinFriction: 4,
    pinBounce: 0.45,
    bounceVariety: 0.15,
    wallBounce: 0.5,
    /** Pushed faster than this (m/s), a pin falls; slower, it only wobbles. */
    knockSpeed: 0.6,
    wobbleFadeS: 0.5,
    restSpeed: 0.03,
    /** Stop waiting for pins to settle this long (s) after the ball reaches them. */
    maxSettleS: 3,
    /** The oil pattern: the ball skids straight for this far… */
    oilLength: 12,
    /** …then the hook builds up over this many metres… */
    hookRamp: 3,
    /** …to this much sideways pull (m/s²) at full spin. */
    hookAccel: 1.6,
  },

  /** Reading the throw (throw.js explains each one). Swing speeds are °/s. */
  throw: {
    swingWindowMs: 250,
    aimWindowMs: 120,
    spinWindowMs: 180,
    weakest: 100,
    strongest: 700,
    /** Letting go while swinging slower than this puts the ball back down, with a hint. */
    minSwing: 90,
    /** Ball speeds (m/s) for the weakest and strongest swings: about 10 and 21 mph. */
    slowestBall: 4.5,
    fastestBall: 9.5,
    turnDeadzone: 25,
    degreesPerTurn: 0.015,
    maxAngle: 3.5,
    twistDeadzone: 60,
    fullTwist: 450,
  },

  /** Lining up: how far along the foul line (m) the ball moves per screen height of pointing. */
  position: { gain: 0.9 },

  /**
   * Holding Fire charges a meter that swings up and down; let go to roll.
   * 'auto' allows it only for phones that send no motion data (no gyroscope),
   * so everyone else has to make the bowling motion. 'always' or 'never' to override.
   */
  charge: { mode: 'auto', cycleMs: 1600 },

  timing: {
    /** How long the result shows before the next ball. */
    resultMs: 1700,
    strikeResultMs: 2400,
    /** Give up on a roll this long (s) after release, whatever the pins are doing. */
    maxRollS: 9,
    /** Ignore the trigger this long after the game ends. */
    gameOverLockMs: 1500,
    /** How often a slice of rolling rumble plays. */
    rumbleEveryMs: 110,
  },

  vibration: {
    grab: 12,
    release: 25,
    hit: 35,
    strike: [70, 40, 70, 40, 140],
    spare: [50, 30, 90],
  },

  sound: { volume: 0.45 },
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

/** A run of strikes has a name. */
const STRIKE_NAMES = { 2: 'Double!', 3: 'Turkey!' };

/**
 * @param {HTMLElement} container
 * @param {import('../game.js').GameController} controller
 */
function createSession(container, controller) {
  container.innerHTML = `
    <div class="bw card">
      <canvas class="bw-canvas"></canvas>
      <header class="bw-card-row" aria-label="Scorecard"></header>
      <p class="bw-callout" aria-live="polite"></p>
      <p class="bw-prompt"></p>
      <p class="bw-readout"></p>
      <div class="bw-screen"></div>
      <button type="button" class="bw-sound">Sound is off. Click here to turn it on.</button>
    </div>`;
  const root = /** @type {HTMLElement} */ (container.querySelector('.bw'));
  const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('.bw-canvas'));
  const card = /** @type {HTMLElement} */ (root.querySelector('.bw-card-row'));
  const callout = /** @type {HTMLElement} */ (root.querySelector('.bw-callout'));
  const prompt = /** @type {HTMLElement} */ (root.querySelector('.bw-prompt'));
  const readout = /** @type {HTMLElement} */ (root.querySelector('.bw-readout'));
  const screen = /** @type {HTMLElement} */ (root.querySelector('.bw-screen'));
  const soundButton = /** @type {HTMLElement} */ (root.querySelector('.bw-sound'));

  const tracker = createAimTracker(loadAimSettings());
  const renderer = createRenderer(canvas, CONFIG);
  const sounds = createSounds(CONFIG.sound);
  const best = createPersonalBest(id);
  const memory = createThrowMemory(CONFIG.throw);
  const cleanups = [() => renderer.destroy()];

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
  // Single-player: the lowest-numbered player bowls.
  const activePlayer = () => controller.players.list().find((player) => player.slot !== null);

  // ---- Game state ---------------------------------------------------------
  /**
   * The game's own clock (ms). It only runs while the game isn't paused, so
   * pausing needs no bookkeeping: every timer here is measured on it.
   */
  let clock = 0;
  /**
   * @type {{ name: 'title' }
   *   | { name: 'aiming' }
   *   | { name: 'rolling' }
   *   | { name: 'result', at: number, waitMs: number }
   *   | { name: 'over', at: number }}
   */
  let phase = { name: 'title' };
  /** Pins knocked down by each ball so far. */
  let rolls = [];
  /** The ball about to be (or being) rolled. */
  let current = nextRoll([]);
  /** @type {import('./lane.js').Pin[]} */
  let pins = rackPins(CONFIG.lane);
  /** @type {import('./lane.js').Lane | null} */
  let lane = null;
  let strikeStreak = 0;
  let personalBest = best.load();
  let lastRumbleAt = -Infinity;
  /** Whether this roll's ball has crashed into the pins yet. */
  let crashed = false;

  /** Where the ball is held along the foul line (m), following the phone… */
  let holdX = 0;
  /** …until it's picked up, when it stays put through the swing. */
  let lockedX = null;
  /** When Fire was pressed to pick up the ball, if it's held. */
  let holdingSince = null;
  /** When the no-gyroscope charge meter started, if charging. */
  let chargingSince = null;
  /**
   * Set when Fire is let go. The throw is read on the next frame, after the
   * tracker has caught up on every motion sample from before the release.
   */
  let pendingRelease = false;

  function showTitle() {
    phase = { name: 'title' };
    root.dataset.phase = 'title';
    const player = activePlayer();
    screen.innerHTML = `
      <h1>${name}</h1>
      <p>${description}</p>
      <p class="bw-rules">
        Point your phone left or right to <b>line up</b>. <b>Hold Fire</b> to pick up the ball,
        <b>swing your arm back and forward</b> underhand, and <b>let go of Fire</b> to roll it.
        Swing faster for a faster ball. <b>Twist your wrist</b> like a doorknob as you let go to
        hook it: clockwise curves right, anticlockwise curves left.
      </p>
      <p class="bw-cta">${
        player
          ? `<span class="bw-player" style="--player: ${playerColor(player.slot)}">${playerLabel(player.slot)}</span> Pull the trigger to start`
          : 'Scan the QR code with your phone to join'
      }</p>
      <p class="bw-hint">Aim for the pocket: just to the right of the head pin.${
        personalBest ? ` Your best game: <b>${personalBest}</b>.` : ''
      }</p>`;
    drawCard();
  }

  function startGame() {
    rolls = [];
    strikeStreak = 0;
    screen.innerHTML = '';
    readout.textContent = '';
    setUpBall();
  }

  /** Sets the pins for the next ball, or ends the game after the last one. */
  function setUpBall() {
    const next = nextRoll(rolls);
    if (!next) return finish();
    const left = standingPins(pins);
    current = next;
    pins = next.freshRack ? rackPins(CONFIG.lane) : rackPins(CONFIG.lane, left);
    lane = null;
    lockedX = null;
    holdingSince = null;
    chargingSince = null;
    pendingRelease = false;
    phase = { name: 'aiming' };
    root.dataset.phase = 'aiming';
    prompt.innerHTML = `<b>Frame ${next.frame + 1}</b> · Ball ${next.ball + 1}${
      next.freshRack ? '' : ` · ${pins.length} pin${pins.length === 1 ? '' : 's'} left`
    }`;
    drawCard();
  }

  function finish() {
    const total = totalScore(rolls);
    const isNewBest = total > personalBest;
    if (isNewBest) {
      personalBest = total;
      best.save(total);
    }
    phase = { name: 'over', at: clock };
    root.dataset.phase = 'over';
    lane = null;
    sounds.finish();
    if (isNewBest) sounds.newBest();
    const frames = scorecard(rolls);
    const strikes = frames.reduce((n, f) => n + f.marks.filter((m) => m === 'X').length, 0);
    const spares = frames.reduce((n, f) => n + f.marks.filter((m) => m === '/').length, 0);
    screen.innerHTML = `
      <p class="eyebrow">Game over</p>
      <h1 class="bw-final">${total}</h1>
      ${isNewBest ? '<p class="bw-best">New personal best!</p>' : ''}
      <dl class="bw-results">
        <div><dt>Strikes</dt><dd>${strikes}</dd></div>
        <div><dt>Spares</dt><dd>${spares}</dd></div>
        <div><dt>Personal best</dt><dd>${personalBest}</dd></div>
      </dl>
      <p class="bw-cta">Pull the trigger to bowl again</p>`;
    drawCard();
  }

  // ---- The scorecard ------------------------------------------------------
  function drawCard() {
    const frames = scorecard(rolls);
    const playing = phase.name !== 'title' && phase.name !== 'over';
    card.innerHTML =
      frames
        .map((frame, f) => {
          const boxes = f === 9 ? 3 : 2;
          const marks = Array.from(
            { length: boxes },
            (_, i) => `<span>${frame.marks[i] ?? ''}</span>`,
          ).join('');
          const isCurrent = playing && current?.frame === f;
          return `<div class="bw-frame${isCurrent ? ' is-current' : ''}${f === 9 ? ' is-tenth' : ''}">
            <small>${f + 1}</small>
            <div class="bw-marks">${marks}</div>
            <b>${frame.total ?? ''}</b>
          </div>`;
        })
        .join('') +
      `<div class="bw-frame is-total"><small>Total</small><b>${totalScore(rolls)}</b></div>`;
  }

  // ---- Rolling ------------------------------------------------------------
  function grab(player) {
    holdingSince = clock;
    lockedX = holdX;
    memory.clear();
    sounds.grab();
    controller.vibrate(player.id, CONFIG.vibration.grab);
  }

  /** Reads the swing that's just ended and rolls the ball, or puts it back if there was no swing. */
  function throwFromSwing() {
    pendingRelease = false;
    const measured = memory.read();
    if (measured.swing < CONFIG.throw.minSwing) {
      lockedX = null;
      showCallout('Swing your arm forward as you let go!', 'hint');
      return;
    }
    roll(releaseBall(measured, CONFIG.throw));
  }

  /**
   * Sends the ball down the lane.
   *
   * @param {{ speed: number, angleDeg: number, spin: number }} release
   */
  function roll(release) {
    const player = activePlayer();
    const x = lockedX ?? holdX;
    lockedX = x;
    lane = rollBall({ ...release, x }, pins);
    pins = lane.pins;
    phase = { name: 'rolling' };
    root.dataset.phase = 'rolling';
    lastRumbleAt = -Infinity;
    crashed = false;
    sounds.release();
    if (player) controller.vibrate(player.id, CONFIG.vibration.release);
    readout.textContent = describeRelease(release);
  }

  /** "16.8 mph · 1.2° left · hooks right", for tuning the feel. */
  function describeRelease({ speed, angleDeg, spin }) {
    const mph = (speed * 2.23694).toFixed(1);
    const angle =
      Math.abs(angleDeg) < 0.05
        ? 'straight'
        : `${Math.abs(angleDeg).toFixed(1)}° ${angleDeg > 0 ? 'right' : 'left'}`;
    const hook =
      spin === 0
        ? 'no hook'
        : `${Math.abs(spin) > 0.6 ? 'big ' : ''}hook ${spin > 0 ? 'right' : 'left'}`;
    return `${mph} mph · ${angle} · ${hook}`;
  }

  /** Plays the sounds and buzzes for what just happened on the lane. */
  function react(events) {
    for (const event of events) {
      if (event.type === 'hit') sounds.clatter(event.speed, clock);
      else if (event.type === 'pinPin' || event.type === 'wall')
        sounds.clatter(event.speed * 0.6, clock);
      else if (event.type === 'gutter') sounds.gutter();
    }
    // The moment the ball first reaches the pins: a big crash, and a buzz.
    if (lane && lane.firstHitAt !== Infinity && !crashed) {
      crashed = true;
      sounds.crash(Math.hypot(lane.ball.vx, lane.ball.vz) + 2);
      const player = activePlayer();
      if (player) controller.vibrate(player.id, CONFIG.vibration.hit);
    }
  }

  /** The ball and pins have stopped: count them, say what happened, and move on. */
  function endRoll() {
    const down = pins.filter((pin) => pin.down).length;
    const left = standingPins(pins);
    const fresh = current.freshRack;
    rolls.push(down);
    const player = activePlayer();

    let waitMs = CONFIG.timing.resultMs;
    if (fresh && left.length === 0) {
      strikeStreak += 1;
      showCallout(
        strikeStreak >= 4 ? `${strikeStreak} in a row!` : (STRIKE_NAMES[strikeStreak] ?? 'Strike!'),
        'strike',
      );
      sounds.strike(strikeStreak);
      if (player) controller.vibrate(player.id, CONFIG.vibration.strike);
      waitMs = CONFIG.timing.strikeResultMs;
    } else {
      strikeStreak = 0;
      if (left.length === 0) {
        showCallout('Spare!', 'spare');
        sounds.spare();
        if (player) controller.vibrate(player.id, CONFIG.vibration.spare);
      } else if (down === 0) {
        showCallout(lane?.ball.gutter ? 'Gutter ball' : 'Missed', 'miss');
        sounds.aww();
      } else if (fresh && isSplit(left)) {
        showCallout(`Split! ${down}`, 'split');
      } else {
        showCallout(`${down} pin${down === 1 ? '' : 's'}`, 'count');
      }
    }
    phase = { name: 'result', at: clock, waitMs };
    root.dataset.phase = 'result';
    drawCard();
  }

  let calloutTimer = null;
  /** Shows a big message over the lane for a moment. */
  function showCallout(text, kind) {
    callout.textContent = text;
    callout.className = `bw-callout is-${kind}`;
    // Restart the pop-in animation.
    void callout.offsetWidth;
    callout.classList.add('is-shown');
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => callout.classList.remove('is-shown'), 1500);
  }
  cleanups.push(() => clearTimeout(calloutTimer));

  // ---- Input --------------------------------------------------------------
  let paused = false;

  cleanups.push(
    tracker.onMotion((playerId, rates, t, body) => {
      // Keep recording until a release is read: the last samples before letting go are
      // replayed on the frame after the button message, and they matter most.
      const recording = holdingSince !== null || pendingRelease;
      if (recording && playerId === activePlayer()?.id) {
        memory.add({ t, swing: rates.pitch, turn: rates.yaw, twist: body.twist });
      }
    }),
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

  /** The trigger: starts games; while lining up, holding it picks up the ball and letting go rolls. */
  function trigger(player, down) {
    if (phase.name === 'title' && down) return startGame();
    if (phase.name === 'over' && down && clock - phase.at >= CONFIG.timing.gameOverLockMs) {
      return startGame();
    }
    if (phase.name !== 'aiming') return;
    if (mayCharge(player)) {
      if (down) {
        chargingSince = clock;
        lockedX = holdX;
      } else if (chargingSince !== null) {
        const norm = chargeAt();
        chargingSince = null;
        const { weakest, strongest } = CONFIG.throw;
        roll(
          releaseBall(
            { swing: weakest + norm * (strongest - weakest), turn: 0, twist: 0 },
            CONFIG.throw,
          ),
        );
      }
      return;
    }
    if (down) grab(player);
    else if (holdingSince !== null) {
      holdingSince = null;
      pendingRelease = true;
    }
  }

  /** May this player use the hold-Fire charged roll? */
  function mayCharge(player) {
    if (CONFIG.charge.mode === 'always') return true;
    if (CONFIG.charge.mode === 'never') return false;
    return tracker.get(player.id).lastSample === null; // no motion data: no gyroscope
  }

  /** The charge meter swings from empty to full and back, over and over. */
  function chargeAt() {
    const t = ((clock - chargingSince) % CONFIG.charge.cycleMs) / CONFIG.charge.cycleMs;
    return t < 0.5 ? t * 2 : 2 - t * 2;
  }

  // ---- The game loop ------------------------------------------------------
  // About 60 times a second:
  //   1. the aim tracker catches up on phone movement (and the swing memory with it);
  //   2. the game moves forward: a throw is read, the ball and pins move, results show;
  //   3. everything is redrawn.
  // While paused, frames are skipped, so the picture freezes and the clock stops.
  let lastFrameAt = null;
  let frameRequest = requestAnimationFrame(function frame(now) {
    const dt = lastFrameAt === null ? 0 : Math.min(50, now - lastFrameAt);
    lastFrameAt = now;
    if (size.height > 0 && !paused) {
      clock += dt;
      tracker.update(now, size.width / size.height);
      advance(dt);
      draw(now);
    }
    frameRequest = requestAnimationFrame(frame);
  });
  cleanups.push(() => cancelAnimationFrame(frameRequest));

  function advance(dt) {
    const player = activePlayer();
    if (phase.name === 'aiming' && player && lockedX === null) {
      const limit = CONFIG.lane.laneWidth / 2 - CONFIG.lane.ballRadius - 0.01;
      const aim = tracker.get(player.id);
      holdX = Math.max(-limit, Math.min(limit, aim.x * CONFIG.position.gain));
    }

    if (pendingRelease) throwFromSwing();

    if (phase.name === 'rolling' && lane) {
      react(stepLane(lane, dt / 1000, CONFIG.lane));
      const ball = lane.ball;
      if (!ball.inPit && clock - lastRumbleAt >= CONFIG.timing.rumbleEveryMs) {
        lastRumbleAt = clock;
        sounds.roll(Math.hypot(ball.vx, ball.vz), ball.gutter);
      }
      if (laneSettled(lane, CONFIG.lane) || lane.time > CONFIG.timing.maxRollS) endRoll();
    } else if (phase.name === 'result' && clock - phase.at >= phase.waitMs) {
      setUpBall();
    }
  }

  function draw(now) {
    const player = activePlayer();
    const aiming = phase.name === 'aiming';
    const ballNearPins = lane && (lane.ball.z > CONFIG.lane.headPinZ - 4 || lane.ball.inPit);
    renderer.draw({
      now,
      view:
        phase.name === 'result' || (phase.name === 'rolling' && ballNearPins)
          ? 'pins'
          : phase.name === 'rolling'
            ? 'follow'
            : 'approach',
      holdX: lockedX ?? holdX,
      holding: holdingSince !== null || chargingSince !== null,
      showGuide: aiming,
      lane: phase.name === 'rolling' || phase.name === 'result' ? lane : null,
      pins,
      pinTime: lane?.time ?? 0,
      ballColor: player ? playerColor(player.slot) : '#6c3bd1',
    });
    if (chargingSince !== null) readout.textContent = `Power ${Math.round(chargeAt() * 100)}%`;
  }

  showTitle();

  return {
    pause() {
      paused = true;
    },

    /** The game clock simply stopped while paused, so there's nothing to shift. */
    resume() {
      if (!paused) return;
      // A swing interrupted by the pause doesn't count.
      if (holdingSince !== null) {
        holdingSince = null;
        lockedX = null;
      }
      pendingRelease = false;
      memory.clear();
      lastFrameAt = null;
      paused = false;
    },

    destroy() {
      for (const cleanup of cleanups) cleanup();
      container.replaceChildren();
    },
  };
}
