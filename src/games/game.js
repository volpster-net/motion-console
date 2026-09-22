/**
 * The contract every game follows, so a launcher can start and stop any of
 * them the same way.
 *
 * A game is a folder in src/games/ whose index.js default-exports:
 *
 *   {
 *     id:          'target-practice',          unique, used in URLs
 *     name:        'Target Practice',          shown to players
 *     description: 'Hit the rings…',           one sentence for a menu
 *     start(container, controller) { … },     draw into `container`, listen to `controller`
 *     stop() { … },                            undo everything start() did
 *   }
 *
 * stop() must leave nothing behind: no animation loops, timers, event
 * listeners, sounds, or elements. A launcher will start and stop games many
 * times in one session, and anything left running would pile up.
 *
 * @typedef {import('../console/channel-host.js').ChannelApi} GameController
 *   Everything a game can do with the players' phones: see who's playing
 *   (`players`), hear their motion and buttons (`onInput`), and buzz them
 *   (`vibrate`).
 *
 * @typedef {object} Game
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {(container: HTMLElement, controller: GameController) => void} start
 * @property {() => void} stop
 */

/**
 * Wraps a game so the console's channel host can run it. Until there's a
 * launcher menu, this is how a game gets on screen.
 *
 * @param {Game} game
 * @returns {import('../console/channel-host.js').Channel}
 */
export function gameAsChannel(game) {
  return {
    title: game.name,
    mount(root, api) {
      game.start(root, api);
      return () => game.stop();
    },
  };
}
