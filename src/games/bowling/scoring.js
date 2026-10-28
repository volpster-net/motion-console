/**
 * Ten-pin bowling scoring, worked out from the list of rolls (how many pins
 * each ball knocked down). Pure functions, no state: the game keeps the rolls
 * and asks these for the scorecard and for what comes next.
 *
 * The rules:
 * - A game is 10 frames. In each of the first nine you get up to two balls
 *   to knock down all 10 pins.
 * - A strike (all 10 with the first ball) scores 10 plus the next two balls.
 * - A spare (all 10 with both balls) scores 10 plus the next ball.
 * - An open frame (pins left standing) scores the pins knocked down.
 * - The 10th frame gives a strike or spare its bonus balls right there, so it
 *   can have three balls. A perfect game is 12 strikes: 300.
 */

export const PINS = 10;
export const FRAMES = 10;

/**
 * @typedef {object} Frame
 * @property {number[]} rolls      pins knocked down by each ball in this frame
 * @property {string[]} marks      what the scorecard shows for each ball: 'X', '/', '-', or a digit
 * @property {number | null} total running total up to this frame, or null while it's waiting on bonus balls
 */

/**
 * Splits the rolls into frames.
 *
 * @param {number[]} rolls
 * @returns {number[][]}  up to 10 frames; the last may be unfinished
 */
function splitFrames(rolls) {
  const frames = [];
  let i = 0;
  while (i < rolls.length && frames.length < FRAMES - 1) {
    if (rolls[i] === PINS) {
      frames.push([PINS]);
      i += 1;
    } else {
      frames.push(rolls.slice(i, i + 2));
      i += 2;
    }
  }
  if (i < rolls.length) frames.push(rolls.slice(i, i + 3));
  return frames;
}

/**
 * How many balls the 10th frame gets, once its first two are known.
 *
 * @param {number[]} rolls  the 10th frame's rolls so far
 */
function tenthFrameBalls(rolls) {
  if (rolls.length < 2) return 2;
  return rolls[0] === PINS || rolls[0] + rolls[1] === PINS ? 3 : 2;
}

/**
 * The scorecard: every frame's marks and running total.
 *
 * @param {number[]} rolls
 * @returns {Frame[]}  always 10 frames; frames not reached yet have no rolls
 */
export function scorecard(rolls) {
  const frames = splitFrames(rolls);
  /** Index into `rolls` where each frame starts. */
  const starts = [];
  let at = 0;
  for (const frame of frames) {
    starts.push(at);
    at += frame.length;
  }

  const result = [];
  let running = 0;
  let known = true;
  for (let f = 0; f < FRAMES; f++) {
    const frameRolls = frames[f] ?? [];
    const marks = f === FRAMES - 1 ? tenthFrameMarks(frameRolls) : frameMarks(frameRolls);
    const score = known ? frameScore(f, frameRolls, rolls, starts[f]) : null;
    if (score === null) known = false;
    else running += score;
    result.push({ rolls: frameRolls, marks, total: known ? running : null });
  }
  return result;
}

/**
 * One frame's score, or null if it isn't finished or is waiting on bonus balls.
 *
 * @param {number} f       frame index, 0 to 9
 * @param {number[]} frame this frame's rolls
 * @param {number[]} rolls every roll
 * @param {number} start   where this frame starts in `rolls`
 */
function frameScore(f, frame, rolls, start) {
  if (frame.length === 0) return null;
  if (f === FRAMES - 1) {
    return frame.length === tenthFrameBalls(frame) ? sum(frame) : null;
  }
  const next = rolls.slice(start + frame.length);
  if (frame[0] === PINS) return next.length >= 2 ? PINS + next[0] + next[1] : null;
  if (frame.length < 2) return null;
  if (frame[0] + frame[1] === PINS) return next.length >= 1 ? PINS + next[0] : null;
  return frame[0] + frame[1];
}

/** Marks for frames 1 to 9. A strike shows as a lone 'X' in the second box. */
function frameMarks(frame) {
  if (frame[0] === PINS) return ['', 'X'];
  const marks = frame.map(digit);
  if (frame.length === 2 && frame[0] + frame[1] === PINS) marks[1] = '/';
  return marks;
}

/** Marks for the 10th frame, where every ball can be a strike or a spare. */
function tenthFrameMarks(frame) {
  const marks = [];
  let standing = PINS;
  for (const pins of frame) {
    if (pins === standing) marks.push(standing === PINS ? 'X' : '/');
    else marks.push(digit(pins));
    standing -= pins;
    if (standing === 0) standing = PINS;
  }
  return marks;
}

const digit = (pins) => (pins === 0 ? '-' : String(pins));
const sum = (list) => list.reduce((a, b) => a + b, 0);

/**
 * What the next ball is: which frame, which ball in it, and whether it faces
 * a full rack of 10 or just the pins left standing.
 *
 * @param {number[]} rolls
 * @returns {{ frame: number, ball: number, freshRack: boolean } | null}  null once the game is over
 */
export function nextRoll(rolls) {
  const frames = splitFrames(rolls);
  const last = frames.at(-1);
  if (!last) return { frame: 0, ball: 0, freshRack: true };
  const f = frames.length - 1;

  if (f < FRAMES - 1) {
    const done = last[0] === PINS || last.length === 2;
    return done
      ? { frame: f + 1, ball: 0, freshRack: true }
      : { frame: f, ball: 1, freshRack: false };
  }

  // The 10th frame: the rack is reset after every strike or spare.
  if (last.length >= tenthFrameBalls(last)) return null;
  let standing = PINS;
  for (const pins of last) {
    standing -= pins;
    if (standing === 0) standing = PINS;
  }
  return { frame: f, ball: last.length, freshRack: standing === PINS };
}

/**
 * The final (or so far known) score.
 *
 * @param {number[]} rolls
 */
export function totalScore(rolls) {
  let total = 0;
  for (const frame of scorecard(rolls)) if (frame.total !== null) total = frame.total;
  return total;
}
