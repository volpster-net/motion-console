import { INPUT, NS } from '../core/protocol.js';
import { sameOrientation } from './orientation-math.js';

/** Resend an unchanged pose this often, so a console that just (re)joined catches up. */
export const KEEPALIVE_MS = 1000;

/**
 * Samples the sensor at a fixed rate and sends orientation when it changes.
 * A fixed-rate sampler (rather than sending on every sensor event) caps
 * bandwidth whatever the hardware's event rate, which keeps us inside
 * Supabase's messages-per-second quota.
 *
 * @param {{
 *   read: () => import('./orientation-math.js').Orientation | null,
 *   send: (ch: string, type: string, data: object) => boolean,
 *   hz: number,
 *   now?: () => number,
 * }} options
 * @returns {() => void} stop
 */
export function startOrientationStream({ read, send, hz, now = () => performance.now() }) {
  let lastSent = null;
  let lastSentAt = -Infinity;

  const timer = setInterval(() => {
    const reading = read();
    if (!reading) return;
    const unchanged = lastSent && sameOrientation(reading, lastSent);
    if (unchanged && now() - lastSentAt < KEEPALIVE_MS) return;
    if (send(NS.INPUT, INPUT.ORIENT, reading)) {
      lastSent = reading;
      lastSentAt = now();
    }
  }, 1000 / hz);

  return () => clearInterval(timer);
}
