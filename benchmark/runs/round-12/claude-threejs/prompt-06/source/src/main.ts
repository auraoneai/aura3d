// Mini-Golf Hole — raw Three.js
// Flat green + one obstacle, ball with rolling physics, click-and-drag to
// aim & shoot, stroke counter, and a camera that follows the ball.

import * as THREE from 'three';

// Full-bleed canvas.
document.documentElement.style.cssText = 'margin:0;height:100%;';
document.body.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#87ceeb;';

// --------------------------------------------------------------------------
// Course constants (all in world units / metres).
// --------------------------------------------------------------------------
const GREEN_W = 14; // x extent of the playable green
const GREEN_L = 24; // z extent of the playable green
const WALL_H = 0.6;
const WALL_T = 0.5;
const BALL_R = 0.35;
const HOLE_R = 0.7;
const FRICTION = 1.4; // velocity decay rate (per second)
const STOP_SPEED = 0.25; // below this the ball is considered stopped
const MAX_POWER = 18; // max launch speed from a full-strength drag
const POWER_PER_UNIT = 2.2; // launch speed gained per metre of drag

// Inner bounds the ball centre is allowed to occupy (green minus wall + radius).
const BOUND_X = GREEN_W / 2 - WALL_T / 2 - BALL_R;
const BOUND_Z = GREEN_L / 2 - WALL_T / 2 - BALL_R;

// Key positions.
const TEE = new THREE.Vector3(0, BALL_R, GREEN_L / 2 - 3);
const HOLE = new THREE.Vector3(0, 0, -GREEN_L / 2 + 4);

// Box obstacle (mini-golf "block" the player must go around). Stored as an
// axis-aligned footprint in the XZ plane for collision.
const OBSTACLE = {
  center: new THREE.Vector2(0, 0),
  halfX: 2.4,
  halfZ: 0.9,
  height: 1.2,
};

// --------------------------------------------------------------------------
// Renderer / scene / camera
// --------------------------------------------------------------------------
const app = document.getElementById('app') ?? document.body;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 90);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
// Camera offset relative to the ball (behind & above), used by the follow rig.
const CAM_OFFSET = new THREE.Vector3(0, 9, 12);
camera.position.copy(TEE).add(CAM_OFFSET);
camera.lookAt(TEE);

// --------------------------------------------------------------------------
// Lighting
// --------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(12, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.bias = -0.0005;
scene.add(sun);

// --------------------------------------------------------------------------
// The green (flat putting surface) + striped mowing pattern
// --------------------------------------------------------------------------
const greenGroup = new THREE.Group();
scene.add(greenGroup);

const green = new THREE.Mesh(
  new THREE.PlaneGeometry(GREEN_W, GREEN_L),
  new THREE.MeshStandardMaterial({ color: 0x3f9d4f, roughness: 0.95, metalness: 0 }),
);
green.rotation.x = -Math.PI / 2;
green.receiveShadow = true;
greenGroup.add(green);

// Mowing stripes for a recognisable golf-green look.
const stripeCount = 12;
const stripeW = GREEN_L / stripeCount;
for (let i = 0; i < stripeCount; i += 1) {
  if (i % 2 === 0) continue;
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(GREEN_W - WALL_T, stripeW),
    new THREE.MeshStandardMaterial({ color: 0x47ad58, roughness: 0.95 }),
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.01, -GREEN_L / 2 + stripeW * (i + 0.5));
  stripe.receiveShadow = true;
  greenGroup.add(stripe);
}

// Surrounding ground so the world doesn't end at the green edge.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x2f6f38, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
ground.receiveShadow = true;
scene.add(ground);

// --------------------------------------------------------------------------
// Walls (perimeter rails that bounce the ball back)
// --------------------------------------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.8 });
function addWall(w: number, d: number, x: number, z: number): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  wall.position.set(x, WALL_H / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  greenGroup.add(wall);
}
addWall(GREEN_W, WALL_T, 0, -GREEN_L / 2); // far rail
addWall(GREEN_W, WALL_T, 0, GREEN_L / 2); // near rail
addWall(WALL_T, GREEN_L, -GREEN_W / 2, 0); // left rail
addWall(WALL_T, GREEN_L, GREEN_W / 2, 0); // right rail

