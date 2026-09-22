import { createEmitter } from '../core/emitter.js';
import { MAX_PLAYERS } from '../core/players.js';

/**
 * @typedef {object} Player
 * @property {string} id    The controller's client id.
 * @property {number | null} slot  1-based slot, or null when the room is full (spectator).
 */

/**
 * The console's view of which controllers are playing and in which slot.
 * Slots are assigned on first contact and freed when the controller leaves.
 */
export function createPlayerRegistry() {
  /** @type {Map<string, Player>} */
  const players = new Map();
  const events = createEmitter();

  function freeSlot() {
    const taken = new Set([...players.values()].map((p) => p.slot));
    for (let slot = 1; slot <= MAX_PLAYERS; slot++) if (!taken.has(slot)) return slot;
    return null;
  }

  /** @returns {Player[]} sorted by slot, spectators last */
  function list() {
    return [...players.values()].sort((a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity));
  }

  const changed = () => events.emit('change', list());

  return {
    /** Registers a controller (idempotent) and returns its player record. */
    admit(id) {
      let player = players.get(id);
      if (!player) {
        player = { id, slot: freeSlot() };
        players.set(id, player);
        changed();
      }
      return player;
    },

    remove(id) {
      if (players.delete(id)) changed();
    },

    /** @returns {Player | undefined} */
    get: (id) => players.get(id),
    list,

    /** @param {(players: Player[]) => void} fn */
    onChange: (fn) => events.on('change', fn),
  };
}
