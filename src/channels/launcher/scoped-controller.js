/**
 * Gives a game its own copy of the controller API and keeps track of every
 * subscription the game makes through it. When the game is stopped, the
 * launcher calls `dispose()` to remove any the game forgot, so a buggy game
 * can't keep reacting to phones after it's gone.
 *
 * @param {import('../../console/channel-host.js').ChannelApi} api  the launcher's own channel API
 * @returns {{ controller: import('../../games/game.js').GameController, dispose: () => void }}
 */
export function createScopedController(api) {
  /** @type {Set<() => void>} */
  const subscriptions = new Set();
  let disposed = false;

  /** Remembers an unsubscribe function, and returns one that also forgets it. */
  function track(off) {
    if (disposed) {
      off();
      return () => {};
    }
    const unsubscribe = () => {
      subscriptions.delete(unsubscribe);
      off();
    };
    subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  return {
    controller: {
      players: {
        list: api.players.list,
        get: api.players.get,
        onChange: (fn) => track(api.players.onChange(fn)),
      },
      onInput: (type, fn) => track(api.onInput(type, fn)),
      vibrate: (playerId, pattern) => !disposed && api.vibrate(playerId, pattern),
    },

    dispose() {
      disposed = true;
      for (const unsubscribe of [...subscriptions]) unsubscribe();
    },
  };
}
