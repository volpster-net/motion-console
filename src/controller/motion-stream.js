import { INPUT, NS } from '../core/protocol.js';

/**
 * Timing jitter allowance. A sensor running at exactly the send rate delivers
 * readings slightly early or late, and without this some would be dropped
 * for arriving 0.1 ms "too soon", halving the effective rate.
 */
const JITTER_ALLOWANCE = 0.75;

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Forwards sensor readings to the console, at most `hz` times a second.
 *
 * Phones fire `devicemotion` anywhere from 50 to 200+ times a second. Sending
 * every reading would waste bandwidth and eat into Supabase's message quota,
 * so readings that arrive too soon after the last sent one are skipped. Each
 * sent reading keeps its own timestamp, so the console still knows exactly
 * how much time passed between the ones it gets.
 *
 * @param {{
 *   onSample: (fn: (sample: import('./motion.js').MotionSample) => void) => () => void,
 *   send: (ch: string, type: string, data: object) => boolean,
 *   hz: number,
 * }} options
 * @returns {() => void} stop
 */
export function startMotionStream({ onSample, send, hz }) {
  const minGapMs = (1000 / hz) * JITTER_ALLOWANCE;
  let lastSentAt = -Infinity;

  return onSample((sample) => {
    if (sample.t - lastSentAt < minGapMs) return;
    /** @type {Record<string, number>} */
    const data = {
      alpha: round1(sample.alpha),
      beta: round1(sample.beta),
      gamma: round1(sample.gamma),
      t: round1(sample.t),
    };
    if (sample.gx !== undefined) {
      Object.assign(data, { gx: round1(sample.gx), gy: round1(sample.gy), gz: round1(sample.gz) });
    }
    if (send(NS.INPUT, INPUT.MOTION, data)) lastSentAt = sample.t;
  });
}
