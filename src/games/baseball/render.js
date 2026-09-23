/**
 * Draws the ballpark on a <canvas>, looking out from just behind home plate:
 * the pitcher, your batter, the ball, and a small top-down map of where hits
 * land. Every frame is drawn from scratch; far things first, near things last.
 */
import { CONTACT_AT, createBatter } from './batter.js';
import { fenceAt, pitchPosition, project, seatsHeight, toFeet } from './field.js';
import { pitcherPose } from './pitcher.js';
import { createPlayers } from './players.js';

/** How long the bat's swoosh lingers, ms. */
const TRAIL_MS = 80;
/** How long the flash of contact lasts, ms. */
const IMPACT_MS = 260;

const COLORS = {
  skyTop: '#8fc8f0',
  skyBottom: '#d9eefb',
  stands: '#5b6b7d',
  standsLight: '#7a8a9c',
  fence: '#1f6b45',
  fenceTop: '#f2c200',
  grassFar: '#6fbf5a',
  grassNear: '#4fa845',
  dirt: '#c98f55',
  lines: '#ffffff',
  base: '#ffffff',
  pitcherJersey: '#c8373c',
  ball: '#ffffff',
  seam: '#e5484d',
  shadow: 'rgb(0 0 0 / 0.22)',
  zone: 'rgb(255 255 255 / 0.55)',
  text: { timing: '#1d2733', hit: '#1f9bf0', homer: '#f2a900', miss: '#6b7785' },
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {typeof import('./index.js').CONFIG} config
 */
export function createRenderer(canvas, config) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const fenceHeight = config.field.fence.heightFt / 3.28084;
  /** The fence's distance (m) at an angle, in degrees out from home plate. */
  const fence = (angleDeg) => fenceAt(angleDeg, config);
  const batter = createBatter(config.batter);
  const players = createPlayers();
  /** The screen and camera, as the 3D players need them. */
  const view = () => ({
    width: size.width,
    height: size.height,
    ratio: window.devicePixelRatio || 1,
    camera: config.field.camera,
    lift,
  });
  let size = { width: 0, height: 0 };
  /** @type {Array<{ text: string, at: number, kind: keyof typeof COLORS.text }>} */
  let texts = [];
  let batSwungAt = Infinity;
  /**
   * How far (in pixels) the view is tilted up to follow a hit ball, like the
   * Wii's camera. Everything in the world moves down together; the bat, map,
   * and text stay put.
   */
  let lift = 0;
  let lastDrawAt = null;
  /** Flashes of contact: when, where the ball was hit, and how well (0 to 1). */
  /** @type {Array<{ at: number, point: { x: number, y: number, z?: number }, quality: number }>} */
  let impacts = [];
  /** Where the bat has just been during a swing (screen points), for its swoosh. */
  let batTrail =
    /** @type {Array<{ at: number, hands: { x: number, y: number }, tip: { x: number, y: number } }>} */ ([]);
  /** How far through his leg kick and stride the batter is (0 to 1, see batterLoad in index.js). */
  let load = 0;
  /** When the crowd started cheering (a home run), so they jump for a few seconds. */
  let cheerAt = -Infinity;

  const to = (p) => {
    const q = project(p, size, config);
    q.y += lift;
    return q;
  };
  /** A point on the ground at `distance` metres, `angleDeg` from straight out to centre field. */
  const ground = (distance, angleDeg, y = 0) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: Math.sin(a) * distance, y, z: Math.cos(a) * distance };
  };

  function resize(width, height) {
    const ratio = window.devicePixelRatio || 1;
    size = { width, height };
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** Fills a shape given as world points. */
  function shape(points, fill) {
    ctx.beginPath();
    points.map(to).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function line(a, b, width, color) {
    const p = to(a);
    const q = to(b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  /**
   * Points along an arc on the ground, from one angle to another.
   * `distance` is metres, or a function of the angle (for the fence's shape).
   */
  const arc = (distance, fromDeg, toDeg, y = 0, steps = 36) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const angle = fromDeg + ((toDeg - fromDeg) * i) / steps;
      return ground(typeof distance === 'function' ? distance(angle) : distance, angle, y);
    });
  /** The fence's shape, extended past the foul lines for the side stands. */
  const fenceOut = (angle) => fence(Math.min(45, Math.abs(angle)));

  /** The fans, made once: a seat in the stands, a shirt colour, a skin tone. */
  const fans = createCrowd();

  function createCrowd() {
    const { rows, filled } = config.field.crowd;
    const shirts = [
      '#e5484d',
      '#1f9bf0',
      '#f2c200',
      '#23b566',
      '#ffffff',
      '#1d2733',
      '#f28a2e',
      '#8e5bd6',
      '#c8373c',
    ];
    const skins = ['#f1c39b', '#e8b48c', '#c68a5e', '#8d5a3b', '#5c3a26'];
    // A fixed seed, so the same fans sit in the same seats every time.
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const list = [];
    for (let row = rows - 1; row >= 0; row--) {
      for (let angle = -80; angle <= 80; angle += 1.3) {
        if (random() > filled) continue; // an empty seat
        list.push({
          angle: angle + (random() - 0.5) * 0.8,
          row,
          shirt: shirts[Math.floor(random() * shirts.length)],
          skin: skins[Math.floor(random() * skins.length)],
          phase: random() * Math.PI * 2,
        });
      }
    }
    return list; // back rows first, so nearer fans are drawn over them
  }

  /** The fans, sitting in their seats, jumping up when the crowd cheers. */
  function drawCrowd(now) {
    const { startM, depthM } = config.field.stands;
    const { rows } = config.field.crowd;
    const cheering = now - cheerAt < 3500;
    for (const fan of fans) {
      const beyond = startM + ((fan.row + 0.5) / rows) * depthM;
      const seat = ground(fenceOut(fan.angle) + beyond, fan.angle, seatsHeight(beyond, config));
      const jump = cheering ? Math.abs(Math.sin((now - cheerAt) / 130 + fan.phase)) * 0.5 : 0;
      const feet = to({ ...seat, y: seat.y + jump });
      const s = feet.scale;
      if (s < 0.3) continue; // too far round the side to see
      const w = Math.max(1.5, 0.5 * s);
      const h = Math.max(2, 0.75 * s);
      ctx.fillStyle = fan.shirt;
      ctx.fillRect(feet.x - w / 2, feet.y - h, w, h);
      ctx.fillStyle = fan.skin;
      const head = Math.max(1.2, 0.26 * s);
      ctx.fillRect(feet.x - head / 2, feet.y - h - head, head, head);
      if (cheering) {
        // Arms up!
        ctx.fillRect(feet.x - w / 2 - head * 0.4, feet.y - h - head * 1.3, head * 0.35, head * 1.1);
        ctx.fillRect(feet.x + w / 2, feet.y - h - head * 1.3, head * 0.35, head * 1.1);
      }
    }
  }

  function drawPark(now) {
    const horizonY = config.field.camera.horizon * size.height + lift;

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, COLORS.skyTop);
    sky.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size.width, horizonY + 1);

    // Grass, down to the bottom of the screen.
    const grass = ctx.createLinearGradient(0, horizonY, 0, size.height);
    grass.addColorStop(0, COLORS.grassFar);
    grass.addColorStop(1, COLORS.grassNear);
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizonY, size.width, size.height - horizonY);

    // Stands rising behind the outfield fence, all the way round, with the fans in them.
    const { startM, depthM, topM } = config.field.stands;
    const back = startM + depthM;
    const standsBack = arc((a) => fenceOut(a) + back, -80, 80, topM);
    const standsFront = arc((a) => fenceOut(a) + startM, 80, -80, fenceHeight);
    shape([...standsBack, ...standsFront], COLORS.stands);
    const middle = startM + depthM / 2;
    const upper = arc((a) => fenceOut(a) + back, -80, 80, topM);
    const lower = arc((a) => fenceOut(a) + middle, 80, -80, seatsHeight(middle, config));
    shape([...upper, ...lower], COLORS.standsLight);
    drawCrowd(now);

    // The outfield fence, with a yellow top rail.
    const fenceTopPts = arc(fenceOut, -46, 46, fenceHeight);
    const fenceFootPts = arc(fenceOut, 46, -46, 0);
    shape([...fenceTopPts, ...fenceFootPts], COLORS.fence);
    ctx.beginPath();
    fenceTopPts.map(to).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.fenceTop;
    ctx.stroke();

    // Distance markers on the fence, in feet: down the lines and the power alleys.
    ctx.font = `800 ${Math.max(10, Math.round(size.height * 0.022))}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    for (const angle of [-42, -22, 22, 42]) {
      const p = to(ground(fence(angle) - 0.5, angle, fenceHeight * 0.3));
      ctx.fillText(`${Math.round(toFeet(fence(angle)) / 5) * 5}`, p.x, p.y);
    }

    // Infield: a dirt diamond with grass inside, the mound, and the bases.
    const base = 27.4 / Math.SQRT2; // bases are 27.4 m apart, on a diamond
    shape(
      [
        { x: 0, y: 0, z: -2 },
        { x: base + 4, y: 0, z: base },
        { x: 0, y: 0, z: base * 2 + 5 },
        { x: -(base + 4), y: 0, z: base },
      ],
      COLORS.dirt,
    );
    shape(
      [
        { x: 0, y: 0, z: 2.5 },
        { x: base - 2.5, y: 0, z: base },
        { x: 0, y: 0, z: base * 2 - 2.5 },
        { x: -(base - 2.5), y: 0, z: base },
      ],
      COLORS.grassFar,
    );
    shape(
      Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return { x: Math.cos(a) * 2.7, y: 0, z: config.pitch.distance + Math.sin(a) * 2.7 };
      }),
      COLORS.dirt,
    );

    // Foul lines, from home plate out to the fence.
    line({ x: 0, y: 0, z: 0 }, ground(fence(45), -45), 2, COLORS.lines);
    line({ x: 0, y: 0, z: 0 }, ground(fence(45), 45), 2, COLORS.lines);

    for (const b of [
      { x: base, z: base },
      { x: 0, z: base * 2 },
      { x: -base, z: base },
    ]) {
      const s = 0.3;
      shape(
        [
          { x: b.x - s, y: 0, z: b.z },
          { x: b.x, y: 0, z: b.z + s },
          { x: b.x + s, y: 0, z: b.z },
          { x: b.x, y: 0, z: b.z - s },
        ],
        COLORS.base,
      );
    }
    // Home plate.
    shape(
      [
        { x: -0.22, y: 0, z: 0.2 },
        { x: 0.22, y: 0, z: 0.2 },
        { x: 0.22, y: 0, z: 0 },
        { x: 0, y: 0, z: -0.22 },
        { x: -0.22, y: 0, z: 0 },
      ],
      COLORS.base,
    );
  }

  /**
   * The pitcher, `progress` of the way through his delivery (pitcher.js).
   * He stands on the mound facing us and strides towards the plate as he throws.
   */
  function drawPitcher(progress, holdingBall) {
    const pose = pitcherPose(progress);
    shadowsUnder(pose, (p) => to({ x: p[0], y: 0, z: p[2] }));
    players.drawPitcher(ctx, view(), { pose, color: COLORS.pitcherJersey, holdingBall });
  }

  /** A soft shadow on the dirt under each of a player's feet. */
  function shadowsUnder(pose, onGround) {
    ctx.fillStyle = COLORS.shadow;
    for (const side of ['l', 'r']) {
      const heel = pose[`${side}Heel`];
      const toe = pose[`${side}Toe`];
      const under = onGround([(heel[0] + toe[0]) / 2, 0, (heel[2] + toe[2]) / 2]);
      ctx.beginPath();
      ctx.ellipse(under.x, under.y, 0.2 * under.scale, 0.05 * under.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Your batter, in the left-hand batter's box, in your player colour
   * (batter.js has the swing, players.js is the 3D player). He stands in
   * the same 3D ballpark, seen through the same camera as everything else.
   *
   * @param {number} now
   * @param {string} color
   * @param {{ x: number, y: number, z?: number } | null} reach  where the pitch crosses the plate
   * @param {number} load  0 to 1: his leg kick and stride as the pitch comes in
   * @param {{ side: number, forward: number }} waggle  how far you've tipped the bat (degrees)
   */
  function drawBatter(now, color, reach, load, waggle) {
    const { stands } = config.batter;
    // Where the pitch crosses the plate, around where he stands.
    const ball = reach
      ? /** @type {[number, number, number]} */ ([
          reach.x - stands.x,
          reach.y,
          (reach.z ?? 0) - stands.z,
        ])
      : null;
    const sinceSwing = now - batSwungAt;
    const pose = batter.pose(sinceSwing, now, ball, load, waggle);
    const place = (p) => to({ x: stands.x + p[0], y: p[1], z: stands.z + p[2] });
    shadowsUnder(pose, place);
    players.drawBatter(ctx, view(), { pose, stands, color });
    // Remember where the bat has just been while he swings, for the swoosh
    // behind it: only while it sweeps across the plate through contact (when
    // it points towards or away from us, a swoosh would just be a smear).
    const { swingMs, startAt } = config.batter;
    const moment = startAt + (1 - startAt) * (sinceSwing / swingMs);
    const across = Math.abs(pose.bat[2]) < 0.7;
    if (moment >= CONTACT_AT - 0.05 && moment <= CONTACT_AT + 0.15 && across) {
      batTrail.push({ at: now, hands: place(pose.lHand), tip: place(pose.batTip) });
    } else {
      batTrail = [];
    }
    batTrail = batTrail.filter((b) => now - b.at >= 0 && now - b.at < TRAIL_MS);
    drawBatTrail(now);
  }

  /**
   * The flash of contact, like Wii Sports: a white-hot burst where bat meets
   * ball, yellow and orange spikes shooting out, and speed lines, all over in
   * a quarter of a second. Better contact makes a bigger burst.
   */
  function drawImpacts(now) {
    impacts = impacts.filter((hit) => now - hit.at < IMPACT_MS);
    for (const hit of impacts) {
      const k = (now - hit.at) / IMPACT_MS;
      const at = to({ x: hit.point.x, y: hit.point.y, z: hit.point.z ?? 0 });
      const size = at.scale * (0.35 + 0.35 * hit.quality);
      const grow = 1 - (1 - k) ** 3;
      ctx.save();
      ctx.translate(at.x, at.y);
      // Spikes: long thin triangles out from the middle, alternating colours.
      const spikes = 14;
      for (let i = 0; i < spikes; i++) {
        const angle = (i / spikes) * Math.PI * 2 + 0.3;
        const long = size * (i % 2 ? 0.7 : 1.15) * (0.4 + 0.8 * grow);
        const wide = size * 0.09 * (1 - k);
        ctx.fillStyle = i % 2 ? `rgb(255 150 40 / ${1 - k})` : `rgb(255 222 70 / ${1 - k})`;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle + Math.PI / 2) * wide, Math.sin(angle + Math.PI / 2) * wide);
        ctx.lineTo(Math.cos(angle) * long, Math.sin(angle) * long);
        ctx.lineTo(Math.cos(angle - Math.PI / 2) * wide, Math.sin(angle - Math.PI / 2) * wide);
        ctx.closePath();
        ctx.fill();
      }
      // Speed lines: short white streaks flying out past the spikes.
      ctx.strokeStyle = `rgb(255 255 255 / ${0.9 * (1 - k)})`;
      ctx.lineWidth = Math.max(1.5, size * 0.025);
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + 0.1;
        const from = size * (0.9 + 0.9 * grow);
        const to2 = from + size * 0.35;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * from, Math.sin(angle) * from);
        ctx.lineTo(Math.cos(angle) * to2, Math.sin(angle) * to2);
        ctx.stroke();
      }
      // The white-hot middle, glowing out to yellow.
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.55);
      glow.addColorStop(0, `rgb(255 255 255 / ${1 - k * 0.7})`);
      glow.addColorStop(0.45, `rgb(255 240 150 / ${0.9 * (1 - k)})`);
      glow.addColorStop(1, 'rgb(255 200 60 / 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * A quick golden swoosh where the bat has just swept through, like Wii
   * Sports: it shows how fast the bat is moving, and fades in a blink.
   */
  function drawBatTrail(now) {
    const along = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    for (let i = 1; i < batTrail.length; i++) {
      const [a, b] = [batTrail[i - 1], batTrail[i]];
      const fade = 1 - (now - a.at) / TRAIL_MS;
      ctx.fillStyle = `rgb(255 214 110 / ${0.45 * fade})`;
      ctx.beginPath();
      const inner = [along(a.hands, a.tip, 0.4), along(b.hands, b.tip, 0.4)];
      ctx.moveTo(inner[0].x, inner[0].y);
      ctx.lineTo(a.tip.x, a.tip.y);
      ctx.lineTo(b.tip.x, b.tip.y);
      ctx.lineTo(inner[1].x, inner[1].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * The strike zone, standing above home plate like the TV graphic: a faint
   * box split into nine, and a dot where the last pitch crossed.
   *
   * @param {{ x: number, y: number } | null} mark  where the last pitch crossed the plate
   */
  function drawZone(mark) {
    const { left, right, bottom, top } = config.pitch.zone;
    const a = to({ x: left, y: top, z: 0 });
    const b = to({ x: right, y: bottom, z: 0 });
    const w = b.x - a.x;
    const h = b.y - a.y;
    ctx.save();
    ctx.fillStyle = 'rgb(255 255 255 / 0.06)';
    ctx.fillRect(a.x, a.y, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgb(255 255 255 / 0.22)';
    ctx.beginPath();
    for (const k of [1 / 3, 2 / 3]) {
      ctx.moveTo(a.x + w * k, a.y);
      ctx.lineTo(a.x + w * k, a.y + h);
      ctx.moveTo(a.x, a.y + h * k);
      ctx.lineTo(a.x + w, a.y + h * k);
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.zone;
    ctx.strokeRect(a.x, a.y, w, h);
    if (mark) {
      const p = to({ ...mark, z: 0 });
      ctx.fillStyle = '#f2c200';
      ctx.strokeStyle = '#1d2733';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(4, 0.037 * p.scale * 1.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBall(p) {
    const shadow = to({ ...p, y: 0 });
    const r = 0.037 * config.field.ballScale;
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, r * shadow.scale, r * shadow.scale * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    const q = to(p);
    // Never smaller than a few pixels, with a dark edge, so a long hit stays
    // easy to follow against the sky.
    const radius = Math.max(4.5, r * q.scale);
    ctx.fillStyle = COLORS.ball;
    ctx.strokeStyle = 'rgb(29 39 51 / 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(q.x, q.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (radius > 6) {
      ctx.strokeStyle = COLORS.seam;
      ctx.lineWidth = Math.max(1, radius * 0.12);
      ctx.beginPath();
      ctx.arc(q.x - radius * 0.9, q.y, radius * 0.7, -0.9, 0.9);
      ctx.moveTo(q.x + radius * 0.9 + Math.cos(Math.PI - 0.9) * radius * 0.7, q.y);
      ctx.arc(q.x + radius * 0.9, q.y, radius * 0.7, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
    }
  }

  /** A hit ball's recent path, as a fading streak. */
  function drawTrail(trail) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = to(trail[i - 1]);
      const b = to(trail[i]);
      ctx.globalAlpha = (i / trail.length) * 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTexts(now) {
    texts = texts.filter((t) => now - t.at < config.effects.textMs);
    // Newest on top; older ones fade upwards.
    texts.forEach((t, i) => {
      const age = (now - t.at) / config.effects.textMs;
      const big = t.kind === 'homer';
      ctx.save();
      ctx.globalAlpha = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25;
      ctx.font = `800 ${Math.round(size.height * (big ? 0.08 : 0.05))}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = COLORS.text[t.kind];
      const y = size.height * (0.3 + (texts.length - 1 - i) * -0.07) - age * size.height * 0.03;
      ctx.strokeText(t.text, size.width / 2, y);
      ctx.fillText(t.text, size.width / 2, y);
      ctx.restore();
    });
  }

  /**
   * A small top-down map of the field, bottom right: where this round's hits
   * landed (gold = home run), and the ball in flight.
   */
  function drawMap(flight, landings) {
    const r = Math.min(size.height * 0.2, 130);
    const origin = { x: size.width - 20 - r, y: size.height - 18 };
    const scale = r / (fence(0) * 1.1);
    const at = (p) => ({ x: origin.x + p.x * scale, y: origin.y - p.z * scale });
    ctx.save();
    // Fair territory and the fence.
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.arc(origin.x, origin.y, r, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1);
    ctx.closePath();
    ctx.fill();
    const fenceLine = arc(fence, -45, 45).map(at);
    ctx.fillStyle = COLORS.grassFar;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    fenceLine.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.fence;
    ctx.lineWidth = 3;
    ctx.beginPath();
    fenceLine.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    // The infield.
    const base = (27.4 / Math.SQRT2) * scale;
    ctx.fillStyle = COLORS.dirt;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + base, origin.y - base);
    ctx.lineTo(origin.x, origin.y - base * 2);
    ctx.lineTo(origin.x - base, origin.y - base);
    ctx.closePath();
    ctx.fill();
    // Where earlier hits landed.
    for (const landing of landings) {
      const p = at(landing);
      ctx.fillStyle =
        landing.kind === 'homer'
          ? COLORS.text.homer
          : landing.kind === 'foul'
            ? '#98a3af'
            : '#ffffff';
      ctx.strokeStyle = '#1d2733';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // The ball in flight, and its path so far.
    if (flight) {
      ctx.strokeStyle = '#1d2733';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      const p = at(flight.p);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.fenceTop;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    resize,

    /** A flash of contact where the ball was hit (see drawImpacts). */
    impact(now, point, quality = 1) {
      impacts.push({ at: now, point, quality });
    },

    /** Starts the batter's swing. */
    swingBat(now) {
      batSwungAt = now;
    },

    /** A line of text in the middle of the screen, e.g. "HOME RUN! 124 m". */
    text(text, now, kind) {
      texts.push({ text, at: now, kind });
    },

    /** Moves every animation later by `ms`, so they freeze during a pause. */
    /** The crowd jumps up and cheers (a home run). */
    cheer(now) {
      cheerAt = now;
    },

    shift(ms) {
      cheerAt += ms;
      impacts = impacts.map((hit) => ({ ...hit, at: hit.at + ms }));
      texts = texts.map((t) => ({ ...t, at: t.at + ms }));
      if (Number.isFinite(batSwungAt)) batSwungAt += ms;
    },

    clearEffects() {
      texts = [];
    },

    /**
     * @param {{
     *   now: number,
     *   pitcher: number,               progress through the delivery, 0 to 1 (pitcher.js)
     *   holdingBall: boolean,          the ball is still in the pitcher's hand
     *   pitch: import('./field.js').Pitch | null,
     *   pitchT: number | null,         how far the pitch has travelled (1 = at the plate)
     *   flight: import('./field.js').Flight | null,
     *   batterLoad?: number,           the batter's leg kick and stride, 0 to 1 (index.js)
     *   batWaggle?: { side: number, forward: number },  how far you've tipped the bat (swing.js)
     *   landings: Array<{ x: number, z: number, kind: 'homer' | 'fair' | 'foul' }>,
     *   batterColor: string,
     *   zone: { mark: { x: number, y: number } | null } | null,  the strike zone, if shown
     * }} scene
     */
    draw({
      now,
      pitcher,
      holdingBall,
      pitch,
      pitchT,
      flight,
      batterLoad = 0,
      batWaggle = { side: 0, forward: 0 },
      landings,
      batterColor,
      zone,
    }) {
      const reach = pitch ? pitch.target : null;
      if (size.height === 0) return;
      // Follow a hit ball: tilt up just enough to keep it below the top bar, smoothly.
      const frameS = lastDrawAt === null ? 0 : Math.min(0.1, (now - lastDrawAt) / 1000);
      lastDrawAt = now;
      const ballY = flight ? project(flight.p, size, config).y : Infinity;
      const target = Math.max(0, size.height * 0.24 - ballY);
      lift += (target - lift) * Math.min(1, frameS * 5);
      ctx.clearRect(0, 0, size.width, size.height);
      drawPark(now);
      drawPitcher(pitcher, holdingBall);
      if (zone) drawZone(zone.mark);
      if (flight) {
        // A home run vanishes into the crowd once it lands in the stands.
        if (!flight.inStands) {
          drawTrail(flight.trail);
          drawBall(flight.p);
        }
      } else if (pitch && pitchT !== null) {
        const p = pitchPosition(pitchT, pitch);
        // Past the plate, the ball goes on into the catcher's mitt, just behind you.
        if (p.z > -1.5) drawBall(p);
      }
      // Straight into the stride as the pitch comes; back to the stance gently if he lets it go by.
      load = batterLoad >= load ? batterLoad : Math.max(batterLoad, load - frameS * 1.5);
      if (batterColor) drawBatter(now, batterColor, reach, load, batWaggle);
      drawImpacts(now);
      drawMap(flight, landings);
      drawTexts(now);
    },
  };
}
