/**
 * The ballpark and the ball, as pure maths: no screen, sound, or clock.
 *
 * The world is measured in metres, looking out from home plate:
 *   x: left field (−) to right field (+)
 *   y: height above the ground
 *   z: distance out towards centre field; the pitcher's mound is at z ≈ 18
 *
 * How a hit is decided, in plain language
 * ---------------------------------------
 * Only timing matters (plus a little swing speed), like Wii Sports:
 * - How close your swing was to the ball reaching the plate sets how
 *   *well* you hit it: dead on is a hard, rising drive; a bit off is a weak
 *   one; too far off is a miss.
 * - Whether you were early or late sets the *direction*: early pulls the
 *   ball to left field, late pushes it to right field, and very early or
 *   late sends it foul.
 * Then the ball flies with gravity and air resistance until it lands or
 * reaches the fence.
 */

/**
 * @typedef {typeof import('./index.js').CONFIG} Config
 * @typedef {{ x: number, y: number, z: number }} Vec
 *
 * @typedef {{ kind: 'miss', error: number }
 *   | { kind: 'hit', error: number, quality: number, sprayDeg: number, launchDeg: number, speed: number, foul: boolean }} Contact
 *   error: swing time minus the ball's arrival at the plate (ms; negative = early)
 *
 * @typedef {object} Flight
 * @property {Vec} p
 * @property {Vec} v
 * @property {'flying' | 'landed' | 'wall'} state
 * @property {boolean} fair     inside the foul lines
 * @property {boolean} homer    cleared the fence
 * @property {number} distance  how far from home plate it is (flat), m
 * @property {Vec[]} trail      recent positions, for drawing
 */

