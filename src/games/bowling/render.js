/**
 * Draws the bowling alley in 3D with three.js: a polished wooden lane with
 * its aiming arrows, gutters, the pin deck and kickback walls, the ten pins,
 * and the ball, plus neighbouring lanes for company.
 *
 * It only draws. Where everything is comes from lane.js each frame. The
 * camera follows the action by itself: behind the foul line while you line up,
 * chasing the ball down the lane, then settling on the pins.
 *
 * lane.js measures x with right positive as you face the pins. three.js's
 * camera, looking down the lane, has right as negative x, so every lane x is
 * flipped on its way into the scene (`at` below).
 */
import * as THREE from 'three';
import { createPlayer } from '../baseball/players.js';
import { ballInHand } from './bowler.js';
import { pinSpots } from './lane.js';

const COLORS = {
  background: 0x141826,
  approach: '#d9b27a',
  wood: ['#e0b77c', '#d6ab6d', '#e6c08a', '#d9b073'],
  gutter: 0x8a929c,
  cap: 0x2b2f3a,
  kickback: 0x3a2a24,
  masking: 0x1d3f8f,
  marks: 0x5a3a20,
  pin: 0xfbfbf8,
  stripe: 0xd8262f,
  guide: 0xffffff,
  guideAngling: 0xffc531,
};

/** A real pin's outline, from base to crown: [radius, height] in metres. */
const PIN_PROFILE = [
  [0.0254, 0],
  [0.04, 0.025],
  [0.054, 0.065],
  [0.0605, 0.114],
  [0.057, 0.16],
  [0.045, 0.205],
  [0.03, 0.245],
  [0.0227, 0.27],
  [0.025, 0.29],
  [0.0305, 0.315],
  [0.032, 0.333],
  [0.029, 0.356],
  [0.019, 0.373],
  [0, 0.381],
];
const PIN_HEIGHT = 0.381;
/** The two red neck stripes, as heights. */
const STRIPES = [
  [0.247, 0.258],
  [0.265, 0.276],
];
/** How long a knocked pin takes to fall flat, in seconds. */
const FALL_S = 0.35;
/** Camera lenses (vertical field of view, °) and where the lining-up camera sits behind the bowler (m). */
const WIDE_FOV = 38;
const STANCE_FOV = 16;
const STANCE_EYE = { back: 11, height: 2.8 };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {typeof import('./index.js').CONFIG} config
 */
