/**
 * Draws the play area on a <canvas>: targets, short-lived effects, and the
 * crosshair. The whole picture is redrawn from scratch every frame, which is
 * how most games work: simpler than tracking what changed, and fast enough.
 *
 * Game positions are in screen heights from the centre (like the aim
 * tracker). They're converted to pixels only here, at the last moment, so
 * resizing the window never moves anything in the game itself.
 */
import { toPixels } from '../../aim/index.js';

/** Colours the game uses for special-target text and effects. */
export const KIND_COLORS = {
  gold: '#e0a100',
  bomb: '#e5484d',
  explosion: '#ff9a1f',
};

const COLORS = {
  // Rings: bullseye, middle, outer.
  rings: ['#f0414f', '#ffffff', '#f0414f'],
  ringEdge: '#b3343a',
  goldRings: ['#f5b700', '#fff4c2', '#f5b700'],
  goldEdge: '#b98900',
  bombBody: '#2b3440',
  bombShine: '#56637a',
  fuse: '#8a6d3b',
  timer: 'rgb(29 39 51 / 0.35)',
  puff: 'rgb(107 119 133 / 0.6)',
  outline: '#ffffff',
};

/** Starts fast and slows down, like something thrown. */
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {typeof import('./index.js').CONFIG} config
 */
