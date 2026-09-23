/**
 * Draws your batter: a cartoon ballplayer in helmet, jersey, pants, high
 * socks, cleats and batting gloves, posed from a set of 2D joints (see
 * swing-frames.js, which has a real swing's joints frame by frame).
 *
 * The body parts are simple shapes stretched between joints: a leg is a
 * rounded, tapering tube from hip to knee and knee to ankle, the torso is the
 * smooth outline round the shoulders and hips, and so on. Because every part
 * is built from the joints, the same drawing works in any pose.
 *
 * Positions are in "art units" (200 units = 1 metre): x right, y down, and
 * 0,0 is his spot on the ground. He's seen from behind the plate, so his
 * right side (the back leg and back arm) is nearest us.
 */

const SKIN_NEAR = '#e8b48c';
const SKIN_FAR = '#d9a07a';
const PANTS = '#f4f6f9';
const PANTS_FAR = '#dde2e8';
const DARK = '#1d2733';
const WOOD = ['#a8652e', '#e0a867', '#b8743a'];

/** @typedef {[number, number]} P */

const add = (a, b) => /** @type {P} */ ([a[0] + b[0], a[1] + b[1]]);
const sub = (a, b) => /** @type {P} */ ([a[0] - b[0], a[1] - b[1]]);
const mul = (a, k) => /** @type {P} */ ([a[0] * k, a[1] * k]);
const lerp = (a, b, k) => add(a, mul(sub(b, a), k));
const unit = (a) => {
  const n = Math.hypot(a[0], a[1]) || 1;
  return /** @type {P} */ ([a[0] / n, a[1] / n]);
};

/**
 * A rounded tube between two circles (centre and radius each): the outline
 * wrapped tight round both, like a limb that tapers from one joint to the next.
 */
function tube(ctx, a, ra, b, rb) {
  const d = sub(b, a);
  const D = Math.hypot(d[0], d[1]);
  ctx.beginPath();
  if (D <= Math.abs(ra - rb)) {
    const [c, r] = ra > rb ? [a, ra] : [b, rb];
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    return;
  }
  const angle = Math.atan2(d[1], d[0]);
  const spread = Math.acos((ra - rb) / D);
  ctx.arc(a[0], a[1], ra, angle + spread, angle - spread + Math.PI * 2);
  ctx.arc(b[0], b[1], rb, angle - spread, angle + spread);
  ctx.closePath();
}

/** The smooth outline round several circles (the convex hull), e.g. the torso round shoulders and hips. */
function blob(ctx, circles) {
  const points = [];
  for (const [c, r] of circles) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      points.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
  }
  points.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = [...half(points), ...half([...points].reverse())];
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Fills the current path, then darkens it by `shade` (0 to 1). */
function paint(ctx, color, shade = 0) {
  ctx.fillStyle = color;
  ctx.fill();
  if (shade > 0) {
    ctx.fillStyle = `rgb(0 0 0 / ${shade})`;
    ctx.fill();
  }
}

/** A leg: pants down to mid-shin, then a high sock, then a cleat from heel to toe. */
function leg(ctx, hip, knee, ankle, heel, toe, { near, jersey }) {
  const pants = near ? PANTS : PANTS_FAR;
  const sockTop = lerp(knee, ankle, 0.62);
  tube(ctx, knee, 11, ankle, 7.5);
  paint(ctx, jersey, near ? 0 : 0.35);
  tube(ctx, hip, 17, knee, 12);
  paint(ctx, pants);
  tube(ctx, knee, 12, sockTop, 9.5);
  paint(ctx, pants);
  // A crease behind the knee.
  ctx.strokeStyle = 'rgb(0 0 0 / 0.1)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const across = unit([-(ankle[1] - hip[1]), ankle[0] - hip[0]]);
  ctx.moveTo(...add(knee, mul(across, -7)));
  ctx.lineTo(...add(knee, mul(across, 7)));
  ctx.stroke();
  // Piping down the side of the pants, in the team colour.
  if (near) {
    ctx.strokeStyle = jersey;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const side = mul(across, 12);
    ctx.moveTo(...add(hip, mul(across, 16)));
    ctx.quadraticCurveTo(...add(knee, side), ...add(sockTop, mul(across, 9)));
    ctx.stroke();
  }
  // Cleat: heel, ankle and toe wrapped together, with a white sole.
  blob(ctx, [
    [ankle, 8],
    [heel, 8],
    [toe, 6.5],
  ]);
  paint(ctx, DARK);
  ctx.strokeStyle = 'rgb(255 255 255 / 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(...add(heel, [0, 6]));
  ctx.lineTo(...add(toe, [0, 5]));
  ctx.stroke();
}

