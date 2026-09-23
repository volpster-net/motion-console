/**
 * The court and the ball's flight, as pure maths: no screen, sound, or clock.
 *
 * The world is measured in metres, seen from the shooter:
 *   x: left (−) to right (+)
 *   y: height above the floor
 *   z: distance forwards, from the point where the ball leaves your hands
 *
 * The rim is a horizontal ring at the far end of the court; the backboard is
 * a flat panel just behind it.
 *
 * How a shot flies, in plain language
 * -----------------------------------
 * Every tiny slice of time (a few milliseconds), the ball moves in a straight
 * line at its current speed, and gravity pulls its upward speed down a
 * little. Repeat that a few hundred times and you get a smooth arc. After
 * each slice we check whether the ball is touching the rim, the backboard,
 * or the floor, and if so, bounce it off.
 */

/**
 * @typedef {typeof import('./index.js').CONFIG} Config
 * @typedef {{ x: number, y: number, z: number }} Vec
 *
 * @typedef {object} Ball
 * @property {number} id
 * @property {Vec} p                 position (m)
 * @property {Vec} v                 velocity (m/s)
 * @property {number} spin           for drawing only: how far the ball has rotated
 * @property {number} launchedAt     ms
 * @property {number} [landedAt]     ms, first time it hit the floor
 * @property {boolean} touchedRim
 * @property {boolean} touchedBoard
 * @property {boolean} scored
 * @property {'short' | 'long' | 'wide' | null} crossing  where it came down past rim height, if it missed
 * @property {number} lastClankAt    ms, so rapid rim contacts make one sound
 */

/** Longest slice of time simulated in one go. Smaller = more accurate bounces. */
const MAX_STEP_S = 1 / 240;

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Where the backboard's front face is, and how big it is. */
export function boardOf(hoopX, config) {
  const { rimHeight, rimRadius, distance, board } = config.court;
  const bottom = rimHeight + board.bottomAboveRim;
  return {
    z: distance + rimRadius + board.gap,
    left: hoopX - board.width / 2,
    right: hoopX + board.width / 2,
    bottom,
    top: bottom + board.height,
  };
}

/**
 * Where the hoop is, left to right, at a point in the round. It stays in the
 * middle at first, then starts sliding side to side, further as time goes on.
 *
 * @param {number} progress  0 at the start of the round, 1 at the end
 * @param {number} elapsedMs time since the round started
 * @param {Config} config
 */
export function hoopXAt(progress, elapsedMs, config) {
  const { fromProgress, amplitude, periodMs } = config.court.hoopMotion;
  if (progress < fromProgress) return 0;
  // How far into the moving part of the round we are, 0 to 1.
  const t = (progress - fromProgress) / (1 - fromProgress);
  const reach = amplitude.start + (amplitude.end - amplitude.start) * t;
  const sinceMoving = elapsedMs - fromProgress * config.round.durationMs;
  return reach * Math.sin((sinceMoving / periodMs) * Math.PI * 2);
}

/**
 * Turns a shot's strength into its power.
 *
 * `norm` places the arm push between the weakest (0) and strongest (1)
 * pushes we expect. Inside the sweet spot around the middle the shot flies exactly
 * as far as it should; outside it, the ball flies proportionally short or
 * long. `speedError` is that mistake: −0.1 means 10% too slow.
 *
 * @param {number} norm  0 to 1
 * @param {Config} config
 */
export function powerFromNorm(norm, config) {
  const { sweetSpot, sweetBand, powerGain } = config.shot;
  const clamped = Math.min(1, Math.max(0, norm));
  const offBy = clamped - sweetSpot;
  const outside = Math.max(0, Math.abs(offBy) - sweetBand);
  return { norm: clamped, speedError: Math.sign(offBy) * outside * powerGain };
}

/**
 * The ball's starting velocity for a shot aimed at `targetX` (metres left or
 * right, at the rim's distance).
 *
 * The shot always leaves at the same upward angle. We work out the exact
 * speed that would carry the ball from your hands to the rim's height at the
 * rim's distance (a standard projectile formula), then make it too slow or too
 * fast by the power's `speedError`.
 *
 * @param {number} targetX
 * @param {number} speedError
 * @param {Config} config
 * @returns {Vec}
 */