// --------------------------------------------------------------------------
// Obstacle (one block in the middle of the fairway)
// --------------------------------------------------------------------------
const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(OBSTACLE.halfX * 2, OBSTACLE.height, OBSTACLE.halfZ * 2),
  new THREE.MeshStandardMaterial({ color: 0xcc4b37, roughness: 0.6, metalness: 0.05 }),
);
obstacle.position.set(OBSTACLE.center.x, OBSTACLE.height / 2, OBSTACLE.center.y);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

// --------------------------------------------------------------------------
// Hole (cup) + flag
// --------------------------------------------------------------------------
const cup = new THREE.Mesh(
  new THREE.CylinderGeometry(HOLE_R, HOLE_R, 0.4, 32, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, side: THREE.DoubleSide }),
);
cup.position.set(HOLE.x, -0.2, HOLE.z);
scene.add(cup);

const cupRim = new THREE.Mesh(
  new THREE.RingGeometry(HOLE_R, HOLE_R + 0.12, 32),
  new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }),
);
cupRim.rotation.x = -Math.PI / 2;
cupRim.position.set(HOLE.x, 0.02, HOLE.z);
scene.add(cupRim);

const cupBottom = new THREE.Mesh(
  new THREE.CircleGeometry(HOLE_R, 32),
  new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
);
cupBottom.rotation.x = -Math.PI / 2;
cupBottom.position.set(HOLE.x, -0.4, HOLE.z);
scene.add(cupBottom);

const flag = new THREE.Group();
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.04, 3, 12),
  new THREE.MeshStandardMaterial({ color: 0xeeeeee }),
);
pole.position.y = 1.5;
pole.castShadow = true;
flag.add(pole);
const flagCloth = new THREE.Mesh(
  new THREE.PlaneGeometry(1.0, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xe23b3b, side: THREE.DoubleSide }),
);
flagCloth.position.set(0.5, 2.6, 0);
flag.add(flagCloth);
flag.position.set(HOLE.x, 0, HOLE.z);
scene.add(flag);

// --------------------------------------------------------------------------
// Ball
// --------------------------------------------------------------------------
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }),
);
ball.castShadow = true;
ball.position.copy(TEE);
scene.add(ball);

const velocity = new THREE.Vector3();
let strokes = 0;
let holed = false;

// --------------------------------------------------------------------------
// Aim indicator (arrow shown while dragging)
// --------------------------------------------------------------------------
const aimDir = new THREE.Vector3(0, 0, -1);
const aimArrow = new THREE.ArrowHelper(aimDir, ball.position, 1, 0xffe34d, 0.6, 0.4);
aimArrow.visible = false;
scene.add(aimArrow);

// --------------------------------------------------------------------------
// HUD overlay
// --------------------------------------------------------------------------
function makeHud(): {
  strokeEl: HTMLDivElement;
  msgEl: HTMLDivElement;
  helpEl: HTMLDivElement;
} {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;pointer-events:none;font-family:system-ui,Arial,sans-serif;color:#fff;';

  const strokeEl = document.createElement('div');
  strokeEl.style.cssText =
    'position:absolute;top:18px;left:20px;font-size:30px;font-weight:700;' +
    'text-shadow:0 2px 6px rgba(0,0,0,.6);background:rgba(0,0,0,.35);' +
    'padding:10px 18px;border-radius:12px;';
  wrap.appendChild(strokeEl);

  const helpEl = document.createElement('div');
  helpEl.style.cssText =
    'position:absolute;bottom:18px;left:50%;transform:translateX(-50%);font-size:15px;' +
    'background:rgba(0,0,0,.4);padding:8px 16px;border-radius:10px;text-align:center;';
  helpEl.textContent = 'Click & drag from the ball to aim, release to shoot';
  wrap.appendChild(helpEl);

  const msgEl = document.createElement('div');
  msgEl.style.cssText =
    'position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);font-size:44px;' +
    'font-weight:800;text-align:center;text-shadow:0 3px 10px rgba(0,0,0,.7);display:none;';
  wrap.appendChild(msgEl);

  document.body.appendChild(wrap);
  return { strokeEl, msgEl, helpEl };
}
const hud = makeHud();
function updateScore(): void {
  hud.strokeEl.textContent = `Strokes: ${strokes}`;
}
updateScore();

