/**
 * Launcher: the console's home screen.
 *
 * It shows a tile for every game in src/games/. Players point at a tile with
 * their phone and pull the trigger (Fire) to start it; on the console you can
 * also click a tile. During a game, Home on any phone (or Esc on the console)
 * pauses it, with a choice to resume or quit to the menu.
 *
 * The launcher is always in one of three modes:
 *
 *   menu ──pick a tile──▶ loading ──downloaded──▶ playing ◀──┐
 *     ▲                      │                       │        │ Resume
 *     │                      │                     Home       │ (after 3-2-1)
 *     │                      │                       ▼        │
 *     └────── Home ──────────┴───── Quit ──────── paused ─────┘
 *
 * "Paused" is part of playing: the game is still loaded, just frozen, with
 * the pause screen on top. Games that don't support pausing (no pause()
 * function) quit straight to the menu on Home instead.
 *
 * The game also pauses by itself if a player's phone disconnects or the
 * console's browser tab is hidden, so nobody comes back to a lost round.
 *
 * Games follow the start/stop contract in src/games/game.js. Each one gets
 * its own copy of the controller API, so when it stops, anything it forgot
 * to unsubscribe is cleaned up too.
 */
import './launcher.css';
import { BUTTONS, INPUT } from '../../core/protocol.js';
import { listGames, loadGame } from '../../games/index.js';
import { createMenu } from './menu.js';
import { createPauseOverlay } from './pause.js';
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
     *   | {
     *       name: 'playing',
     *       game: import('../../games/game.js').Game,
     *       container: HTMLElement,
     *       scope: ReturnType<typeof createScopedController>,
     *       pause: ReturnType<typeof createPauseOverlay> | null,
     *     }}
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

      const scope = createScopedController(api);
      mode = { name: 'playing', game, container, scope, pause: null };
      document.title = `${game.name} · Motion Console`;
      setGameParam(id);
      try {
        game.start(container, scope.controller);
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
      mode.pause?.destroy();
      try {
        mode.game.stop();
      } catch (err) {
        console.error(err);
      }
      mode.scope.dispose();
    }

    /**
     * Freezes the game and shows the pause screen. Returns false if the game
     * can't pause.
     *
     * @param {string} [reason]  shown on the pause screen
     */
    function pauseGame(reason) {
      if (mode.name !== 'playing') return false;
      if (mode.pause) return true;
      const { game, container, scope } = mode;
      if (typeof game.pause !== 'function' || typeof game.resume !== 'function') return false;
      try {
        game.pause();
      } catch (err) {
        console.error(err);
        return false;
      }
      scope.setMuted(true);
      mode.pause = createPauseOverlay({
        container,
        api,
        gameName: game.name,
        reason,
        onResume: resumeGame,
        onQuit: () => goHome(),
      });
      return true;
    }

    /** Called when the resume countdown finishes. */
    function resumeGame() {
      if (mode.name !== 'playing' || !mode.pause) return;
      mode.pause.destroy();
      mode.pause = null;
      mode.scope.setMuted(false);
      try {
        mode.game.resume();
      } catch (err) {
        console.error(err);
        goHome(`${mode.game.name} hit a problem and was closed. ${err.message}`);
      }
    }

    /**
     * Home on a phone or Esc on the console:
     *   playing → pause (or quit, for games that can't pause)
     *   paused  → resume
     *   loading → cancel
     */
    function onHome() {
      if (mode.name === 'loading') return goHome();
      if (mode.name !== 'playing') return;
      if (!mode.pause) {
        if (!pauseGame()) goHome();
      } else if (!mode.pause.counting) {
        mode.pause.resume();
      }
    }

    const offHome = api.onInput(INPUT.BUTTON, ({ id, down }) => {
      if (id === BUTTONS.HOME && down) onHome();
    });
    const onKey = (event) => event.key === 'Escape' && onHome();
    window.addEventListener('keydown', onKey);

    // Pause by itself when the console tab is hidden…
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pauseGame();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // …or when a player's phone disconnects.
    const slotted = (players) =>
      new Set(players.filter((player) => player.slot !== null).map((player) => player.id));
    let connected = slotted(api.players.list());
    const offPlayers = api.players.onChange((players) => {
      const now = slotted(players);
      const someoneLeft = [...connected].some((id) => !now.has(id));
      connected = now;
      if (someoneLeft) pauseGame('A controller disconnected.');
    });

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
      offPlayers();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },
};
