/**
 * The batter and the pitcher as 3D cartoon ballplayers, in the style of Wii
 * Sports: a big round head, no neck, a short rounded shirt in their team
 * colour, slim arms with round hands, striped pants and round shoes. The
 * batter has a big glossy yellow bat; the pitcher a cap, a brown glove and
 * the ball. They're posed from their joints (batter.js, pitcher.js) and seen
 * through exactly the same camera as the rest of the ballpark, then painted
 * onto the game's canvas like everything else.
 *
 * Each body part is a simple shape moved each frame to where its joints
 * are: an arm is a rounded tube from shoulder to elbow and another from
 * elbow to hand, the shirt is a rounded barrel from the hips to the
 * shoulders, and so on.
 *
 * Uses three.js, a 3D drawing library, drawing on its own hidden canvas.
 */
import * as THREE from 'three';
import { BAT, GRIP } from './batter.js';
import { BODY } from './body.js';

const COLORS = {
  skin: 0xf1c7a0,
  hair: 0x5a3a22,
  white: 0xffffff,
  bat: 0xf4b92c,
  glove: 0x9a5a26,
};

const UP = new THREE.Vector3(0, 1, 0);
const v = () => new THREE.Vector3();
const lerp = (a, b, k) => v().lerpVectors(a, b, k);

