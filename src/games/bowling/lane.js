/**
 * The lane, the ball, and the pins, seen from above: a 2D physics model.
 *
 * Distances are metres and match a real lane. x runs across the lane (0 is
 * the middle, positive is right as you face the pins) and z runs down it
 * (0 is the foul line, the head pin stands at `headPinZ`).
 *
 *        pit  ┌─────────────────┐
 *             │   7   8   9  10 │  pin deck, with kickback walls at the sides
 *             │     4   5   6   │
 *             │       2   3     │
 *             │         1       │
 *        gutter│                 │gutter
 *             │   oil (skids)   │  the ball skids straight here…
 *             │                 │
 *             │  ▲  ▲  ▲  ▲  ▲  │  …then grips the dry back end and hooks
 *             └────── foul line ┘
 *
 * The ball and pins are circles that bump into each other. That's enough for
 * pins to scatter believably, bounce off the side walls, and knock each other
 * down, without a full 3D physics engine. A pin hit hard enough falls over and
 * keeps sliding (and can take out more pins); a light touch only makes it wobble.
 *
 * The ball's spin makes it hook. Real lanes are oiled for the first two
 * thirds, so a spinning ball skids straight there and only curves once it
 * reaches the dry wood near the pins. That late break is what makes a hook
 * ball carry so well, and it happens here too.
 */

/**
 * @typedef {object} Pin
 * @property {number} n       pin number, 1 to 10
 * @property {number} x
 * @property {number} z
 * @property {number} vx      m/s
 * @property {number} vz
 * @property {boolean} down   knocked over (or gone into the pit or gutter)
 * @property {number} fallAngle  which way it fell, radians: atan2(vx, vz) when it was knocked
 * @property {number} downAt  simulation time it was knocked over (s), or Infinity
 * @property {boolean} inPit  slid off the back of the deck
 * @property {number} wobble  how hard a standing pin is rocking, 0 to 1 (fades away)
 *
 * @typedef {object} Ball
 * @property {number} x
 * @property {number} z
 * @property {number} vx
 * @property {number} vz
 * @property {number} spin    -1 (hooks hard left) to 1 (hooks hard right)
 * @property {boolean} gutter fell into a gutter: rolls on but can't hit pins
 * @property {number} rolled  distance rolled, for spinning it on screen
 * @property {boolean} inPit
 *
 * @typedef {object} Lane
 * @property {Ball} ball
 * @property {Pin[]} pins
 * @property {number} time    seconds since the ball was released
 * @property {number} firstHitAt  when the ball first reached the pins, or Infinity
 *
 * @typedef {{ type: 'gutter' }
 *   | { type: 'hit', pin: number, speed: number }
 *   | { type: 'pinPin', speed: number }
 *   | { type: 'wall', speed: number }
 *   | { type: 'pit' }} LaneEvent
 */

/** Physics steps this long, however long the frame was, so fast balls can't skip through pins. */
const STEP = 1 / 480;

/**
 * Where the 10 pins stand: a triangle, the head pin nearest the bowler.
 * Pins 2, 4, 7 are on the left; 3, 6, 10 on the right.
 *
 * @param {LaneConfig} config
 * @returns {Array<{ n: number, x: number, z: number }>}
 */
export function pinSpots(config) {
  const spots = [];
  const rowGap = config.pinSpacing * Math.cos(Math.PI / 6);
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k <= row; k++) {
      spots.push({
        n: (row * (row + 1)) / 2 + 1 + k,
        x: (k - row / 2) * config.pinSpacing,
        z: config.headPinZ + row * rowGap,
      });
    }
  }
  return spots;
}

/**
 * Sets up pins for the next ball.
 *
 * @param {LaneConfig} config
 * @param {number[]} [standing]  pin numbers still up; all 10 when left out
 * @returns {Pin[]}
 */
export function rackPins(config, standing) {
  return pinSpots(config)
    .filter((spot) => !standing || standing.includes(spot.n))
    .map((spot) => ({
      ...spot,
      vx: 0,
      vz: 0,
      down: false,
      fallAngle: 0,
      downAt: Infinity,
      inPit: false,
      wobble: 0,
    }));
}

/**
 * Releases a ball onto the lane.
 *
 * @param {{ x: number, angleDeg: number, speed: number, spin: number }} release
 *   x: where along the foul line, angleDeg: off straight (positive = right),
 *   speed: m/s, spin: -1 to 1
 * @param {Pin[]} pins
 * @returns {Lane}
 */
export function rollBall({ x, angleDeg, speed, spin }, pins) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    ball: {
      x,
      z: 0,
      vx: Math.sin(angle) * speed,
      vz: Math.cos(angle) * speed,
      spin,
      gutter: false,
      rolled: 0,
      inPit: false,
    },
    pins,
    time: 0,
    firstHitAt: Infinity,
  };
}