// --------------------------------------------------------------------------
// Input: raycast onto the green to read where the pointer is in world space.
// --------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

let aiming = false;

function pointerToGround(ev: PointerEvent, out: THREE.Vector3): boolean {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, out) !== null;
}

function ballAtRest(): boolean {
  return velocity.lengthSq() < STOP_SPEED * STOP_SPEED;
}

function onPointerDown(ev: PointerEvent): void {
  if (holed || !ballAtRest()) return;
  if (!pointerToGround(ev, hitPoint)) return;
  aiming = true;
  renderer.domElement.setPointerCapture(ev.pointerId);
  updateAim();
}

function updateAim(): void {
  // Shoot direction = from ball toward the current pointer position. Power is
  // the drag distance (capped). The arrow previews both direction and strength.
  const dx = hitPoint.x - ball.position.x;
  const dz = hitPoint.z - ball.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.0001) {
    aimArrow.visible = false;
    return;
  }
  aimDir.set(dx, 0, dz).normalize();
  const power = Math.min(dist * POWER_PER_UNIT, MAX_POWER);
  const len = 1 + (power / MAX_POWER) * 5;
  aimArrow.position.set(ball.position.x, BALL_R, ball.position.z);
  aimArrow.setDirection(aimDir);
  aimArrow.setLength(len, Math.min(0.7, len * 0.25), Math.min(0.5, len * 0.18));
  // Colour shifts from green (soft) to red (hard) with power.
  const t = power / MAX_POWER;
  aimArrow.setColor(new THREE.Color().setHSL((1 - t) * 0.33, 0.9, 0.55));
  aimArrow.visible = true;
}

function onPointerMove(ev: PointerEvent): void {
  if (!aiming) return;
  if (pointerToGround(ev, hitPoint)) updateAim();
}

function onPointerUp(ev: PointerEvent): void {
  if (!aiming) return;
  aiming = false;
  aimArrow.visible = false;
  if (renderer.domElement.hasPointerCapture(ev.pointerId)) {
    renderer.domElement.releasePointerCapture(ev.pointerId);
  }
  if (!pointerToGround(ev, hitPoint)) return;

  const dx = hitPoint.x - ball.position.x;
  const dz = hitPoint.z - ball.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4) return; // tiny taps don't count as a shot

  const power = Math.min(dist * POWER_PER_UNIT, MAX_POWER);
  velocity.set(dx, 0, dz).setLength(power);
  strokes += 1;
  updateScore();
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);
renderer.domElement.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);

// --------------------------------------------------------------------------
// Physics
// --------------------------------------------------------------------------
function resolveWalls(): void {
  if (ball.position.x > BOUND_X) {
    ball.position.x = BOUND_X;
    velocity.x = -Math.abs(velocity.x) * 0.7;
  } else if (ball.position.x < -BOUND_X) {
    ball.position.x = -BOUND_X;
    velocity.x = Math.abs(velocity.x) * 0.7;
  }
  if (ball.position.z > BOUND_Z) {
    ball.position.z = BOUND_Z;
    velocity.z = -Math.abs(velocity.z) * 0.7;
  } else if (ball.position.z < -BOUND_Z) {
    ball.position.z = -BOUND_Z;
    velocity.z = Math.abs(velocity.z) * 0.7;
  }
}

