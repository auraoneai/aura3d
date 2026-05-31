// Mini-Golf Hole — raw Three.js (0.165.0)
// A flat green, one obstacle, a ball with simple physics, click-to-aim-and-shoot,
// a stroke/score counter, and a camera that follows the ball.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants / course layout
// ---------------------------------------------------------------------------
const GREEN_HALF_X = 9;   // green spans [-9, 9] on X
const GREEN_HALF_Z = 16;  // green spans [-16, 16] on Z
const WALL_H = 0.9;
const BALL_R = 0.45;
const HOLE_R = 0.85;
const FRICTION = 1.6;        // velocity damping per second (exponential-ish)
const STOP_SPEED = 0.35;     // below this the ball is considered at rest
const MAX_POWER = 26;        // maximum launch speed
const RESTITUTION = 0.72;    // bounce energy retained on wall/obstacle hits

const START_POS = new THREE.Vector3(0, BALL_R, GREEN_HALF_Z - 3);
const HOLE_POS = new THREE.Vector3(0, 0, -GREEN_HALF_Z + 4);

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec6ff);
scene.fog = new THREE.Fog(0x8ec6ff, 40, 90);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(0, 14, GREEN_HALF_Z + 10);
camera.lookAt(START_POS);

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0x335522, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(-12, 24, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 32;
sun.shadow.camera.bottom = -32;
scene.add(sun);

// ---------------------------------------------------------------------------
// The green (flat playing surface)
// ---------------------------------------------------------------------------
const greenMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.95 });
const green = new THREE.Mesh(
  new THREE.PlaneGeometry(GREEN_HALF_X * 2, GREEN_HALF_Z * 2),
  greenMat,
);
green.rotation.x = -Math.PI / 2;
green.receiveShadow = true;
scene.add(green);

// Subtle mowing stripes so the green reads clearly as a golf surface.
const stripeMat = new THREE.MeshStandardMaterial({ color: 0x37b24d, roughness: 0.95 });
for (let i = -GREEN_HALF_Z + 2; i < GREEN_HALF_Z; i += 4) {
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(GREEN_HALF_X * 2, 2),
    stripeMat,
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.01, i);
  stripe.receiveShadow = true;
  scene.add(stripe);
}

// Wooden border walls keep the ball on the green and provide bounce surfaces.
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
function addWall(w: number, d: number, x: number, z: number): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  wall.position.set(x, WALL_H / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}
const T = 0.6; // wall thickness
addWall(GREEN_HALF_X * 2 + T * 2, T, 0, -GREEN_HALF_Z - T / 2); // far
addWall(GREEN_HALF_X * 2 + T * 2, T, 0, GREEN_HALF_Z + T / 2);  // near
addWall(T, GREEN_HALF_Z * 2 + T * 2, -GREEN_HALF_X - T / 2, 0); // left
addWall(T, GREEN_HALF_Z * 2 + T * 2, GREEN_HALF_X + T / 2, 0);  // right

// ---------------------------------------------------------------------------
// The obstacle (a brick block the ball must bounce around)
// ---------------------------------------------------------------------------
const obstacleSize = new THREE.Vector3(5.5, 1.6, 1.4);
const obstaclePos = new THREE.Vector3(0, obstacleSize.y / 2, 1);
const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(obstacleSize.x, obstacleSize.y, obstacleSize.z),
  new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.6, metalness: 0.05 }),
);
obstacle.position.copy(obstaclePos);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);
// Half-extents used for axis-aligned collision (inflated by the ball radius).
const obsHalf = new THREE.Vector2(obstacleSize.x / 2, obstacleSize.z / 2);

// ---------------------------------------------------------------------------
// The hole + flag
// ---------------------------------------------------------------------------
const hole = new THREE.Mesh(
  new THREE.CircleGeometry(HOLE_R, 32),
  new THREE.MeshBasicMaterial({ color: 0x10130f }),
);
hole.rotation.x = -Math.PI / 2;
hole.position.set(HOLE_POS.x, 0.02, HOLE_POS.z);
scene.add(hole);

