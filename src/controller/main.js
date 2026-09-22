import '../ui/base.css';
import './controller.css';
import { createClientId, normalizeRoomCode } from '../core/ids.js';
import { playerColor, playerLabel } from '../core/players.js';
import { BUTTONS, INPUT, NS, OUTPUT, parseVibration, SYS } from '../core/protocol.js';
import { joinRoom } from '../core/transport.js';
import { renderFatal } from '../ui/fatal.js';
import { formatSigned } from '../ui/format.js';
import { enterFullscreen, keepScreenAwake, vibrate } from './device.js';
import { createMotionSensor } from './motion.js';
import { startMotionStream } from './motion-stream.js';

// Per-tab, so a reload rejoins as the same player and keeps its slot.
const PLAYER_ID_STORAGE_KEY = 'motion-console.player-id';
const DEFAULT_SEND_HZ = 60;
const MIN_SEND_HZ = 10;
const MAX_SEND_HZ = 60;
const SENSOR_GRACE_MS = 1500;

const $ = (selector) => /** @type {HTMLElement} */ (document.querySelector(selector));
const params = new URLSearchParams(location.search);

const screens = {
  join: $('#screen-join'),
  start: $('#screen-start'),
  pad: $('#screen-pad'),
};

/** @param {keyof typeof screens} name */
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

function getPlayerId() {
  let id = sessionStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (!id) {
    id = createClientId('p');
    sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, id);
  }
  return id;
}

/** Send rate, overridable for experiments with `?hz=60`. */
function getSendHz() {
  const requested = Number(params.get('hz')) || DEFAULT_SEND_HZ;
  return Math.min(MAX_SEND_HZ, Math.max(MIN_SEND_HZ, requested));
}

/** @param {string} state @param {string} text */
function setStatus(state, text) {
  const el = $('#pad-status');
  el.dataset.state = state;
  el.textContent = text;
}

/** @param {number | null | undefined} slot  undefined = not welcomed yet */
function setPlayer(slot) {
  const badge = $('#player-badge');
  if (slot === undefined) {
    badge.textContent = '–';
    document.body.style.removeProperty('--player');
    return;
  }
  badge.textContent = playerLabel(slot);
  document.body.style.setProperty('--player', playerColor(slot));
  setStatus('ready', slot ? `Player ${slot}` : 'Room full, spectating');
}

function showJoin() {
  showScreen('join');
  const input = /** @type {HTMLInputElement} */ ($('#join-code'));
  $('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = normalizeRoomCode(input.value);
    $('#join-error').hidden = !!code;
    if (!code) return input.focus();
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    history.replaceState(null, '', url);
    showStart(code);
  });
  input.focus();
}

/** @param {string} code */
function showStart(code) {
  showScreen('start');
  $('#start-code').textContent = code;
  $('#start-btn').addEventListener(
    'click',
    () => {
      // Everything that needs a user gesture runs synchronously, before any await.
      const sensor = createMotionSensor();
      const permission = sensor.start();
      enterFullscreen();
      keepScreenAwake();
      connect(code, sensor, permission);
    },
    { once: true },
  );
}

/**
 * @param {string} code
 * @param {ReturnType<typeof createMotionSensor>} sensor
 * @param {Promise<string>} permission
 */
async function connect(code, sensor, permission) {
  showScreen('pad');
  $('#pad-room').textContent = code;
  setStatus('connecting', 'Connecting…');
  startReadout(sensor);
  reportSensorProblems(sensor, permission);

  let room;
  try {
    room = await joinRoom(code, { id: getPlayerId(), meta: { role: 'controller' } });
  } catch (err) {
    console.error(err);
    renderFatal({ title: 'Could not connect', message: err.message });
    return;
  }
  runSession(room, sensor);
}

/**
 * @param {import('../core/transport.js').Room} room
 * @param {ReturnType<typeof createMotionSensor>} sensor
 */
