/**
 * A game's best score ever on this console, kept in the browser's local
 * storage. Storage can be missing or blocked (private windows, strict privacy
 * settings), so every access is wrapped in try/catch and failure just means
 * "no personal best yet".
 *
 * @param {string} gameId  keeps each game's best separate
 */
export function createPersonalBest(gameId) {
  const key = `motion-console.${gameId}.best`;
  return {
    /** @returns {number} 0 if there's no saved best */
    load() {
      try {
        const saved = Number(localStorage.getItem(key));
        return Number.isFinite(saved) && saved > 0 ? saved : 0;
      } catch {
        return 0;
      }
    },

    /** @param {number} score */
    save(score) {
      try {
        localStorage.setItem(key, String(score));
      } catch {
        // Storage blocked: the best still shows until the page reloads.
      }
    },
  };
}
