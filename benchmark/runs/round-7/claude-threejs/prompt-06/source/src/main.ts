import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Mini-Golf Hole
 * - Flat green with a perimeter border
 * - One obstacle (a stone tower) the ball collides with
 * - A golf ball with simple kinematic physics (velocity + friction)
 * - Click-and-drag from the ball to aim and set power, release to shoot
 * - Stroke / score counter in an HUD overlay
 * - Camera follows the ball
 * ------------------------------------------------------------------ */

// ---- Layout constants ------------------------------------------------
const GREEN_HALF_X = 7;   // green spans x in [-7, 7]
const GREEN_MIN_Z = -11;  // far end (hole)
const GREEN_MAX_Z = 11;   // near end (tee)
const BALL_RADIUS = 0.35;
const OBSTACLE_RADIUS = 1.3;
const OBSTACLE_POS = new THREE.Vector3(0, 0, 0);
const HOLE_POS = new THREE.Vector3(0, 0, -9);
const HOLE_RADIUS = 0.7;
const TEE_POS = new THREE.Vector3(0, 0, 9);

const FRICTION = 1.4;        // deceleration constant
const WALL_RESTITUTION = 0.7;
const STOP_SPEED = 0.25;     // below this the ball is considered at rest
const MAX_POWER = 14;        // max launch speed
const MAX_DRAG = 6;          // drag distance that maps to max power

// ---- Renderer / scene / camera --------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 80);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);

// ---- Lights ----------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a5f2a, 0.9));

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(-12, 20, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
sun.shadow.bias = -0.0002;
scene.add(sun);

// ---- The green -------------------------------------------------------
const greenGroup = new THREE.Group();
scene.add(greenGroup);

const greenWidth = GREEN_HALF_X * 2;
const greenDepth = GREEN_MAX_Z - GREEN_MIN_Z;
const greenCenterZ = (GREEN_MAX_Z + GREEN_MIN_Z) / 2;

const greenMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.95 });
const green = new THREE.Mesh(new THREE.PlaneGeometry(greenWidth, greenDepth), greenMat);
green.rotation.x = -Math.PI / 2;
green.position.z = greenCenterZ;
green.receiveShadow = true;
greenGroup.add(green);

// Subtle mowing stripes for readability
const stripeMat = new THREE.MeshStandardMaterial({ color: 0x37b24d, roughness: 0.95 });
for (let i = 0; i < 11; i++) {
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(greenWidth, 1), stripeMat);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.002, GREEN_MIN_Z + 1 + i * 2);
  stripe.receiveShadow = true;
  greenGroup.add(stripe);
}

// Surrounding ground (out of bounds, for context)
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 1 }),
);
apron.rotation.x = -Math.PI / 2;
apron.position.y = -0.05;
apron.receiveShadow = true;
scene.add(apron);

// ---- Border walls ----------------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
const WALL_H = 0.6;
const WALL_T = 0.4;

function makeWall(w: number, d: number, x: number, z: number) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  wall.position.set(x, WALL_H / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  greenGroup.add(wall);
}
// Left / right
makeWall(WALL_T, greenDepth + WALL_T, -GREEN_HALF_X - WALL_T / 2, greenCenterZ);
makeWall(WALL_T, greenDepth + WALL_T, GREEN_HALF_X + WALL_T / 2, greenCenterZ);
// Far / near
makeWall(greenWidth + WALL_T * 2, WALL_T, 0, GREEN_MIN_Z - WALL_T / 2);
makeWall(greenWidth + WALL_T * 2, WALL_T, 0, GREEN_MAX_Z + WALL_T / 2);

// ---- The obstacle (a stone tower) -----------------------------------
const obstacleGroup = new THREE.Group();
obstacleGroup.position.copy(OBSTACLE_POS);
scene.add(obstacleGroup);

const towerBody = new THREE.Mesh(
  new THREE.CylinderGeometry(OBSTACLE_RADIUS, OBSTACLE_RADIUS, 2.4, 32),
  new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.9 }),
);
towerBody.position.y = 1.2;
towerBody.castShadow = true;
towerBody.receiveShadow = true;
obstacleGroup.add(towerBody);

const towerRoof = new THREE.Mesh(
  new THREE.ConeGeometry(OBSTACLE_RADIUS + 0.25, 1.2, 32),
  new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.7 }),
);
towerRoof.position.y = 3.0;
towerRoof.castShadow = true;
obstacleGroup.add(towerRoof);

// ---- The hole + flag -------------------------------------------------
const holeGroup = new THREE.Group();
holeGroup.position.copy(HOLE_POS);
scene.add(holeGroup);

const holeMesh = new THREE.Mesh(
  new THREE.CircleGeometry(HOLE_RADIUS, 32),
  new THREE.MeshStandardMaterial({ color: 0x06130b, roughness: 1 }),
);
holeMesh.rotation.x = -Math.PI / 2;
holeMesh.position.y = 0.01;
holeGroup.add(holeMesh);