function runSession(room, sensor) {
  // Track console sessions, not ids: a reloaded console keeps its id but gets a new session.
  const consoleSessionsIn = (peers) =>
    new Set(peers.filter((peer) => peer.role === 'console').map((peer) => peer.session));
  let consoleSessions = consoleSessionsIn(room.peers());
  const sayHello = () => room.send(NS.SYS, SYS.HELLO, {});

  room.on('message', (msg) => {
    if (msg.ch === NS.SYS && msg.type === SYS.WELCOME) {
      setPlayer(msg.d.slot);
      vibrate(40);
    }
    // Games can buzz this phone, e.g. harder for a hit than a miss.
    if (msg.ch === NS.OUTPUT && msg.type === OUTPUT.VIBRATE) {
      const pattern = parseVibration(msg.d.pattern);
      if (pattern !== null) vibrate(pattern);
    }
  });

  room.on('presence', (peers) => {
    const next = consoleSessionsIn(peers);
    const consoleArrived = [...next].some((session) => !consoleSessions.has(session));
    consoleSessions = next;
    if (consoleArrived) {
      sayHello(); // a console (re)joined: introduce ourselves so it assigns a slot
    } else if (next.size === 0) {
      setPlayer(undefined);
      setStatus('waiting', 'Waiting for console…');
    }
  });

  room.on('status', (status) => {
    if (status === 'connected') {
      setStatus('waiting', 'Waiting for console…');
      sayHello();
    } else {
      setStatus(status, status === 'closed' ? 'Disconnected' : 'Reconnecting…');
    }
  });

  setStatus('waiting', 'Waiting for console…');
  sayHello();

  startMotionStream({ onSample: sensor.onSample, send: room.send, hz: getSendHz() });
  // The console does the aiming; the phone only reports presses and buzzes.
  bindButton($('#fire-btn'), BUTTONS.FIRE, room, { key: ' ', onDown: () => vibrate(30) });
  bindButton($('#recenter-btn'), BUTTONS.RECENTER, room, { key: 'r', onDown: () => vibrate(25) });
  bindButton($('#home-btn'), BUTTONS.HOME, room, { key: 'h', onDown: () => vibrate(25) });
}

/**
 * Sends `button` messages on press and release. Pointer capture keeps a
 * press alive if the thumb slides off the button. A keyboard key is bound too,
 * for testing on a desktop.
 *
 * @param {HTMLElement} el
 * @param {string} id
 * @param {import('../core/transport.js').Room} room
 * @param {{ key: string, onDown?: () => void }} options
 */
function bindButton(el, id, room, { key, onDown }) {
  let down = false;
  const set = (next) => {
    if (next === down) return;
    down = next;
    el.classList.toggle('is-down', down);
    if (down) onDown?.();
    room.send(NS.INPUT, INPUT.BUTTON, { id, down });
  };

  el.addEventListener('pointerdown', (event) => {
    el.setPointerCapture(event.pointerId);
    set(true);
  });
  el.addEventListener('pointerup', () => set(false));
  el.addEventListener('pointercancel', () => set(false));
  el.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('keydown', (event) => {
    if (event.key !== key) return;
    event.preventDefault();
    if (!event.repeat) set(true);
  });
  window.addEventListener('keyup', (event) => event.key === key && set(false));
  window.addEventListener('blur', () => set(false));
}

/** Local readout of the raw rotation rate, updated once per frame. */
function startReadout(sensor) {
  const outputs = { alpha: $('#alpha'), beta: $('#beta'), gamma: $('#gamma') };
  requestAnimationFrame(function frame() {
    const sample = sensor.read();
    if (sample) {
      for (const [axis, el] of Object.entries(outputs)) {
        el.textContent = formatSigned(sample[axis]);
      }
    }
    requestAnimationFrame(frame);
  });
}

async function reportSensorProblems(sensor, permission) {
  const warn = (text) => {
    const el = $('#sensor-warning');
    el.textContent = `${text} Buttons still work.`;
    el.hidden = false;
  };
  if (!window.isSecureContext) return warn('Motion sensors need HTTPS.');
  const state = await permission;
  if (state === 'unsupported') return warn('This browser has no motion sensor API.');
  if (state === 'denied') return warn('Motion sensor access was denied.');
  setTimeout(() => {
    if (!sensor.hasData) warn('No motion data yet. This device may not have a gyroscope.');
  }, SENSOR_GRACE_MS);
}

function main() {
  const code = normalizeRoomCode(params.get('room') ?? '');
  if (code) showStart(code);
  else showJoin();
}

main();