const toRad = (deg) => (deg * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/**
 * Where a pitch is, `t` of the way (0 to 1) from the pitcher's hand to the
 * plate: a nearly straight line, with a gentle arc.
 *
 * @param {number} t
 * @param {Config} config
 * @returns {Vec}
 */
export function pitchPosition(t, config) {
  const { distance, releaseHeight, plateHeight } = config.pitch;
  const arc = 0.15 * Math.sin(Math.PI * Math.min(1, t)); // a gentle rise and fall
  return {
    x: 0,
    y: lerp(releaseHeight, plateHeight, t) + arc,
    z: distance * (1 - t),
  };
}

/**
 * How long a pitch takes, for pitch number `index` (0-based) of `count`.
 * Pitches get quicker through the round, with a little variety.
 *
 * @param {number} index
 * @param {number} count
 * @param {number} random  0 to 1
 * @param {Config} config
 */
export function pitchTravelMs(index, count, random, config) {
  const { slowest, fastest, variety } = config.pitch.travelMs;
  const progress = count > 1 ? index / (count - 1) : 0;
  const base = lerp(slowest, fastest, progress);
  return base * (1 + (random * 2 - 1) * variety);
}

/**
 * Turns a swing's timing (and speed) into what happens to the ball.
 *
 * @param {number} error  swing time minus the ball's arrival at the plate, ms
 * @param {number} power  swing speed, 0 (weakest) to 1 (strongest)
 * @param {Config} config
 * @returns {Contact}
 */
export function contactFrom(error, power, config) {
  const { windowMs, perfectMs } = config.timing;
  const { exitSpeed, launchDeg, sprayAtEdgeDeg, foulBeyondDeg, powerBonus } = config.hit;
  if (Math.abs(error) > windowMs) return { kind: 'miss', error };

  // 1 when dead on (within perfectMs), falling to 0 at the edge of the window.
  const off = Math.max(0, Math.abs(error) - perfectMs) / (windowMs - perfectMs);
  const quality = clamp01(1 - off);
  // Early (negative error) pulls the ball left; late pushes it right.
  const sprayDeg = (error / windowMs) * sprayAtEdgeDeg;
  const speed = lerp(exitSpeed.worst, exitSpeed.best, quality) * (1 + (power - 0.5) * powerBonus);
  return {
    kind: 'hit',
    error,
    quality,
    sprayDeg,
    launchDeg: lerp(launchDeg.worst, launchDeg.best, quality),
    speed,
    foul: Math.abs(sprayDeg) > foulBeyondDeg,
  };
}

/**
 * A ball leaving the bat.
 *
 * @param {Extract<Contact, { kind: 'hit' }>} contact
 * @param {Config} config
 * @returns {Flight}
 */
export function launch(contact, config) {
  const up = toRad(contact.launchDeg);
  const across = toRad(contact.sprayDeg);
  const flat = contact.speed * Math.cos(up);
  return {
    p: { x: 0, y: config.pitch.plateHeight, z: 0.3 },
    v: { x: flat * Math.sin(across), y: contact.speed * Math.sin(up), z: flat * Math.cos(across) },
    state: 'flying',
    fair: !contact.foul,
    homer: false,
    distance: 0,
    trail: [],
  };
}

/** Longest slice of time simulated in one go. */
const MAX_STEP_S = 1 / 120;

/**
 * Moves a hit ball forward by `seconds`.
 *
 * Each tiny slice of time: gravity pulls it down, air resistance slows it
 * (more the faster it goes: the drag is proportional to speed squared), and
 * it moves. Then we check the fence: clearing it is a home run, hitting it
 * stops the ball. A ball that lands in the field just stops where it lands.
 *
 * @param {Flight} flight
 * @param {number} seconds
 * @param {Config} config
 */
export function stepFlight(flight, seconds, config) {
  if (flight.state !== 'flying') return;
  const { gravity, drag, fenceDistance, fenceHeight } = config.field;
  const steps = Math.max(1, Math.ceil(seconds / MAX_STEP_S));
  const dt = seconds / steps;
  for (let i = 0; i < steps; i++) {
    const speed = Math.hypot(flight.v.x, flight.v.y, flight.v.z);
    flight.v.x -= drag * speed * flight.v.x * dt;
    flight.v.y -= (gravity + drag * speed * flight.v.y) * dt;
    flight.v.z -= drag * speed * flight.v.z * dt;
    const wasInside = flight.distance < fenceDistance;
    flight.p.x += flight.v.x * dt;
    flight.p.y += flight.v.y * dt;
    flight.p.z += flight.v.z * dt;
    flight.distance = Math.hypot(flight.p.x, flight.p.z);

    // Reaching the fence. Only fair balls count: fouls sail into the side stands.
    if (flight.fair && wasInside && flight.distance >= fenceDistance) {
      if (flight.p.y > fenceHeight) {
        flight.homer = true; // over the fence: it keeps flying into the stands
      } else {
        flight.state = 'wall';
        flight.distance = fenceDistance;
        return;
      }
    }
    if (flight.p.y <= 0) {
      flight.p.y = 0;
      flight.state = 'landed';
      return;
    }
  }
  flight.trail.push({ ...flight.p });
  if (flight.trail.length > 40) flight.trail.shift();
}

/**
 * Flies a hit all the way to the end, for tests and for predicting results.
 *
 * @param {Extract<Contact, { kind: 'hit' }>} contact
 * @param {Config} config
 */
export function flyToEnd(contact, config) {
  const flight = launch(contact, config);
  for (let i = 0; i < 2000 && flight.state === 'flying'; i++) stepFlight(flight, 1 / 60, config);
  return { distance: flight.distance, homer: flight.homer, wall: flight.state === 'wall' };
}

/**
 * Where a point appears on screen, looking out from just behind home plate.
 * Further away = smaller and nearer the horizon.
 *
 * @param {Vec} point
 * @param {{ width: number, height: number }} size
 * @param {Config} config
 */
export function project(point, size, config) {
  const { height: eyeHeight, behind, focal, horizon } = config.field.camera;
  const depth = Math.max(0.05, point.z + behind);
  const scale = (focal * size.height) / depth;
  return {
    x: size.width / 2 + point.x * scale,
    y: horizon * size.height - (point.y - eyeHeight) * scale,
    scale,
  };
}