// White rim ring around the cup.
const rim = new THREE.Mesh(
  new THREE.RingGeometry(HOLE_R, HOLE_R + 0.12, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
rim.rotation.x = -Math.PI / 2;
rim.position.set(HOLE_POS.x, 0.03, HOLE_POS.z);
scene.add(rim);

const flagGroup = new THREE.Group();
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.05, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 }),
);
pole.position.y = 2;
pole.castShadow = true;
flagGroup.add(pole);
const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 0.9),
  new THREE.MeshStandardMaterial({ color: 0xffd43b, side: THREE.DoubleSide, roughness: 0.7 }),
);
flag.position.set(0.7, 3.4, 0);
flagGroup.add(flag);
flagGroup.position.set(HOLE_POS.x, 0, HOLE_POS.z);
scene.add(flagGroup);

// ---------------------------------------------------------------------------
// The ball
// ---------------------------------------------------------------------------
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }),
);
ball.position.copy(START_POS);
ball.castShadow = true;
scene.add(ball);

const velocity = new THREE.Vector3();
let inHole = false;

// ---------------------------------------------------------------------------
// Aim arrow (shown while charging a shot)
// ---------------------------------------------------------------------------
const aimDir = new THREE.Vector3(0, 0, -1);
const aimArrow = new THREE.ArrowHelper(aimDir, ball.position, 1, 0xffe066, 0.8, 0.5);
aimArrow.visible = false;
scene.add(aimArrow);

// ---------------------------------------------------------------------------
// HUD / score counter
// ---------------------------------------------------------------------------
const hud = document.createElement('div');
hud.style.cssText = [
  'position:fixed', 'top:16px', 'left:16px', 'padding:14px 18px',
  'font:600 16px/1.5 system-ui,Segoe UI,Arial,sans-serif',
  'color:#fff', 'background:rgba(20,30,20,0.6)', 'border-radius:12px',
  'backdrop-filter:blur(4px)', 'user-select:none', 'pointer-events:none',
  'box-shadow:0 4px 14px rgba(0,0,0,0.25)', 'min-width:180px',
].join(';');
document.body.appendChild(hud);

const help = document.createElement('div');
help.style.cssText = [
  'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
  'padding:8px 16px', 'font:500 14px system-ui,Arial,sans-serif',
  'color:#fff', 'background:rgba(20,30,20,0.55)', 'border-radius:10px',
  'user-select:none', 'pointer-events:none',
].join(';');
help.textContent = 'Click & drag from the ball, release to shoot. Sink it in as few strokes as possible.';
document.body.appendChild(help);

let strokes = 0;
let power = 0;
function updateHud(): void {
  const status = inHole
    ? `🏆 Holed in ${strokes} stroke${strokes === 1 ? '' : 's'}!`
    : isMoving()
      ? 'Ball rolling…'
      : aiming
        ? `Power: ${Math.round((power / MAX_POWER) * 100)}%`
        : 'Ready to aim';
  hud.innerHTML =
    `<div style="font-size:20px;margin-bottom:4px">⛳ Mini-Golf</div>` +
    `<div>Strokes: <span style="color:#ffe066">${strokes}</span></div>` +
    `<div style="font-size:14px;opacity:0.9;margin-top:4px">${status}</div>`;
}

// ---------------------------------------------------------------------------
// Aim & shoot interaction
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundHit = new THREE.Vector3();
let aiming = false;

function pointerToGround(ev: PointerEvent): boolean {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, groundHit) !== null;
}

function isMoving(): boolean {
  return velocity.lengthSq() > 0.0001;
}

renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (inHole || isMoving()) return;
  if (!pointerToGround(ev)) return;
  aiming = true;
  updateAim();
});

window.addEventListener('pointermove', (ev) => {
  if (!aiming) return;
  if (pointerToGround(ev)) updateAim();
});

window.addEventListener('pointerup', () => {
  if (!aiming) return;
  aiming = false;
  aimArrow.visible = false;
  if (power > 0.5) {
    velocity.copy(aimDir).multiplyScalar(power);
    strokes += 1;
  }
  power = 0;
  updateHud();
});

