/**
 * Prompt 06 — Mini-Golf Hole
 *
 * A single procedurally-built mini-golf hole:
 *   - a flat green bordered by walls
 *   - one obstacle (a brick block) to putt around
 *   - a ball with simple top-down rolling physics (friction + wall/obstacle bounces)
 *   - click-and-drag to aim and set power, release to shoot
 *   - a stroke (score) counter and par
 *   - a follow camera that trails the ball
 *
 * Built with three.js only (no external physics — the ball physics is a small,
 * self-contained 2D simulation on the XZ plane).
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Course dimensions (everything in world units; the green top sits at y = 0)
// ---------------------------------------------------------------------------
const GREEN_HALF_W = 5; // half-width  along X
const GREEN_HALF_L = 12; // half-length along Z
const WALL_HEIGHT = 0.7;
const WALL_THICK = 0.5;

const BALL_RADIUS = 0.35;
const HOLE_RADIUS = 0.55;

const TEE = new THREE.Vector3(0, BALL_RADIUS, GREEN_HALF_L - 2);
const HOLE = new THREE.Vector3(0, 0, -(GREEN_HALF_L - 2.2));

const PAR = 3;

// Play-area bounds the ball centre is clamped to (inside the walls).
const INNER_X = GREEN_HALF_W - WALL_THICK - BALL_RADIUS;
const INNER_Z = GREEN_HALF_L - WALL_THICK - BALL_RADIUS;

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd4ff);
scene.fog = new THREE.Fog(0x9fd4ff, 40, 90);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(0, 9, GREEN_HALF_L + 6);
camera.lookAt(0, 0, 0);

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x335522, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
sun.position.set(12, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
sun.shadow.bias = -0.0003;
scene.add(sun);

// ---------------------------------------------------------------------------
// The green (a procedurally striped putting surface)
// ---------------------------------------------------------------------------
function makeGreenTexture(): THREE.Texture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  // Mown-stripe pattern of two greens.
  const stripes = 10;
  const band = size / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#3aa64b' : '#2f9440';
    ctx.fillRect(0, i * band, size, band);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const greenGeo = new THREE.BoxGeometry(GREEN_HALF_W * 2, 1, GREEN_HALF_L * 2);
const greenMat = new THREE.MeshStandardMaterial({
  map: makeGreenTexture(),
  roughness: 0.95,
  metalness: 0.0,
});
const green = new THREE.Mesh(greenGeo, greenMat);
green.position.y = -0.5; // top surface at y = 0
green.receiveShadow = true;
scene.add(green);

// Surrounding ground so the green reads as a course in a field.
const fieldMat = new THREE.MeshStandardMaterial({ color: 0x6f8f3f, roughness: 1 });
const field = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), fieldMat);
field.rotation.x = -Math.PI / 2;
field.position.y = -0.55;
field.receiveShadow = true;
scene.add(field);

// ---------------------------------------------------------------------------
// Border walls (keep the ball on the green)
// ---------------------------------------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });

function addWall(w: number, d: number, x: number, z: number) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
  wall.position.set(x, WALL_HEIGHT / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}
// long walls (±X) and end walls (±Z)
addWall(WALL_THICK, GREEN_HALF_L * 2, -GREEN_HALF_W + WALL_THICK / 2, 0);
addWall(WALL_THICK, GREEN_HALF_L * 2, GREEN_HALF_W - WALL_THICK / 2, 0);
addWall(GREEN_HALF_W * 2, WALL_THICK, 0, -GREEN_HALF_L + WALL_THICK / 2);
addWall(GREEN_HALF_W * 2, WALL_THICK, 0, GREEN_HALF_L - WALL_THICK / 2);

// ---------------------------------------------------------------------------
// One obstacle — a brick block the ball must putt around / bounce off.
// Stored as an axis-aligned box on the XZ plane for collision.
// ---------------------------------------------------------------------------
const OB_HALF_X = 2.2;
const OB_HALF_Z = 0.55;
const OB_CENTER = new THREE.Vector2(-1.1, 1.5); // (x, z)

function makeBrickTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9c3b2e';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#caa37a';
  const bh = 32;
  const bw = 64;
  for (let row = 0, y = 0; y < c.height; y += bh, row++) {
    const off = row % 2 === 0 ? 0 : bw / 2;
    ctx.fillRect(0, y, c.width, 3); // mortar line
    for (let x = -bw; x < c.width; x += bw) {
      ctx.fillRect(x + off, y, 3, bh); // vertical mortar
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(OB_HALF_X * 2, 1.1, OB_HALF_Z * 2),
  new THREE.MeshStandardMaterial({ map: makeBrickTexture(), roughness: 0.85 }),
);
obstacle.position.set(OB_CENTER.x, 0.55, OB_CENTER.y);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

// ---------------------------------------------------------------------------
// Hole + flag
// ---------------------------------------------------------------------------
const holeGroup = new THREE.Group();
holeGroup.position.set(HOLE.x, 0, HOLE.z);
scene.add(holeGroup);

// Dark cup sunk into the green.
const cup = new THREE.Mesh(
  new THREE.CylinderGeometry(HOLE_RADIUS, HOLE_RADIUS, 1.0, 32, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x05130a, side: THREE.DoubleSide, roughness: 1 }),
);
cup.position.y = -0.5;
holeGroup.add(cup);
const cupFloor = new THREE.Mesh(
  new THREE.CircleGeometry(HOLE_RADIUS, 32),
  new THREE.MeshStandardMaterial({ color: 0x02080a, roughness: 1 }),
);
cupFloor.rotation.x = -Math.PI / 2;
cupFloor.position.y = -1.0;
holeGroup.add(cupFloor);
// White rim so the hole is clearly visible from the follow camera.
const rim = new THREE.Mesh(
  new THREE.RingGeometry(HOLE_RADIUS, HOLE_RADIUS + 0.08, 32),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
);
rim.rotation.x = -Math.PI / 2;
rim.position.y = 0.011;
holeGroup.add(rim);

// Flag pole + flag.
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.04, 3, 12),
  new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 }),
);
pole.position.y = 1.5;
pole.castShadow = true;
holeGroup.add(pole);
const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(1.0, 0.6),
  new THREE.MeshStandardMaterial({ color: 0xe5322b, side: THREE.DoubleSide, roughness: 0.7 }),
);
flag.position.set(0.5, 2.6, 0);
holeGroup.add(flag);

// ---------------------------------------------------------------------------
// The ball
// ---------------------------------------------------------------------------
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 }),
);
ball.castShadow = true;
ball.position.copy(TEE);
scene.add(ball);

// Velocity lives on the XZ plane.
const vel = new THREE.Vector2(0, 0);
let sunk = false;
let strokes = 0;

// ---------------------------------------------------------------------------
// Aim arrow (a three.js ArrowHelper hugging the ground)
// ---------------------------------------------------------------------------
const aimArrow = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(),
  1,
  0xffe14d,
  0.5,
  0.35,
);
aimArrow.visible = false;
scene.add(aimArrow);

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const hud = document.createElement('div');
hud.innerHTML = `
  <div id="scorecard">
    <div class="row"><span class="lbl">STROKES</span><span id="strokes">0</span></div>
    <div class="row"><span class="lbl">PAR</span><span id="par">${PAR}</span></div>
  </div>
  <div id="powerwrap"><div id="powerbar"></div></div>
  <div id="hint">Click &amp; drag from the ball to aim — release to shoot. Right-drag to look around.</div>
  <div id="message"></div>
`;
document.body.appendChild(hud);

const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden;
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; }
  #app { position: fixed; inset: 0; }
  #scorecard {
    position: fixed; top: 18px; left: 18px; padding: 14px 18px;
    background: rgba(12,28,16,0.78); color: #eafff0; border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.15);
    box-shadow: 0 8px 28px rgba(0,0,0,0.35); backdrop-filter: blur(4px);
    min-width: 150px;
  }
  #scorecard .row { display: flex; justify-content: space-between; align-items: baseline; gap: 22px; }
  #scorecard .row + .row { margin-top: 6px; }
  #scorecard .lbl { font-size: 12px; letter-spacing: 2px; opacity: 0.7; }
  #scorecard #strokes { font-size: 30px; font-weight: 800; line-height: 1; }
  #scorecard #par { font-size: 20px; font-weight: 700; opacity: 0.9; }
  #powerwrap {
    position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%);
    width: 280px; height: 16px; border-radius: 10px;
    background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.25);
    overflow: hidden; opacity: 0; transition: opacity 0.15s;
  }
  #powerwrap.show { opacity: 1; }
  #powerbar {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, #56d364, #f2cc60, #f85149);
  }
  #hint {
    position: fixed; bottom: 18px; left: 18px; color: #eafff0; font-size: 13px;
    background: rgba(12,28,16,0.6); padding: 8px 12px; border-radius: 10px;
    max-width: 320px;
  }
  #message {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    color: #fff; text-align: center; pointer-events: none;
    text-shadow: 0 4px 18px rgba(0,0,0,0.6); opacity: 0;
    transition: opacity 0.3s; font-weight: 800;
  }
  #message.show { opacity: 1; }
  #message .big { font-size: 54px; display: block; }
  #message .sub { font-size: 20px; font-weight: 600; }
  #message button {
    pointer-events: auto; margin-top: 16px; font: inherit; font-weight: 700;
    padding: 10px 22px; border-radius: 999px; border: none; cursor: pointer;
    background: #56d364; color: #06210f; font-size: 16px;
  }
`;
document.head.appendChild(style);

const strokesEl = document.getElementById('strokes')!;
const powerWrap = document.getElementById('powerwrap')!;
const powerBar = document.getElementById('powerbar')!;
const messageEl = document.getElementById('message')!;

function showMessage(html: string) {
  messageEl.innerHTML = html;
  messageEl.classList.add('show');
}
function hideMessage() {
  messageEl.classList.remove('show');
}

// ---------------------------------------------------------------------------
// Input: click-to-aim-and-shoot via raycasting onto the green plane
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const MAX_POWER = 26; // max launch speed
const MAX_DRAG = 7; // drag distance (world units) that maps to full power

let aiming = false;
const aimDir = new THREE.Vector2(0, -1);
let aimPower = 0; // 0..1

// Right-drag orbiting of the follow camera.
let orbiting = false;
let lastOrbitX = 0;
let camYaw = 0; // current camera yaw around the ball
let userYawOffset = 0; // manual offset added by right-drag

function pointerToGround(ev: PointerEvent, out: THREE.Vector3): boolean {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, out) !== null;
}

const ballAtRest = () => vel.lengthSq() < 0.0009 && !sunk;

const hit = new THREE.Vector3();

renderer.domElement.addEventListener('pointerdown', (ev) => {
  if (ev.button === 2) {
    orbiting = true;
    lastOrbitX = ev.clientX;
    return;
  }
  if (ev.button !== 0 || !ballAtRest()) return;
  if (!pointerToGround(ev, hit)) return;
  aiming = true;
  aimArrow.visible = true;
  powerWrap.classList.add('show');
  updateAim(ev);
});

function updateAim(ev: PointerEvent) {
  if (!pointerToGround(ev, hit)) return;
  // Aim from the ball toward the cursor; power scales with drag distance.
  const dx = hit.x - ball.position.x;
  const dz = hit.z - ball.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return;
  aimDir.set(dx / dist, dz / dist);
  aimPower = Math.min(dist / MAX_DRAG, 1);

  // Position + orient the ground arrow.
  aimArrow.position.set(ball.position.x, 0.05, ball.position.z);
  aimArrow.setDirection(new THREE.Vector3(aimDir.x, 0, aimDir.y));
  aimArrow.setLength(1 + aimPower * 4.5, 0.55, 0.4);
  powerBar.style.width = `${(aimPower * 100).toFixed(0)}%`;
}

window.addEventListener('pointermove', (ev) => {
  if (orbiting) {
    const dx = ev.clientX - lastOrbitX;
    lastOrbitX = ev.clientX;
    userYawOffset += dx * 0.005;
    return;
  }
  if (aiming) updateAim(ev);
});

window.addEventListener('pointerup', (ev) => {
  if (ev.button === 2) {
    orbiting = false;
    return;
  }
  if (!aiming) return;
  aiming = false;
  aimArrow.visible = false;
  powerWrap.classList.remove('show');
  if (aimPower > 0.04) {
    const speed = aimPower * MAX_POWER;
    vel.set(aimDir.x * speed, aimDir.y * speed);
    strokes += 1;
    strokesEl.textContent = String(strokes);
  }
  aimPower = 0;
  powerBar.style.width = '0%';
});

// Disable the browser context menu so right-drag can orbit.
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Physics step (fixed-ish, friction + collisions on the XZ plane)
// ---------------------------------------------------------------------------
const FRICTION = 1.6; // per-second velocity damping coefficient
const STOP_SPEED = 0.18; // below this the ball is considered stopped

function reflect(component: 'x' | 'y', restitution = 0.6) {
  vel[component] = -vel[component] * restitution;
}

function stepPhysics(dt: number) {
  if (sunk) return;

  const speed = vel.length();
  if (speed === 0) return;

  // Hole capture: if the ball is over the cup and moving slowly enough, sink it.
  const toHole = new THREE.Vector2(ball.position.x - HOLE.x, ball.position.z - HOLE.z);
  if (toHole.length() < HOLE_RADIUS - 0.05 && speed < 12) {
    sink();
    return;
  }

  // Exponential friction (frame-rate independent).
  const damp = Math.exp(-FRICTION * dt);
  vel.multiplyScalar(damp);
  if (vel.length() < STOP_SPEED) {
    vel.set(0, 0);
    return;
  }

  // Integrate position.
  ball.position.x += vel.x * dt;
  ball.position.z += vel.y * dt;

  // --- Wall collisions (clamp to inner play area, reflect) ---
  if (ball.position.x > INNER_X) {
    ball.position.x = INNER_X;
    reflect('x');
  } else if (ball.position.x < -INNER_X) {
    ball.position.x = -INNER_X;
    reflect('x');
  }
  if (ball.position.z > INNER_Z) {
    ball.position.z = INNER_Z;
    reflect('y');
  } else if (ball.position.z < -INNER_Z) {
    ball.position.z = -INNER_Z;
    reflect('y');
  }

  // --- Obstacle collision (circle vs AABB on XZ) ---
  resolveBoxCollision(OB_CENTER.x, OB_CENTER.y, OB_HALF_X, OB_HALF_Z);

  // Roll the ball visually: rotate about the axis perpendicular to motion.
  const moved = new THREE.Vector2(vel.x, vel.y).multiplyScalar(dt);
  const rollAxis = new THREE.Vector3(vel.y, 0, -vel.x).normalize();
  const angle = moved.length() / BALL_RADIUS;
  if (angle > 0) ball.rotateOnWorldAxis(rollAxis, angle);
}

function resolveBoxCollision(cx: number, cz: number, hx: number, hz: number) {
  const px = ball.position.x;
  const pz = ball.position.z;
  // Closest point on the box to the ball centre.
  const nearestX = Math.max(cx - hx, Math.min(px, cx + hx));
  const nearestZ = Math.max(cz - hz, Math.min(pz, cz + hz));
  const dx = px - nearestX;
  const dz = pz - nearestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= BALL_RADIUS * BALL_RADIUS) return;

  const dist = Math.sqrt(distSq) || 1e-4;
  let nx = dx / dist;
  let nz = dz / dist;

  // If the centre is inside the box, push out along the shallowest axis.
  if (distSq < 1e-6) {
    const overlapX = hx + BALL_RADIUS - Math.abs(px - cx);
    const overlapZ = hz + BALL_RADIUS - Math.abs(pz - cz);
    if (overlapX < overlapZ) {
      nx = Math.sign(px - cx) || 1;
      nz = 0;
    } else {
      nx = 0;
      nz = Math.sign(pz - cz) || 1;
    }
  }

  // Separate the ball, then reflect velocity about the contact normal.
  const push = BALL_RADIUS - dist;
  ball.position.x += nx * push;
  ball.position.z += nz * push;
  const vn = vel.x * nx + vel.y * nz;
  if (vn < 0) {
    const restitution = 0.6;
    vel.x -= (1 + restitution) * vn * nx;
    vel.y -= (1 + restitution) * vn * nz;
  }
}

function sink() {
  sunk = true;
  vel.set(0, 0);
  ball.position.set(HOLE.x, -0.4, HOLE.z); // drop into the cup
  const diff = strokes - PAR;
  const term =
    strokes === 1
      ? 'HOLE IN ONE!'
      : diff <= -2
        ? 'EAGLE!'
        : diff === -1
          ? 'BIRDIE!'
          : diff === 0
            ? 'PAR'
            : diff === 1
              ? 'BOGEY'
              : `+${diff}`;
  showMessage(
    `<span class="big">⛳ ${term}</span>` +
      `<span class="sub">Holed in ${strokes} stroke${strokes === 1 ? '' : 's'} (par ${PAR})</span>` +
      `<button id="again">Play again</button>`,
  );
  document.getElementById('again')!.addEventListener('click', resetGame);
}

function resetGame() {
  hideMessage();
  sunk = false;
  strokes = 0;
  strokesEl.textContent = '0';
  vel.set(0, 0);
  ball.position.copy(TEE);
  ball.rotation.set(0, 0, 0);
  userYawOffset = 0;
}

// ---------------------------------------------------------------------------
// Follow camera — trails behind the ball, looking toward it.
// ---------------------------------------------------------------------------
const CAM_DIST = 9;
const CAM_HEIGHT = 6;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

function angleLerp(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateCamera(dt: number) {
  // When the ball is moving, trail behind its velocity. Otherwise face the hole
  // from behind the ball so the player can line up the next putt.
  let desiredYaw: number;
  if (vel.lengthSq() > 1.0) {
    desiredYaw = Math.atan2(-vel.x, -vel.y);
  } else {
    const toHole = new THREE.Vector2(HOLE.x - ball.position.x, HOLE.z - ball.position.z);
    desiredYaw = Math.atan2(-toHole.x, -toHole.y);
  }
  camYaw = angleLerp(camYaw, desiredYaw, 1 - Math.exp(-3 * dt));

  const yaw = camYaw + userYawOffset;
  camPos.set(
    ball.position.x + Math.sin(yaw) * CAM_DIST,
    CAM_HEIGHT,
    ball.position.z + Math.cos(yaw) * CAM_DIST,
  );
  // Smoothly chase the target position.
  camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));

  camTarget.lerp(ball.position, 1 - Math.exp(-8 * dt));
  camera.lookAt(camTarget.x, camTarget.y + 0.4, camTarget.z);
}
camTarget.copy(ball.position);

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  let dt = clock.getDelta();
  dt = Math.min(dt, 1 / 30); // clamp to avoid tunneling on hiccups

  // Sub-step physics for stable fast-ball collisions.
  const substeps = 4;
  const h = dt / substeps;
  for (let i = 0; i < substeps; i++) stepPhysics(h);

  // Gentle flag flutter.
  flag.rotation.z = Math.sin(clock.elapsedTime * 3) * 0.12;

  // Keep the aim arrow pinned to the ball while aiming.
  if (aiming) {
    aimArrow.position.set(ball.position.x, 0.05, ball.position.z);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