const holeRing = new THREE.Mesh(
  new THREE.RingGeometry(HOLE_RADIUS, HOLE_RADIUS + 0.08, 32),
  new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.6 }),
);
holeRing.rotation.x = -Math.PI / 2;
holeRing.position.y = 0.012;
holeGroup.add(holeRing);

const flagPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.04, 3, 12),
  new THREE.MeshStandardMaterial({ color: 0xdee2e6 }),
);
flagPole.position.y = 1.5;
flagPole.castShadow = true;
holeGroup.add(flagPole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xe03131, side: THREE.DoubleSide }),
);
flag.position.set(0.5, 2.6, 0);
flag.castShadow = true;
holeGroup.add(flag);

// ---- The ball --------------------------------------------------------
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }),
);
ball.castShadow = true;
ball.position.copy(TEE_POS);
ball.position.y = BALL_RADIUS;
scene.add(ball);

const velocity = new THREE.Vector3();
let ballSunk = false;

// Tee marker
const tee = new THREE.Mesh(
  new THREE.RingGeometry(0.45, 0.6, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
);
tee.rotation.x = -Math.PI / 2;
tee.position.set(TEE_POS.x, 0.01, TEE_POS.z);
greenGroup.add(tee);

// ---- Aim arrow -------------------------------------------------------
const aimDir = new THREE.Vector3(0, 0, -1); // default: toward the hole
const aimArrow = new THREE.ArrowHelper(aimDir, ball.position, 2, 0xffd43b, 0.6, 0.4);
scene.add(aimArrow);

// ---- HUD -------------------------------------------------------------
const hud = document.createElement('div');
hud.style.cssText = [
  'position:fixed', 'top:16px', 'left:16px', 'padding:14px 18px',
  'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
  'color:#fff', 'background:rgba(20,28,22,0.72)', 'border-radius:12px',
  'box-shadow:0 4px 18px rgba(0,0,0,0.35)', 'user-select:none',
  'line-height:1.5', 'backdrop-filter:blur(4px)',
].join(';');
document.body.appendChild(hud);

const banner = document.createElement('div');
banner.style.cssText = [
  'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
  'font-family:system-ui,sans-serif', 'font-size:40px', 'font-weight:800',
  'color:#ffe066', 'text-shadow:0 3px 12px rgba(0,0,0,0.6)',
  'pointer-events:none', 'opacity:0', 'transition:opacity .3s',
].join(';');
document.body.appendChild(banner);

let strokes = 0;
const PAR = 2;

function updateHud() {
  const speed = velocity.length();
  const state = ballSunk
    ? '<span style="color:#69db7c">⛳ HOLED OUT! Click to play again</span>'
    : speed > STOP_SPEED
      ? '<span style="color:#ffd43b">Ball rolling…</span>'
      : 'Click &amp; drag the ball to aim, release to shoot';
  hud.innerHTML = `
    <div style="font-size:22px;font-weight:800;margin-bottom:4px">⛳ Mini-Golf</div>
    <div style="font-size:30px;font-weight:800">Strokes: ${strokes}</div>
    <div style="opacity:.85">Par ${PAR}</div>
    <div style="margin-top:8px;max-width:240px;font-size:13px">${state}</div>
  `;
}
updateHud();

function showBanner(text: string) {
  banner.textContent = text;
  banner.style.opacity = '1';
}
function hideBanner() {
  banner.style.opacity = '0';
}

// ---- Input: click-drag aim & shoot ----------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let aiming = false;
let aimPower = 0; // 0..1

function pointerToGround(ev: PointerEvent): THREE.Vector3 | null {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, hitPoint) ? hitPoint : null;
}

function ballAtRest(): boolean {
  return velocity.length() < STOP_SPEED;
}

function resetBall() {
  ballSunk = false;
  strokes = 0;
  velocity.set(0, 0, 0);
  ball.position.set(TEE_POS.x, BALL_RADIUS, TEE_POS.z);
  ball.visible = true;
  hideBanner();
  updateHud();
}

renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (ballSunk) {
    resetBall();
    return;
  }
  if (!ballAtRest()) return;
  aiming = true;
  updateAim(ev);
});

window.addEventListener('pointermove', (ev) => {
  if (!aiming) return;
  updateAim(ev);
});

window.addEventListener('pointerup', () => {
  if (!aiming) return;
  aiming = false;
  if (aimPower > 0.02) {
    velocity.copy(aimDir).multiplyScalar(aimPower * MAX_POWER);
    strokes++;
    updateHud();
  }
  aimPower = 0;
});

function updateAim(ev: PointerEvent) {
  const p = pointerToGround(ev);
  if (!p) return;
  // Aim FROM the drag point TO the ball (slingshot style): pull back to aim.
  const pull = new THREE.Vector3().subVectors(ball.position, p);
  pull.y = 0;
  const dist = pull.length();
  if (dist < 1e-3) return;
  aimDir.copy(pull).normalize();
  aimPower = Math.min(dist, MAX_DRAG) / MAX_DRAG;
}

