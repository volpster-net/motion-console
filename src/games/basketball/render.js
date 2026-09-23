/**
 * Draws the court on a <canvas>, looking down it from just behind the
 * shooter. Every frame is drawn from scratch.
 *
 * Depth: things further away must be drawn first, so nearer things cover
 * them. The rim is the tricky part: a ball dropping through it is in front
 * of the back of the rim but behind the front. So the rim is drawn in two
 * halves, with the balls and net in between.
 */
import { boardOf, project } from './court.js';

const COLORS = {
  wall: '#e4e9ef',
  wallStripe: '#dde3ea',
  wallPad: '#c3d0dd',
  wallPadEdge: '#aebdcc',
  floorNear: '#e2b879',
  floorFar: '#edcf9f',
  lines: 'rgb(255 255 255 / 0.85)',
  board: '#ffffff',
  boardEdge: '#9aa6b2',
  boardSquare: '#f0414f',
  rim: '#f26b1d',
  rimDark: '#c4541a',
  net: 'rgb(255 255 255 / 0.9)',
  ball: '#f28a2e',
  ballDark: '#c9651a',
  seam: '#7a3d10',
  shadow: 'rgb(60 40 20 / 0.28)',
  fire: '#ff6a00',
  text: { make: '#1f9bf0', fire: '#ff6a00', miss: '#6b7785' },
};

/**
 * @param {HTMLCanvasElement} canvas
 * @param {typeof import('./index.js').CONFIG} config
 */