/**
 * Moves everything forward by `seconds`.
 *
 * @param {Lane} lane  changed in place
 * @param {number} seconds
 * @param {LaneConfig} config
 * @param {() => number} [random]  0 to 1, for a little natural variety in how pins bounce
 * @returns {LaneEvent[]}  what happened, for sounds and buzzes
 */
export function stepLane(lane, seconds, config, random = Math.random) {
  const events = [];
  const steps = Math.max(1, Math.round(seconds / STEP));
  const dt = seconds / steps;
  for (let i = 0; i < steps; i++) step(lane, dt, config, random, events);
  for (const pin of lane.pins) pin.wobble *= Math.exp(-seconds / config.wobbleFadeS);
  return events;
}

/** One small physics step. */
function step(lane, dt, config, random, events) {
  const { ball, pins } = lane;
  lane.time += dt;

  // ---- The ball -----------------------------------------------------------
  if (!ball.inPit) {
    if (!ball.gutter) {
      // Hook: only once the ball reaches the dry back end, growing as it goes.
      const grip = clamp01((ball.z - config.oilLength) / config.hookRamp);
      ball.vx += ball.spin * config.hookAccel * grip * dt;
    }
    // Rolling slows a ball only very slightly.
    const speed = Math.hypot(ball.vx, ball.vz);
    if (speed > 0) {
      const slowed = Math.max(0, speed - config.ballDrag * dt) / speed;
      ball.vx *= slowed;
      ball.vz *= slowed;
    }
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    ball.rolled += Math.hypot(ball.vx, ball.vz) * dt;

    // Off the edge of the lane: into the gutter, where it rolls straight on past the pins.
    if (!ball.gutter && Math.abs(ball.x) > config.laneWidth / 2) {
      ball.gutter = true;
      ball.x = Math.sign(ball.x) * (config.laneWidth / 2 + config.gutterWidth / 2);
      ball.vx = 0;
      events.push({ type: 'gutter' });
    }
    if (ball.z > config.pitZ) {
      ball.inPit = true;
      events.push({ type: 'pit' });
    }
  }

  // ---- Pins sliding -------------------------------------------------------
  for (const pin of pins) {
    if (pin.inPit) continue;
    const speed = Math.hypot(pin.vx, pin.vz);
    if (speed > 0) {
      const slowed = Math.max(0, speed - config.pinFriction * dt) / speed;
      pin.vx *= slowed;
      pin.vz *= slowed;
      pin.x += pin.vx * dt;
      pin.z += pin.vz * dt;
    }
    // A pin that slides into the gutter or off the back is down for good.
    if (!pin.down && Math.abs(pin.x) > config.laneWidth / 2) knockDown(pin, lane.time);
    if (pin.z > config.pitZ) {
      pin.inPit = true;
      knockDown(pin, lane.time);
      pin.vx = 0;
      pin.vz = 0;
    }
    // The kickback walls at each side of the deck.
    const wall = config.laneWidth / 2 + config.gutterWidth - radiusOf(pin, config);
    if (Math.abs(pin.x) > wall && pin.z > config.headPinZ - config.kickbackReach) {
      pin.x = Math.sign(pin.x) * wall;
      if (Math.sign(pin.vx) === Math.sign(pin.x)) {
        events.push({ type: 'wall', speed: Math.abs(pin.vx) });
        pin.vx *= -config.wallBounce;
      }
    }
  }

  // ---- Collisions ---------------------------------------------------------
  if (!ball.gutter && !ball.inPit) {
    for (const pin of pins) {
      if (pin.inPit) continue;
      const speed = collide(ball, config.ballMass, config.ballRadius, pin, config, random);
      if (speed > 0) {
        if (lane.firstHitAt === Infinity) lane.firstHitAt = lane.time;
        settlePin(pin, speed, lane.time, config);
        events.push({ type: 'hit', pin: pin.n, speed });
      }
    }
  }
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const a = pins[i];
      const b = pins[j];
      if (a.inPit || b.inPit) continue;
      const speed = collide(a, config.pinMass, radiusOf(a, config), b, config, random);
      if (speed > 0) {
        settlePin(a, speed, lane.time, config);
        settlePin(b, speed, lane.time, config);
        events.push({ type: 'pinPin', speed });
      }
    }
  }
}

/**
 * Bumps two circles apart if they overlap, swapping momentum like billiard
 * balls (heavier things push lighter things further).
 *
 * @returns {number}  how hard they hit (closing speed, m/s), or 0 if they didn't
 */