export function launchVelocity(targetX, speedError, config) {
  const { gravity, rimHeight, distance, releaseHeight, launchAngleDeg } = config.court;
  const angle = (launchAngleDeg * Math.PI) / 180;
  const across = Math.hypot(targetX, distance); // flat distance to the target
  const rise = rimHeight - releaseHeight;
  // From height = across·tan(angle) − g·across² / (2·speed²·cos²(angle)), solved for speed.
  const room = across * Math.tan(angle) - rise;
  const perfect = Math.sqrt((gravity * across * across) / (2 * Math.cos(angle) ** 2 * room));
  const speed = perfect * (1 + speedError);
  const heading = Math.atan2(targetX, distance); // left/right direction
  const flat = speed * Math.cos(angle);
  return { x: flat * Math.sin(heading), y: speed * Math.sin(angle), z: flat * Math.cos(heading) };
}

/**
 * A new ball leaving the shooter's hands.
 *
 * @param {{ id: number, velocity: Vec, now: number, config: Config }} options
 * @returns {Ball}
 */
export function createBall({ id, velocity, now, config }) {
  return {
    id,
    p: { x: 0, y: config.court.releaseHeight, z: 0 },
    v: { ...velocity },
    spin: 0,
    launchedAt: now,
    touchedRim: false,
    touchedBoard: false,
    scored: false,
    crossing: null,
    lastClankAt: -Infinity,
  };
}

/**
 * Bounces the ball off a surface: the part of its velocity heading into the
 * surface is reversed and weakened by `bounce` (1 = perfect bounce, 0 = thud).
 *
 * @param {Ball} ball
 * @param {Vec} normal   unit vector pointing away from the surface
 * @param {number} bounce
 */
function reflect(ball, normal, bounce) {
  const into = dot(ball.v, normal);
  if (into >= 0) return; // already moving away
  ball.v.x -= (1 + bounce) * into * normal.x;
  ball.v.y -= (1 + bounce) * into * normal.y;
  ball.v.z -= (1 + bounce) * into * normal.z;
}

/**
 * Moves a ball forward by `seconds`, bouncing it off the rim, backboard, and
 * floor. Returns what it touched, for sounds and scoring.
 *
 * @param {Ball} ball
 * @param {number} seconds
 * @param {number} hoopX
 * @param {number} now  ms, for timestamps
 * @param {Config} config
 * @returns {Array<'rim' | 'board' | 'score' | 'floor'>}
 */