export function createRenderer(canvas, config) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const court = config.court;
  let size = { width: 0, height: 0 };
  /** @type {Array<{ at: number, text: string, kind: 'make' | 'fire' | 'miss', p: import('./court.js').Vec }>} */
  let texts = [];
  /** A coaching hint near the bottom of the screen, e.g. "Snap your wrist to release!" */
  let hint = null;

  const to = (p) => project(p, size, config);

  /** Sharp on high-resolution screens: one canvas pixel per real pixel. */
  function resize(width, height) {
    const ratio = window.devicePixelRatio || 1;
    size = { width, height };
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** Fills a four-cornered shape given in world coordinates. */
  function quad(points, fill) {
    ctx.beginPath();
    points.map(to).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function line(from, to_, width, color) {
    const a = to(from);
    const b = to(to_);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function drawCourt(hoopX) {
    const board = boardOf(hoopX, config);
    const baselineZ = board.z + 1.2;
    const baselineY = to({ x: 0, y: 0, z: baselineZ }).y;

    // The wall behind the hoop, with the console's pinstripes.
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(0, 0, size.width, baselineY);
    ctx.fillStyle = COLORS.wallStripe;
    for (let y = 0; y < baselineY; y += 6) ctx.fillRect(0, y, size.width, 2);

    // Padding along the bottom of the wall, like a real gym.
    const wallZ = baselineZ + 2;
    const padTop = to({ x: 0, y: 1.1, z: wallZ }).y;
    const wallFoot = to({ x: 0, y: 0, z: wallZ }).y;
    ctx.fillStyle = COLORS.wallPad;
    ctx.fillRect(0, padTop, size.width, wallFoot - padTop);
    ctx.fillStyle = COLORS.wallPadEdge;
    ctx.fillRect(0, padTop, size.width, 3);

    // The wooden floor, lighter in the distance.
    const floor = ctx.createLinearGradient(0, wallFoot, 0, size.height);
    floor.addColorStop(0, COLORS.floorFar);
    floor.addColorStop(1, COLORS.floorNear);
    ctx.fillStyle = floor;
    ctx.fillRect(0, wallFoot, size.width, size.height - wallFoot);

    // Court lines: the baseline, and the lane leading to the hoop (it stays put).
    ctx.lineCap = 'butt';
    line({ x: -30, y: 0, z: baselineZ }, { x: 30, y: 0, z: baselineZ }, 3, COLORS.lines);
    const lane = 1.8;
    const laneStart = 0.4;
    line({ x: -lane, y: 0, z: laneStart }, { x: -lane, y: 0, z: baselineZ }, 3, COLORS.lines);
    line({ x: lane, y: 0, z: laneStart }, { x: lane, y: 0, z: baselineZ }, 3, COLORS.lines);
    line({ x: -lane, y: 0, z: laneStart }, { x: lane, y: 0, z: laneStart }, 3, COLORS.lines);
  }

  function drawBoard(hoopX) {
    const b = boardOf(hoopX, config);
    // The pole and arm holding the board up, behind it.
    const poleX = hoopX;
    line(
      { x: poleX, y: 0, z: b.z + 1.0 },
      { x: poleX, y: b.bottom + 0.3, z: b.z + 1.0 },
      10,
      '#8a96a3',
    );
    line(
      { x: poleX, y: b.bottom + 0.3, z: b.z + 1.0 },
      { x: poleX, y: b.bottom + 0.3, z: b.z },
      8,
      '#8a96a3',
    );

    const corners = [
      { x: b.left, y: b.top, z: b.z },
      { x: b.right, y: b.top, z: b.z },
      { x: b.right, y: b.bottom, z: b.z },
      { x: b.left, y: b.bottom, z: b.z },
    ];
    quad(corners, COLORS.board);
    const tl = to(corners[0]);
    const br = to(corners[2]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.boardEdge;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // The small square above the rim that players aim bank shots at.
    const sq = { w: 0.3, bottom: court.rimHeight + 0.02, top: court.rimHeight + 0.47 };
    const a = to({ x: hoopX - sq.w, y: sq.top, z: b.z });
    const c = to({ x: hoopX + sq.w, y: sq.bottom, z: b.z });
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.boardSquare;
    ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);

    // The bracket joining the rim to the board.
    line(
      { x: hoopX, y: court.rimHeight, z: court.distance + court.rimRadius },
      { x: hoopX, y: court.rimHeight, z: b.z },
      4,
      COLORS.rimDark,
    );
  }

  /** Points around the rim, in the world. */
  function rimPoints(hoopX, radius = court.rimRadius, y = court.rimHeight, count = 48) {
    return Array.from({ length: count + 1 }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return {
        x: hoopX + Math.cos(angle) * radius,
        y,
        z: court.distance + Math.sin(angle) * radius,
      };
    });
  }

  /** Draws the half of the rim that's further away (back) or nearer (front). */
  function drawRimHalf(hoopX, half) {
    const points = rimPoints(hoopX);
    ctx.lineWidth = Math.max(3, to({ x: 0, y: 0, z: court.distance }).scale * 0.035);
    ctx.lineCap = 'round';
    ctx.strokeStyle = half === 'back' ? COLORS.rimDark : COLORS.rim;
    ctx.beginPath();
    let drawing = false;
    for (const point of points) {
      const inHalf = half === 'back' ? point.z >= court.distance : point.z <= court.distance;
      const p = to(point);
      if (inHalf && !drawing) ctx.moveTo(p.x, p.y);
      else if (inHalf) ctx.lineTo(p.x, p.y);
      drawing = inHalf;
    }
    ctx.stroke();
  }

  /** The net: strings from the rim down to a narrower ring below it. */
  function drawNet(hoopX) {
    const top = rimPoints(hoopX, court.rimRadius, court.rimHeight, 12);
    const bottom = rimPoints(hoopX, court.rimRadius * 0.6, court.rimHeight - 0.45, 12);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.net;
    ctx.beginPath();
    for (let i = 0; i < top.length - 1; i++) {
      for (const [from, to_] of [
        [top[i], bottom[i + 1]],
        [top[i + 1], bottom[i]],
      ]) {
        const a = to(from);
        const b = to(to_);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
    const ring = bottom.map(to);
    ring.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }

  function drawShadow(ball) {
    const p = to({ x: ball.p.x, y: 0, z: ball.p.z });
    const r = court.ballRadius * p.scale;
    const fade = Math.max(0.15, 1 - ball.p.y / 4);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * @param {{ p: import('./court.js').Vec, spin: number }} ball
   * @param {boolean} onFire
   * @param {{ x: number, y: number, r: number }} [placed]  draw here instead (screen pixels)
   */
  function drawBall(ball, onFire, placed) {
    const p = placed ?? to(ball.p);
    const r = placed?.r ?? court.ballRadius * to(ball.p).scale;
    ctx.save();
    if (onFire) {
      ctx.shadowColor = COLORS.fire;
      ctx.shadowBlur = r * 0.9;
    }
    const shading = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    shading.addColorStop(0, COLORS.ball);
    shading.addColorStop(1, COLORS.ballDark);
    ctx.fillStyle = shading;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Seams, turning as the ball spins.
    ctx.translate(p.x, p.y);
    ctx.rotate(ball.spin);
    ctx.strokeStyle = COLORS.seam;
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.moveTo(-r * 0.55, -r * 0.83);
    ctx.quadraticCurveTo(-r * 0.05, 0, -r * 0.55, r * 0.83);
    ctx.moveTo(r * 0.55, -r * 0.83);
    ctx.quadraticCurveTo(r * 0.05, 0, r * 0.55, r * 0.83);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The aim marker, drawn at the rim's height so you can line it up with the
   * hoop. Once you're set, it locks in place and gets a solid centre.
   */
  function drawAim(aim) {
    const rimY = to({ x: 0, y: court.rimHeight, z: court.distance }).y;
    const x = size.width / 2 + aim.x * size.height;
    ctx.save();
    ctx.translate(x, rimY);
    if (aim.locked) {
      ctx.fillStyle = aim.color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'round';
    for (const [width, color] of [
      [7, '#ffffff'],
      [3, aim.color],
    ]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        ctx.moveTo(dx * 14, dy * 14);
        ctx.lineTo(dx * 22, dy * 22);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The ball in your hands, at the bottom of the screen. It rests low when
   * you're ready, lifts and glows when you're set, and is gone for a moment
   * after a shot (it's in the air).
   *
   * @param {import('./shot.js').ShotStage} stage
   * @param {number} now
   */
  function drawHands(stage, now) {
    if (stage === 'cooldown') return;
    const raised = stage === 'set' || stage === 'pushing';
    const r = size.height * 0.1;
    const x = size.width / 2;
    const y = size.height - (raised ? r * 1.6 : r * 0.55);
    ctx.save();
    if (raised) {
      // A pulsing glow: you're set, now push and snap.
      ctx.shadowColor = '#23b566';
      ctx.shadowBlur = r * (0.5 + 0.3 * Math.sin(now / 120));
    }
    drawBall({ p: { x: 0, y: 0, z: 0 }, spin: 0.4 }, false, { x, y, r });
    ctx.restore();

    ctx.save();
    ctx.font = `800 ${Math.round(size.height * 0.03)}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = raised ? '#23b566' : '#6b7785';
    const label = raised ? 'Set! Push up and snap' : 'Raise and cock your wrist to set';
    const labelY = y - r - size.height * 0.02;
    ctx.strokeText(label, x, labelY);
    ctx.fillText(label, x, labelY);
    ctx.restore();
  }

  function drawHint(now) {
    if (!hint || now - hint.at > config.effects.textMs * 1.5) return;
    const age = (now - hint.at) / (config.effects.textMs * 1.5);
    ctx.save();
    ctx.globalAlpha = 1 - age * age;
    ctx.font = `800 ${Math.round(size.height * 0.045)}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#e5484d';
    const y = size.height * 0.62;
    ctx.strokeText(hint.text, size.width / 2, y);
    ctx.fillText(hint.text, size.width / 2, y);
    ctx.restore();
  }

  function drawTexts(now) {
    texts = texts.filter((t) => now - t.at < config.effects.textMs);
    for (const t of texts) {
      const age = (now - t.at) / config.effects.textMs;
      const p = to({ ...t.p, y: t.p.y + age * 0.4 });
      ctx.save();
      ctx.globalAlpha = 1 - age * age;
      ctx.font = `800 ${Math.round(size.height * (t.kind === 'miss' ? 0.042 : 0.055))}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = COLORS.text[t.kind];
      ctx.strokeText(t.text, p.x, p.y);
      ctx.fillText(t.text, p.x, p.y);
      ctx.restore();
    }
  }

  return {
    resize,

    /**
     * Floating text above the hoop, e.g. "Swish! +3".
     *
     * @param {import('./court.js').Vec} position
     * @param {string} text
     * @param {number} now
     * @param {'make' | 'fire' | 'miss'} kind
     */
    text(position, text, now, kind) {
      texts.push({ p: position, text, at: now, kind });
    },

    /** A coaching hint near the bottom of the screen. */
    hint(text, now) {
      hint = { text, at: now };
    },

    /** Moves every effect later by `ms`, so they freeze during a pause. */
    shift(ms) {
      texts = texts.map((t) => ({ ...t, at: t.at + ms }));
      if (hint) hint = { ...hint, at: hint.at + ms };
    },

    clearEffects() {
      texts = [];
      hint = null;
    },

    /**
     * @param {{
     *   now: number,
     *   hoopX: number,
     *   balls: import('./court.js').Ball[],
     *   aim: { x: number, color: string, locked: boolean } | null,
     *   hands: import('./shot.js').ShotStage | null,
     *   onFire: boolean,
     * }} scene
     */
    draw({ now, hoopX, balls, aim, hands, onFire }) {
      if (size.height === 0) return;
      ctx.clearRect(0, 0, size.width, size.height);
      drawCourt(hoopX);
      for (const ball of balls) drawShadow(ball);
      drawBoard(hoopX);

      // Far to near: balls behind the rim, the back of the rim, the net, the
      // front of the rim, then balls in front of it.
      const byDistance = [...balls].sort((a, b) => b.p.z - a.p.z);
      const behind = byDistance.filter((ball) => ball.p.z > court.distance);
      const inFront = byDistance.filter((ball) => ball.p.z <= court.distance);
      drawRimHalf(hoopX, 'back');
      for (const ball of behind) drawBall(ball, onFire);
      drawNet(hoopX);
      drawRimHalf(hoopX, 'front');
      for (const ball of inFront) drawBall(ball, onFire);

      if (aim) drawAim(aim);
      if (hands) drawHands(hands, now);
      drawTexts(now);
      drawHint(now);
    },
  };
}