function collide(a, massA, radiusA, pin, config, random) {
  const dx = pin.x - a.x;
  const dz = pin.z - a.z;
  const reach = radiusA + radiusOf(pin, config);
  const distSq = dx * dx + dz * dz;
  if (distSq >= reach * reach || distSq === 0) return 0;
  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const nz = dz / dist;

  // Push them apart so they no longer overlap, the lighter one further.
  const massB = config.pinMass;
  const overlap = reach - dist;
  const shareA = massB / (massA + massB);
  a.x -= nx * overlap * shareA;
  a.z -= nz * overlap * shareA;
  pin.x += nx * overlap * (1 - shareA);
  pin.z += nz * overlap * (1 - shareA);

  // How fast they're closing along the line between their centres.
  const closing = (a.vx - pin.vx) * nx + (a.vz - pin.vz) * nz;
  if (closing <= 0) return 0;
  const bounce = config.pinBounce + (random() - 0.5) * config.bounceVariety;
  const impulse = ((1 + bounce) * closing) / (1 / massA + 1 / massB);
  a.vx -= (impulse / massA) * nx;
  a.vz -= (impulse / massA) * nz;
  pin.vx += (impulse / massB) * nx;
  pin.vz += (impulse / massB) * nz;
  return closing;
}

/**
 * After a knock: a pin pushed fast enough topples; a light knock only rocks
 * it, and it stays where it stands.
 */
function settlePin(pin, speed, time, config) {
  if (pin.down) return;
  if (Math.hypot(pin.vx, pin.vz) >= config.knockSpeed) {
    knockDown(pin, time);
  } else {
    pin.vx = 0;
    pin.vz = 0;
    pin.wobble = Math.min(1, pin.wobble + speed / config.knockSpeed);
  }
}

function knockDown(pin, time) {
  if (pin.down) return;
  pin.down = true;
  pin.downAt = time;
  pin.fallAngle = Math.atan2(pin.vx, pin.vz);
  pin.wobble = 0;
}

/** A standing pin is as wide as its belly; a fallen one sweeps a wider area. */
const radiusOf = (pin, config) => (pin.down ? config.fallenPinRadius : config.pinRadius);

/**
 * Has everything stopped? The ball is gone and no pin is still moving.
 *
 * @param {Lane} lane
 * @param {LaneConfig} config
 */
export function laneSettled(lane, config) {
  const ballGone = lane.ball.inPit || Math.hypot(lane.ball.vx, lane.ball.vz) < 0.05;
  if (!ballGone) return false;
  const still = lane.pins.every(
    (pin) => pin.inPit || Math.hypot(pin.vx, pin.vz) < config.restSpeed,
  );
  return still || lane.time - lane.firstHitAt > config.maxSettleS;
}

/**
 * Pin numbers still standing.
 *
 * @param {Pin[]} pins
 */
export function standingPins(pins) {
  return pins.filter((pin) => !pin.down).map((pin) => pin.n);
}

/**
 * Names a leave, for the callout: a split is when the head pin is down and
 * the pins left have a gap between them with nothing in front.
 *
 * @param {number[]} standing  pin numbers
 */
export function isSplit(standing) {
  if (standing.includes(1) || standing.length < 2) return false;
  // Pin columns across the deck, left to right, by pin number.
  const column = { 7: 0, 4: 1, 2: 2, 8: 2, 1: 3, 5: 3, 3: 4, 9: 4, 6: 5, 10: 6 };
  const columns = [...new Set(standing.map((n) => column[n]))].sort((a, b) => a - b);
  return columns.some((c, i) => i > 0 && c - columns[i - 1] > 1);
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * @typedef {object} LaneConfig
 * @property {number} laneWidth
 * @property {number} gutterWidth
 * @property {number} headPinZ
 * @property {number} pinSpacing
 * @property {number} pitZ
 * @property {number} kickbackReach   how far in front of the head pin the side walls start
 * @property {number} ballRadius
 * @property {number} ballMass
 * @property {number} ballDrag        m/s²
 * @property {number} pinRadius
 * @property {number} fallenPinRadius
 * @property {number} pinMass
 * @property {number} pinFriction     m/s², how quickly a knocked pin slows
 * @property {number} pinBounce       0 to 1
 * @property {number} bounceVariety
 * @property {number} wallBounce
 * @property {number} knockSpeed      m/s: pushed faster than this, a pin falls
 * @property {number} wobbleFadeS
 * @property {number} restSpeed
 * @property {number} maxSettleS
 * @property {number} oilLength       where the dry back end starts
 * @property {number} hookRamp        over how many metres the hook builds up
 * @property {number} hookAccel       m/s² of sideways pull at full spin on dry wood
 */