export function createRenderer(canvas, config) {
  const lane = config.lane;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  scene.fog = new THREE.Fog(COLORS.background, 32, 46);
  const camera = new THREE.PerspectiveCamera(WIDE_FOV, 16 / 9, 0.05, 60);
  /** Every pin shares one shape and one material, made on first use (see makePin). */
  let sharedPinGeometry = null;
  let sharedPinMaterial = null;

  /** A lane position as a three.js point (x flipped; see the top of this file). */
  const at = (x, y, z) => new THREE.Vector3(-x, y, z);

  // ---- Lights -------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x30303a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.8, 6, 6);
  sun.target.position.set(0, 0, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 4096);
  Object.assign(sun.shadow.camera, {
    left: -2,
    right: 2,
    top: 14,
    bottom: -14,
    near: 0.5,
    far: 20,
  });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  // A warm spotlight over the pins, like a real alley's pin lights.
  const pinLight = new THREE.PointLight(0xfff0d8, 3, 6, 1.5);
  pinLight.position.copy(at(0, 2.2, lane.headPinZ - 0.4));
  scene.add(pinLight);

  // ---- The lanes ----------------------------------------------------------
  const laneLength = lane.pitZ + 0.05;
  const capWidth = 0.12;
  /** Centre-to-centre distance between neighbouring lanes. */
  const pairWidth = lane.laneWidth + lane.gutterWidth * 2 + capWidth;
  const woodTexture = makeWoodTexture();
  const disposables = [woodTexture];

  /** Builds one lane at `offset` metres across. Only ours (offset 0) gets a guide and moving pins. */
  function buildLane(offset) {
    const group = new THREE.Group();
    group.position.x = -offset;

    const surface = mesh(
      new THREE.BoxGeometry(lane.laneWidth, 0.04, laneLength),
      new THREE.MeshStandardMaterial({ map: woodTexture, roughness: 0.28, metalness: 0.05 }),
    );
    surface.position.set(0, -0.02, laneLength / 2);
    surface.receiveShadow = true;
    group.add(surface);

    const approach = mesh(
      new THREE.BoxGeometry(lane.laneWidth + lane.gutterWidth * 2 + capWidth, 0.04, 5),
      new THREE.MeshStandardMaterial({ color: COLORS.approach, roughness: 0.5 }),
    );
    approach.position.set(0, -0.02, -2.5);
    approach.receiveShadow = true;
    group.add(approach);

    // Foul line.
    const foul = mesh(new THREE.BoxGeometry(lane.laneWidth, 0.002, 0.02), flat(0x222222));
    foul.position.set(0, 0.001, 0);
    group.add(foul);

    // Gutters on each side: shallow metal channels.
    for (const side of [-1, 1]) {
      const gutter = mesh(
        new THREE.BoxGeometry(lane.gutterWidth, 0.02, laneLength),
        new THREE.MeshStandardMaterial({ color: COLORS.gutter, roughness: 0.35, metalness: 0.6 }),
      );
      gutter.position.set(
        side * (lane.laneWidth / 2 + lane.gutterWidth / 2),
        -0.07,
        laneLength / 2,
      );
      gutter.receiveShadow = true;
      group.add(gutter);

      // The cap between lanes.
      const cap = mesh(
        new THREE.BoxGeometry(capWidth / 2, 0.06, laneLength),
        new THREE.MeshStandardMaterial({ color: COLORS.cap, roughness: 0.6 }),
      );
      cap.position.set(side * (pairWidth / 2 - capWidth / 4), 0, laneLength / 2);
      group.add(cap);

      // Kickback walls beside the pin deck.
      const kickbackLength = lane.pitZ - lane.headPinZ + lane.kickbackReach + 0.6;
      const kickback = mesh(
        new THREE.BoxGeometry(0.04, 0.7, kickbackLength),
        new THREE.MeshStandardMaterial({ color: COLORS.kickback, roughness: 0.7 }),
      );
      kickback.position.set(
        side * (lane.laneWidth / 2 + lane.gutterWidth + 0.02),
        0.3,
        lane.headPinZ - lane.kickbackReach + kickbackLength / 2,
      );
      kickback.receiveShadow = true;
      group.add(kickback);
    }

    // Targeting arrows at 15 feet, and dots at 7 feet, every fifth board.
    const board = lane.laneWidth / 39;
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(-0.018, 0);
    arrowShape.lineTo(0.018, 0);
    arrowShape.lineTo(0, 0.13);
    arrowShape.closePath();
    const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
    const dotGeometry = new THREE.CircleGeometry(0.011, 12);
    for (let k = -3; k <= 3; k++) {
      const x = k * 5 * board;
      const arrow = mesh(arrowGeometry, flat(COLORS.marks));
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = Math.PI;
      // Arrows step back towards the middle, the way real lanes paint them.
      arrow.position.set(-x, 0.002, 4.57 + Math.abs(k) * 0.15);
      group.add(arrow);
      const dot = mesh(dotGeometry, flat(COLORS.marks));
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(-x, 0.002, 2.13);
      group.add(dot);
    }

    scene.add(group);
    return group;
  }

  buildLane(0);
  for (const side of [-1, 1]) {
    const neighbour = buildLane(side * pairWidth);
    // Neighbouring lanes keep a full rack standing, for company.
    for (const spot of pinSpots(lane)) {
      const pin = makePin();
      pin.position.set(-spot.x, 0, spot.z);
      neighbour.add(pin);
    }
  }

  // The masking panel that hangs over the pins, and the dark pit behind them.
  const maskingTexture = makeMaskingTexture();
  disposables.push(maskingTexture);
  const masking = mesh(
    new THREE.BoxGeometry(pairWidth * 3, 0.9, 0.05),
    new THREE.MeshStandardMaterial({ map: maskingTexture, roughness: 0.6 }),
  );
  masking.position.set(0, 1.65, lane.headPinZ - 0.7);
  scene.add(masking);
  const curtain = mesh(new THREE.BoxGeometry(pairWidth * 3, 2, 0.05), flat(0x050608));
  curtain.position.set(0, 0.6, lane.pitZ + 0.6);
  scene.add(curtain);

  // ---- Pins ---------------------------------------------------------------
  /** @type {Map<number, THREE.Group>} our lane's pins, by pin number */
  const pinMeshes = new Map();
  /** A random-looking but steady direction for each pin to wobble in. */
  const wobbleAxes = new Map();
  for (const spot of pinSpots(lane)) {
    const pin = makePin();
    pinMeshes.set(spot.n, pin);
    wobbleAxes.set(spot.n, new THREE.Vector3(Math.cos(spot.n * 2.4), 0, Math.sin(spot.n * 2.4)));
    scene.add(pin);
  }

  // ---- The ball and the aiming guide --------------------------------------
  const ballTexture = makeBallTexture();
  disposables.push(ballTexture);
  const ballMaterial = new THREE.MeshStandardMaterial({
    map: ballTexture,
    roughness: 0.12,
    metalness: 0.15,
  });
  const ball = mesh(new THREE.SphereGeometry(lane.ballRadius, 40, 28), ballMaterial);
  ball.castShadow = true;
  scene.add(ball);
  let lastRolled = 0;

  // ---- The bowler ---------------------------------------------------------
  // Home Run Derby's cartoon player, in a bowling shirt, posed by bowler.js.
  const bowler = createPlayer({});
  bowler.root.traverse((part) => (part.castShadow = true));
  scene.add(bowler.root);
  const joint = (q) => at(q[0], q[1], q[2]);

  // The guide is a line from the ball, turned to the chosen angle: a group
  // pivoting at the ball, holding a strip that runs ahead of it all the way to
  // the pins, widening as it goes so it still shows that far away.
  const guideLength = lane.headPinZ + 0.2;
  const guideMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.guide,
    transparent: true,
    opacity: 0.35,
  });
  const guide = new THREE.Group();
  const guideShape = new THREE.PlaneGeometry(0.03, guideLength);
  const corners = guideShape.attributes.position;
  for (let i = 0; i < corners.count; i++) {
    // Local -y ends up at the far end once the strip is laid flat.
    if (corners.getY(i) < 0) corners.setX(i, corners.getX(i) * 3);
  }
  const guideStrip = mesh(guideShape, guideMaterial);
  guideStrip.rotation.x = -Math.PI / 2;
  guideStrip.position.set(0, 0, guideLength / 2);
  guide.add(guideStrip);
  scene.add(guide);

  // ---- Camera -------------------------------------------------------------
  const cameraAt = new THREE.Vector3(0, 1.3, -2.4);
  const lookAt = new THREE.Vector3(0, 0, 12);
  camera.position.copy(cameraAt);
  let lastDrawAt = null;

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  /**
   * @param {{
   *   now: number,
   *   view: 'approach' | 'follow' | 'pins',
   *   holdX: number,                       where the ball is held across the foul line
   *   aimAngle: number,                    the chosen angle, degrees (positive = right)
   *   adjusting: 'position' | 'angle',     what the D-pad changes: the guide glows while angling
   *   holding: boolean,                    the player is gripping it (A held)
   *   showGuide: boolean,
   *   lane: import('./lane.js').Lane | null,  the ball in play, if any
   *   pins: import('./lane.js').Pin[],
   *   pinTime: number,                     the lane's clock (s), for falling pins
   *   ballColor: string,
   *   bowler: Record<string, number[]>,    every joint, from bowlerPose()
   * }} state
   */
  function draw(state) {
    const dt = lastDrawAt === null ? 0 : Math.min(0.1, (state.now - lastDrawAt) / 1000);
    lastDrawAt = state.now;

    // The ball: in play, or waiting at the foul line.
    const rolling = state.lane?.ball;
    if (rolling && !rolling.inPit) {
      const y = rolling.gutter ? lane.ballRadius - 0.06 : lane.ballRadius;
      ball.visible = true;
      ball.position.copy(at(rolling.x, y, rolling.z));
      // Roll it by however far it travelled since last frame, around the axis across its path.
      const moved = rolling.rolled - lastRolled;
      lastRolled = rolling.rolled;
      const travel = new THREE.Vector3(-rolling.vx, 0, rolling.vz);
      if (travel.lengthSq() > 1e-6 && moved > 0) {
        travel.normalize();
        const across = new THREE.Vector3(travel.z, 0, -travel.x);
        ball.rotateOnWorldAxis(across, moved / lane.ballRadius);
        // A hooking ball also spins sideways.
        ball.rotateOnWorldAxis(travel, -rolling.spin * dt * 12);
      }
    } else if (rolling) {
      ball.visible = false;
    } else {
      // Not rolled yet: in the bowler's hand.
      ball.visible = true;
      lastRolled = 0;
      ball.position.copy(joint(ballInHand(state.bowler, lane.ballRadius)));
    }
    ballMaterial.color.set(state.ballColor);
    bowler.dress(state.ballColor);
    bowler.pose(state.bowler, joint);

    guide.visible = state.showGuide;
    guide.position.copy(at(state.holdX, 0.003, -0.2));
    // Turning right in lane terms is towards three.js's negative x.
    guide.rotation.y = (-state.aimAngle * Math.PI) / 180;
    const angling = state.adjusting === 'angle';
    guideMaterial.color.set(angling ? COLORS.guideAngling : COLORS.guide);
    guideMaterial.opacity = angling ? 0.8 : 0.35;

    // Pins.
    const shown = new Set();
    for (const pin of state.pins) {
      shown.add(pin.n);
      posePin(pinMeshes.get(pin.n), pin, state.pinTime, state.now);
    }
    for (const [n, pinMesh] of pinMeshes) if (!shown.has(n)) pinMesh.visible = false;

    moveCamera(state, dt);
    renderer.render(scene, camera);
  }

  /** Stands, wobbles, topples, or drops a pin, from its physics state. */
  function posePin(pinMesh, pin, time, now) {
    pinMesh.visible = true;
    pinMesh.quaternion.identity();
    if (!pin.down) {
      pinMesh.position.copy(at(pin.x, 0, pin.z));
      if (pin.wobble > 0.01) {
        const angle = pin.wobble * 0.18 * Math.sin(now / 45);
        pinMesh.quaternion.setFromAxisAngle(wobbleAxes.get(pin.n), angle);
      }
      return;
    }
    // Falling over, in the direction it was knocked.
    const progress = Math.min(1, Math.max(0, (time - pin.downAt) / FALL_S));
    const eased = 1 - (1 - progress) * (1 - progress);
    const fall = new THREE.Vector3(-Math.sin(pin.fallAngle), 0, Math.cos(pin.fallAngle));
    const axis = new THREE.Vector3(fall.z, 0, -fall.x);
    pinMesh.quaternion.setFromAxisAngle(axis, (eased * Math.PI) / 2);
    // Lying down, the pin's middle (not its base) is where the physics says it is.
    const base = at(pin.x, 0, pin.z).addScaledVector(fall, (-PIN_HEIGHT / 2) * eased);
    base.y = 0.045 * eased;
    if (pin.inPit) base.y -= 0.5;
    pinMesh.position.copy(base);
  }

  /** Glides the camera towards where it should be for this moment. */
  function moveCamera(state, dt) {
    const rolling = state.lane?.ball;
    let eye;
    let target;
    // A wider lens for the chase, a long one to line up: from further back and
    // zoomed in, the pins look much closer while the bowler stays the same size.
    let fov = WIDE_FOV;
    // Straight behind the bowler, looking straight down the lane.
    const bowlerZ = state.bowler.lHip[2];
    const bowlerX = (state.bowler.lHip[0] + state.bowler.rHip[0]) / 2;
    if (state.view === 'follow' && rolling) {
      const z = Math.max(bowlerZ - 3.5, Math.min(rolling.z - 2.4, lane.headPinZ - 3.6));
      // Near the bowler it stays high behind them, passing over their head;
      // once clear, it drops down behind the ball.
      const near = Math.max(0, Math.min(1, 1 - (z - bowlerZ) / 3.5));
      const x = bowlerX * near + rolling.x * 0.5 * (1 - near);
      eye = at(x, 0.75 + 1.3 * near, z);
      target = at(
        x * near + rolling.x * 0.3 * (1 - near),
        0.05,
        Math.min(z + 8, lane.headPinZ + 1),
      );
    } else if (state.view === 'pins') {
      eye = at(0, 1.05, lane.headPinZ - 3.2);
      target = at(0, 0.12, lane.headPinZ + 0.6);
    } else {
      // Behind and above the bowler, walking up with them on the approach.
      eye = at(bowlerX, STANCE_EYE.height, bowlerZ - STANCE_EYE.back);
      target = at(bowlerX, -0.8, bowlerZ + 13);
      fov = STANCE_FOV;
    }
    const glide = state.view === 'follow' ? 1 - Math.exp(-dt / 0.12) : 1 - Math.exp(-dt / 0.35);
    cameraAt.lerp(eye, dt === 0 ? 1 : glide);
    lookAt.lerp(target, dt === 0 ? 1 : glide);
    const zoom = dt === 0 ? fov : camera.fov + (fov - camera.fov) * glide;
    if (Math.abs(zoom - camera.fov) > 1e-3) {
      camera.fov = zoom;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(cameraAt);
    camera.lookAt(lookAt);
  }

  // ---- Building blocks ----------------------------------------------------
  function mesh(geometry, material) {
    disposables.push(geometry, material);
    return new THREE.Mesh(geometry, material);
  }

  function flat(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  }

  /** One pin, standing on its base at the group's origin. */
  function makePin() {
    const group = new THREE.Group();
    const pinMesh = mesh(pinGeometry(), pinMaterial());
    pinMesh.castShadow = true;
    group.add(pinMesh);
    return group;
  }

  function pinGeometry() {
    if (sharedPinGeometry) return sharedPinGeometry;
    // Sample the outline finely so the stripes come out crisp.
    const points = [];
    for (let y = 0; y <= PIN_HEIGHT; y += 0.003) points.push(new THREE.Vector2(radiusAt(y), y));
    points.push(new THREE.Vector2(0, PIN_HEIGHT));
    const geometry = new THREE.LatheGeometry(points, 28);
    // Paint each point white or red by its height.
    const white = new THREE.Color(COLORS.pin);
    const red = new THREE.Color(COLORS.stripe);
    const heights = geometry.attributes.position;
    const colors = new Float32Array(heights.count * 3);
    for (let i = 0; i < heights.count; i++) {
      const y = heights.getY(i);
      const color = STRIPES.some(([from, to]) => y >= from && y <= to) ? red : white;
      color.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    sharedPinGeometry = geometry;
    return geometry;
  }
  function pinMaterial() {
    sharedPinMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25 });
    return sharedPinMaterial;
  }

  return {
    resize,
    draw,
    /** Releases the GPU memory and the WebGL context, so starting again doesn't pile them up. */
    destroy() {
      for (const item of new Set(disposables)) item.dispose();
      bowler.root.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return;
        part.geometry.dispose();
        for (const material of [part.material].flat()) {
          material.map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** A pin's radius at height `y`, read off PIN_PROFILE. */
function radiusAt(y) {
  for (let i = 1; i < PIN_PROFILE.length; i++) {
    const [r1, y1] = PIN_PROFILE[i];
    if (y <= y1) {
      const [r0, y0] = PIN_PROFILE[i - 1];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return 0;
}

/** Long maple boards with a little grain, repeated down the lane. */
function makeWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 390;
  canvas.height = 1024;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const boardWidth = canvas.width / 39;
  for (let b = 0; b < 39; b++) {
    ctx.fillStyle = COLORS.wood[(b * 7) % COLORS.wood.length];
    ctx.fillRect(b * boardWidth, 0, boardWidth, canvas.height);
    // Faint grain streaks.
    ctx.strokeStyle = 'rgb(120 70 30 / 0.08)';
    for (let g = 0; g < 6; g++) {
      const x = b * boardWidth + Math.random() * boardWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 2, 300, x - 2, 700, x + 1, canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgb(90 50 20 / 0.25)';
    ctx.fillRect(b * boardWidth, 0, 1, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A glossy marbled ball with three finger holes. */
function makeBallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Swirls of lighter and darker shades; the material's colour tints them.
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = i % 2 ? 'rgb(255 255 255 / 0.5)' : 'rgb(0 0 0 / 0.18)';
    ctx.lineWidth = 4 + Math.random() * 14;
    ctx.beginPath();
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + Math.random() * 160 - 80,
      y + Math.random() * 80 - 40,
      x + Math.random() * 160 - 80,
      y + Math.random() * 80 - 40,
      x + Math.random() * 200 - 100,
      y + Math.random() * 100 - 50,
    );
    ctx.stroke();
  }
  // Finger holes, near the top.
  ctx.fillStyle = '#111';
  for (const [x, y, r] of [
    [240, 60, 9],
    [272, 60, 9],
    [256, 100, 11],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The panel above the pins, with the alley's name and a pattern of stars. */
function makeMaskingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#2a57c4');
  gradient.addColorStop(1, '#1a3480');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgb(255 255 255 / 0.15)';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc((i * 97) % canvas.width, (i * 53) % canvas.height, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ MOTION LANES ★', canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
