/**
 * The best score ever reached on this console, kept in the browser's local
 * storage. Storage can be missing or blocked (private windows, strict privacy
 * settings), so every access is wrapped in try/catch and failure just means
 * "no personal best yet".
 */
const STORAGE_KEY = 'motion-console.target-practice.best';

/** @returns {number} 0 if there's no saved best */
export function loadPersonalBest() {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

/** @param {number} score */
export function savePersonalBest(score) {
  try {
    localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    // Storage blocked: the best still shows until the page reloads.
  }
}
