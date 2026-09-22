/** Best-effort device niceties. Every one of these is optional and may be unsupported. */

/** Fullscreen and portrait lock (Android Chrome). Must be called in a user gesture. */
export function enterFullscreen() {
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('portrait'))
    .catch(() => {});
}

/** Keeps the screen on while the controller is open, and re-acquires the lock when the tab becomes visible again. */
export function keepScreenAwake() {
  if (!('wakeLock' in navigator)) return;
  const acquire = () => navigator.wakeLock.request('screen').catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') acquire();
  });
  acquire();
}

/** @param {number | number[]} pattern */
export function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}
