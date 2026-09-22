/**
 * Mounts one channel at a time into the stage and routes messages to it.
 *
 * A channel sees:
 *   - `input` messages from every admitted controller (motion, buttons)
 *   - messages in its own namespace (`ch === <channel id>`)
 * and can only send in its own namespace, so channels can't interfere with
 * the core protocol or each other.
 *
 * @typedef {import('./players.js').Player} Player
 * @typedef {import('../core/transport.js').Message} Message
 *
 * @callback MessageHandler
 * @param {Record<string, any>} data  The envelope payload (`d`).
 * @param {{ player: Player, msg: Message }} context
 *
 * @typedef {object} ChannelApi
 * @property {string} id
 * @property {{
 *   list: () => Player[],
 *   get: (id: string) => Player | undefined,
 *   onChange: (fn: (players: Player[]) => void) => () => void,
 * }} players
 * @property {(type: string, fn: MessageHandler) => () => void} onInput
 *   Subscribe to core controller input, e.g. `onInput(INPUT.MOTION, ...)`.
 * @property {(type: string, fn: MessageHandler) => () => void} onMessage
 *   Subscribe to messages in this channel's own namespace.
 * @property {(type: string, data?: object, to?: string) => boolean} send
 *   Send in this channel's namespace, to everyone or to one player id.
 *
 * @typedef {object} Channel
 * @property {string} title
 * @property {(root: HTMLElement, api: ChannelApi) => void | (() => void)} mount
 *   Render into `root` and subscribe through `api`. May return a teardown
 *   function. Subscriptions made through `api` are cleaned up automatically.
 */
import { createEmitter } from '../core/emitter.js';
import { NS, SYS } from '../core/protocol.js';
import { loadChannel } from '../channels/index.js';

/**
 * @param {{
 *   room: import('../core/transport.js').Room,
 *   players: ReturnType<typeof import('./players.js').createPlayerRegistry>,
 *   stage: HTMLElement,
 * }} deps
 */
export function createChannelHost({ room, players, stage }) {
  /** @type {{ id: string, events: ReturnType<typeof createEmitter>, cleanups: Array<() => void> } | null} */
  let active = null;

  room.on('message', (/** @type {Message} */ msg) => {
    if (!active || (msg.ch !== NS.INPUT && msg.ch !== active.id)) return;
    // Only controllers that said hello (and so have a slot) drive channels.
    const player = players.get(msg.from);
    if (!player) return;
    active.events.emit(`${msg.ch}:${msg.type}`, msg.d, { player, msg });
  });

  function stop() {
    if (!active) return;
    for (const cleanup of active.cleanups) cleanup();
    active.events.clear();
    stage.replaceChildren();
    active = null;
  }

  /** @param {string} id */
  async function start(id) {
    const channel = await loadChannel(id);
    stop();

    const events = createEmitter();
    /** @type {Array<() => void>} */
    const cleanups = [];
    const root = document.createElement('div');
    root.className = 'channel';
    root.dataset.channel = id;
    stage.replaceChildren(root);

    /** @type {ChannelApi} */
    const api = {
      id,
      players: {
        list: players.list,
        get: players.get,
        onChange(fn) {
          const off = players.onChange(fn);
          cleanups.push(off);
          return off;
        },
      },
      onInput: (type, fn) => events.on(`${NS.INPUT}:${type}`, fn),
      onMessage: (type, fn) => events.on(`${id}:${type}`, fn),
      send: (type, data, to) => room.send(id, type, data, to),
    };

    const teardown = channel.mount(root, api);
    if (typeof teardown === 'function') cleanups.push(teardown);
    active = { id, events, cleanups };
    document.title = `${channel.title} · Motion Console`;
    room.send(NS.SYS, SYS.CHANNEL, { id });
  }

  return {
    start,
    stop,
    get activeId() {
      return active?.id ?? null;
    },
  };
}