export function createRenderer(canvas, config) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  let size = { width: 0, height: 0 };
  /** @type {Array<{ kind: 'burst' | 'points' | 'puff', x: number, y: number, at: number, color?: string, text?: string, angles?: number[], spread?: number }>} */
  let effects = [];

  /** Screen heights → pixels. */
  const px = (position) => toPixels(position, size);

  /**
   * Keeps the canvas sharp on high-resolution screens: the canvas gets one
   * drawing pixel per real screen pixel, and we scale so our drawing code can
   * keep thinking in CSS pixels.
   */
  function resize(width, height) {
    const ratio = window.devicePixelRatio || 1;
    size = { width, height };
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function drawTarget(target, now) {
    const { popInMs, fadeOutMs } = config.effects;
    const { x, y } = px(target);
    const radius = target.radius * size.height;
    const age = now - target.bornAt;
    const remaining = target.expiresAt - now;
    const scale = easeOut(Math.min(1, age / popInMs)); // pop in
    const alpha = Math.min(1, remaining / fadeOutMs); // fade out at the end

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (target.kind === 'bomb') drawBomb(radius, now);
    else drawRings(radius, target.kind === 'gold', now);
    // A thin arc around the outside shows how much time the target has left.
    const lifeLeft = Math.max(0, remaining / (target.expiresAt - target.bornAt));
    ctx.beginPath();
    ctx.arc(0, 0, radius + 6, -Math.PI / 2, -Math.PI / 2 + lifeLeft * Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.timer;
    ctx.stroke();
    ctx.restore();
  }

  /** A ring target. Gold ones glow and have a highlight sweeping around them. */
  function drawRings(radius, gold, now) {
    const fills = gold ? COLORS.goldRings : COLORS.rings;
    const rings = config.rings;
    if (gold) {
      ctx.shadowColor = KIND_COLORS.gold;
      ctx.shadowBlur = 18;
    }
    // Rings from the outside in, so each smaller one paints over the last.
    for (let i = rings.length - 1; i >= 0; i--) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * rings[i].upTo, 0, Math.PI * 2);
      ctx.fillStyle = fills[i % fills.length];
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = gold ? COLORS.goldEdge : COLORS.ringEdge;
      ctx.stroke();
    }
    if (gold) {
      // The shine: a short white arc that circles the target about once a second.
      const angle = (now / 1000) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.8, angle, angle + 0.9);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.stroke();
    }
  }

  /** A bomb: dark body, a shine, and a fuse with a flickering spark. */
  function drawBomb(radius, now) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bombBody;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-radius * 0.35, -radius * 0.35, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.bombShine;
    ctx.fill();

    // The fuse curls up and to the right from the top of the bomb.
    const tip = { x: radius * 0.75, y: -radius * 1.25 };
    ctx.beginPath();
    ctx.moveTo(radius * 0.45, -radius * 0.8);
    ctx.quadraticCurveTo(radius * 0.5, -radius * 1.2, tip.x, tip.y);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.fuse;
    ctx.stroke();

    // The spark flickers by changing size quickly.
    const flicker = 5 + Math.sin(now / 45) * 2 + Math.sin(now / 17) * 1.5;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, flicker, 0, Math.PI * 2);
    ctx.fillStyle = KIND_COLORS.explosion;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, flicker * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#fff4c2';
    ctx.fill();
  }

  function drawEffect(effect, now) {
    const { burstMs, pointsMs, puffMs } = config.effects;
    const { x, y } = px(effect);
    const age = now - effect.at;
    ctx.save();

    if (effect.kind === 'burst') {
      // Sparks flying outwards from the hit, fading as they go.
      const t = age / burstMs;
      const distance = easeOut(t) * size.height * 0.12 * effect.spread;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = effect.color;
      for (const angle of effect.angles) {
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          4 * (1 - t) + 1,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else if (effect.kind === 'points') {
      // "+50" floating up and fading out.
      const t = age / pointsMs;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `800 ${Math.round(size.height * 0.05)}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = COLORS.outline;
      ctx.fillStyle = effect.color;
      const rise = easeOut(t) * size.height * 0.08;
      ctx.strokeText(effect.text, x, y - rise);
      ctx.fillText(effect.text, x, y - rise);
    } else if (effect.kind === 'puff') {
      // A small grey ring that spreads and vanishes.
      const t = age / puffMs;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(x, y, 6 + easeOut(t) * 18, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.puff;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCrosshair(position, color) {
    const { x, y } = px(position);
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    // Draw twice: a thick white outline, then the colour on top, so it shows on any background.
    for (const [width, stroke] of [
      [7, COLORS.outline],
      [3, color],
    ]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = stroke;
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
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const lifetimeOf = (effect) =>
    ({
      burst: config.effects.burstMs,
      points: config.effects.pointsMs,
      puff: config.effects.puffMs,
    })[effect.kind];

  return {
    resize,

    /**
     * Sparks at a hit. `big` bursts (gold, bombs) have more sparks that fly further.
     *
     * @param {{ x: number, y: number }} position
     * @param {string} color
     * @param {number} now
     * @param {{ big?: boolean }} [options]
     */
    burst(position, color, now, { big = false } = {}) {
      const spread = big ? config.effects.bigBurstScale : 1;
      const count = Math.round(config.effects.burstParticles * spread);
      const angles = Array.from(
        { length: count },
        (_, i) => (i / count) * Math.PI * 2 + Math.random() * 0.4,
      );
      effects.push({ kind: 'burst', ...position, color, angles, spread, at: now });
    },

    /** Floating score text. */
    points(position, text, color, now) {
      effects.push({ kind: 'points', ...position, text, color, at: now });
    },

    /** A miss. */
    puff(position, now) {
      effects.push({ kind: 'puff', ...position, at: now });
    },

    /** Forgets all effects, e.g. when a new round starts. */
    clearEffects() {
      effects = [];
    },

    /**
     * Draws one frame.
     *
     * @param {{
     *   now: number,
     *   targets: import('./round.js').Target[],
     *   crosshair: { x: number, y: number, color: string } | null,
     * }} scene
     */
    draw({ now, targets, crosshair }) {
      ctx.clearRect(0, 0, size.width, size.height);
      for (const target of targets) drawTarget(target, now);
      effects = effects.filter((effect) => now - effect.at < lifetimeOf(effect));
      for (const effect of effects) drawEffect(effect, now);
      if (crosshair) drawCrosshair(crosshair, crosshair.color);
    },
  };
}
