/**
 * Wire protocol shared by the console and every controller.
 *
 * Every message is a single envelope sent on one Supabase broadcast event.
 * Routing happens in our code, keyed by `ch` (namespace) + `type`, so the
 * transport never needs to know which games exist.
 *
 *   {
 *     v:    2,            protocol version; mismatches are dropped
 *     ch:   'input',      namespace: 'sys' | 'input' | a channel id
 *     type: 'motion',     message type within the namespace
 *     from: 'p_k3j9x2qa', sender's client id
 *     to:   'p_k3j9x2qa', optional; omitted means everyone in the room
 *     seq:  1042,         per-sender counter, used to detect lost messages
 *     d:    { ... }       payload, shape defined per type below
 *   }
 */

// v2: controllers send raw `motion` (rotation rate) instead of `orient` angles.
export const PROTOCOL_VERSION = 2;

/** The one Supabase broadcast event name all envelopes travel on. */
export const BROADCAST_EVENT = 'msg';

/** Namespaces owned by the core. Every other `ch` value belongs to a channel. */
export const NS = Object.freeze({
  SYS: 'sys',
  INPUT: 'input',
});

export const RESERVED_NAMESPACES = new Set(Object.values(NS));

/** `sys` messages: session plumbing between console and controllers. */
export const SYS = Object.freeze({
  /** controller → console. d: {} — "I'm here, please assign me a slot." */
  HELLO: 'hello',
  /** console → one controller. d: { slot: number | null, channel: string | null } */
  WELCOME: 'welcome',
  /** console → everyone. d: { id: string } — the active channel changed. */
  CHANNEL: 'channel',
});

/** `input` messages: controller state, consumed by whichever channel is active. */
export const INPUT = Object.freeze({
  /**
   * d: { alpha, beta, gamma, gx, gy, gz, t } — the phone's raw sensor readings.
   *   alpha, beta, gamma  rotation rate in degrees per second, 0.1 precision
   *                       (DeviceMotionEvent.rotationRate). Which phone axis each
   *                       name means varies by browser; see AXIS_ORDERS in src/aim.
   *   gx, gy, gz          accelerometer including gravity, m/s², along the phone's
   *                       x, y, z axes (accelerationIncludingGravity). Optional.
   *   t                   when the phone measured it, in ms on the phone's own clock.
   *                       Only differences between samples mean anything.
   */
  MOTION: 'motion',
  /** d: { id: ButtonId, down: boolean } — sent on both press and release. */
  BUTTON: 'button',
});

export const BUTTONS = Object.freeze({
  FIRE: 'fire',
  RECENTER: 'recenter',
});

/**
 * @typedef {object} Envelope
 * @property {string} ch
 * @property {string} type
 * @property {string} from
 * @property {string | null} to
 * @property {number} seq
 * @property {Record<string, unknown>} d
 */

/**
 * @param {{ ch: string, type: string, data?: object, from: string, to?: string | null, seq: number }} fields
 */
export function createEnvelope({ ch, type, data = {}, from, to = null, seq }) {
  const envelope = { v: PROTOCOL_VERSION, ch, type, from, seq, d: data };
  if (to) envelope.to = to;
  return envelope;
}

/**
 * Validates an incoming payload. Returns a normalized envelope, or null if the
 * payload is malformed or from an incompatible protocol version.
 *
 * @param {unknown} raw
 * @returns {Envelope | null}
 */
export function parseEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { v, ch, type, from, to, seq, d } = /** @type {Record<string, unknown>} */ (raw);
  if (v !== PROTOCOL_VERSION) return null;
  if (typeof ch !== 'string' || typeof type !== 'string' || typeof from !== 'string') return null;
  if (!Number.isInteger(seq)) return null;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if (to != null && typeof to !== 'string') return null;
  return {
    ch,
    type,
    from,
    to: to ?? null,
    seq: /** @type {number} */ (seq),
    d: /** @type {Record<string, unknown>} */ (d),
  };
}
