/**
 * Draws the ballpark on a <canvas>, looking out from just behind home plate,
 * plus the bat in your hands and a small top-down map of where hits land.
 * Every frame is drawn from scratch; far things first, near things last.
 */
import { pitchPosition, project } from './field.js';

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
  pitcherBody: '#e5484d',
  pitcherSkin: '#f1c39b',
  pitcherLegs: '#f5f5f5',
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
  const { fenceDistance, fenceHeight } = config.field;
  let size = { width: 0, height: 0 };
  /** @type {Array<{ text: string, at: number, kind: keyof typeof COLORS.text }>} */
  let texts = [];
  let batSwungAt = -Infinity;
  /**
   * How far (in pixels) the view is tilted up to follow a hit ball, like the
   * Wii's camera. Everything in the world moves down together; the bat, map,
   * and text stay put.
   */
  let lift = 0;
  let lastDrawAt = null;

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

  /** Points along an arc on the ground, from one angle to another. */
  const arc = (distance, fromDeg, toDeg, y = 0, steps = 36) =>
    Array.from({ length: steps + 1 }, (_, i) =>
      ground(distance, fromDeg + ((toDeg - fromDeg) * i) / steps, y),
    );

  function drawPark() {
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

    // Stands rising behind the outfield fence, all the way round.
    const standsBack = arc(fenceDistance + 30, -80, 80, 22);
    const standsFront = arc(fenceDistance + 2, 80, -80, fenceHeight);
    shape([...standsBack, ...standsFront], COLORS.stands);
    const upper = arc(fenceDistance + 30, -80, 80, 22);
    const lower = arc(fenceDistance + 16, 80, -80, 12);
    shape([...upper, ...lower], COLORS.standsLight);

    // The outfield fence, with a yellow top rail.
    const fenceTopPts = arc(fenceDistance, -46, 46, fenceHeight);
    const fenceFootPts = arc(fenceDistance, 46, -46, 0);
    shape([...fenceTopPts, ...fenceFootPts], COLORS.fence);
    ctx.beginPath();
    fenceTopPts.map(to).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.fenceTop;
    ctx.stroke();

    // Distance markers on the fence.
    ctx.font = `800 ${Math.max(10, Math.round(size.height * 0.022))}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    for (const angle of [-32, 32]) {
      const p = to(ground(fenceDistance - 0.5, angle, fenceHeight * 0.35));
      ctx.fillText(`${fenceDistance} m`, p.x, p.y);
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
    line({ x: 0, y: 0, z: 0 }, ground(fenceDistance, -45), 2, COLORS.lines);
    line({ x: 0, y: 0, z: 0 }, ground(fenceDistance, 45), 2, COLORS.lines);

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
   * The pitcher on the mound. `windup` goes from 0 to 1 through the windup:
   * the arm comes back and up, then whips forwards at the release.
   */
  function drawPitcher(windup) {
    const z = config.pitch.distance + 0.3;
    const feet = to({ x: 0, y: 0, z });
    const s = feet.scale;
    const body = { w: 0.5 * s, h: 0.8 * s };
    ctx.save();
    ctx.lineCap = 'round';
    // Legs.
    ctx.strokeStyle = COLORS.pitcherLegs;
    ctx.lineWidth = 0.18 * s;
    ctx.beginPath();
    ctx.moveTo(feet.x - 0.15 * s, feet.y);
    ctx.lineTo(feet.x - 0.1 * s, feet.y - 0.85 * s);
    ctx.moveTo(feet.x + 0.15 * s, feet.y);
    ctx.lineTo(feet.x + 0.1 * s, feet.y - 0.85 * s);
    ctx.stroke();
    // Body.
    ctx.fillStyle = COLORS.pitcherBody;
    ctx.beginPath();
    ctx.roundRect(feet.x - body.w / 2, feet.y - 0.85 * s - body.h, body.w, body.h, 0.12 * s);
    ctx.fill();
    // Head.
    ctx.fillStyle = COLORS.pitcherSkin;
    ctx.beginPath();
    ctx.arc(feet.x, feet.y - 1.85 * s, 0.14 * s, 0, Math.PI * 2);
    ctx.fill();
    // Throwing arm: swings back and up during the windup, then forwards.
    const shoulder = { x: feet.x + 0.22 * s, y: feet.y - 1.55 * s };
    const angle = windup < 1 ? -Math.PI / 2 + windup * 2.2 : Math.PI * 0.35;
    const hand = {
      x: shoulder.x + Math.cos(angle) * 0.6 * s,
      y: shoulder.y + Math.sin(angle) * 0.6 * s,
    };
    ctx.strokeStyle = COLORS.pitcherBody;
    ctx.lineWidth = 0.14 * s;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    if (windup < 1) {
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, 0.07 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The strike zone: where the ball crosses the plate. Swing when it gets here. */
  function drawZone() {
    const a = to({ x: -0.25, y: config.pitch.plateHeight + 0.35, z: 0 });
    const b = to({ x: 0.25, y: config.pitch.plateHeight - 0.35, z: 0 });
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

  /**
   * The bat, in your hands at the bottom right (you're a right-handed
   * batter, seen from just behind). When you swing, it sweeps across.
   */
  function drawBat(now) {
    const since = now - batSwungAt;
    const { batSwingMs } = config.effects;
    // Resting over your shoulder, pointing up and back.
    const rest = -2.2;
    const through = 0.9;
    let angle = rest;
    if (since < batSwingMs) {
      const t = since / batSwingMs;
      angle = rest + (through - rest) * (1 - (1 - t) ** 3);
    } else if (since < batSwingMs + 500) {
      angle = through; // follow-through
    } else if (since < batSwingMs + 900) {
      angle = through + (rest - through) * ((since - batSwingMs - 500) / 400);
    }
    const grip = { x: size.width * 0.66, y: size.height * 0.96 };
    const length = size.height * 0.42;
    ctx.save();
    ctx.translate(grip.x, grip.y);
    ctx.rotate(angle);
    const barrel = ctx.createLinearGradient(0, 0, length, 0);
    barrel.addColorStop(0, COLORS.batDark);
    barrel.addColorStop(0.3, COLORS.bat);
    barrel.addColorStop(1, COLORS.bat);
    ctx.fillStyle = barrel;
    ctx.beginPath();
    // Thin handle widening to a thick barrel with a rounded end.
    const w0 = size.height * 0.012;
    const w1 = size.height * 0.032;
    ctx.moveTo(0, -w0);
    ctx.lineTo(length * 0.45, -w0 * 1.2);
    ctx.quadraticCurveTo(length * 0.7, -w1, length - w1, -w1);
    ctx.arc(length - w1, 0, w1, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo(length * 0.7, w1, length * 0.45, w0 * 1.2);
    ctx.lineTo(0, w0);
    ctx.closePath();
    ctx.fill();
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
   * A small top-down map of the field, bottom left: where this round's hits
   * landed (gold = home run), and the ball in flight.
   */
  function drawMap(flight, landings) {
    const r = Math.min(size.height * 0.2, 130);
    const origin = { x: 20 + r, y: size.height - 18 };
    const scale = r / (fenceDistance * 1.15);
    const at = (p) => ({ x: origin.x + p.x * scale, y: origin.y - p.z * scale });
    ctx.save();
    // Fair territory and the fence.
    ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.arc(origin.x, origin.y, r, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.grassFar;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.arc(origin.x, origin.y, fenceDistance * scale, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.fence;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, fenceDistance * scale, -Math.PI * 0.75, -Math.PI * 0.25);
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

    /** Starts the bat's swing animation. */
    swingBat(now) {
      batSwungAt = now;
    },

    /** A line of text in the middle of the screen, e.g. "HOME RUN! 124 m". */
    text(text, now, kind) {
      texts.push({ text, at: now, kind });
    },

    /** Moves every animation later by `ms`, so they freeze during a pause. */
    shift(ms) {
      texts = texts.map((t) => ({ ...t, at: t.at + ms }));
      batSwungAt += ms;
    },

    clearEffects() {
      texts = [];
    },

    /**
     * @param {{
     *   now: number,
     *   pitcher: number,               windup progress, 0 to 1 (1 = thrown)
     *   pitchT: number | null,         how far the pitch has travelled (1 = at the plate)
     *   flight: import('./field.js').Flight | null,
     *   landings: Array<{ x: number, z: number, kind: 'homer' | 'fair' | 'foul' }>,
     * }} scene
     */
    draw({ now, pitcher, pitchT, flight, landings }) {
      if (size.height === 0) return;
      // Follow a hit ball: tilt up just enough to keep it below the top bar, smoothly.
      const frameS = lastDrawAt === null ? 0 : Math.min(0.1, (now - lastDrawAt) / 1000);
      lastDrawAt = now;
      const ballY = flight ? project(flight.p, size, config).y : Infinity;
      const target = Math.max(0, size.height * 0.24 - ballY);
      lift += (target - lift) * Math.min(1, frameS * 5);
      ctx.clearRect(0, 0, size.width, size.height);
      drawPark();
      drawPitcher(pitcher);
      if (flight) {
        drawTrail(flight.trail);
        drawBall(flight.p);
      } else if (pitchT !== null) {
        if (pitchT < 1.1) drawZone();
        const p = pitchPosition(pitchT, config);
        // Past the plate, the ball goes on into the catcher's mitt, just behind you.
        if (p.z > -1.5) drawBall(p);
      }
      drawBat(now);
      drawMap(flight, landings);
      drawTexts(now);
    },
  };
}
