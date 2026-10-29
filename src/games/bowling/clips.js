/**
 * The alley's big-screen celebrations: short cartoon clips that play over the
 * lane when you roll a strike, a spare, or a turkey (three strikes in a row).
 *
 * There are no video files. Each clip is a function that draws one frame from
 * how long it has been playing, so it's drawn fresh every frame on a little
 * canvas, and it pauses along with the game. Clips draw on a 320 × 180
 * "screen" (ground level at y 150) that is scaled to fit.
 *
 *   strike  Pin Rocket, Bowled Over, Kickline
 *   spare   Clean Sweep, High Five
 *   turkey  Turkey Trot
 */

const W = 320;
const H = 180;
const GROUND = 150;

/**
 * @typedef {'strike' | 'spare' | 'turkey'} ClipKind
 *
 * @typedef {object} Clip
 * @property {string} id
 * @property {ClipKind} kind
 * @property {number} ms   how long it plays
 * @property {{ at: number, sound: string }[]} cues  sounds to play along the way (at: seconds in)
 * @property {(ctx: CanvasRenderingContext2D, t: number) => void} draw  one frame, t seconds in
 */

/** @type {Clip[]} */
export const CLIPS = [
  {
    id: 'pin-rocket',
    kind: 'strike',
    ms: 2800,
    cues: [
      { at: 0.7, sound: 'whoosh' },
      { at: 1.55, sound: 'pop' },
    ],
    draw: pinRocket,
  },
  {
    id: 'bowled-over',
    kind: 'strike',
    ms: 2700,
    cues: [{ at: 0.1, sound: 'whoosh' }],
    draw: bowledOver,
  },
  { id: 'kickline', kind: 'strike', ms: 2800, cues: [], draw: kickline },
  {
    id: 'clean-sweep',
    kind: 'spare',
    ms: 2500,
    cues: [
      { at: 0.4, sound: 'sweep' },
      { at: 1.0, sound: 'sweep' },
    ],
    draw: cleanSweep,
  },
  { id: 'high-five', kind: 'spare', ms: 2400, cues: [{ at: 1.3, sound: 'clap' }], draw: highFive },
  {
    id: 'turkey-trot',
    kind: 'turkey',
    ms: 3200,
    cues: [{ at: 1.3, sound: 'gobble' }],
    draw: turkeyTrot,
  },
];

/**
 * Picks a clip for what just happened, avoiding the one shown last time when
 * there's a choice.
 *
 * @param {ClipKind} kind
 * @param {string | null} lastId
 * @param {() => number} [random]
 * @returns {Clip}
 */
export function pickClip(kind, lastId, random = Math.random) {
  const pool = CLIPS.filter((clip) => clip.kind === kind);
  const fresh = pool.length > 1 ? pool.filter((clip) => clip.id !== lastId) : pool;
  return fresh[Math.floor(random() * fresh.length) % fresh.length];
}

/**
 * Plays clips on a canvas, timed by the game's clock.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {(sound: string) => void} playSound
 */
export function createClipScreen(canvas, playSound) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {{ clip: Clip, startedAt: number, cued: number } | null} */
  let playing = null;
  let lastId = null;

  return {
    /**
     * Starts a clip for `kind`, and says how long it lasts (ms).
     *
     * @param {ClipKind} kind
     * @param {number} now  game clock, ms
     */
    play(kind, now) {
      const clip = pickClip(kind, lastId);
      lastId = clip.id;
      playing = { clip, startedAt: now, cued: 0 };
      canvas.hidden = false;
      return clip.ms;
    },

    /** Draws the current frame, or hides the screen once the clip is over. */
    update(now) {
      if (!playing) return;
      const { clip } = playing;
      const t = (now - playing.startedAt) / 1000;
      if (t * 1000 >= clip.ms) return this.stop();
      while (playing.cued < clip.cues.length && clip.cues[playing.cued].at <= t) {
        playSound(clip.cues[playing.cued].sound);
        playing.cued += 1;
      }
      const scale = Math.min(canvas.clientWidth / W, canvas.clientHeight / H);
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(W * scale * ratio);
      if (canvas.width !== width) {
        canvas.width = width;
        canvas.height = Math.round(H * scale * ratio);
      }
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      clip.draw(ctx, t);
      ctx.restore();
    },

    stop() {
      playing = null;
      canvas.hidden = true;
    },
  };
}

