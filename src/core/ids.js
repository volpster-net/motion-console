// No I or O: they're easily confused with 1 and 0 when read off a screen.
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CLIENT_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const ROOM_CODE_LENGTH = 4;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Uniformly random string; rejects bytes that would bias the modulo. */
function randomString(alphabet, length) {
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

export function generateRoomCode() {
  return randomString(ROOM_ALPHABET, ROOM_CODE_LENGTH);
}

/**
 * Accepts user-typed input ("ab cd", "abcd\n") and returns a canonical room
 * code, or null if it can't be one.
 *
 * @param {string} input
 * @returns {string | null}
 */
export function normalizeRoomCode(input) {
  const code = String(input)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/** @param {string} prefix e.g. 'p' for players, 'console' for consoles */
export function createClientId(prefix) {
  return `${prefix}_${randomString(CLIENT_ALPHABET, 8)}`;
}
