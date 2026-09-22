/**
 * The list of games. Every folder in src/games/ with a meta.js and an
 * index.js is a game; adding a folder adds it to the launcher menu.
 *
 * Each meta.js is bundled with the menu (it's tiny). Each index.js is split
 * into its own download by Vite, fetched only when that game is picked.
 */

/** @type {Record<string, import('./game.js').GameMeta>} */
const metas = import.meta.glob('./*/meta.js', { eager: true, import: 'default' });
const loaders = import.meta.glob('./*/index.js', { import: 'default' });

const folderOf = (path) => path.split('/')[1];

/** @returns {import('./game.js').GameMeta[]} every game, sorted by name */
export function listGames() {
  return Object.entries(metas)
    .filter(([path, meta]) => {
      const folder = folderOf(path);
      if (meta?.id !== folder) {
        console.warn(`[games] ${path}: id "${meta?.id}" must match its folder name "${folder}"`);
        return false;
      }
      return `./${folder}/index.js` in loaders;
    })
    .map(([, meta]) => meta)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Downloads and returns a game.
 *
 * @param {string} id
 * @returns {Promise<import('./game.js').Game>}
 */
export async function loadGame(id) {
  const load = loaders[`./${id}/index.js`];
  if (!load || !listGames().some((game) => game.id === id)) {
    throw new Error(`Unknown game "${id}"`);
  }
  const game = /** @type {any} */ (await load());
  if (typeof game?.start !== 'function' || typeof game?.stop !== 'function') {
    throw new Error(`Game "${id}" must default-export an object with start() and stop()`);
  }
  return game;
}