// ---- The clips --------------------------------------------------------------

/** A pin straps on a rocket, blasts off, and bursts into fireworks. */
function pinRocket(ctx, t) {
  const launch = 0.7;
  sky(ctx, '#070b26', '#29306e');
  stars(ctx, t);
  ctx.fillStyle = '#273049';
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#5b6684';
  ctx.fillRect(138, GROUND - 4, 44, 6);

  const heightAt = (s) => (s < launch ? 0 : (s - launch) ** 2 * 260);
  const y = GROUND - 4 - heightAt(t);
  const shake = t < launch ? Math.sin(t * 90) * 1.4 * (t / launch) : 0;

  // Smoke: puffs left behind along the way, drifting and fading.
  for (let born = 0; born < Math.min(t, 1.6); born += 0.04) {
    const age = t - born;
    const i = Math.round(born * 100);
    const drift = (rand(i) - 0.5) * 50 * age;
    const alpha = Math.max(0, 0.55 - age / 2.2);
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgb(200 205 220 / ${alpha})`;
    circle(ctx, 160 + drift, GROUND - 2 - heightAt(born) + 6, 3 + age * 9);
  }

  // Flame under the pin, flickering, roaring once it lifts off.
  if (t > launch * 0.5 && y > -60) {
    const roar = t < launch ? 0.5 : 1;
    const length = (12 + Math.sin(t * 70) * 3) * roar + (t > launch ? 8 : 0);
    flame(ctx, 160 + shake, y + 2, 7, length, '#ff7a1a');
    flame(ctx, 160 + shake, y + 2, 4, length * 0.6, '#ffe066');
  }
  drawPin(ctx, 160 + shake, y, { scale: 1.1, face: t < launch ? 'scared' : 'grin' });

  // Fireworks where it bursts.
  const burstAt = 1.55;
  if (t >= burstAt) {
    const age = t - burstAt;
    if (age < 0.15) {
      ctx.fillStyle = `rgb(255 255 255 / ${0.8 - age * 5})`;
      circle(ctx, 160, 46, 20 + age * 120);
    }
    burst(ctx, 160, 46, age, 46, 110);
  }
  bigText(ctx, 'STRIKE!', t - 1.6, 160, 112, '#ffd34d');
}

/** A bowling ball barrels through ten worried pins, and they go flying. */
function bowledOver(ctx, t) {
  sky(ctx, '#17214a', '#33468a');
  floor(ctx);
  const ballX = -30 + t * 260;
  const rows = [4, 3, 2, 1];
  let index = 0;
  for (let row = 0; row < rows.length; row++) {
    const count = rows[row];
    for (let k = 0; k < count; k++) {
      const i = index++;
      const scale = 0.72 + row * 0.08;
      const px = 236 + (k - (count - 1) / 2) * 26 - row * 6;
      const py = GROUND - 16 + row * 5;
      const hitAt = (px - 10 + 30) / 260;
      if (t < hitAt) {
        const close = t > hitAt - 0.4;
        const tremble = close ? Math.sin(t * 60 + i) * 0.08 : 0;
        drawPin(ctx, px, py, { scale, tilt: tremble, face: close ? 'scared' : 'happy' });
      } else {
        const age = t - hitAt;
        const x = px + (60 + rand(i) * 130) * age;
        const y = py - (130 + rand(i + 5) * 120) * age + 170 * age * age;
        const tilt = (0.4 + rand(i + 9)) * 12 * age;
        drawPin(ctx, x, y, { scale, tilt, face: 'dizzy' });
        if (age < 0.25) burst(ctx, px - 4, py - 20, age, 8, 60, 0.25);
      }
    }
  }
  if (ballX < W + 40) drawBall(ctx, ballX, GROUND - 14, 14, ballX / 14, '#6c3bd1');
  bigText(ctx, 'STRIKE!', t - 1.3, 160, 58, '#ffd34d');
}

/** Ten pins do a kickline under the disco lights. */
function kickline(ctx, t) {
  sky(ctx, '#140b2e', '#3a1a5e');
  // Sweeping spotlights.
  for (let s = 0; s < 3; s++) {
    const swing = Math.sin(t * 2.2 + s * 2) * 0.5;
    ctx.save();
    ctx.translate(60 + s * 100, -10);
    ctx.rotate(swing);
    ctx.fillStyle = ['rgb(255 90 180 / 0.18)', 'rgb(90 200 255 / 0.18)', 'rgb(255 220 90 / 0.18)'][
      s
    ];
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.lineTo(40, 190);
    ctx.lineTo(-40, 190);
    ctx.fill();
    ctx.restore();
  }
  // The disco ball.
  ctx.strokeStyle = '#9aa3b5';
  ctx.lineWidth = 1;
  line(ctx, 160, 0, 160, 14);
  ctx.fillStyle = '#d5dbe6';
  circle(ctx, 160, 22, 9);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = (k + Math.floor(t * 8)) % 2 ? '#ffffff' : '#8f98ab';
    ctx.fillRect(153 + (k % 3) * 5, 17 + Math.floor(k / 3) * 5, 3, 3);
  }
  floor(ctx, '#3b2a55', '#4c3870');

  const dancing = t > 0.35;
  for (let i = 0; i < 10; i++) {
    const x = 34 + i * 28;
    const beat = t * 7 - i * 0.55;
    const hop = dancing ? Math.max(0, Math.sin(beat)) * 12 : 0;
    // After a wave of hops, they kick in pairs: tilting left and right in turn.
    const kick = t > 1.2 ? Math.sin(t * 9 + (i % 2) * Math.PI) * 0.35 : 0;
    drawPin(ctx, x, GROUND - hop, { scale: 0.85, tilt: kick, face: 'grin', legs: kick });
  }
  // Music notes floating up.
  for (let n = 0; n < 6; n++) {
    const age = (t * 0.8 + n / 6) % 1;
    ctx.fillStyle = `rgb(255 255 255 / ${1 - age})`;
    note(ctx, 30 + n * 52 + Math.sin(age * 6 + n) * 6, 110 - age * 70);
  }
  bigText(ctx, 'STRIKE!', t - 1.0, 160, 62, '#ffd34d');
}

/** A broom sweeps the last two pins off the screen. */
function cleanSweep(ctx, t) {
  sky(ctx, '#24173f', '#4a3170');
  floor(ctx);
  const head = -40 + t * 175 + Math.sin(t * 16) * 5;
  // Dust kicked up behind the broom.
  for (let k = 0; k < 10; k++) {
    const born = k * 0.18;
    const age = t - born;
    if (age < 0 || age > 0.9) continue;
    ctx.fillStyle = `rgb(230 210 170 / ${0.5 * (1 - age / 0.9)})`;
    circle(ctx, -40 + born * 175 - age * 20, GROUND - 4 - age * 18, 3 + age * 8);
  }
  for (const [order, start] of [
    [0, 190],
    [1, 224],
  ]) {
    const pushedTo = head + 22 + order * 26;
    const pushed = pushedTo > start;
    const x = pushed ? pushedTo : start;
    const tilt = pushed ? -0.35 + Math.sin(t * 22 + order) * 0.12 : Math.sin(t * 6 + order) * 0.06;
    drawPin(ctx, x, GROUND, { scale: 0.95, tilt, face: pushed ? 'scared' : 'worried' });
  }
  drawBroom(ctx, head, GROUND);
  if (t > 1.8) sparkles(ctx, t - 1.8);
  bigText(ctx, 'SPARE!', t - 1.6, 160, 62, '#7fe0a0');
}

/** The last two pins jump up and high-five. */
function highFive(ctx, t) {
  sky(ctx, '#0f2d3f', '#1f6a72');
  floor(ctx);
  const slideIn = Math.min(1, t / 0.6);
  const offset = 21 + (1 - easeOut(slideIn)) * 150;
  // Crouch, jump, land.
  const crouch = t > 0.7 && t < 1.0 ? Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.18 : 0;
  const air = t > 1.0 && t < 1.6 ? Math.sin(((t - 1.0) / 0.6) * Math.PI) * 44 : 0;
  const reach = t > 0.9 ? Math.min(1, (t - 0.9) / 0.25) : 0;
  for (const side of [-1, 1]) {
    drawPin(ctx, 160 + side * offset, GROUND - air, {
      scale: 1,
      squash: crouch,
      face: 'grin',
      arm: { side: -side, reach },
    });
  }
  const clapAt = 1.3;
  // Where the hands meet, at the top of the jump.
  if (t > clapAt) burst(ctx, 160, GROUND - 92, t - clapAt, 20, 80, 0.6);
  bigText(ctx, 'SPARE!', t - 1.35, 160, 50, '#7fe0a0');
}

/** Three strikes: a turkey struts in, fans its tail, and gobbles. */
function turkeyTrot(ctx, t) {
  sky(ctx, '#ff9b4f', '#7b3fa0', true);
  // Rolling hills.
  ctx.fillStyle = '#6b3d2a';
  ctx.beginPath();
  ctx.moveTo(0, GROUND - 20);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, GROUND - 20 - Math.sin(x / 50) * 10);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.fillStyle = '#4f2d1f';
  ctx.fillRect(0, GROUND, W, H - GROUND);

  // Three pins cheering in the background.
  for (let k = 0; k < 3; k++) {
    const hop = t > 1.6 ? Math.max(0, Math.sin(t * 10 + k * 2)) * 8 : 0;
    drawPin(ctx, 230 + k * 26, GROUND - 6 - hop, { scale: 0.6, face: 'happy' });
  }

  const walking = t < 1.1;
  const x = walking ? -50 + (t / 1.1) * 190 : 140;
  const spread = walking ? 0.55 : Math.min(1, 0.55 + (t - 1.1) * 2);
  const gobbling = t > 1.3 && t < 2.1;
  drawTurkey(ctx, x, GROUND, t, { walking, spread, gobbling });
  if (gobbling) speech(ctx, x + 30, GROUND - 92, 'Gobble!');

  bigText(ctx, 'TURKEY!', t - 2.0, 160, 46, '#ffd34d');
  if (t > 2.2) {
    for (let k = 0; k < 3; k++) {
      const shown = t - 2.2 - k * 0.12;
      if (shown < 0) continue;
      const size = Math.min(1, shown / 0.15) * 9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      const cx = 136 + k * 24;
      line(ctx, cx - size, 72 - size, cx + size, 72 + size);
      line(ctx, cx + size, 72 - size, cx - size, 72 + size);
    }
  }
}

// ---- Characters ---------------------------------------------------------------

/**
 * A cartoon bowling pin with a face, standing on (x, y).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {{
 *   scale?: number, tilt?: number, squash?: number,
 *   face?: 'happy' | 'grin' | 'scared' | 'worried' | 'dizzy',
 *   legs?: number,                          kicking: which way (and how far) the legs swing
 *   arm?: { side: number, reach: number },  one arm up for a high five (side ±1, reach 0–1)
 * }} options
 */
function drawPin(ctx, x, y, { scale = 1, tilt = 0, squash = 0, face = 'happy', legs, arm } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale * (1 + squash), scale * (1 - squash));
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#2a2f3a';
  if (legs !== undefined) {
    ctx.lineWidth = 2;
    line(ctx, -3, -1, -3 - Math.max(0, -legs) * 22, 5 - Math.max(0, -legs) * 10);
    line(ctx, 3, -1, 3 + Math.max(0, legs) * 22, 5 - Math.max(0, legs) * 10);
    ctx.lineWidth = 1.4;
  }
  if (arm) {
    ctx.lineWidth = 2;
    const sx = arm.side * 7;
    line(ctx, sx, -22, sx + arm.side * (6 + 8 * arm.reach), -22 - 26 * arm.reach);
    ctx.fillStyle = '#ffffff';
    circle(ctx, sx + arm.side * (6 + 8 * arm.reach), -22 - 26 * arm.reach, 2.6);
    ctx.stroke();
    ctx.lineWidth = 1.4;
  }
  pinShape(ctx);
  ctx.fillStyle = '#fbfbf8';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#d8262f';
  ctx.fillRect(-10, -29, 20, 2.2);
  ctx.fillRect(-10, -25.5, 20, 1.4);
  ctx.restore();
  pinShape(ctx);
  ctx.stroke();
  drawFace(ctx, 0, -38, face);
  ctx.restore();
}

/** The outline of a pin, 42 tall, base at the origin. */
function pinShape(ctx) {
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.bezierCurveTo(-10, -6, -10, -18, -5, -26);
  ctx.bezierCurveTo(-3, -30, -6, -34, -5.5, -38);
  ctx.bezierCurveTo(-4.5, -44, 4.5, -44, 5.5, -38);
  ctx.bezierCurveTo(6, -34, 3, -30, 5, -26);
  ctx.bezierCurveTo(10, -18, 10, -6, 5, 0);
  ctx.closePath();
}

function drawFace(ctx, x, y, face) {
  ctx.fillStyle = '#2a2f3a';
  ctx.strokeStyle = '#2a2f3a';
  ctx.lineWidth = 0.9;
  if (face === 'dizzy') {
    for (const ex of [-2, 2]) {
      line(ctx, x + ex - 1, y - 1, x + ex + 1, y + 1);
      line(ctx, x + ex + 1, y - 1, x + ex - 1, y + 1);
    }
  } else {
    const r = face === 'scared' ? 1.1 : 0.8;
    circle(ctx, x - 2, y, r);
    circle(ctx, x + 2, y, r);
  }
  ctx.beginPath();
  if (face === 'scared') ctx.arc(x, y + 3, 1.2, 0, Math.PI * 2);
  else if (face === 'worried') ctx.arc(x, y + 4, 1.6, Math.PI * 1.15, Math.PI * 1.85);
  else if (face === 'dizzy') ctx.arc(x, y + 3.5, 1.3, 0, Math.PI);
  else ctx.arc(x, y + 1.6, face === 'grin' ? 2.2 : 1.6, 0.15 * Math.PI, 0.85 * Math.PI);
  if (face === 'scared') ctx.fill();
  else ctx.stroke();
}

/** A bowling ball centred on (x, y), rolled round by `turn` radians. */
function drawBall(ctx, x, y, r, turn, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  circle(ctx, 0, 0, r);
  ctx.fillStyle = 'rgb(255 255 255 / 0.25)';
  circle(ctx, -r * 0.35, -r * 0.4, r * 0.3);
  ctx.rotate(turn);
  ctx.fillStyle = '#15101f';
  circle(ctx, -3, -5, 1.8);
  circle(ctx, 3, -5, 1.8);
  circle(ctx, 0, 1, 2.2);
  ctx.restore();
}

function drawBroom(ctx, x, ground) {
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  line(ctx, x - 4, ground - 16, x - 46, ground - 96);
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#e6c35c';
  ctx.beginPath();
  ctx.moveTo(x - 10, ground - 18);
  ctx.lineTo(x + 6, ground - 18);
  ctx.lineTo(x + 14, ground);
  ctx.lineTo(x - 16, ground);
  ctx.fill();
  ctx.strokeStyle = '#b8902f';
  ctx.lineWidth = 0.8;
  for (let k = -12; k <= 10; k += 4) line(ctx, x + k * 0.6, ground - 14, x + k, ground);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x - 11, ground - 20, 18, 4);
}

function drawTurkey(ctx, x, ground, t, { walking, spread, gobbling }) {
  const step = walking ? Math.sin(t * 14) : 0;
  const bob = walking ? Math.sin(t * 14) * 2 : gobbling ? Math.sin(t * 36) * 2.5 : 0;
  // Tail feathers, fanned out behind.
  const colors = ['#c0392b', '#e67e22', '#f1c40f', '#8e5a2b'];
  for (let k = 0; k < 9; k++) {
    const angle = -Math.PI / 2 + (k - 4) * 0.28 * spread - 0.25;
    ctx.save();
    ctx.translate(x - 8, ground - 32);
    ctx.rotate(angle);
    ctx.fillStyle = colors[k % colors.length];
    ellipse(ctx, 0, -20 * (0.7 + 0.3 * spread), 6, 20 * (0.7 + 0.3 * spread));
    ctx.restore();
  }
  // Legs.
  ctx.strokeStyle = '#f39c12';
  ctx.lineWidth = 2.2;
  line(ctx, x - 4, ground - 16, x - 4 + step * 6, ground);
  line(ctx, x + 4, ground - 16, x + 4 - step * 6, ground);
  // Body and wing.
  ctx.fillStyle = '#7a4a26';
  ellipse(ctx, x, ground - 27, 17, 14);
  ctx.fillStyle = '#5e381c';
  ellipse(ctx, x - 3, ground - 26, 9, 7);
  // Neck and head.
  ctx.strokeStyle = '#7a4a26';
  ctx.lineWidth = 6;
  line(ctx, x + 10, ground - 34, x + 14, ground - 46 + bob);
  ctx.fillStyle = '#8a5a34';
  circle(ctx, x + 15, ground - 49 + bob, 6.5);
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.moveTo(x + 21, ground - 51 + bob);
  ctx.lineTo(x + 27, ground - 49 + bob);
  ctx.lineTo(x + 21, ground - 47 + bob);
  ctx.fill();
  ctx.fillStyle = '#e8343f';
  ellipse(ctx, x + 21, ground - 43 + bob, 2, 4.5);
  ctx.fillStyle = '#ffffff';
  circle(ctx, x + 17, ground - 51 + bob, 2);
  ctx.fillStyle = '#1c1c1c';
  circle(ctx, x + 17.6, ground - 51 + bob, 1);
}

// ---- Scenery and effects ------------------------------------------------------

function sky(ctx, top, bottom, sunset = false) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  if (sunset) {
    ctx.fillStyle = 'rgb(255 225 120 / 0.9)';
    circle(ctx, 250, GROUND - 30, 26);
  }
}

function stars(ctx, t) {
  for (let i = 0; i < 40; i++) {
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i));
    ctx.fillStyle = `rgb(255 255 255 / ${twinkle})`;
    ctx.fillRect(rand(i) * W, rand(i + 40) * (GROUND - 20), 1.2, 1.2);
  }
}

/** A wooden lane floor, boards and all. */
function floor(ctx, light = '#e0b77c', dark = '#c99a5c') {
  ctx.fillStyle = light;
  ctx.fillRect(0, GROUND - 10, W, H - GROUND + 10);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  for (let y = GROUND - 4; y < H; y += 7) line(ctx, 0, y, W, y);
}

/** Bright particles flying out from (x, y) and falling. */
function burst(ctx, x, y, age, count, speed, life = 1.3) {
  if (age > life) return;
  const colors = ['#ffd34d', '#ff5fa2', '#5fd4ff', '#7fe0a0', '#ffffff'];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(i) * 0.4;
    const v = speed * (0.5 + rand(i + 17) * 0.6);
    const px = x + Math.cos(angle) * v * age;
    const py = y + Math.sin(angle) * v * age + 40 * age * age;
    ctx.fillStyle = colors[i % colors.length];
    circle(ctx, px, py, Math.max(0, 2.4 * (1 - age / life)));
  }
}

function sparkles(ctx, age) {
  for (let i = 0; i < 12; i++) {
    const phase = (age * 2 + rand(i)) % 1;
    const size = Math.sin(phase * Math.PI) * 4;
    const x = 30 + rand(i + 3) * 260;
    const y = 30 + rand(i + 8) * 100;
    ctx.fillStyle = '#fff6c2';
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.3, y - size * 0.3);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size * 0.3, y + size * 0.3);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.3, y + size * 0.3);
    ctx.lineTo(x - size, y);
    ctx.lineTo(x - size * 0.3, y - size * 0.3);
    ctx.fill();
  }
}

function flame(ctx, x, y, width, length, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - width, y);
  ctx.quadraticCurveTo(x, y + length * 1.2, x + width, y);
  ctx.fill();
}

function note(ctx, x, y) {
  ellipse(ctx, x, y, 3, 2.2);
  ctx.fillRect(x + 2, y - 10, 1.2, 10);
  ctx.fillRect(x + 2, y - 10, 5, 1.6);
}

function speech(ctx, x, y, text) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2a2f3a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, 58, 20, 8);
  ctx.moveTo(x + 8, y + 20);
  ctx.lineTo(x + 2, y + 28);
  ctx.lineTo(x + 16, y + 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2a2f3a';
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 29, y + 10.5);
}

/** Big outlined words that pop in `shown` seconds after their moment, then gently pulse. */
function bigText(ctx, text, shown, x, y, color) {
  if (shown < 0) return;
  const pop = shown < 0.35 ? easeOutBack(shown / 0.35) : 1 + Math.sin(shown * 7) * 0.03;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.rotate(-0.04);
  ctx.font = '900 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#1b1f2e';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ---- Drawing helpers ----------------------------------------------------------

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** The same "random" number every frame for the same i, so particles don't jitter. */
const rand = (i) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const easeOut = (p) => 1 - (1 - p) ** 3;
const easeOutBack = (p) => 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;
