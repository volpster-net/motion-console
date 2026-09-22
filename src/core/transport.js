/**
 * Room transport over Supabase Realtime. This is the only module that knows
 * about Supabase; everything else talks to the `Room` object it returns, so
 * swapping in WebRTC or a custom WebSocket server later touches one file.
 *
 * - Broadcast carries protocol envelopes (see protocol.js).
 * - Presence tracks who is in the room and what role they play.
 */
import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';
import { createEmitter } from './emitter.js';
import { BROADCAST_EVENT, createEnvelope, parseEnvelope } from './protocol.js';

const SUBSCRIBE_TIMEOUT_MS = 10_000;
const SELF_PRESENCE_TIMEOUT_MS = 3_000;

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

function getClient() {
  if (!client) {
    const { supabaseUrl, supabaseKey } = getConfig();
    client = createClient(supabaseUrl, supabaseKey, {
      // No user accounts in this app: skip session storage and token refresh.
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * @typedef {'connected' | 'reconnecting' | 'closed'} RoomStatus
 * @typedef {{ id: string, role?: string } & Record<string, unknown>} Peer
 * @typedef {import('./protocol.js').Envelope & { lost: number }} Message
 *   `lost` counts messages from this sender that never arrived before this one.
 *
 * @typedef {object} Room
 * @property {string} code
 * @property {string} id  This client's id (also its presence key).
 * @property {RoomStatus} status
 * @property {(ch: string, type: string, data?: object, to?: string) => boolean} send
 *   Returns false (and drops the message) while not connected.
 * @property {(event: 'message' | 'presence' | 'leave' | 'status', fn: Function) => () => void} on
 *   message: (msg: Message)   presence: (peers: Peer[])   leave: (id: string)   status: (s: RoomStatus)
 * @property {() => Peer[]} peers
 * @property {() => Promise<Peer[]>} waitForSelf  Resolves once our own presence is visible.
 * @property {() => Promise<void>} leave
 */

/**
 * Joins `room:<code>` and resolves once subscribed.
 *
 * @param {string} code
 * @param {{ id: string, meta?: Record<string, unknown> }} options
 *   `meta` is published via presence, e.g. `{ role: 'controller' }`.
 * @returns {Promise<Room>}
 */
export function joinRoom(code, { id, meta = {} }) {
  const supabase = getClient();
  const channel = supabase.channel(`room:${code}`, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: id, enabled: true },
    },
  });
  const events = createEmitter();
  const lastSeqBySender = new Map();
  let seq = 0;
  /** @type {RoomStatus | 'connecting'} */
  let status = 'connecting';

  function countLost(msg) {
    const last = lastSeqBySender.get(msg.from);
    lastSeqBySender.set(msg.from, msg.seq);
    // A lower seq means the sender restarted its counter (page reload).
    return last !== undefined && msg.seq > last ? msg.seq - last - 1 : 0;
  }

  channel.on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
    const envelope = parseEnvelope(payload);
    if (!envelope) return;
    // Count before filtering by recipient: unicasts to others still advance seq.
    const lost = countLost(envelope);
    if (envelope.to && envelope.to !== id) return;
    events.emit('message', { ...envelope, lost });
  });

  channel.on('presence', { event: 'sync' }, () => events.emit('presence', peers()));

  channel.on('presence', { event: 'leave' }, ({ key, currentPresences }) => {
    // The same key can briefly have two presences (e.g. a quick reload).
    if (currentPresences.length === 0) events.emit('leave', key);
  });

  /**
   * One entry per presence. A key can briefly have two (a reload's stale
   * entry alongside the new one), so ids are not guaranteed unique.
   *
   * @returns {Peer[]}
   */
  function peers() {
    return Object.entries(channel.presenceState()).flatMap(([key, metas]) =>
      metas.map((meta) => ({ ...meta, id: key })),
    );
  }

  /** @type {Room} */
  const room = {
    code,
    id,
    get status() {
      return /** @type {RoomStatus} */ (status);
    },

    send(ch, type, data = {}, to) {
      // Supabase would silently fall back to HTTP when not joined; we'd rather drop.
      if (status !== 'connected') return false;
      seq += 1;
      channel
        .send({
          type: 'broadcast',
          event: BROADCAST_EVENT,
          payload: createEnvelope({ ch, type, data, from: id, to, seq }),
        })
        .catch((err) => console.warn('[transport] send failed', err));
      return true;
    },

    on: events.on,
    peers,

    waitForSelf() {
      return new Promise((resolve) => {
        const hasSelf = (list) => list.some((peer) => peer.id === id);
        if (hasSelf(peers())) return resolve(peers());
        const done = () => {
          off();
          clearTimeout(timer);
          resolve(peers());
        };
        const off = events.on('presence', (list) => hasSelf(list) && done());
        const timer = setTimeout(done, SELF_PRESENCE_TIMEOUT_MS);
      });
    },

    async leave() {
      status = 'closed';
      events.clear();
      await supabase.removeChannel(channel);
    },
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(
      () => fail(new Error('Timed out connecting to the realtime server.')),
      SUBSCRIBE_TIMEOUT_MS,
    );

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      supabase.removeChannel(channel);
      reject(err);
    }

    function setStatus(next) {
      if (status === next || status === 'closed') return;
      status = next;
      if (settled) events.emit('status', next);
    }

    channel.subscribe((state, err) => {
      if (state === 'SUBSCRIBED') {
        setStatus('connected');
        // Re-track after every (re)join so presence survives reconnects.
        channel.track(meta).catch((trackErr) => console.warn('[transport] track failed', trackErr));
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(room);
        }
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        if (!settled) return fail(new Error(`Could not join room: ${err?.message ?? state}`));
        setStatus('reconnecting'); // supabase-js retries on its own
      } else if (state === 'CLOSED') {
        if (!settled) return fail(new Error('Realtime connection closed.'));
        setStatus('closed');
      }
    });
  });
}
