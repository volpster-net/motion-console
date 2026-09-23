/**
 * Simple animated people, for the pitcher and the batter.
 *
 * A person is a skeleton: a handful of joints (head, shoulders, elbows,
 * hands, hips, knees, feet), each a point in metres, with x to the right and
 * y up from the ground. A *pose* says where every joint is.
 *
 * An animation is a list of key poses at moments from 0 to 1, the way an
 * animator draws the important frames of a motion. To draw any moment in
 * between, we blend the two key poses either side of it, easing in and out so
 * the motion speeds up and slows down naturally rather than moving like a robot.
 */

/** @typedef {[number, number]} Point  [x, y] in metres */
/** @typedef {Record<string, Point | number>} Pose  joints (points) plus any extra numbers, like z */
/** @typedef {{ at: number } & Pose} Keyframe */

/** Slow at the start and end of a move, quick in the middle. */
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Fills in every keyframe from the ones before it, so each key pose only
 * needs to list the joints that move. Returns the keyframes sorted by time.
 *
 * @param {Keyframe[]} keyframes
 * @returns {Keyframe[]}
 */
export function completeKeyframes(keyframes) {
  const sorted = [...keyframes].sort((a, b) => a.at - b.at);
  let previous = {};
  return sorted.map((frame) => (previous = { ...previous, ...frame }));
}

/**
 * The pose at moment `t` (0 to 1), blended from the key poses either side.
 *
 * @param {Keyframe[]} frames  from completeKeyframes()
 * @param {number} t
 * @returns {Pose}
 */
export function poseAt(frames, t) {
  if (t <= frames[0].at) return frames[0];
  const last = frames[frames.length - 1];
  if (t >= last.at) return last;
  const next = frames.findIndex((frame) => frame.at > t);
  const a = frames[next - 1];
  const b = frames[next];
  const k = ease((t - a.at) / (b.at - a.at));
  /** @type {Pose} */
  const pose = {};
  for (const key of Object.keys(b)) {
    const from = a[key] ?? b[key];
    const to = b[key];
    pose[key] = Array.isArray(to)
      ? [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]
      : from + (to - from) * k;
  }
  return pose;
}

/**
 * Draws a person.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Pose} pose
 * @param {(point: Point) => { x: number, y: number }} place  pose point → screen pixels
 * @param {number} pxPerMetre
 * @param {{
 *   jersey: string, pants: string, skin: string, cap: string,
 *   facing: 'front' | 'back',      front shows a face; back shows the back of a helmet
 *   hands?: 'separate' | 'together', together = both hands on one point, `hands` (a batter's grip)
 *   glove?: string,                 draws a glove on the left hand
 *   frontArm?: 'left' | 'right',    which arm is drawn over the body
 * }} style
 */
export function drawFigure(ctx, pose, place, pxPerMetre, style) {
  const px = (metres) => Math.max(1, metres * pxPerMetre);
  const at = (joint) => place(/** @type {Point} */ (pose[joint]));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const limb = (joints, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = px(width);
    ctx.beginPath();
    joints.map(at).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  };
  const handOf = (side) => (style.hands === 'together' ? 'hands' : `${side}Hand`);
  const arm = (side) => {
    limb([`${side}Shoulder`, `${side}Elbow`], 0.12, style.jersey);
    limb([`${side}Elbow`, handOf(side)], 0.09, style.skin);
  };
  const backArm = style.frontArm === 'left' ? 'r' : 'l';
  const frontArm = style.frontArm === 'left' ? 'l' : 'r';

  // Legs, with shoes.
  for (const side of ['l', 'r']) {
    limb([`${side}Hip`, `${side}Knee`, `${side}Foot`], 0.16, style.pants);
    const foot = at(`${side}Foot`);
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, px(0.13), px(0.05), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  arm(backArm);

  // Body: a jersey from shoulders to hips, and a belt.
  const torso = ['lShoulder', 'rShoulder', 'rHip', 'lHip'].map(at);
  ctx.fillStyle = style.jersey;
  ctx.strokeStyle = style.jersey;
  ctx.lineWidth = px(0.1);
  ctx.beginPath();
  torso.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  limb(['rHip', 'lHip'], 0.05, '#1d2733');
  limb(['neck', 'chest'], 0.1, style.skin);

  // Head: a face and cap from the front, a helmet from behind.
  const head = at('head');
  const r = px(0.12);
  ctx.fillStyle = style.skin;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.cap;
  ctx.beginPath();
  if (style.facing === 'front') {
    ctx.arc(head.x, head.y - r * 0.15, r * 1.05, Math.PI, 0); // cap
    ctx.fill();
    ctx.fillRect(head.x - r * 1.3, head.y - r * 0.2, r * 2.6, r * 0.28); // brim
  } else {
    // From behind, the helmet covers the whole head, with its ear flap and a little brim.
    ctx.arc(head.x, head.y, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(head.x - r * 0.2, head.y - r * 0.1, r * 1.45, r * 0.3);
    ctx.beginPath();
    ctx.ellipse(head.x - r * 0.35, head.y + r * 0.45, r * 0.4, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  arm(frontArm);

  if (style.glove) {
    const glove = at('lHand');
    ctx.fillStyle = style.glove;
    ctx.beginPath();
    ctx.arc(glove.x, glove.y, px(0.11), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
