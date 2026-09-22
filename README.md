# Motion Console

A Wii-inspired game console that runs in the browser, with your phone as the motion controller.
Open the console on a laptop or TV, scan the QR code with an Android phone, and the phone's
gyroscope becomes a pointer, with buttons.

**Live demo: [motion.volpster.net](https://motion.volpster.net)**. Open it on a laptop or TV, then scan the QR code with your phone.

<p>
  <img src="docs/console.png" alt="Console page showing the room QR code, the connected players, and live input data" width="640" />
  <img src="docs/controller.png" alt="Controller page on a phone with a sensor readout, Re-center button and a large Fire button" width="150" />
</p>

**Status: Milestone 2.** Pairing, buttons, and crosshair aiming work end to end. Point the phone at
the screen and a crosshair follows it. Games come next.

## How it works

```mermaid
flowchart LR
  subgraph Phone["Phone · /controller/"]
    S[devicemotion rotation rate] -->|up to 60 Hz| T1[transport]
    B[Fire / Re-center] --> T1
  end
  subgraph Supabase["Supabase Realtime · room:ABCD"]
    BC[(Broadcast)]
    PR[(Presence)]
  end
  subgraph Console["Console · /"]
    T2[transport] --> H[channel host]
    H --> C1[aim channel]
    C1 --> A[aim tracker]
    H -.-> C2[future games…]
    C2 -.-> A
  end
  T1 <--> BC <--> T2
  T1 <--> PR <--> T2
```

1. The console picks a 4-letter room code (no `I` or `O`, which look like `1` and `0`). It joins
   the Supabase Realtime channel `room:<CODE>` and shows a QR code for `/controller/?room=<CODE>`.
   It also checks, through presence, that no other console already owns that code.
2. The phone joins the same channel and sends `sys/hello`. The console replies with `sys/welcome`
   and a player slot (P1–P4).
3. The phone forwards its gyroscope's raw rotation rate (how fast it's turning, in degrees per
   second) up to 60 times a second, each reading stamped with the phone's clock. It also sends a
   press and a release event for each button. The phone does no maths.
4. The console routes each message to the active **channel**: a pluggable screen such as a game,
   a menu, or the Milestone 2 Aim screen. Channels turn motion into a crosshair with the shared
   **aim tracker** (below).

### Design decisions

| Decision                                     | Why                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vanilla JS + Vite, no framework**          | The app is two small pages plus a hot input loop, and future games will draw to canvas. A reactive framework would sit between sensor events and pixels and add weight to the phone page without paying for itself. Vite provides ES modules, HMR, env vars, a multi-page build, and `import.meta.glob` for plugin discovery. |
| **One broadcast event, routing in our code** | Every message is the same envelope on a single Supabase event. The core routes by namespace (`ch`), so Supabase never needs to know which games exist.                                                                                                                                                                        |
| **Transport behind one module**              | `src/core/transport.js` is the only file that imports Supabase. Swapping to WebRTC data channels for lower latency would change one file.                                                                                                                                                                                     |
| **A dumb phone, a smart console**            | The phone sends raw sensor data and button presses, nothing else. All aiming maths, tuning, and calibration live on the console, so they can change (or differ per game) without touching the phone page.                                                                                                                     |
| **Rotation rate, not orientation angles**    | Rotation rate comes straight from the gyroscope, so it responds instantly and games can apply their own deadzone and smoothing. It has to be added up over time (integrated), which the aim tracker does.                                                                                                                     |
| **Integrate by the phone's timestamps**      | Messages cross the internet in uneven bursts. Each sample carries the time the phone measured it, and the console replays samples by those times, so network jitter doesn't change crosshair speed.                                                                                                                           |
| **Rate-capped sending**                      | Phones fire `devicemotion` at 50–200+ Hz. Capping at 60 Hz keeps bandwidth and Supabase's message quota predictable; the timestamps mean skipped readings don't distort aiming.                                                                                                                                               |
| **Re-centering on the console**              | Re-center snaps the crosshair to the middle in the aim tracker. The phone just reports the button, so every game gets the same behaviour for free.                                                                                                                                                                            |
| **DOM updates once per frame**               | Messages only update state. `requestAnimationFrame` writes to the DOM, so 60 messages a second never cause 60 layouts.                                                                                                                                                                                                        |
| **`core/` has no DOM**                       | The protocol, IDs, and emitter are pure and unit-tested. So is the aiming maths in `src/aim/`.                                                                                                                                                                                                                                |

## Message protocol

Every message is one envelope:

```js
{
  v: 2,              // protocol version; other versions are dropped
  ch: 'input',       // namespace: 'sys' | 'input' | <channel id>
  type: 'motion',    // message type within the namespace
  from: 'p_k3j9x2qa',// sender id
  to: 'console_…',   // optional: unicast. Omitted = everyone in the room
  seq: 1042,         // per-sender counter, used to count lost messages
  d: { … }           // payload
}
```

