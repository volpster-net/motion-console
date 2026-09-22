/**
 * The contract every game follows, so the launcher can list, start, and stop
 * any of them the same way.
 *
 * A game is a folder in src/games/ with two files:
 *
 *   meta.js   default-exports what the menu shows (GameMeta below). It's
 *             small, so the menu can load every game's meta.js up front.
 *
 *   index.js  default-exports the game itself, loaded only when it's picked:
 *
 *     {
 *       id, name, description,                  the same as meta.js
 *       start(container, controller) { … },     draw into `container`, listen to `controller`
 *       stop() { … },                            undo everything start() did
 *     }
 *
 * stop() must leave nothing behind: no animation loops, timers, event
 * listeners, sounds, or elements. The launcher starts and stops games many
 * times in one session, and anything left running would pile up. (As a
 * safety net, the launcher also removes any `controller` subscriptions a game
 * forgets, but it can't see timers or window listeners.)
 *
 * @typedef {object} GameMeta
 * @property {string} id           Unique, the same as the folder name. Used in URLs (?game=id).
 * @property {string} name         Shown to players.
 * @property {string} description  One sentence for the menu.
 * @property {string} [art]        Optional inline <svg> for the menu tile.
 *
 * @typedef {object} GameController
 *   Everything a game can do with the players' phones.
 * @property {{
 *   list: () => import('../console/players.js').Player[],
 *   get: (id: string) => import('../console/players.js').Player | undefined,
 *   onChange: (fn: (players: import('../console/players.js').Player[]) => void) => () => void,
 * }} players  Who's connected, in slot order.
 * @property {(type: string, fn: import('../console/channel-host.js').MessageHandler) => () => void} onInput
 *   Hear phone input: `onInput(INPUT.MOTION, …)` or `onInput(INPUT.BUTTON, …)`. Returns an unsubscribe function.
 * @property {(playerId: string, pattern: number | number[]) => boolean} vibrate
 *   Buzz one player's phone. `pattern` is as for navigator.vibrate().
 *
 * @typedef {GameMeta & {
 *   start: (container: HTMLElement, controller: GameController) => void,
 *   stop: () => void,
 * }} Game
 */

export {};
