/**
 * Channel registry. Every folder in src/channels/ containing an index.js is a
 * channel, and the folder name is its id. Vite code-splits each one, so a
 * channel's code only downloads when it's started.
 *
 * Adding a game = adding a folder. Nothing in core/ or console/ changes.
 */
import { RESERVED_NAMESPACES } from '../core/protocol.js';

const modules = import.meta.glob('./*/index.js');

export const DEFAULT_CHANNEL = 'monitor';

export function listChannelIds() {
  return Object.keys(modules).map((path) => path.split('/')[1]);
}

/**
 * @param {string} id
 * @returns {Promise<import('../console/channel-host.js').Channel>}
 */
export async function loadChannel(id) {
  if (RESERVED_NAMESPACES.has(id)) throw new Error(`"${id}" is a reserved namespace`);
  const load = modules[`./${id}/index.js`];
  if (!load) throw new Error(`Unknown channel "${id}"`);
  const { default: channel } = /** @type {{ default: any }} */ (await load());
  if (typeof channel?.mount !== 'function') {
    throw new Error(`Channel "${id}" must default-export an object with a mount() function`);
  }
  return channel;
}
