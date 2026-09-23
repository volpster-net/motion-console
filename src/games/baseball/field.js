/**
 * The ballpark and the ball, as pure maths: no screen, sound, or clock.
 *
 * The world is measured in metres, looking out from home plate (the game
 * shows distances in feet; see toFeet):
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
 * @typedef {{ x: number, y: number }} Location  where a pitch crosses the plate (m)
 *
 * @typedef {{ kind: 'miss', error: number }
 *   | { kind: 'hit', error: number, quality: number, sprayDeg: number, launchDeg: number, speed: number, foul: boolean, location: Location }} Contact
 *   error: swing time minus the ball's arrival at the plate (ms; negative = early)
 *
 * @typedef {object} Flight
 * @property {Vec} p
 * @property {Vec} v
 * @property {'flying' | 'landed' | 'wall'} state
 * @property {boolean} fair     inside the foul lines
 * @property {boolean} homer    cleared the fence
 * @property {boolean} [inStands] came down in the seats beyond the fence
 * @property {number} distance  how far from home plate it is (flat), m
 * @property {Vec[]} trail      recent positions, for drawing
 */

const toRad = (deg) => (deg * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** Metres to feet, for everything the player sees. */
export const toFeet = (metres) => metres * 3.28084;
const FEET_TO_M = 1 / 3.28084;

/**
 * How far the outfield fence is at a given angle (0 = straight out to centre
 * field, ±45° = down the foul lines), in metres. Like a real ballpark it's
 * closest down the lines and deepest in centre, curving smoothly between.
 *
 * @param {number} angleDeg
 * @param {Config} config
 */
export function fenceAt(angleDeg, config) {
  const { linesFt, centreFt } = config.field.fence;
  const t = Math.cos(toRad(Math.min(45, Math.abs(angleDeg)) * 2)); // 1 in centre, 0 on the lines
  return (linesFt + (centreFt - linesFt) * t) * FEET_TO_M;
}

/**
 * @typedef {object} Pitch
 * @property {Vec} start     where it leaves the pitcher's hand
 * @property {Vec} target    where it crosses the plate
 * @property {{ x: number, y: number }} bend  how far off the target it first
 *   seems to be heading (m): it curves back onto the target on its way in
 * @property {number} breakPower  how late it breaks: bigger = later and sharper
 */

/**
 * Where a pitch is, `t` of the way (0 to 1) from the pitcher's hand to the
 * plate.
 *
 * Breaking pitches, in plain language: the ball sets off as if heading for a
 * spot beside the real target (the "bend"), and curves back onto the target
 * as it travels. The curve is `bend × t^breakPower`: tiny at first and
 * biggest at the end, so the ball looks straight for most of its flight and
 * then breaks late, which is what makes a good slider or curveball hard to
 * read. A curveball's bend is upwards, so it looks high and then drops in.
 *
 * Past the plate (t > 1), the ball carries straight on towards the catcher.
 *
 * @param {number} t
 * @param {Pitch} pitch
 * @returns {Vec}
 */
export function pitchPosition(t, pitch) {
  const { start, target, bend, breakPower } = pitch;
  const at = (u) => ({
    x: lerp(start.x, target.x + bend.x, u) - bend.x * u ** breakPower,
    y: lerp(start.y, target.y + bend.y, u) - bend.y * u ** breakPower,
    z: lerp(start.z, target.z, u),
  });
  if (t <= 1) return at(t);
  // Straight on past the plate, at the speed it arrived with.
  const end = at(1);
  const before = at(0.99);
  const k = (t - 1) / 0.01;
  return {
    x: end.x + (end.x - before.x) * k,
    y: end.y + (end.y - before.y) * k,
    z: end.z + (end.z - before.z) * k,
  };
}

/**
 * Picks the next pitch: its type (weighted at random), speed, and where it
 * crosses the plate. Pitches get quicker through the round.
 *
 * @param {{ index: number, count: number, random: () => number, config: Config }} options
 */
export function choosePitch({ index, count, random, config }) {
  const types = Object.entries(config.pitchTypes);
  // The first few pitches are fastballs, so everyone can find their timing.
  let key = 'fastball';
  if (index >= config.pitch.mixFrom) {
    const total = types.reduce((sum, [, type]) => sum + type.weight, 0);
    let roll = random() * total;
    for (const [name, type] of types) {
      roll -= type.weight;
      if (roll < 0) {
        key = name;
        break;
      }
    }
  }
  const type = config.pitchTypes[key];
  const { slowest, fastest } = config.pitch.travelMs;
  const progress = count > 1 ? index / (count - 1) : 0;
  const { zone } = config.pitch;
  // Anywhere in the strike zone: inside or outside, high or low.
  const across = (zone.right - zone.left) * zone.use;
  const up = (zone.top - zone.bottom) * zone.use;
  const middle = { x: (zone.left + zone.right) / 2, y: (zone.bottom + zone.top) / 2 };
  return {
    type: key,
    name: type.name,
    mph: Math.round(lerp(type.mph[0], type.mph[1], random())),
    travelMs: lerp(slowest, fastest, progress) * type.speed,
    path: /** @type {Pitch} */ ({
      start: { ...config.pitch.release },
      target: {
        x: middle.x + (random() - 0.5) * across,
        y: middle.y + (random() - 0.5) * up,
        z: 0,
      },
      bend: { ...type.bend },
      breakPower: type.breakPower,
    }),
  };
}

/** The middle of the strike zone. */
export const zoneMiddle = (config) => ({
  x: (config.pitch.zone.left + config.pitch.zone.right) / 2,
  y: (config.pitch.zone.bottom + config.pitch.zone.top) / 2,
});

/**
 * Turns a swing's timing (and speed, and where the pitch was) into what
 * happens to the ball.
 *
 * Timing matters most. Where the pitch crossed the plate nudges the result,
 * like the real game: an inside pitch (nearer you) tends to get pulled to left
 * field, an outside one pushed to right, a high one lifted, a low one hit lower.
 *
 * @param {number} error  swing time minus the ball's arrival at the plate, ms
 * @param {number} power  swing speed, 0 (weakest) to 1 (strongest)
 * @param {Config} config
 * @param {Location} [location]  where the pitch crossed the plate (default: the middle)
 * @returns {Contact}
 */
export function contactFrom(error, power, config, location = zoneMiddle(config)) {
  const { windowMs, perfectMs } = config.timing;
  const { exitSpeed, launchDeg, sprayAtEdgeDeg, foulBeyondDeg, powerBonus, locationEffect } =
    config.hit;
  if (Math.abs(error) > windowMs) return { kind: 'miss', error };

  // 1 when dead on (within perfectMs), falling to 0 at the edge of the window.
  const off = Math.max(0, Math.abs(error) - perfectMs) / (windowMs - perfectMs);
  const quality = clamp01(1 - off);
  const middle = zoneMiddle(config);
  // Early (negative error) pulls the ball left; late pushes it right. Inside
  // pitches (negative x, nearer a right-handed batter) pull it a little more.
  const sprayDeg =
    (error / windowMs) * sprayAtEdgeDeg + (location.x - middle.x) * locationEffect.sprayDegPerM;
  const speed = lerp(exitSpeed.worst, exitSpeed.best, quality) * (1 + (power - 0.5) * powerBonus);
  return {
    kind: 'hit',
    error,
    quality,
    sprayDeg,
    launchDeg:
      lerp(launchDeg.worst, launchDeg.best, quality) +
      (location.y - middle.y) * locationEffect.launchDegPerM,
    speed,
    foul: Math.abs(sprayDeg) > foulBeyondDeg,
    location,
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
    p: { x: contact.location.x, y: contact.location.y, z: 0.3 },
    v: { x: flat * Math.sin(across), y: contact.speed * Math.sin(up), z: flat * Math.cos(across) },
    state: 'flying',
    fair: !contact.foul,
    homer: false,
    distance: 0,
    trail: [],
  };
}

/**
 * How high the seats are, `beyond` metres past the outfield fence. The stands
 * start just behind the fence at the fence's height and rise steadily towards
 * the back, like real bleachers.
 *
 * @param {number} beyond
 * @param {Config} config
 */
export function seatsHeight(beyond, config) {
  const { startM, depthM, topM } = config.field.stands;
  const fenceHeight = config.field.fence.heightFt * FEET_TO_M;
  const k = Math.min(1, Math.max(0, (beyond - startM) / depthM));
  return fenceHeight + k * (topM - fenceHeight);
}

/** The angle out from home plate, in degrees: 0 = centre field, negative = left. */
const angleOf = (p) => (Math.atan2(p.x, p.z) * 180) / Math.PI;

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
  const { gravity, drag } = config.field;
  const fenceHeight = config.field.fence.heightFt * FEET_TO_M;
  const steps = Math.max(1, Math.ceil(seconds / MAX_STEP_S));
  const dt = seconds / steps;
  for (let i = 0; i < steps; i++) {
    const speed = Math.hypot(flight.v.x, flight.v.y, flight.v.z);
    flight.v.x -= drag * speed * flight.v.x * dt;
    flight.v.y -= (gravity + drag * speed * flight.v.y) * dt;
    flight.v.z -= drag * speed * flight.v.z * dt;
    const wasInside = flight.distance < fenceAt(angleOf(flight.p), config);
    flight.p.x += flight.v.x * dt;
    flight.p.y += flight.v.y * dt;
    flight.p.z += flight.v.z * dt;
    flight.distance = Math.hypot(flight.p.x, flight.p.z);
    const fence = fenceAt(angleOf(flight.p), config);

    // Reaching the fence. Only fair balls count: fouls sail into the side stands.
    if (flight.fair && wasInside && flight.distance >= fence) {
      if (flight.p.y > fenceHeight) {
        flight.homer = true; // over the fence: it keeps flying into the stands
      } else {
        flight.state = 'wall';
        flight.distance = fence;
        return;
      }
    }
    // A home run comes down in the stands, and stays there.
    if (flight.homer) {
      const seats = seatsHeight(flight.distance - fence, config);
      if (flight.p.y <= seats) {
        flight.p.y = seats;
        flight.state = 'landed';
        flight.inStands = true;
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
  return {
    distance: flight.distance,
    homer: flight.homer,
    wall: flight.state === 'wall',
    inStands: Boolean(flight.inStands),
    landedAt: { ...flight.p },
  };
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