const material = (color, roughness = 0.6, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

/**
 * Builds one player: his body parts in their own group, ready to be posed.
 *
 * @param {{ bat?: boolean, glove?: boolean, cap?: boolean }} kit
 */
function createPlayer(kit) {
  const root = new THREE.Group();
  const shirt = material(0x1f9bf0, 0.65);
  const capColor = material(0x1f9bf0, 0.45);
  const skin = material(COLORS.skin, 0.7);
  const hair = material(COLORS.hair, 0.8);

  // Stripes for the pants and shoes: white with thin stripes in the team colour.
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 64;
  stripeCanvas.height = 4;
  const stripes = new THREE.CanvasTexture(stripeCanvas);
  stripes.wrapS = THREE.RepeatWrapping;
  stripes.repeat.set(5, 1);
  stripes.colorSpace = THREE.SRGBColorSpace;
  const pants = material(COLORS.white, 0.75, { map: stripes });
  const shoes = material(COLORS.white, 0.55, { map: stripes });

  /** A rounded tube for a bone `length` long, moved each frame to run between two joints. */
  function tube(radius, length, mat) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 16), mat);
    mesh.userData.length = length;
    root.add(mesh);
    return mesh;
  }
  const between = (mesh, a, b) => {
    const along = v().subVectors(b, a);
    const distance = along.length() || 1e-6;
    mesh.position.copy(a).addScaledVector(along, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, along.divideScalar(distance));
    mesh.scale.set(1, distance / mesh.userData.length, 1);
  };
  const ball = (radius, mat, scale = [1, 1, 1], parent = root) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), mat);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  };

  // ---- Legs: striped pants and round shoes --------------------------------
  const leg = () => ({
    thigh: tube(0.075, BODY.thigh, pants),
    shin: tube(0.066, BODY.shin, pants),
    shoe: ball(0.082, shoes, [1.05, 0.62, 1.55]),
  });
  const legs = { l: leg(), r: leg() };

  // ---- Body: a short rounded shirt, over the top of the pants -------------
  const body = new THREE.Group();
  root.add(body);
  ball(0.13, pants, [1.15, 0.7, 0.9], body).position.set(0, -0.02, 0);
  // The shirt: turned from a side profile, hips (0) to shoulders (TORSO).
  const TORSO = BODY.torso;
  const shirtProfile = [
    [0, -0.05],
    [0.15, -0.045],
    [0.162, 0.03],
    [0.158, 0.18],
    [0.148, 0.3],
    [0.125, 0.37],
    [0.08, 0.41],
    [0, 0.425],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(shirtProfile, 32), shirt);
  body.add(torso);

  // ---- Arms: slim sleeves, round hands --------------------------------------
  const arm = () => ({
    upper: tube(0.042, BODY.upperArm, shirt),
    fore: tube(0.038, BODY.foreArm, shirt),
    hand: ball(0.055, shirt),
  });
  const arms = { l: arm(), r: arm() };

  // ---- Head: big and round, with hair, and a cap for the pitcher ------------
  // (The head's own axes: x to his right, y up, z out of the back of his head.)
  const head = new THREE.Group();
  root.add(head);
  const R = BODY.headRadius;
  ball(R, skin, [1, 1.02, 0.98], head);
  const topHalf = (radius, mat, reach = 0.42) =>
    new THREE.Mesh(
      new THREE.SphereGeometry(radius, 28, 16, 0, Math.PI * 2, 0, Math.PI * reach),
      mat,
    );
  if (kit.cap) {
    head.add(topHalf(R * 1.06, capColor, 0.46));
    const brim = ball(R * 0.9, capColor, [0.85, 0.1, 0.8], head);
    brim.position.set(0, R * 0.3, -R * 0.75);
  } else {
    head.add(topHalf(R * 1.05, hair));
  }
  const hairBack = topHalf(R * 1.04, hair, 0.5);
  hairBack.rotation.x = Math.PI / 2 - 0.35;
  head.add(hairBack);

  // ---- The bat: big, yellow and glossy, turned from a profile --------------
  let bat = null;
  if (kit.bat) {
    const profile = [
      [0, 0],
      [0.034, 0.005],
      [0.034, 0.022],
      [0.021, 0.04],
      [0.021, 0.3],
      [0.028, 0.5],
      [0.05, 0.74],
      [0.056, 0.9],
      [0.05, 0.94],
      [0, BAT],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    bat = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 28),
      material(COLORS.bat, 0.3, { emissive: 0x3a2400 }),
    );
    root.add(bat);
  }

  // ---- The glove (on his left hand) and the ball (in his right) ------------
  let glove = null;
  let heldBall = null;
  if (kit.glove) {
    glove = ball(0.1, material(COLORS.glove, 0.7), [1, 1.1, 0.55]);
    heldBall = ball(0.05, material(COLORS.white, 0.5));
  }

  let shownColor = '';
  /** Dresses him in the team colour: shirt, cap, and the stripes on his pants and shoes. */
  function dress(color) {
    if (color === shownColor) return;
    shownColor = color;
    shirt.color.set(color);
    capColor.color.set(color).multiplyScalar(0.8);
    const g = /** @type {CanvasRenderingContext2D} */ (stripeCanvas.getContext('2d'));
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 4);
    g.fillStyle = color;
    g.fillRect(24, 0, 16, 4);
    stripes.needsUpdate = true;
  }

  /**
   * Moves every part to its joints. `at` turns a joint into a 3D point.
   *
   * @param {Record<string, number[]>} p
   * @param {(q: number[]) => THREE.Vector3} at
   * @param {{ holdingBall?: boolean }} [extra]
   */
  function pose(p, at, { holdingBall = false } = {}) {
    const j = (name) => at(p[name]);
    for (const side of /** @type {const} */ (['l', 'r'])) {
      const part = legs[side];
      const hip = j(`${side}Hip`);
      const knee = j(`${side}Knee`);
      const ankle = j(`${side}Ankle`);
      between(part.thigh, hip, knee);
      between(part.shin, knee, ankle);
      // The shoe: centred between heel and toe, pointing along the foot.
      const heel = j(`${side}Heel`);
      const toe = j(`${side}Toe`);
      part.shoe.position.copy(lerp(heel, toe, 0.45));
      part.shoe.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        v().subVectors(toe, heel).normalize(),
      );

      const limb = arms[side];
      const shoulder = j(`${side}Sh`);
      const elbow = j(`${side}El`);
      const hand = j(`${side}Hand`);
      between(limb.upper, shoulder, elbow);
      between(limb.fore, elbow, hand);
      limb.hand.position.copy(hand);
    }

    // The body: upright along his spine, turned with his shoulders.
    const hipMid = lerp(j('lHip'), j('rHip'), 0.5);
    const shoulderMid = lerp(j('lSh'), j('rSh'), 0.5);
    const spine = v().subVectors(shoulderMid, hipMid).normalize();
    const across = v().subVectors(j('rSh'), j('lSh'));
    across.addScaledVector(spine, -across.dot(spine)).normalize();
    const back = v().crossVectors(across, spine);
    body.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, spine, back));
    body.position.copy(hipMid);
    torso.scale.set(1.08, hipMid.distanceTo(shoulderMid) / TORSO, 0.86);

    // The head, facing where he looks.
    const centre = j('head');
    const look = v().subVectors(j('nose'), centre);
    look.y *= 0.4;
    look.normalize();
    const right = v().crossVectors(look, UP).normalize();
    const top = v().crossVectors(right, look).normalize();
    head.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, top, look.clone().negate()),
    );
    head.position.copy(centre);

    if (bat) {
      // The bat, from its knob just below his bottom hand.
      const along = v().subVectors(j('batTip'), j('rHand')).normalize();
      bat.position.copy(j('rHand').addScaledVector(along, -GRIP));
      bat.quaternion.setFromUnitVectors(UP, along);
    }
    if (glove && heldBall) {
      // The glove on his left hand, its open side facing the way his forearm points.
      const hand = j('lHand');
      glove.position.copy(hand);
      glove.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        v().subVectors(hand, j('lEl')).normalize(),
      );
      heldBall.visible = holdingBall;
      heldBall.position.copy(j('rHand'));
    }
  }

  return { root, dress, pose };
}