function updateAim(): void {
  // Slingshot: pull back from the ball; the ball launches the opposite way.
  const pull = new THREE.Vector3().subVectors(ball.position, groundHit);
  pull.y = 0;
  const dist = pull.length();
  power = Math.min(dist * 3.2, MAX_POWER);
  if (dist > 0.001) aimDir.copy(pull).normalize();
  aimArrow.position.copy(ball.position);
  aimArrow.setDirection(aimDir);
  aimArrow.setLength(1 + (power / MAX_POWER) * 6, 0.9, 0.6);
  aimArrow.visible = power > 0.5;
  updateHud();
}

// ---------------------------------------------------------------------------
// Physics step
// ---------------------------------------------------------------------------
function stepPhysics(dt: number): void {
  if (inHole || !isMoving()) return;

  // Hole capture: if slow enough and centred over the cup, sink it.
  const toHole = new THREE.Vector2(ball.position.x - HOLE_POS.x, ball.position.z - HOLE_POS.z);
  if (toHole.length() < HOLE_R * 0.9 && velocity.length() < 9) {
    inHole = true;
    velocity.set(0, 0, 0);
    ball.position.set(HOLE_POS.x, -BALL_R * 0.5, HOLE_POS.z);
    updateHud();
    return;
  }

  // Integrate position.
  ball.position.x += velocity.x * dt;
  ball.position.z += velocity.z * dt;

  // Roll the ball mesh for visual feedback.
  const speed = velocity.length();
  if (speed > 0.0001) {
    const axis = new THREE.Vector3(velocity.z, 0, -velocity.x).normalize();
    ball.rotateOnWorldAxis(axis, (speed * dt) / BALL_R);
  }

  // Border wall collisions (reflect + lose energy).
  const limX = GREEN_HALF_X - BALL_R;
  const limZ = GREEN_HALF_Z - BALL_R;
  if (ball.position.x > limX) { ball.position.x = limX; velocity.x *= -RESTITUTION; }
  if (ball.position.x < -limX) { ball.position.x = -limX; velocity.x *= -RESTITUTION; }
  if (ball.position.z > limZ) { ball.position.z = limZ; velocity.z *= -RESTITUTION; }
  if (ball.position.z < -limZ) { ball.position.z = -limZ; velocity.z *= -RESTITUTION; }

  // Obstacle AABB collision (resolve along the shallowest penetration axis).
  const dx = ball.position.x - obstaclePos.x;
  const dz = ball.position.z - obstaclePos.z;
  const ox = obsHalf.x + BALL_R - Math.abs(dx);
  const oz = obsHalf.y + BALL_R - Math.abs(dz);
  if (ox > 0 && oz > 0) {
    if (ox < oz) {
      ball.position.x = obstaclePos.x + Math.sign(dx || 1) * (obsHalf.x + BALL_R);
      velocity.x *= -RESTITUTION;
    } else {
      ball.position.z = obstaclePos.z + Math.sign(dz || 1) * (obsHalf.y + BALL_R);
      velocity.z *= -RESTITUTION;
    }
  }

  // Friction (exponential decay), then snap to rest.
  const damp = Math.exp(-FRICTION * dt);
  velocity.multiplyScalar(damp);
  if (velocity.length() < STOP_SPEED) {
    velocity.set(0, 0, 0);
    updateHud();
  }
}

// ---------------------------------------------------------------------------
// Follow camera
// ---------------------------------------------------------------------------
const camOffset = new THREE.Vector3(0, 9, 13);
const camTarget = new THREE.Vector3();
const desiredCam = new THREE.Vector3();
function updateCamera(dt: number): void {
  desiredCam.copy(ball.position).add(camOffset);
  // Keep the camera above the green.
  desiredCam.y = Math.max(desiredCam.y, 4);
  camera.position.lerp(desiredCam, 1 - Math.exp(-4 * dt));
  camTarget.lerp(ball.position, 1 - Math.exp(-6 * dt));
  camera.lookAt(camTarget);
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
camTarget.copy(ball.position);
updateHud();

const clock = new THREE.Clock();
function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.033);
  // Sub-step physics for stability at high speeds.
  const steps = 4;
  for (let i = 0; i < steps; i++) stepPhysics(dt / steps);
  flag.rotation.z = Math.sin(clock.elapsedTime * 2) * 0.08;
  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
