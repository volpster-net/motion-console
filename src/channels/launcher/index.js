/**
 * Launcher: the console's home screen.
 *
 * It shows a tile for every game in src/games/. Players point at a tile with
 * their phone and pull the trigger (Fire) to start it; on the console you can
 * also click a tile. During a game, Home on any phone (or Esc on the console)
 * stops it and comes back here.
 *
 * The launcher is always in one of three modes:
 *
 *   menu ──pick a tile──▶ loading ──downloaded──▶ playing
 *     ▲                      │                       │
 *     └────── Home ──────────┴──────── Home ─────────┘
 *
 * Games follow the start/stop contract in src/games/game.js. Each one gets
 * its own copy of the controller API, so when it stops, anything it forgot
 * to unsubscribe is cleaned up too.
 */
import './launcher.css';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { listGames, loadGame } from '../../games/index.js';
import { createMenu } from './menu.js';
import { createScopedController } from './scoped-controller.js';

const GAME_PARAM = 'game';
const HOME_TITLE = 'Home · Motion Console';

/** Puts the running game in the address bar, so reloading the console goes straight back to it. */
function setGameParam(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set(GAME_PARAM, id);
  else url.searchParams.delete(GAME_PARAM);
  history.replaceState(null, '', url);
}

/** @type {import('../../console/channel-host.js').Channel} */
export default {
  title: 'Home',

  mount(root, api) {
    root.classList.add('launcher');
    const games = listGames();

    /**
     * @type {{ name: 'menu' }
     *   | { name: 'loading', id: string }
     *   | { name: 'playing', game: import('../../games/game.js').Game, dispose: () => void }}
     */
    let mode = { name: 'menu' };
    /** @type {ReturnType<typeof createMenu> | null} */
    let menu = null;

    function showMenu(error) {
      document.title = HOME_TITLE;
      menu = createMenu({ root, api, games, onPick: startGame });
      if (error) menu.showError(error);
    }

    /** @param {string} id */
    async function startGame(id) {
      if (mode.name !== 'menu') return;
      const loading = { name: /** @type {const} */ ('loading'), id };
      mode = loading;
      menu?.showLoading(id);

      let game;
      try {
        game = await loadGame(id);
      } catch (err) {
        console.error(err);
        mode = { name: 'menu' };
        menu?.showError(`Couldn't load that game. ${err.message}`);
        return;
      }
      // Home was pressed (or the launcher closed) while it downloaded.
      if (mode !== loading) return;

      menu?.destroy();
      menu = null;
      const container = document.createElement('div');
      container.className = 'launcher-game';
      root.replaceChildren(container);

      const { controller, dispose } = createScopedController(api);
      mode = { name: 'playing', game, dispose };
      document.title = `${game.name} · Motion Console`;
      setGameParam(id);
      try {
        game.start(container, controller);
      } catch (err) {
        console.error(err);
        goHome(`${game.name} hit a problem and was closed. ${err.message}`);
      }
    }

    /** Stops whatever is running and shows the menu. */
    function goHome(error) {
      if (mode.name === 'menu') return;
      stopGame();
      mode = { name: 'menu' };
      setGameParam(null);
      menu?.destroy(); // still up if Home was pressed while a game was loading
      root.replaceChildren();
      showMenu(error);
    }

    function stopGame() {
      if (mode.name !== 'playing') return;
      try {
        mode.game.stop();
      } catch (err) {
        console.error(err);
      }
      mode.dispose();
    }

    // Home on any phone, or Esc on the console, always comes back here.
    const offHome = api.onInput(INPUT.BUTTON, ({ id, down }) => {
      if (id === BUTTONS.HOME && down) goHome();
    });
    const onKey = (event) => event.key === 'Escape' && goHome();
    window.addEventListener('keydown', onKey);

    showMenu();
    // `?game=target-practice` in the console's address jumps straight into a game.
    const requested = new URLSearchParams(location.search).get(GAME_PARAM);
    if (requested) {
      if (games.some((game) => game.id === requested)) startGame(requested);
      else setGameParam(null);
    }

    return () => {
      stopGame();
      mode = { name: 'menu' };
      menu?.destroy();
      offHome();
      window.removeEventListener('keydown', onKey);
    };
  },
};