function resolveObstacle(): void {
  // Circle (ball) vs axis-aligned box collision in the XZ plane.
  const minX = OBSTACLE.center.x - OBSTACLE.halfX;
  const maxX = OBSTACLE.center.x + OBSTACLE.halfX;
  const minZ = OBSTACLE.center.y - OBSTACLE.halfZ;
  const maxZ = OBSTACLE.center.y + OBSTACLE.halfZ;

  const closestX = THREE.MathUtils.clamp(ball.position.x, minX, maxX);
  const closestZ = THREE.MathUtils.clamp(ball.position.z, minZ, maxZ);
  let nx = ball.position.x - closestX;
  let nz = ball.position.z - closestZ;
  const distSq = nx * nx + nz * nz;
  if (distSq >= BALL_R * BALL_R) return;

  let dist = Math.sqrt(distSq);
  if (dist < 1e-4) {
    // Ball centre inside the box: push out along the shallowest axis.
    const toRight = maxX - ball.position.x;
    const toLeft = ball.position.x - minX;
    const toFar = maxZ - ball.position.z;
    const toNear = ball.position.z - minZ;
    const m = Math.min(toRight, toLeft, toFar, toNear);
    if (m === toRight) { nx = 1; nz = 0; } else if (m === toLeft) { nx = -1; nz = 0; }
    else if (m === toFar) { nx = 0; nz = 1; } else { nx = 0; nz = -1; }
    dist = 0;
  } else {
    nx /= dist;
    nz /= dist;
  }
  // Reposition to the surface and reflect velocity about the contact normal.
  ball.position.x = closestX + nx * BALL_R;
  ball.position.z = closestZ + nz * BALL_R;
  const vDotN = velocity.x * nx + velocity.z * nz;
  if (vDotN < 0) {
    velocity.x -= 2 * vDotN * nx;
    velocity.z -= 2 * vDotN * nz;
    velocity.multiplyScalar(0.75); // energy loss on bounce
  }
}

const ballAxis = new THREE.Vector3();
function rollBall(dt: number): void {
  const speed = velocity.length();
  if (speed < 1e-4) return;
  // Rotate the ball so it visually rolls in its travel direction.
  ballAxis.set(velocity.z, 0, -velocity.x).normalize();
  ball.rotateOnWorldAxis(ballAxis, (speed * dt) / BALL_R);
}

function checkHole(): void {
  const dx = ball.position.x - HOLE.x;
  const dz = ball.position.z - HOLE.z;
  const d = Math.hypot(dx, dz);
  const speed = velocity.length();
  // Falls in when over the cup and not moving too fast to lip out.
  if (d < HOLE_R - BALL_R * 0.4 && speed < 9) {
    holed = true;
    velocity.set(0, 0, 0);
    hud.msgEl.style.display = 'block';
    hud.msgEl.innerHTML =
      `⛳ In the hole!<br>${strokes} stroke${strokes === 1 ? '' : 's'}` +
      `<div style="font-size:18px;margin-top:14px;font-weight:600;">Press R to play again</div>`;
  }
}

function dropIntoCup(dt: number): void {
  // Animate the ball settling into the cup after holing out.
  ball.position.x += (HOLE.x - ball.position.x) * Math.min(1, dt * 6);
  ball.position.z += (HOLE.z - ball.position.z) * Math.min(1, dt * 6);
  if (ball.position.y > -0.25) ball.position.y -= dt * 1.5;
}

function resetGame(): void {
  ball.position.copy(TEE);
  ball.quaternion.identity();
  velocity.set(0, 0, 0);
  strokes = 0;
  holed = false;
  updateScore();
  hud.msgEl.style.display = 'none';
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') resetGame();
});

// --------------------------------------------------------------------------
// Follow camera
// --------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
lookTarget.copy(TEE);
function updateCamera(dt: number): void {
  camTarget.copy(ball.position).add(CAM_OFFSET);
  const k = 1 - Math.exp(-dt * 4); // frame-rate independent smoothing
  camera.position.lerp(camTarget, k);
  lookTarget.lerp(ball.position, k);
  camera.lookAt(lookTarget);
}

// --------------------------------------------------------------------------
// Main loop
// --------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate(): void {
  const dt = Math.min(clock.getDelta(), 1 / 30);

  if (holed) {
    dropIntoCup(dt);
  } else {
    // Integrate position.
    ball.position.x += velocity.x * dt;
    ball.position.z += velocity.z * dt;
    ball.position.y = BALL_R;

    resolveObstacle();
    resolveWalls();

    // Apply rolling friction.
    const decay = Math.exp(-FRICTION * dt);
    velocity.multiplyScalar(decay);
    if (velocity.lengthSq() < 0.02 * 0.02) velocity.set(0, 0, 0);

    rollBall(dt);
    checkHole();
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// --------------------------------------------------------------------------
// Resize
// --------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
