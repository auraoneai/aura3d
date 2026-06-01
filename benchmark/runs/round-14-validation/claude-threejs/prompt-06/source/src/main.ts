import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Mini-Golf Hole
 * - Flat green bounded by walls
 * - One obstacle (a brick block) in the middle of the fairway
 * - A golf ball with simple rolling physics (velocity + friction,
 *   wall + obstacle collisions)
 * - Click-and-drag from the ball to aim, release to shoot (slingshot)
 * - Stroke score counter (HTML overlay)
 * - Camera follows / emphasizes the ball
 * ------------------------------------------------------------------ */

// ---- Constants -----------------------------------------------------
const GREEN_HALF_X = 9;        // half width of the playable green
const GREEN_HALF_Z = 14;       // half depth of the playable green
const WALL_HEIGHT = 0.9;
const WALL_THICK = 0.6;
const BALL_RADIUS = 0.45;
const FRICTION = 1.6;          // velocity damping (per second)
const MIN_SPEED = 0.25;        // below this the ball is considered stopped
const MAX_POWER = 26;          // max launch speed
const POWER_SCALE = 2.4;       // drag-distance -> speed multiplier
const HOLE_RADIUS = 0.75;
const HOLE_POS = new THREE.Vector3(0, 0, -GREEN_HALF_Z + 3);
const START_POS = new THREE.Vector3(0, BALL_RADIUS, GREEN_HALF_Z - 3);

// Obstacle: an axis-aligned box sitting on the green
const OBSTACLE_CENTER = new THREE.Vector3(0, 0, 0);
const OBSTACLE_HALF = new THREE.Vector3(2.4, 1.0, 0.9);

// ---- Renderer ------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

// ---- Scene & Camera ------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b6e8);
scene.fog = new THREE.Fog(0x87b6e8, 40, 90);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);
camera.position.set(0, 12, START_POS.z + 12);
camera.lookAt(START_POS);

// ---- Lights --------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xffffff, 0x2e4a26, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
sun.position.set(14, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.bias = -0.0004;
scene.add(sun);

const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// ---- The Green (flat ground) --------------------------------------
const greenMat = new THREE.MeshStandardMaterial({ color: 0x3aa14a, roughness: 0.95 });
const green = new THREE.Mesh(
  new THREE.BoxGeometry(GREEN_HALF_X * 2, 0.6, GREEN_HALF_Z * 2),
  greenMat
);
green.position.y = -0.3;
green.receiveShadow = true;
scene.add(green);

// Subtle mowing stripes for a turf look
const stripeMat = new THREE.MeshStandardMaterial({ color: 0x349241, roughness: 0.95 });
for (let i = 0; i < 7; i++) {
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(GREEN_HALF_X * 2 - 0.2, 0.62, (GREEN_HALF_Z * 2) / 14),
    stripeMat
  );
  stripe.position.set(0, -0.295, -GREEN_HALF_Z + (i * 2 + 0.5) * ((GREEN_HALF_Z * 2) / 14));
  stripe.receiveShadow = true;
  scene.add(stripe);
}

// ---- Boundary walls -----------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
function makeWall(w: number, d: number, x: number, z: number) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
  wall.position.set(x, WALL_HEIGHT / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}
makeWall(GREEN_HALF_X * 2 + WALL_THICK * 2, WALL_THICK, 0, GREEN_HALF_Z + WALL_THICK / 2);
makeWall(GREEN_HALF_X * 2 + WALL_THICK * 2, WALL_THICK, 0, -GREEN_HALF_Z - WALL_THICK / 2);
makeWall(WALL_THICK, GREEN_HALF_Z * 2 + WALL_THICK * 2, GREEN_HALF_X + WALL_THICK / 2, 0);
makeWall(WALL_THICK, GREEN_HALF_Z * 2 + WALL_THICK * 2, -GREEN_HALF_X - WALL_THICK / 2, 0);

// ---- Obstacle ------------------------------------------------------
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0xb5402f, roughness: 0.6, metalness: 0.05 });
const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(OBSTACLE_HALF.x * 2, OBSTACLE_HALF.y * 2, OBSTACLE_HALF.z * 2),
  obstacleMat
);
obstacle.position.set(OBSTACLE_CENTER.x, OBSTACLE_HALF.y, OBSTACLE_CENTER.z);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

// ---- Hole (cup + flag) --------------------------------------------
const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 });
const hole = new THREE.Mesh(
  new THREE.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS, 0.5, 32),
  holeMat
);
hole.position.set(HOLE_POS.x, 0.0, HOLE_POS.z);
scene.add(hole);

const ringMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 });
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(HOLE_RADIUS + 0.06, 0.07, 12, 32),
  ringMat
);
ring.rotation.x = Math.PI / 2;
ring.position.set(HOLE_POS.x, 0.02, HOLE_POS.z);
scene.add(ring);

