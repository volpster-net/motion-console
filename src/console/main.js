import QRCode from 'qrcode';
import '../ui/base.css';
import './console.css';
import { DEFAULT_CHANNEL, listChannelIds } from '../channels/index.js';
import { createClientId, generateRoomCode, normalizeRoomCode } from '../core/ids.js';
import { playerColor, playerLabel } from '../core/players.js';
import { NS, SYS } from '../core/protocol.js';
import { joinRoom } from '../core/transport.js';
import { renderFatal } from '../ui/fatal.js';
import { createChannelHost } from './channel-host.js';
import { createPlayerRegistry } from './players.js';

// Per-tab, so a page reload keeps the same code and phones stay connected.
const ROOM_STORAGE_KEY = 'motion-console.room';
// Also per-tab: after a reload, Supabase can keep the old page's presence for
// several seconds. Reusing the id means that stale entry counts as us, not as
// a rival console, so the claim below keeps the code.
const CONSOLE_ID_STORAGE_KEY = 'motion-console.console-id';
const MAX_CLAIM_ATTEMPTS = 5;

const $ = (selector) => /** @type {HTMLElement} */ (document.querySelector(selector));

/**
 * Joins a room and checks, via presence, that no other console already owns
 * it. If one does (a code collision), tries a new code.
 *
 * @param {string} consoleId
 */
async function claimRoom(consoleId) {
  // Unique per page load, so controllers can tell a reloaded console from the old one.
  const session = createClientId('s');
  let code =
    normalizeRoomCode(sessionStorage.getItem(ROOM_STORAGE_KEY) ?? '') ?? generateRoomCode();
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    const room = await joinRoom(code, { id: consoleId, meta: { role: 'console', session } });
    const peers = await room.waitForSelf();
    if (!peers.some((peer) => peer.role === 'console' && peer.id !== consoleId)) {
      sessionStorage.setItem(ROOM_STORAGE_KEY, code);
      return room;
    }
    await room.leave();
    code = generateRoomCode();
  }
  throw new Error('Could not find a free room code. Please reload.');
}

function getConsoleId() {
  let id = sessionStorage.getItem(CONSOLE_ID_STORAGE_KEY);
  if (!id) {
    id = createClientId('console');
    sessionStorage.setItem(CONSOLE_ID_STORAGE_KEY, id);
  }
  return id;
}

function controllerUrl(code) {
  const url = new URL('controller/', new URL(import.meta.env.BASE_URL, location.origin));
  url.searchParams.set('room', code);
  return url.href;
}

async function renderJoinInfo(code) {
  const url = controllerUrl(code);
  $('#room-code').textContent = code;
  const link = /** @type {HTMLAnchorElement} */ ($('#join-url'));
  link.href = url;
  link.textContent = url.replace(/^https?:\/\//, '');
  $('#qr').innerHTML = await QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1d2733', light: '#0000' },
  });
  $('#host-warning').hidden = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

/** @param {import('./players.js').Player[]} players */
function renderPlayers(players) {
  const list = $('#player-list');
  if (players.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'player-empty';
    empty.textContent = 'Waiting for controllers…';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(
    ...players.map((player) => {
      const item = document.createElement('li');
      item.className = 'player';
      item.style.setProperty('--player', playerColor(player.slot));
      const badge = document.createElement('span');
      badge.className = 'player-badge';
      badge.textContent = player.slot ? `P${player.slot}` : '–';
      const name = document.createElement('span');
      name.textContent = player.slot ? `Player ${player.slot}` : playerLabel(null);
      const id = document.createElement('code');
      id.className = 'player-id';
      id.textContent = player.id;
      item.append(badge, name, id);
      return item;
    }),
  );
}

/** @param {string} state @param {string} [code] */
function renderStatus(state, code) {
  const labels = {
    connected: `Online · room ${code}`,
    reconnecting: 'Reconnecting…',
    closed: 'Disconnected. Reload to reconnect.',
  };
  const el = $('#connection-status');
  el.dataset.state = state;
  el.textContent = labels[state] ?? state;
}

async function main() {
  renderPlayers([]);
  const room = await claimRoom(getConsoleId());
  await renderJoinInfo(room.code);
  renderStatus('connected', room.code);
  room.on('status', (status) => renderStatus(status, room.code));

  const players = createPlayerRegistry();
  const host = createChannelHost({ room, players, stage: $('#stage') });
  players.onChange(renderPlayers);

  room.on('message', (msg) => {
    if (msg.ch === NS.SYS && msg.type === SYS.HELLO) {
      const player = players.admit(msg.from);
      room.send(NS.SYS, SYS.WELCOME, { slot: player.slot, channel: host.activeId }, msg.from);
    }
  });
  room.on('leave', (id) => players.remove(id));

  await host.start(requestedChannel() ?? DEFAULT_CHANNEL);
}

/** Lets `?channel=monitor` pick a channel until there's a menu to choose from. */
function requestedChannel() {
  const id = new URLSearchParams(location.search).get('channel');
  return id && listChannelIds().includes(id) ? id : null;
}

main().catch((err) => {
  console.error(err);
  renderFatal({ title: 'The console could not start', message: err.message });
});
