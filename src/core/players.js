export const MAX_PLAYERS = 4;

/** Slot colours, P1–P4, in the spirit of the Wii Remote's player LEDs. */
export const PLAYER_COLORS = ['#1f9bf0', '#f0414f', '#23b566', '#f2a900'];

const SPECTATOR_COLOR = '#98a3af';

/** @param {number | null} slot 1-based player slot, or null for spectators */
export function playerColor(slot) {
  return slot ? PLAYER_COLORS[(slot - 1) % PLAYER_COLORS.length] : SPECTATOR_COLOR;
}

/** @param {number | null} slot */
export function playerLabel(slot) {
  return slot ? `P${slot}` : 'Spectator';
}