// Flag pole + flag
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.05, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0xdddddd })
);
pole.position.set(HOLE_POS.x, 2, HOLE_POS.z);
pole.castShadow = true;
scene.add(pole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 0.8),
  new THREE.MeshStandardMaterial({ color: 0xe23b3b, side: THREE.DoubleSide })
);
flag.position.set(HOLE_POS.x + 0.7, 3.4, HOLE_POS.z);
scene.add(flag);

// ---- Ball ----------------------------------------------------------
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 })
);
ball.castShadow = true;
ball.position.copy(START_POS);
scene.add(ball);

const velocity = new THREE.Vector3();
let inHole = false;

// ---- Aim line ------------------------------------------------------
const aimMat = new THREE.LineBasicMaterial({ color: 0xffff33 });
const aimGeom = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
]);
const aimLine = new THREE.Line(aimGeom, aimMat);
aimLine.visible = false;
scene.add(aimLine);

// Power indicator (a small cone arrowhead)
const aimHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.35, 0.9, 12),
  new THREE.MeshBasicMaterial({ color: 0xffff33 })
);
aimHead.visible = false;
scene.add(aimHead);

// ---- HUD overlay ---------------------------------------------------
const hud = document.createElement('div');
hud.style.cssText = [
  'position:fixed', 'top:16px', 'left:16px', 'padding:12px 16px',
  'font-family:system-ui,Arial,sans-serif', 'color:#fff',
  'background:rgba(0,0,0,0.45)', 'border-radius:10px',
  'font-size:18px', 'line-height:1.5', 'user-select:none',
  'pointer-events:none', 'z-index:10',
].join(';');
document.body.appendChild(hud);

const help = document.createElement('div');
help.style.cssText = [
  'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
  'padding:8px 14px', 'font-family:system-ui,Arial,sans-serif',
  'color:#fff', 'background:rgba(0,0,0,0.4)', 'border-radius:8px',
  'font-size:14px', 'user-select:none', 'pointer-events:none', 'z-index:10',
].join(';');
help.textContent = 'Click & drag from the ball to aim, release to shoot';
document.body.appendChild(help);

let strokes = 0;
let message = '';
function updateHud() {
  hud.innerHTML =
    `<strong>⛳ Mini-Golf</strong><br>Strokes: ${strokes}` +
    (message ? `<br><span style="color:#ffe066">${message}</span>` : '');
}
updateHud();

// ---- Input: click-to-aim-and-shoot --------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL_RADIUS);
let aiming = false;
const aimTarget = new THREE.Vector3();

function pointerToGround(ev: PointerEvent, out: THREE.Vector3): boolean {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, out) !== null;
}

function ballIsStopped(): boolean {
  return velocity.lengthSq() < MIN_SPEED * MIN_SPEED;
}

renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (inHole || !ballIsStopped()) return;
  if (pointerToGround(ev, aimTarget)) {
    aiming = true;
    aimLine.visible = true;
    aimHead.visible = true;
    updateAimVisual();
  }
});

window.addEventListener('pointermove', (ev) => {
  if (!aiming) return;
  pointerToGround(ev, aimTarget);
  updateAimVisual();
});

window.addEventListener('pointerup', () => {
  // Reset after sinking (play again)
  if (inHole) {
    inHole = false;
    strokes = 0;
    message = '';
    ball.position.copy(START_POS);
    velocity.set(0, 0, 0);
    updateHud();
    return;
  }

  if (!aiming) return;
  aiming = false;
  aimLine.visible = false;
  aimHead.visible = false;

  // Shoot toward the dragged point; power scales with drag distance.
  const dir = new THREE.Vector3().subVectors(aimTarget, ball.position);
  dir.y = 0;
  const dist = dir.length();
  if (dist < 0.4) return; // too small a drag, ignore
  dir.normalize();
  const speed = Math.min(dist * POWER_SCALE, MAX_POWER);
  velocity.copy(dir.multiplyScalar(speed));
  strokes++;
  message = '';
  updateHud();
});

function updateAimVisual() {
  const dir = new THREE.Vector3().subVectors(aimTarget, ball.position);
  dir.y = 0;
  const dist = Math.min(dir.length(), MAX_POWER / POWER_SCALE);
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const start = ball.position.clone();
  start.y = BALL_RADIUS;
  const end = start.clone().add(dir.clone().multiplyScalar(dist));
  aimGeom.setFromPoints([start, end]);
  aimGeom.attributes.position.needsUpdate = true;

  aimHead.position.copy(end);
  aimHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  // Colour from yellow (soft) to red (hard) based on power.
  const t = dist / (MAX_POWER / POWER_SCALE);
  const col = new THREE.Color().setHSL((1 - t) * 0.17, 1, 0.5);
  (aimLine.material as THREE.LineBasicMaterial).color.copy(col);
  (aimHead.material as THREE.MeshBasicMaterial).color.copy(col);
}