/** An arm: a short jersey sleeve, then bare arm down to the batting glove. */
function arm(ctx, shoulder, elbow, hand, { near, jersey }) {
  const skin = near ? SKIN_NEAR : SKIN_FAR;
  const sleeveEnd = lerp(shoulder, elbow, 0.55);
  tube(ctx, elbow, near ? 8.5 : 7.5, hand, near ? 7 : 6.5);
  paint(ctx, skin);
  tube(ctx, shoulder, near ? 9.5 : 8.5, elbow, near ? 8.5 : 7.5);
  paint(ctx, skin);
  if (near) {
    tube(ctx, shoulder, 15, sleeveEnd, 14);
    paint(ctx, 'rgb(0 0 0 / 0.25)');
  }
  tube(ctx, shoulder, near ? 13 : 11, sleeveEnd, near ? 12 : 10);
  paint(ctx, jersey, near ? 0.1 : 0.3);
}

/** The bat, from the knob just below the bottom hand to the end of the barrel. */
function bat(ctx, knob, tip) {
  const along = sub(tip, knob);
  const length = Math.hypot(along[0], along[1]);
  ctx.save();
  ctx.translate(knob[0], knob[1]);
  ctx.rotate(Math.atan2(along[1], along[0]));
  const wood = ctx.createLinearGradient(0, -7.5, 0, 7.5);
  wood.addColorStop(0, WOOD[0]);
  wood.addColorStop(0.45, WOOD[1]);
  wood.addColorStop(1, WOOD[2]);
  ctx.fillStyle = wood;
  const barrel = 7.5;
  const end = Math.max(length, barrel * 2.5);
  ctx.beginPath();
  ctx.moveTo(0, -3.2);
  ctx.lineTo(end * 0.42, -3.6);
  ctx.quadraticCurveTo(end * 0.72, -barrel, end - barrel, -barrel);
  ctx.arc(end - barrel, 0, barrel, -Math.PI / 2, Math.PI / 2);
  ctx.quadraticCurveTo(end * 0.72, barrel, end * 0.42, 3.6);
  ctx.lineTo(0, 3.2);
  ctx.closePath();
  ctx.fill();
  // When the bat points towards or away from us it looks short: show the
  // round end of the barrel, so it reads as pointing at us, not shrinking.
  const facing = Math.min(1, Math.max(0, 1 - length / 180));
  if (facing > 0.15) {
    ctx.fillStyle = '#e9b877';
    ctx.strokeStyle = 'rgb(0 0 0 / 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(
      end - barrel * (1 - facing * 0.5),
      0,
      barrel * facing * 0.9,
      barrel,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
  }
  // The knob.
  ctx.fillStyle = '#8a5a2b';
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A batting glove round the handle: a jersey-coloured cuff at the wrist, the
 * back of the hand, and fingers curled round the bat.
 */
function glove(ctx, hand, elbow, along, jersey) {
  const wrist = unit(sub(elbow, hand));
  tube(ctx, add(hand, mul(wrist, 7)), 7, add(hand, mul(wrist, 12)), 6.5);
  paint(ctx, jersey, 0.25);
  ctx.save();
  ctx.translate(hand[0], hand[1]);
  ctx.rotate(Math.atan2(along[1], along[0]));
  // Which side of the bat the wrist is on: the fingers wrap round the other side.
  const side = Math.sign(wrist[0] * -along[1] + wrist[1] * along[0]) || 1;
  ctx.scale(1, side);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgb(0 0 0 / 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-8.5, -3, 17, 13, 5);
  ctx.fill();
  ctx.stroke();
  // Four fingers curled round the handle.
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.roundRect(-8.2 + k * 4.2, -9.5, 3.9, 9, 1.9);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The helmet, turned the way he's looking: brim towards his face, the ear
 * flap over his right ear (nearest us), a shine on top.
 */
function helmet(ctx, head, nose, jersey) {
  const look = sub(nose, head);
  const facing = look[0] >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, Math.PI * 2);
  paint(ctx, jersey, 0.22);
  ctx.save();
  ctx.scale(facing, 1);
  ctx.rotate(Math.atan2(look[1], Math.abs(look[0])) * 0.6);
  // Brim, pointing where he looks.
  ctx.beginPath();
  ctx.moveTo(20, -10);
  ctx.quadraticCurveTo(34, -12, 38, -2);
  ctx.lineTo(22, 2);
  ctx.closePath();
  paint(ctx, jersey, 0.42);
  // Ear flap.
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.quadraticCurveTo(10, 6, 16, 18);
  ctx.quadraticCurveTo(8, 30, -6, 24);
  ctx.closePath();
  paint(ctx, jersey, 0.32);
  ctx.restore();
  // Shine.
  ctx.strokeStyle = 'rgb(255 255 255 / 0.45)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, -6);
  ctx.quadraticCurveTo(-18, -22, -2, -26);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the batter in a pose.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Record<string, any>} pose  joints in art units (see swing-frames.js),
 *   plus lEl/rEl for the elbows and batTip for the end of the bat
 * @param {{ x: number, y: number, perUnit: number, jersey: string, number?: string }} where
 *   x, y: his spot on the ground on screen; perUnit: pixels per art unit
 */
export function drawBatterArt(ctx, pose, { x, y, perUnit, jersey, number = '1' }) {
  // A touch narrower through the shoulders and hips than the video: its
  // camera was close to the hitter, which makes his body look wider than
  // it would from the game's camera further back.
  const narrow = (a, b, k) => [lerp(lerp(a, b, 0.5), a, k), lerp(lerp(a, b, 0.5), b, k)];
  const [lSh, rSh] = narrow(pose.lSh, pose.rSh, 0.82);
  const [lHip, rHip] = narrow(pose.lHip, pose.rHip, 0.82);
  const p = { ...pose, lSh, rSh, lHip, rHip };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(perUnit, perUnit);
  ctx.lineJoin = 'round';

  // Shadows on the dirt: one under his body, and one right under each foot,
  // so you can see both feet are planted.
  ctx.fillStyle = 'rgb(0 0 0 / 0.16)';
  ctx.beginPath();
  ctx.ellipse((p.lAnkle[0] + p.rAnkle[0]) / 2, 12, 70, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const side of ['l', 'r']) {
    const heel = p[side + 'Heel'];
    const toe = p[side + 'Toe'];
    ctx.fillStyle = 'rgb(0 0 0 / 0.22)';
    ctx.beginPath();
    ctx.ellipse((heel[0] + toe[0]) / 2, Math.max(heel[1], toe[1]) + 7, 26, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Furthest away: his front leg and front arm, partly behind his body.
  leg(ctx, p.lHip, p.lKnee, p.lAnkle, p.lHeel, p.lToe, { near: false, jersey });
  arm(ctx, p.lSh, p.lEl, p.lHand, { near: false, jersey });

  // Seat and hips.
  const seat = (hip) => add(hip, [0, 10]);
  blob(ctx, [
    [p.lHip, 18],
    [p.rHip, 18],
    [seat(p.lHip), 17],
    [seat(p.rHip), 17],
  ]);
  paint(ctx, PANTS_FAR);

  // His back leg, nearest us.
  leg(ctx, p.rHip, p.rKnee, p.rAnkle, p.rHeel, p.rToe, { near: true, jersey });

  // Torso: the jersey round his shoulders, down to the waist.
  const neckBase = add(lerp(p.lSh, p.rSh, 0.5), [0, -8]);
  const waist = (hip) => add(hip, [0, -18]);
  const hips = lerp(p.lHip, p.rHip, 0.5);
  const torso = /** @type {Array<[P, number]>} */ ([
    [p.lSh, 13],
    [p.rSh, 14],
    [neckBase, 11],
    // His chest and back, so he's solid even when side-on to us.
    [lerp(lerp(p.lSh, p.rSh, 0.5), hips, 0.38), 23],
    [waist(p.lHip), 18],
    [waist(p.rHip), 18],
  ]);
  blob(ctx, torso);
  paint(ctx, jersey);
  // Shading: darker down his back.
  const shade = ctx.createLinearGradient(
    Math.min(p.lSh[0], p.rSh[0]) - 22,
    0,
    Math.max(p.lSh[0], p.rSh[0]) + 22,
    0,
  );
  shade.addColorStop(0, 'rgb(0 0 0 / 0.22)');
  shade.addColorStop(0.55, 'rgb(0 0 0 / 0)');
  shade.addColorStop(1, 'rgb(0 0 0 / 0.1)');
  ctx.fillStyle = shade;
  ctx.fill();
  // His number, as his back turns towards us: it comes round from his side,
  // narrow at first, then full width when his back is square on.
  const backTurned = Math.min(1, Math.max(0, (p.rSh[0] - p.lSh[0] - 10) / 50));
  if (backTurned > 0.05) {
    const middle = add(lerp(lerp(p.lSh, p.rSh, 0.5), lerp(p.lHip, p.rHip, 0.5), 0.42), [
      (1 - backTurned) * -10,
      0,
    ]);
    ctx.save();
    ctx.globalAlpha = 0.92 * Math.min(1, backTurned * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(middle[0], middle[1]);
    ctx.rotate(Math.atan2(p.rSh[1] - p.lSh[1], p.rSh[0] - p.lSh[0]) * 0.5);
    ctx.scale(0.3 + 0.7 * backTurned, 1);
    ctx.fillText(number, 0, 0);
    ctx.restore();
  }
  // Belt: a band round his waist, trimmed to the jersey's outline, tilting
  // a little with his hips.
  ctx.save();
  blob(ctx, torso);
  ctx.clip();
  const hipLine = sub(p.rHip, p.lHip);
  const tilt = Math.max(-0.35, Math.min(0.35, hipLine[1] / (Math.abs(hipLine[0]) + 20)));
  ctx.translate(hips[0], hips[1] - 6);
  ctx.rotate(Math.atan(tilt));
  ctx.fillStyle = DARK;
  ctx.fillRect(-80, -5, 160, 10);
  ctx.restore();

  // Neck and helmet.
  tube(ctx, neckBase, 10, lerp(neckBase, p.head, 0.7), 9);
  paint(ctx, SKIN_FAR);
  helmet(ctx, p.head, p.nose, jersey);

  // His back arm, nearest us.
  arm(ctx, p.rSh, p.rEl, p.rHand, { near: true, jersey });

  // The bat, then the gloves wrapped round it.
  const along = unit(sub(p.batTip, p.rHand));
  bat(ctx, sub(p.lHand, mul(along, 13)), p.batTip);
  glove(ctx, p.lHand, p.lEl, along, jersey);
  glove(ctx, p.rHand, p.rEl, along, jersey);

  ctx.restore();
}
