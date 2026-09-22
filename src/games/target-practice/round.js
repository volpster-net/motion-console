/**
 * The rules of one round of Target Practice: where targets appear, how long
 * they last, what a shot scores. No screen, sound, clock, or network here;
 * the caller passes in the time and the crosshair position. That keeps the
 * rules easy to unit-test and easy to read on their own.
 *
 * Positions and sizes are in "screen heights" from the centre of the play
 * area, the same units the aim tracker uses (see src/aim/aim-math.js).
 */

/**
 * @typedef {typeof import('./index.js').CONFIG} Config
 *
 * @typedef {object} Target
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} radius     Size of the outer ring, in screen heights.
 * @property {number} bornAt     When it appeared (ms).
 * @property {number} expiresAt  When it disappears if nobody hits it (ms).
 *
 * @typedef {object} Bounds  Where targets may appear.
 * @property {number} aspect     Play area width ÷ height.
 * @property {number} topReserved  Height of the top bar, as a fraction of the play area height.
 *
 * @typedef {{ name: string, upTo: number, points: number }} Ring
 *
 * @typedef {{ hit: false }
 *   | { hit: true, target: Target, ring: Ring, multiplier: number, points: number }} ShotResult
 */

/** @param {number} value */
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * The value of a setting that changes over the round. `progress` runs from 0
 * (the round just started) to 1 (time's up), and the value slides evenly from
 * `start` to `end`. Halfway through the round, you get halfway between.
 *
 * @param {{ start: number, end: number }} setting
 * @param {number} progress
 */
export function ramp({ start, end }, progress) {
  return start + (end - start) * clamp01(progress);
}

/**
 * Which ring a shot landed in. `distance` is how far the shot was from the
 * target's centre; dividing by the target's size gives 0 at the centre and 1
 * at the outer edge. Rings are listed from the inside out, so the first one
 * whose `upTo` reaches that far is the one that was hit.
 *
 * @param {number} distance
 * @param {number} radius
 * @param {Ring[]} rings  innermost first
 * @returns {Ring | null} null for a miss
 */
export function ringAt(distance, radius, rings) {
  const fromCentre = distance / radius;
  return rings.find((ring) => fromCentre <= ring.upTo) ?? null;
}

/**
 * The score multiplier for a streak of consecutive hits.
 *
 * @param {number} streak
 * @param {Array<{ from: number, multiplier: number }>} rules
 */
export function multiplierFor(streak, rules) {
  let best = 1;
  for (const rule of rules) if (streak >= rule.from) best = Math.max(best, rule.multiplier);
  return best;
}

/**
 * Picks a random spot for a new target: fully on screen, below the top bar,
 * and not overlapping another target. Tries a handful of random spots and
 * gives up (returns null) if the screen is too crowded, rather than looping forever.
 *
 * @param {{
 *   radius: number,
 *   bounds: Bounds,
 *   existing: Target[],
 *   config: Config,
 *   random: () => number,
 * }} options
 * @returns {{ x: number, y: number } | null}
 */
export function findSpawnPosition({ radius, bounds, existing, config, random }) {
  const { edgeMargin, gapBetween, placementAttempts } = config.targets;
  const halfWidth = bounds.aspect / 2;
  const minX = -halfWidth + edgeMargin + radius;
  const maxX = halfWidth - edgeMargin - radius;
  const minY = -0.5 + bounds.topReserved + edgeMargin + radius;
  const maxY = 0.5 - edgeMargin - radius;
  if (maxX < minX || maxY < minY) return null;

  for (let attempt = 0; attempt < placementAttempts; attempt++) {
    const spot = { x: minX + random() * (maxX - minX), y: minY + random() * (maxY - minY) };
    const clear = existing.every(
      (other) =>
        Math.hypot(spot.x - other.x, spot.y - other.y) >= radius + other.radius + gapBetween,
    );
    if (clear) return spot;
  }
  return null;
}

/**
 * Starts a round.
 *
 * @param {{ config: Config, startedAt: number, random?: () => number }} options
 */
export function createRound({ config, startedAt, random = Math.random }) {
  const { durationMs } = config.round;
  /** @type {Target[]} */
  let targets = [];
  let nextId = 1;
  let nextSpawnAt = startedAt;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let shots = 0;
  let hits = 0;

  /** How far through the round we are: 0 at the start, 1 at the end. */
  const progressAt = (now) => clamp01((now - startedAt) / durationMs);
  const isOver = (now) => now - startedAt >= durationMs;

  return {
    get targets() {
      return targets;
    },
    get score() {
      return score;
    },
    get streak() {
      return streak;
    },
    get multiplier() {
      return multiplierFor(streak, config.streak);
    },

    /** @param {number} now */
    timeLeftMs: (now) => Math.max(0, durationMs - (now - startedAt)),
    isOver,

    /**
     * Moves the round forward to `now`: removes targets whose time is up and,
     * if it's time, adds a new one. Returns what happened, so the caller can
     * play sounds or effects.
     *
     * @param {number} now
     * @param {Bounds} bounds
     * @returns {{ expired: Target[], spawned: Target | null }}
     */
    update(now, bounds) {
      const expired = targets.filter((target) => now >= target.expiresAt);
      if (expired.length > 0) {
        targets = targets.filter((target) => now < target.expiresAt);
        if (config.targets.expiredBreaksStreak) streak = 0;
      }

      // Keep at least one target up, and add another every so often, up to the maximum.
      let spawned = null;
      const due = targets.length === 0 || now >= nextSpawnAt;
      if (!isOver(now) && due && targets.length < config.targets.maxOnScreen) {
        const progress = progressAt(now);
        const radius = ramp(config.targets.radius, progress);
        const spot = findSpawnPosition({ radius, bounds, existing: targets, config, random });
        if (spot) {
          spawned = {
            id: nextId++,
            ...spot,
            radius,
            bornAt: now,
            expiresAt: now + ramp(config.targets.lifetimeMs, progress),
          };
          targets = [...targets, spawned];
          nextSpawnAt = now + ramp(config.targets.spawnEveryMs, progress);
        }
      }
      return { expired, spawned };
    },

    /**
     * Fires a shot at `aim`. If it lands on a target, that target is removed
     * and scored; if two overlap the shot, the one hit closest to its centre counts.
     *
     * @param {{ x: number, y: number }} aim
     * @returns {ShotResult}
     */
    shoot(aim) {
      shots += 1;
      let best = null;
      for (const target of targets) {
        const distance = Math.hypot(aim.x - target.x, aim.y - target.y);
        const ring = ringAt(distance, target.radius, config.rings);
        const closeness = distance / target.radius;
        if (ring && (!best || closeness < best.closeness)) best = { target, ring, closeness };
      }

      if (!best) {
        streak = 0; // a miss breaks the streak
        return { hit: false };
      }

      targets = targets.filter((target) => target !== best.target);
      hits += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      // This hit already counts towards the streak, so the 5th hit in a row gets ×2.
      const multiplier = multiplierFor(streak, config.streak);
      const points = best.ring.points * multiplier;
      score += points;
      return { hit: true, target: best.target, ring: best.ring, multiplier, points };
    },

    /** Final numbers for the results screen. */
    results() {
      return { score, shots, hits, accuracy: shots > 0 ? hits / shots : 0, bestStreak };
    },
  };
}