// ---- Physics step --------------------------------------------------
function stepPhysics(dt: number) {
  if (inHole) return;
  if (velocity.lengthSq() === 0) return;

  // Integrate position
  ball.position.addScaledVector(velocity, dt);

  // Rolling visual (rotate about axis perpendicular to motion)
  const speed = velocity.length();
  if (speed > 0.0001) {
    const axis = new THREE.Vector3(velocity.z, 0, -velocity.x).normalize();
    ball.rotateOnWorldAxis(axis, (speed * dt) / BALL_RADIUS);
  }

  // Apply friction (linear damping toward zero)
  const damp = Math.max(0, 1 - FRICTION * dt);
  velocity.multiplyScalar(damp);
  if (velocity.lengthSq() < MIN_SPEED * MIN_SPEED) {
    velocity.set(0, 0, 0);
  }

  // ---- Wall collisions (reflect + clamp) ----
  const maxX = GREEN_HALF_X - BALL_RADIUS;
  const maxZ = GREEN_HALF_Z - BALL_RADIUS;
  if (ball.position.x > maxX) { ball.position.x = maxX; velocity.x = -Math.abs(velocity.x) * 0.7; }
  if (ball.position.x < -maxX) { ball.position.x = -maxX; velocity.x = Math.abs(velocity.x) * 0.7; }
  if (ball.position.z > maxZ) { ball.position.z = maxZ; velocity.z = -Math.abs(velocity.z) * 0.7; }
  if (ball.position.z < -maxZ) { ball.position.z = -maxZ; velocity.z = Math.abs(velocity.z) * 0.7; }

  // ---- Obstacle collision (circle vs AABB on XZ plane) ----
  resolveObstacle();

  // ---- Hole capture ----
  const toHole = new THREE.Vector3(
    ball.position.x - HOLE_POS.x,
    0,
    ball.position.z - HOLE_POS.z
  );
  const holeDist = toHole.length();
  if (holeDist < HOLE_RADIUS) {
    if (speed < 9) {
      // Sink it
      inHole = true;
      velocity.set(0, 0, 0);
      ball.position.set(HOLE_POS.x, BALL_RADIUS - 0.35, HOLE_POS.z);
      message = `🏆 Holed in ${strokes} stroke${strokes === 1 ? '' : 's'}! Click to play again.`;
      updateHud();
      return;
    } else {
      // Too fast: lip-out, nudge ball away from center
      const push = toHole.normalize().multiplyScalar(0.05);
      ball.position.add(push);
    }
  }

  ball.position.y = BALL_RADIUS;
}

function resolveObstacle() {
  const minX = OBSTACLE_CENTER.x - OBSTACLE_HALF.x;
  const maxX = OBSTACLE_CENTER.x + OBSTACLE_HALF.x;
  const minZ = OBSTACLE_CENTER.z - OBSTACLE_HALF.z;
  const maxZ = OBSTACLE_CENTER.z + OBSTACLE_HALF.z;

  const closestX = Math.max(minX, Math.min(ball.position.x, maxX));
  const closestZ = Math.max(minZ, Math.min(ball.position.z, maxZ));
  const dx = ball.position.x - closestX;
  const dz = ball.position.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq < BALL_RADIUS * BALL_RADIUS) {
    let nx = dx;
    let nz = dz;
    const dist = Math.sqrt(distSq);
    if (distSq < 1e-8) {
      // Ball center inside the box: push out along the shallowest axis
      const overlapX = Math.min(ball.position.x - minX, maxX - ball.position.x);
      const overlapZ = Math.min(ball.position.z - minZ, maxZ - ball.position.z);
      if (overlapX < overlapZ) {
        nx = ball.position.x < OBSTACLE_CENTER.x ? -1 : 1; nz = 0;
      } else {
        nx = 0; nz = ball.position.z < OBSTACLE_CENTER.z ? -1 : 1;
      }
    } else {
      nx /= dist; nz /= dist;
    }
    // Push ball to the surface
    const penetration = BALL_RADIUS - (distSq < 1e-8 ? 0 : dist);
    ball.position.x += nx * penetration;
    ball.position.z += nz * penetration;
    // Reflect velocity about the collision normal
    const vn = velocity.x * nx + velocity.z * nz;
    if (vn < 0) {
      velocity.x -= 2 * vn * nx;
      velocity.z -= 2 * vn * nz;
      velocity.x *= 0.82;
      velocity.z *= 0.82;
    }
  }
}

// ---- Follow camera -------------------------------------------------
const camOffset = new THREE.Vector3(0, 9, 13);
const camTarget = new THREE.Vector3().copy(START_POS);
function updateCamera(dt: number) {
  // Position the camera behind & above the ball, looking at it.
  const desired = ball.position.clone().add(camOffset);
  const lerp = 1 - Math.pow(0.001, dt); // smooth, frame-rate independent
  camera.position.lerp(desired, lerp);
  camTarget.lerp(ball.position, lerp);
  camera.lookAt(camTarget);
}

// ---- Resize --------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Main loop -----------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  stepPhysics(dt);
  if (aiming) updateAimVisual();
  // gentle flag wave
  flag.rotation.z = Math.sin(performance.now() * 0.003) * 0.12;
  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
