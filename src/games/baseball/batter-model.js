/**
 * Your batter as a 3D cartoon ballplayer, in the style of Wii Sports: a big
 * round head with a cap of hair, no neck, a short rounded shirt in your
 * player colour, slim arms with round hands, striped pants, round shoes
 * and a big glossy yellow bat. He's posed from his joints (batter.js) and
 * seen through exactly the same camera as the rest of the ballpark, then
 * painted onto the game's canvas like everything else.
 *
 * Each body part is a simple shape moved each frame to where its joints
 * are: an arm is a rounded tube from shoulder to elbow and another from
 * elbow to hand, the shirt is a rounded barrel from his hips to his
 * shoulders, and so on.
 *
 * Uses three.js, a 3D drawing library, drawing on its own hidden canvas.
 */
import * as THREE from 'three';
import { BAT, BODY, GRIP } from './batter.js';

const COLORS = {
  skin: 0xf1c7a0,
  hair: 0x5a3a22,
  pants: 0xffffff,
  shoe: 0xffffff,
  bat: 0xf4b92c,
};

export function createBatterModel() {
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

  const material = (color, roughness = 0.6, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const shirt = material(0x1f9bf0, 0.65);
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
  const pants = material(COLORS.pants, 0.75, { map: stripes });
  const shoes = material(COLORS.shoe, 0.55, { map: stripes });

  const UP = new THREE.Vector3(0, 1, 0);

  /** A rounded tube for a bone `length` long, moved each frame to run between two joints. */
  function tube(radius, length, mat) {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 16), mat);
    mesh.userData.length = length;
    scene.add(mesh);
    return mesh;
  }
  const between = (mesh, a, b) => {
    const along = new THREE.Vector3().subVectors(b, a);
    const distance = along.length() || 1e-6;
    mesh.position.copy(a).addScaledVector(along, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, along.divideScalar(distance));
    mesh.scale.set(1, distance / mesh.userData.length, 1);
  };
  const ball = (radius, mat, scale = [1, 1, 1], parent = scene) => {
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
  scene.add(body);
  const seat = ball(0.13, pants, [1.15, 0.7, 0.9], body);
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

  // ---- Head: big and round, with a cap of hair on top and round the back ----
  const head = new THREE.Group();
  scene.add(head);
  const R = BODY.headRadius;
  ball(R, skin, [1, 1.02, 0.98], head);
  const hairTop = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.05, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
    hair,
  );
  head.add(hairTop);
  const hairBack = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.04, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hair,
  );
  // A half-sphere tipped to cover the back of his head (his head's +z is behind him).
  hairBack.rotation.x = Math.PI / 2 - 0.35;
  head.add(hairBack);

  // ---- The bat: big, yellow and glossy, turned from a profile --------------
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
  const bat = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 28),
    material(COLORS.bat, 0.3, { emissive: 0x3a2400 }),
  );
  scene.add(bat);

  let shownColor = '';
  /** Dresses him in the team colour: shirt, and the stripes on his pants and shoes. */
  function dress(color) {
    if (color === shownColor) return;
    shownColor = color;
    shirt.color.set(color);
    const g = /** @type {CanvasRenderingContext2D} */ (stripeCanvas.getContext('2d'));
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 4);
    g.fillStyle = color;
    g.fillRect(24, 0, 16, 4);
    stripes.needsUpdate = true;
  }

  const v = () => new THREE.Vector3();
  const lerp = (a, b, k) => v().lerpVectors(a, b, k);

  /** Moves every part to its joints. `at` turns a joint into a 3D point. */
  function pose(p, at) {
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
      const along = v().subVectors(toe, heel).normalize();
      part.shoe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);

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
    seat.position.set(0, -0.02, 0);

    // The head, facing where he looks (its own z axis out of the back of his head).
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

    // The bat, from its knob just below his bottom hand.
    const batAlong = v().subVectors(j('batTip'), j('rHand')).normalize();
    bat.position.copy(j('rHand').addScaledVector(batAlong, -GRIP));
    bat.quaternion.setFromUnitVectors(UP, batAlong);
  }

  return {
    /**
     * Draws him onto the game's canvas.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Record<string, number[]>} p  joints, metres around where he stands (batter.js)
     * @param {{
     *   width: number, height: number, ratio: number,
     *   stands: { x: number, z: number },
     *   camera: { height: number, behind: number, focal: number, horizon: number },
     *   lift: number, jersey: string,
     * }} view  the game's screen and camera (field.js project() sees the world the same way)
     */
    draw(ctx, p, view) {
      const { width, height, ratio } = view;
      if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
      ) {
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
      }
      dress(view.jersey);

      // The game's camera: eye height, a set distance behind the plate,
      // looking straight out, with the horizon a set way down the screen.
      // (three.js looks down its -z axis, so the game's z is flipped.)
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
      camera.position.set(0, eye, behind);
      camera.lookAt(0, eye, 0);

      const { stands } = view;
      const at = (q) => new THREE.Vector3(stands.x + q[0], q[1], -(stands.z + q[2]));
      pose(p, at);
      renderer.render(scene, camera);
      ctx.drawImage(canvas, 0, 0, width, height);
    },
  };
}