/** Both players, drawn together in one 3D scene. */
export function createPlayers() {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();

  // Bright, soft daylight: sky and ground light, and the sun from high behind us.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb58a5c, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-2, 6, 6);
  scene.add(sun);

  const batter = createPlayer({ bat: true });
  const pitcher = createPlayer({ glove: true, cap: true });
  scene.add(batter.root, pitcher.root);

  /** Game space → three.js space (three.js looks down its -z axis, so z is flipped). */
  const toScene = (x, y, z) => new THREE.Vector3(x, y, -z);

  /**
   * Draws the scene through the game's camera onto its canvas, showing only
   * `shown` (each player is drawn at his own place in the picture: the
   * pitcher behind the ball and strike zone, the batter in front).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {View} view
   * @param {ReturnType<typeof createPlayer>} shown
   */
  function render(ctx, view, shown) {
    const { width, height, ratio } = view;
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
    }
    // The game's camera: eye height, a set distance behind the plate,
    // looking straight out, with the horizon a set way down the screen.
    const { height: eye, behind, focal, horizon } = view.camera;
    const near = 0.1;
    const f = focal * height;
    const centreY = horizon * height + view.lift;
    camera.projectionMatrix.makePerspective(
      (-width / 2 / f) * near,
      (width / 2 / f) * near,
      (centreY / f) * near,
      (-(height - centreY) / f) * near,
      near,
      200,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.position.copy(toScene(0, eye, -behind));
    camera.lookAt(toScene(0, eye, 0));
    batter.root.visible = shown === batter;
    pitcher.root.visible = shown === pitcher;
    renderer.render(scene, camera);
    ctx.drawImage(canvas, 0, 0, width, height);
  }

  /**
   * @typedef {{
   *   width: number, height: number, ratio: number,
   *   camera: { height: number, behind: number, focal: number, horizon: number },
   *   lift: number,
   * }} View  the game's screen and camera (field.js project() sees the world the same way)
   */

  return {
    /**
     * Draws the batter: his joints are around where he stands.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {View} view
     * @param {{ pose: Record<string, number[]>, stands: { x: number, z: number }, color: string }} at
     */
    drawBatter(ctx, view, { pose, stands, color }) {
      batter.dress(color);
      batter.pose(pose, (q) => toScene(stands.x + q[0], q[1], stands.z + q[2]));
      render(ctx, view, batter);
    },

    /**
     * Draws the pitcher: his joints are in the ballpark.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {View} view
     * @param {{ pose: Record<string, number[]>, color: string, holdingBall: boolean }} at
     */
    drawPitcher(ctx, view, { pose, color, holdingBall }) {
      pitcher.dress(color);
      pitcher.pose(pose, (q) => toScene(q[0], q[1], q[2]), { holdingBall });
      render(ctx, view, pitcher);
    },
  };
}
