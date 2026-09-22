/**
 * Minimal event emitter. Listener errors are caught and logged so one faulty
 * subscriber (say, a buggy channel) can't break delivery to the others.
 */
export function createEmitter() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  return {
    /**
     * @param {string} event
     * @param {Function} fn
     * @returns {() => void} unsubscribe
     */
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },

    /** @param {string} event */
    emit(event, ...args) {
      for (const fn of listeners.get(event) ?? []) {
        try {
          fn(...args);
        } catch (err) {
          console.error(`[emitter] "${event}" listener threw`, err);
        }
      }
    },

    clear() {
      listeners.clear();
    },
  };
}