| `ch`           | `type`    | Direction                | `d`                                                |
| -------------- | --------- | ------------------------ | -------------------------------------------------- |
| `sys`          | `hello`   | controller → console     | `{}`                                               |
| `sys`          | `welcome` | console → one controller | `{ slot: 1-4 \| null, channel }`                   |
| `sys`          | `channel` | console → all            | `{ id }` (active channel changed)                  |
| `input`        | `motion`  | controller → console     | `{ alpha, beta, gamma, gx, gy, gz, t }`: see below |
| `input`        | `button`  | controller → console     | `{ id: 'fire' \| 'recenter', down: boolean }`      |
| `<channel id>` | anything  | either way               | defined by that channel                            |

`alpha`, `beta`, and `gamma` are the phone's raw rotation rate in degrees per second
([`DeviceMotionEvent.rotationRate`](https://developer.mozilla.org/docs/Web/API/DeviceMotionEvent/rotationRate)).
Which phone axis each one means depends on the browser (see [Aiming](#aiming)). `gx`, `gy`, `gz`
are the accelerometer including gravity, in m/s² along the phone's x, y, z axes; they're omitted
if the phone doesn't provide them.
`t` is when the phone measured them, in milliseconds on the phone's own clock; only the gaps
between samples matter. `sys` and `input` are reserved. Any other `ch` value
belongs to the channel with that id, which isolates games from the core and from each other.

## Aiming

`src/aim/` turns a phone's spin into a crosshair position. Every game should use it rather than
doing its own maths. The code comments explain each step in plain language.

1. **Find left/right and up/down.** The gyroscope measures spin around the phone's own axes, but
   aiming happens in the room. The phone also sends its gravity reading, so the console knows which
   way is up. Left/right is spin around the vertical, and up/down is spin around a flat
   left-to-right line. Twisting your wrist is neither, so it's ignored. This works whether the
   phone is held flat like a TV remote, upright like a camera, or anywhere in between.
2. **Deadzone.** Turning slower than a threshold counts as still, so sensor noise and shaky hands
   don't make the crosshair creep.
3. **Integrate.** Speed × time = distance: each sample moves the crosshair by
   `rate × (time since the previous sample) × sensitivity`, using the phone's timestamps.
   At sensitivity 1, a 30° turn crosses one screen height.
4. **Clamp.** The crosshair stops at the edges and comes back as soon as you turn back.
5. **Smooth.** The drawn crosshair glides towards the true position each frame, which hides jitter.
   The formula is frame-rate independent, so it feels the same at 60 Hz and 120 Hz.

Positions are in _screen heights_ from the centre, so the same wrist movement feels the same on a
laptop and a TV. `toPixels()` converts them for drawing.

**Browsers disagree about the axes.** The W3C spec says `alpha` is the spin around the axis out of
the screen, but Chrome on Android reports `alpha`, `beta`, `gamma` as the x, y, z axes in order.
Mixing them up turns wrist twists into aiming. The default is Android Chrome's order, and the tuning
panel can switch it.

**Tuning.** Press <kbd>D</kbd> on the console to open a panel with sliders for sensitivity,
deadzone, and smoothing, an axis-order menu, and each controller's live raw values next to the
turn/tip speeds aiming uses. Settings apply instantly and are saved in that browser.

## Writing a channel

A channel is a folder. Create `src/channels/<id>/index.js`:

```js
import { createAimTracker, loadAimSettings, toPixels } from '../../aim/index.js';
import { BUTTONS, INPUT } from '../../core/protocol.js';

/** @type {import('../../console/channel-host.js').Channel} */
export default {
  title: 'Target Practice',

  mount(root, api) {
    root.innerHTML = '<canvas></canvas>';
    const tracker = createAimTracker(loadAimSettings());

    api.onInput(INPUT.MOTION, (sample, { player }) => tracker.push(player.id, sample));
    api.onInput(INPUT.BUTTON, ({ id, down }, { player }) => {
      if (id === BUTTONS.RECENTER && down) tracker.recenter(player.id);
      if (id === BUTTONS.FIRE && down) {
        /* check for a hit at tracker.get(player.id) */
      }
    });

    let frame = requestAnimationFrame(function loop(now) {
      tracker.update(now, 16 / 9);
      /* draw each player at toPixels(tracker.get(player.id), { width, height }) */
      frame = requestAnimationFrame(loop);
    });

    return () => cancelAnimationFrame(frame); // optional teardown
  },
};
```

`src/channels/index.js` discovers the folder with `import.meta.glob`, and Vite code-splits it
into its own chunk. No file in `core/` or `console/` changes. Subscriptions made through `api`
are removed automatically when the channel stops. [`src/channels/aim`](src/channels/aim/index.js)
is a complete working example.

Until there's a menu, open a specific channel with `?channel=<id>` on the console URL, for
example `?channel=monitor` for the raw Input Monitor.

## Project structure

```
index.html                  console page
controller/index.html       controller page (served at /controller/)
src/
  core/                     shared by both pages, no DOM
    protocol.js             envelope format, namespaces, message types
    transport.js            Supabase Realtime room (the only Supabase import)
    ids.js                  room codes and client ids
    emitter.js              tiny error-isolating event emitter
    players.js              slot count and colours
    config.js               env var loading
  console/
    main.js                 room claim, QR, handshake, player list
    players.js              slot assignment
    channel-host.js         mounts channels, routes messages (+ Channel API types)
  controller/
    main.js                 join flow, handshake, buttons
    motion.js               devicemotion wrapper (raw rotation rate + timestamp)
    motion-stream.js        rate-capped sender (tested)
    device.js               fullscreen, wake lock, vibration
  aim/                      shared aiming for every game, no DOM except the panel
    aim-math.js             deadzone, integration, clamping, smoothing (pure, tested)
    aim-tracker.js          one crosshair per player; what games use (tested)
    aim-settings.js         sensitivity/deadzone/smoothing defaults and saving
    debug-panel.js          hidden tuning panel (press D)
  channels/
    index.js                channel discovery and loading
    aim/                    Milestone 2: crosshair aiming (the default channel)
    monitor/                raw input monitor (?channel=monitor)
  ui/                       shared styles and DOM helpers
```

## Setup

### 1. Supabase

The app uses **Broadcast** and **Presence** only. There are no tables, no SQL, and no RLS policies.

1. Create a project at [supabase.com](https://supabase.com). The free plan is fine; pick a
   region close to you, because every message round-trips through it.
2. Copy two values. Both are also listed in the **Connect** dialog on the project home page:
   - **Project URL**: **Project Settings → Data API** (`https://<project-ref>.supabase.co`).
   - **Publishable key**: **Project Settings → API Keys** (`sb_publishable_…`). A legacy
     **anon** key also works. Never use the secret/`service_role` key: this key ships to the browser.
3. Open **Realtime → Settings** and make sure public channel access is **allowed**, which is the
   default. This app uses public channels. If "private channels only" is turned on, joins fail
   with an authorization error.

That's all. Channels are created on the fly when the first client joins `room:<CODE>`.

### 2. Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

Phones only expose motion sensors over **HTTPS**, so the dev server uses a self-signed
certificate and listens on your LAN. Open the console with the **Network** URL that Vite prints
(e.g. `https://192.168.1.20:5173`), not `localhost`: the QR code points at whatever host the
console was opened on. Your phone must be on the same Wi-Fi. It will warn about the certificate
once; accept it to continue.

You can also test the controller on a desktop: it has no sensor, but **Space** fires and **R**
re-centers.

### 3. Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel. It detects Vite automatically
   (build `npm run build`, output `dist`).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under
   **Settings → Environment Variables** for Production and Preview.
3. Redeploy. Vite inlines these values at build time, so a deploy that ran before you added
   them has no config and shows an error screen.

## Scripts

| Command           |                             |
| ----------------- | --------------------------- |
| `npm run dev`     | HTTPS dev server on the LAN |
| `npm run build`   | production build to `dist/` |
| `npm run preview` | serve the production build  |
| `npm test`        | unit tests (Vitest)         |
| `npm run format`  | Prettier                    |

Tuning: add `?hz=30` to a controller URL to change its send rate (10–60, default 60). Press
<kbd>D</kbd> on the console for the aim tuning panel.

## Limitations and roadmap

- **Quota.** Supabase meters Realtime messages per second and per month. At 60 Hz one controller
  sends about 216k messages an hour, and every broadcast is also delivered to everyone else in the
  room. Several players can hit free-tier limits, so check your plan's quotas, or lower the rate
  with `?hz=30`.
- **Latency.** Every message goes through a Supabase region, which typically adds tens of
  milliseconds. That's fine for pointing and Wii-style party games. A WebRTC data channel,
  signalled over this same room, is the upgrade path, and `transport.js` is the seam for it.
- **Room security.** Rooms are public: anyone who knows a 4-letter code can join it. Next step:
  private channels with Supabase anonymous sign-ins and an RLS policy on `realtime.messages`.
- **Gravity is approximate while moving.** The accelerometer feels hand movement as well as
  gravity. The console follows it slowly to filter that out, but fast, jerky swings can briefly
  tilt its idea of "up".
- **Drift.** Adding up speeds over time also adds up tiny sensor errors, so after a while the
  crosshair and the phone can disagree about where "centre" is. The deadzone slows this down, and
  Re-center fixes it.
- **Console reload reassigns slots.** Controllers reconnect automatically but may swap slot numbers.
- Next milestones: a channel picker menu, the first game, and controller-side channel UIs
  (`sys/channel` already tells phones which channel is active).
