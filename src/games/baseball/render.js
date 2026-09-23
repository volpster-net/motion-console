/**
 * Draws the ballpark on a <canvas>, looking out from just behind home plate:
 * the pitcher, your batter, the ball, and a small top-down map of where hits
 * land. Every frame is drawn from scratch; far things first, near things last.
 */
import { createBatter } from './batter.js';
import { fenceAt, pitchPosition, project, seatsHeight, toFeet } from './field.js';
import { drawFigure } from './figure.js';
import { pitcherPose } from './pitcher.js';

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
  pitcherCap: '#8e1f24',
  pants: '#f3f4f6',
  skin: '#e8b48c',
  glove: '#8a5a2b',
  ball: '#ffffff',
  seam: '#e5484d',
  shadow: 'rgb(0 0 0 / 0.22)',
  bat: '#c98a4b',
  batDark: '#8a5a2b',
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
    const feet = to({ x: 0, y: 0, z: /** @type {number} */ (pose.z) });
    const s = feet.scale;
    const place = ([x, y]) => ({ x: feet.x + x * s, y: feet.y - y * s });
    drawFigure(ctx, pose, place, s, {
      jersey: COLORS.pitcherJersey,
      pants: COLORS.pants,
      skin: COLORS.skin,
      cap: COLORS.pitcherCap,
      facing: 'front',
      glove: COLORS.glove,
      frontArm: 'right',
    });
    if (holdingBall) {
      const hand = place(/** @type {[number, number]} */ (pose.rHand));
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, Math.max(2, 0.05 * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Your batter, in the left-hand batter's box, in your player colour
   * (batter.js has the swing). His joints are 3D points around where he
   * stands, seen through the same camera as the rest of the ballpark.
   */
  function drawBatter(now, color) {
    const pose = batter.pose(now - batSwungAt, now);
    const { stands } = config.batter;
    const s = to(stands).scale;
    const place = ([x, y, z]) => to({ x: stands.x + x, y, z: stands.z + z });
    drawFigure(ctx, pose, place, s, {
      jersey: color,
      pants: COLORS.pants,
      skin: COLORS.skin,
      cap: color,
      facing: 'back',
      hands: 'together',
      frontArm: 'right',
    });
    // The bat: a thin handle in the hands, widening to the barrel.
    const hands = place(/** @type {[number, number]} */ (pose.hands));
    const tip = place(/** @type {[number, number]} */ (pose.batTip));
    const angle = Math.atan2(tip.y - hands.y, tip.x - hands.x);
    const length = Math.hypot(tip.x - hands.x, tip.y - hands.y);
    const handle = 0.02 * s;
    const barrel = 0.045 * s;
    ctx.save();
    ctx.translate(hands.x, hands.y);
    ctx.rotate(angle);
    const wood = ctx.createLinearGradient(0, 0, length, 0);
    wood.addColorStop(0, COLORS.batDark);
    wood.addColorStop(0.35, COLORS.bat);
    wood.addColorStop(1, COLORS.bat);
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.moveTo(-0.08 * s, -handle);
    ctx.lineTo(length * 0.45, -handle * 1.2);
    ctx.quadraticCurveTo(length * 0.7, -barrel, length - barrel, -barrel);
    ctx.arc(length - barrel, 0, barrel, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo(length * 0.7, barrel, length * 0.45, handle * 1.2);
    ctx.lineTo(-0.08 * s, handle);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** The strike zone: where the ball crosses the plate. Swing when it gets here. */
  function drawZone() {
    const { height, spread } = config.pitch.zone;
    const a = to({ x: -0.25, y: height + spread + 0.2, z: 0 });
    const b = to({ x: 0.25, y: height - spread - 0.2, z: 0 });
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.zone;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
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
     *   landings: Array<{ x: number, z: number, kind: 'homer' | 'fair' | 'foul' }>,
     *   batterColor: string,
     * }} scene
     */
    draw({ now, pitcher, holdingBall, pitch, pitchT, flight, landings, batterColor }) {
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
      if (flight) {
        drawTrail(flight.trail);
        drawBall(flight.p);
      } else if (pitch && pitchT !== null) {
        if (pitchT < 1.1) drawZone();
        const p = pitchPosition(pitchT, pitch);
        // Past the plate, the ball goes on into the catcher's mitt, just behind you.
        if (p.z > -1.5) drawBall(p);
      }
      drawBatter(now, batterColor);
      drawMap(flight, landings);
      drawTexts(now);
    },
  };
}