export function stepBall(ball, seconds, hoopX, now, config) {
  const c = config.court;
  const events = [];
  const board = boardOf(hoopX, config);
  const steps = Math.max(1, Math.ceil(seconds / MAX_STEP_S));
  const dt = seconds / steps;

  for (let i = 0; i < steps; i++) {
    const wasAbove = ball.p.y > c.rimHeight;
    ball.v.y -= c.gravity * dt;
    ball.p.x += ball.v.x * dt;
    ball.p.y += ball.v.y * dt;
    ball.p.z += ball.v.z * dt;
    ball.spin += dt * 6;

    // Coming down through rim height: in, or where it missed.
    if (wasAbove && ball.p.y <= c.rimHeight && ball.v.y < 0 && !ball.scored) {
      const fromCentre = Math.hypot(ball.p.x - hoopX, ball.p.z - c.distance);
      if (fromCentre < c.rimRadius) {
        ball.scored = true;
        events.push('score');
        // The net catches it: it drops almost straight down.
        ball.v.x *= 0.2;
        ball.v.z *= 0.2;
      } else if (ball.crossing === null) {
        const dz = ball.p.z - c.distance;
        ball.crossing =
          Math.abs(ball.p.x - hoopX) > Math.abs(dz) ? 'wide' : dz < 0 ? 'short' : 'long';
      }
    }

    if (!ball.scored) {
      // The rim is a thin ring. Find the point on the ring nearest the ball:
      // straight out from the rim's centre, in the ball's direction.
      const out = { x: ball.p.x - hoopX, z: ball.p.z - c.distance };
      const across = Math.hypot(out.x, out.z) || 1;
      const nearest = {
        x: hoopX + (out.x / across) * c.rimRadius,
        y: c.rimHeight,
        z: c.distance + (out.z / across) * c.rimRadius,
      };
      const gap = { x: ball.p.x - nearest.x, y: ball.p.y - nearest.y, z: ball.p.z - nearest.z };
      const distance = Math.hypot(gap.x, gap.y, gap.z);
      const touching = c.ballRadius + c.rimTube;
      if (distance < touching && distance > 0) {
        const normal = { x: gap.x / distance, y: gap.y / distance, z: gap.z / distance };
        // Push the ball back out of the rim, then bounce it.
        ball.p.x = nearest.x + normal.x * touching;
        ball.p.y = nearest.y + normal.y * touching;
        ball.p.z = nearest.z + normal.z * touching;
        reflect(ball, normal, c.rimBounce);
        ball.touchedRim = true;
        if (now - ball.lastClankAt > 120) {
          ball.lastClankAt = now;
          events.push('rim');
        }
      }

      // The backboard: a flat panel facing the shooter.
      const front = ball.p.z + c.ballRadius;
      const withinBoard =
        ball.p.x > board.left - c.ballRadius &&
        ball.p.x < board.right + c.ballRadius &&
        ball.p.y > board.bottom - c.ballRadius &&
        ball.p.y < board.top + c.ballRadius;
      if (withinBoard && front > board.z && ball.p.z < board.z && ball.v.z > 0) {
        ball.p.z = board.z - c.ballRadius;
        reflect(ball, { x: 0, y: 0, z: -1 }, c.boardBounce);
        if (!ball.touchedBoard) events.push('board');
        ball.touchedBoard = true;
      }
    }

    // The floor.
    if (ball.p.y < c.ballRadius) {
      ball.p.y = c.ballRadius;
      reflect(ball, { x: 0, y: 1, z: 0 }, c.floorBounce);
      ball.v.x *= 0.8;
      ball.v.z *= 0.8;
      if (ball.landedAt === undefined) {
        ball.landedAt = now;
        events.push('floor');
      }
    }
  }
  return events;
}

/**
 * How a finished (or scored) shot is described.
 *
 * @param {Ball} ball
 * @returns {'swish' | 'bank' | 'make' | 'rimmed' | 'board' | 'short' | 'long' | 'wide'}
 */
export function shotResult(ball) {
  if (ball.scored) {
    if (ball.touchedBoard) return 'bank';
    return ball.touchedRim ? 'make' : 'swish';
  }
  if (ball.touchedRim) return 'rimmed';
  if (ball.touchedBoard) return 'board';
  // Never came down past rim height (a weak shot), or where it did.
  return ball.crossing ?? 'short';
}

/**
 * Has this ball finished its shot, so it can be removed?
 *
 * @param {Ball} ball
 * @param {number} now
 * @param {Config} config
 */
export function ballIsDone(ball, now, config) {
  const { maxFlightMs, afterLandingMs } = config.court;
  if (now - ball.launchedAt > maxFlightMs) return true;
  return ball.landedAt !== undefined && now - ball.landedAt > afterLandingMs;
}

/**
 * Where a point in the world appears on screen, looking down the court from
 * just behind the shooter. Things further away are drawn smaller and closer
 * to the horizon: screen position = world position ÷ distance from the eye.
 *
 * @param {Vec} point
 * @param {{ width: number, height: number }} size  canvas size in pixels
 * @param {Config} config
 * @returns {{ x: number, y: number, scale: number }}  `scale` is pixels per metre at that distance
 */
export function project(point, size, config) {
  const { height: eyeHeight, behind, focal, horizon } = config.court.camera;
  const depth = Math.max(0.05, point.z + behind);
  const scale = (focal * size.height) / depth;
  return {
    x: size.width / 2 + point.x * scale,
    y: horizon * size.height - (point.y - eyeHeight) * scale,
    scale,
  };
}