// ---- Camera follow ---------------------------------------------------
const camOffset = new THREE.Vector3(0, 7.5, 11);
const camTarget = new THREE.Vector3();
// Initialise camera immediately so the first frame is framed on the ball
camera.position.copy(ball.position).add(camOffset);
camera.lookAt(ball.position);

// ---- Physics & loop --------------------------------------------------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();

function stepPhysics(dt: number) {
  if (ballSunk) return;
  const speed = velocity.length();
  if (speed < STOP_SPEED) {
    velocity.set(0, 0, 0);
    return;
  }

  // Apply rolling friction (decelerate toward zero)
  const decel = FRICTION * dt;
  const newSpeed = Math.max(0, speed - decel);
  velocity.multiplyScalar(newSpeed / speed);

  // Integrate
  ball.position.addScaledVector(velocity, dt);

  // Roll the ball mesh visually
  const rollAxis = tmp.set(velocity.z, 0, -velocity.x).normalize();
  if (isFinite(rollAxis.x)) {
    ball.rotateOnWorldAxis(rollAxis, (newSpeed * dt) / BALL_RADIUS);
  }

  // --- Hole capture ---
  const dxh = ball.position.x - HOLE_POS.x;
  const dzh = ball.position.z - HOLE_POS.z;
  const distHole = Math.hypot(dxh, dzh);
  if (distHole < HOLE_RADIUS && newSpeed < MAX_POWER * 0.55) {
    ballSunk = true;
    velocity.set(0, 0, 0);
    ball.position.set(HOLE_POS.x, -BALL_RADIUS * 0.5, HOLE_POS.z);
    showBanner(strokes <= PAR ? '⛳ Nice! Holed out' : '⛳ Holed out!');
    updateHud();
    return;
  }

  // --- Obstacle collision (circle) ---
  const dxo = ball.position.x - OBSTACLE_POS.x;
  const dzo = ball.position.z - OBSTACLE_POS.z;
  const distObs = Math.hypot(dxo, dzo);
  const minDist = OBSTACLE_RADIUS + BALL_RADIUS;
  if (distObs < minDist && distObs > 1e-4) {
    const nx = dxo / distObs;
    const nz = dzo / distObs;
    // Push the ball back out of the obstacle
    ball.position.x = OBSTACLE_POS.x + nx * minDist;
    ball.position.z = OBSTACLE_POS.z + nz * minDist;
    // Reflect velocity about the contact normal
    const vn = velocity.x * nx + velocity.z * nz;
    velocity.x -= (1 + WALL_RESTITUTION) * vn * nx;
    velocity.z -= (1 + WALL_RESTITUTION) * vn * nz;
  }

  // --- Border wall collisions ---
  const minX = -GREEN_HALF_X + BALL_RADIUS;
  const maxX = GREEN_HALF_X - BALL_RADIUS;
  const minZ = GREEN_MIN_Z + BALL_RADIUS;
  const maxZ = GREEN_MAX_Z - BALL_RADIUS;
  if (ball.position.x < minX) { ball.position.x = minX; velocity.x = Math.abs(velocity.x) * WALL_RESTITUTION; }
  if (ball.position.x > maxX) { ball.position.x = maxX; velocity.x = -Math.abs(velocity.x) * WALL_RESTITUTION; }
  if (ball.position.z < minZ) { ball.position.z = minZ; velocity.z = Math.abs(velocity.z) * WALL_RESTITUTION; }
  if (ball.position.z > maxZ) { ball.position.z = maxZ; velocity.z = -Math.abs(velocity.z) * WALL_RESTITUTION; }

  ball.position.y = BALL_RADIUS;

  if (velocity.length() < STOP_SPEED) {
    velocity.set(0, 0, 0);
    updateHud();
  }
}

function updateAimArrow() {
  const atRest = ballAtRest() && !ballSunk;
  aimArrow.visible = atRest;
  if (!atRest) return;
  aimArrow.position.copy(ball.position);
  aimArrow.setDirection(aimDir);
  const len = 1.5 + aimPower * 5;
  aimArrow.setLength(len, 0.7, 0.45);
  // Yellow when idle, hot (orange/red) as power approaches max
  aimArrow.setColor(new THREE.Color().setHSL((1 - aimPower) * 0.15, 1, 0.55));
}

function updateCamera(dt: number) {
  camTarget.copy(ball.position).add(camOffset);
  const k = 1 - Math.exp(-4 * dt); // smooth, frame-rate independent
  camera.position.lerp(camTarget, k);
  tmp.copy(ball.position);
  tmp.y += 0.5;
  camera.lookAt(tmp);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.033);
  // Flutter the flag a touch
  flag.rotation.z = Math.sin(performance.now() * 0.004) * 0.12;
  stepPhysics(dt);
  updateAimArrow();
  updateCamera(dt);
  renderer.render(scene, camera);
});

// ---- Resize ----------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
