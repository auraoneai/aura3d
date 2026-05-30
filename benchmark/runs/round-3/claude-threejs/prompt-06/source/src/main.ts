import * as THREE from "three";

/* -------------------------------------------------------------------------- */
/*  Mini-Golf Hole                                                            */
/*  - Flat green bounded by walls                                             */
/*  - One obstacle (a brick block in the fairway)                            */
/*  - A ball with custom rolling physics (friction + wall/obstacle bounce)   */
/*  - Click-drag to aim & set power, release to shoot                        */
/*  - Stroke score counter                                                   */
/*  - Follow camera that trails the ball                                     */
/* -------------------------------------------------------------------------- */

// ---- Course dimensions -----------------------------------------------------
const HALF_W = 6; // half width (x)
const HALF_L = 11; // half length (z)
const WALL_H = 0.7;
const WALL_T = 0.4;
const BALL_R = 0.32;
const HOLE_R = 0.55;

// Start & hole positions
const START = new THREE.Vector3(0, BALL_R, HALF_L - 2);
const HOLE = new THREE.Vector3(0, 0, -HALF_L + 2.2);

// Obstacle (axis-aligned box in the middle of the fairway)
const OBST_HALF = new THREE.Vector3(2.2, 0.6, 0.45);
const OBST_CENTER = new THREE.Vector3(0, OBST_HALF.y, 1.0);

// ---- Renderer / scene / camera --------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = "block";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecae6);
scene.fog = new THREE.Fog(0x8ecae6, 30, 60);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

// ---- Lights ----------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x4a7a3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.bias = -0.0003;
scene.add(sun);

// ---- Green (the putting surface) ------------------------------------------
const greenMat = new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 1 });
const green = new THREE.Mesh(
  new THREE.BoxGeometry(HALF_W * 2, 0.4, HALF_L * 2),
  greenMat
);
green.position.y = -0.2;
green.receiveShadow = true;
scene.add(green);

// Subtle mowed-stripe overlay for visual richness
{
  const stripes = new THREE.Group();
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0x4cb85c,
    roughness: 1,
    transparent: true,
    opacity: 0.55,
  });
  const count = 11;
  const stripeW = (HALF_L * 2) / count;
  for (let i = 0; i < count; i += 2) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, stripeW), stripeMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, 0.011, -HALF_L + stripeW * (i + 0.5));
    s.receiveShadow = true;
    stripes.add(s);
  }
  scene.add(stripes);
}

// Ground apron under everything
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 })
);
apron.rotation.x = -Math.PI / 2;
apron.position.y = -0.41;
apron.receiveShadow = true;
scene.add(apron);

// ---- Walls (course borders) ------------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.8 });
function addWall(w: number, d: number, x: number, z: number) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  wall.position.set(x, WALL_H / 2 - 0.05, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}
addWall(HALF_W * 2 + WALL_T * 2, WALL_T, 0, HALF_L + WALL_T / 2); // back (+z)
addWall(HALF_W * 2 + WALL_T * 2, WALL_T, 0, -HALF_L - WALL_T / 2); // front (-z)
addWall(WALL_T, HALF_L * 2 + WALL_T * 2, HALF_W + WALL_T / 2, 0); // right (+x)
addWall(WALL_T, HALF_L * 2 + WALL_T * 2, -HALF_W - WALL_T / 2, 0); // left (-x)

// ---- Obstacle --------------------------------------------------------------
const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(OBST_HALF.x * 2, OBST_HALF.y * 2, OBST_HALF.z * 2),
  new THREE.MeshStandardMaterial({ color: 0xb5462f, roughness: 0.7 })
);
obstacle.position.copy(OBST_CENTER);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);
// Brick-edge accent on top of the obstacle
{
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(OBST_HALF.x * 2 + 0.1, 0.15, OBST_HALF.z * 2 + 0.1),
    new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.6 })
  );
  cap.position.set(OBST_CENTER.x, OBST_HALF.y * 2 - 0.02, OBST_CENTER.z);
  cap.castShadow = true;
  scene.add(cap);
}

// ---- Hole + flag -----------------------------------------------------------
const holeMesh = new THREE.Mesh(
  new THREE.CircleGeometry(HOLE_R, 32),
  new THREE.MeshBasicMaterial({ color: 0x05130a })
);
holeMesh.rotation.x = -Math.PI / 2;
holeMesh.position.set(HOLE.x, 0.02, HOLE.z);
scene.add(holeMesh);
// Thin rim around the cup
const rim = new THREE.Mesh(
  new THREE.RingGeometry(HOLE_R, HOLE_R + 0.08, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
rim.rotation.x = -Math.PI / 2;
rim.position.set(HOLE.x, 0.025, HOLE.z);
scene.add(rim);

// Flag pole + flag
const flag = new THREE.Group();
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.045, 3, 12),
  new THREE.MeshStandardMaterial({ color: 0xf2f2f2 })
);
pole.position.y = 1.5;
pole.castShadow = true;
flag.add(pole);
const cloth = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 0.7),
  new THREE.MeshStandardMaterial({ color: 0xe63946, side: THREE.DoubleSide })
);
cloth.position.set(0.55, 2.6, 0);
flag.add(cloth);
flag.position.set(HOLE.x, 0, HOLE.z);
scene.add(flag);

// ---- Ball ------------------------------------------------------------------
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 })
);
ball.castShadow = true;
ball.position.copy(START);
scene.add(ball);

const ballVel = new THREE.Vector3(); // velocity in xz-plane

// ---- Aim arrow -------------------------------------------------------------
const aimGroup = new THREE.Group();
aimGroup.visible = false;
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
const arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 1), arrowMat);
arrowShaft.position.z = 0.5;
aimGroup.add(arrowShaft);
const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 16), arrowMat);
arrowHead.rotation.x = Math.PI / 2;
arrowHead.position.z = 1.2;
aimGroup.add(arrowHead);
scene.add(aimGroup);

// Power ring beneath the ball while aiming
const powerRing = new THREE.Mesh(
  new THREE.RingGeometry(BALL_R + 0.1, BALL_R + 0.28, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 })
);
powerRing.rotation.x = -Math.PI / 2;
powerRing.visible = false;
scene.add(powerRing);

// ---- HUD -------------------------------------------------------------------
const hud = document.createElement("div");
hud.style.cssText = `
  position:fixed; top:16px; left:16px; z-index:10;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color:#fff; text-shadow:0 2px 6px rgba(0,0,0,.5);
  pointer-events:none; user-select:none;
`;
hud.innerHTML = `
  <div style="font-size:34px; font-weight:800; letter-spacing:.5px;">⛳ Mini-Golf</div>
  <div style="font-size:22px; margin-top:6px;">Strokes: <span id="strokes" style="font-weight:800;">0</span> &nbsp;|&nbsp; Par 3</div>
  <div id="hint" style="font-size:15px; margin-top:8px; opacity:.9; max-width:340px;">
    Click &amp; drag from the ball to aim, release to shoot.
  </div>
`;
document.body.appendChild(hud);
const strokesEl = hud.querySelector<HTMLSpanElement>("#strokes")!;
const hintEl = hud.querySelector<HTMLDivElement>("#hint")!;

// Win banner
const banner = document.createElement("div");
banner.style.cssText = `
  position:fixed; inset:0; z-index:20; display:none;
  align-items:center; justify-content:center; flex-direction:column;
  background:rgba(0,0,0,.45); color:#fff; pointer-events:none;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; text-align:center;
`;
banner.innerHTML = `
  <div style="font-size:64px; font-weight:900;">Hole Complete!</div>
  <div id="banner-sub" style="font-size:28px; margin-top:10px;"></div>
  <div style="font-size:18px; margin-top:22px; opacity:.85;">Press <b>R</b> to play again</div>
`;
document.body.appendChild(banner);
const bannerSub = banner.querySelector<HTMLDivElement>("#banner-sub")!;

// ---- Game state ------------------------------------------------------------
let strokes = 0;
let aiming = false;
let won = false;
const aimDir = new THREE.Vector3(); // unit shoot direction (xz)
let aimPower = 0; // 0..1

const MAX_POWER = 22; // max launch speed
const FRICTION = 1.6; // velocity decay coefficient per second
const STOP_SPEED = 0.25; // below this, ball is considered stopped
const RESTITUTION = 0.72; // wall/obstacle bounciness

function ballStopped(): boolean {
  return ballVel.lengthSq() < STOP_SPEED * STOP_SPEED;
}

// ---- Pointer -> ground intersection ---------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

function pointerToGround(ev: PointerEvent): boolean {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, hitPoint) !== null;
}

function updateAim() {
  // Vector from pointer to ball: slingshot — pull back, shoot forward.
  const dx = ball.position.x - hitPoint.x;
  const dz = ball.position.z - hitPoint.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) {
    aimPower = 0;
    aimGroup.visible = false;
    powerRing.visible = false;
    return;
  }
  aimDir.set(dx / dist, 0, dz / dist);
  aimPower = Math.min(dist / 6, 1); // 6 world-units of pull = full power

  // Orient & size the aim arrow.
  aimGroup.position.set(ball.position.x, 0.05, ball.position.z);
  aimGroup.rotation.y = Math.atan2(aimDir.x, aimDir.z);
  const len = 0.6 + aimPower * 3.2;
  aimGroup.scale.set(1, 1, len);
  aimGroup.visible = true;

  // Power ring color from green -> red.
  powerRing.position.set(ball.position.x, 0.04, ball.position.z);
  powerRing.visible = true;
  (powerRing.material as THREE.MeshBasicMaterial).color.setHSL(
    (1 - aimPower) * 0.33,
    0.9,
    0.5
  );
}

// ---- Pointer events --------------------------------------------------------
renderer.domElement.addEventListener("pointerdown", (ev) => {
  if (won || !ballStopped()) return;
  if (!pointerToGround(ev)) return;
  aiming = true;
  aimPower = 0;
  updateAim();
});

window.addEventListener("pointermove", (ev) => {
  if (!aiming) return;
  if (!pointerToGround(ev)) return;
  updateAim();
});

window.addEventListener("pointerup", () => {
  if (!aiming) return;
  aiming = false;
  aimGroup.visible = false;
  powerRing.visible = false;
  if (aimPower > 0.04) {
    ballVel.copy(aimDir).multiplyScalar(aimPower * MAX_POWER);
    strokes++;
    strokesEl.textContent = String(strokes);
    hintEl.textContent = "Nice swing! Wait for the ball to settle…";
  }
});

// ---- Reset -----------------------------------------------------------------
function resetGame() {
  ball.position.copy(START);
  ballVel.set(0, 0, 0);
  strokes = 0;
  won = false;
  aiming = false;
  strokesEl.textContent = "0";
  hintEl.textContent = "Click & drag from the ball to aim, release to shoot.";
  banner.style.display = "none";
}
window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") resetGame();
});

// ---- Physics step ----------------------------------------------------------
function stepPhysics(dt: number) {
  if (won) return;
  if (ballVel.lengthSq() === 0) return;

  // Integrate position.
  ball.position.x += ballVel.x * dt;
  ball.position.z += ballVel.z * dt;

  // Rolling rotation for visual feedback.
  const speed = ballVel.length();
  if (speed > 0) {
    const axis = new THREE.Vector3(ballVel.z, 0, -ballVel.x).normalize();
    ball.rotateOnWorldAxis(axis, (speed * dt) / BALL_R);
  }

  // Friction (exponential decay, frame-rate independent).
  const decay = Math.exp(-FRICTION * dt);
  ballVel.multiplyScalar(decay);
  if (ballStopped()) {
    ballVel.set(0, 0, 0);
    if (!won) hintEl.textContent = "Click & drag from the ball to aim, release to shoot.";
  }

  // Wall collisions (inner faces of the border).
  const lim = HALF_W - BALL_R;
  const limZ = HALF_L - BALL_R;
  if (ball.position.x > lim) {
    ball.position.x = lim;
    ballVel.x = -ballVel.x * RESTITUTION;
  } else if (ball.position.x < -lim) {
    ball.position.x = -lim;
    ballVel.x = -ballVel.x * RESTITUTION;
  }
  if (ball.position.z > limZ) {
    ball.position.z = limZ;
    ballVel.z = -ballVel.z * RESTITUTION;
  } else if (ball.position.z < -limZ) {
    ball.position.z = -limZ;
    ballVel.z = -ballVel.z * RESTITUTION;
  }

  // Obstacle collision (circle vs AABB in xz).
  resolveObstacle();

  // Hole check.
  const toHole = Math.hypot(ball.position.x - HOLE.x, ball.position.z - HOLE.z);
  if (toHole < HOLE_R - 0.05 && speed < 9) {
    sinkBall();
  }
}

function resolveObstacle() {
  const minX = OBST_CENTER.x - OBST_HALF.x;
  const maxX = OBST_CENTER.x + OBST_HALF.x;
  const minZ = OBST_CENTER.z - OBST_HALF.z;
  const maxZ = OBST_CENTER.z + OBST_HALF.z;

  // Closest point on the box to the ball center.
  const cx = Math.max(minX, Math.min(ball.position.x, maxX));
  const cz = Math.max(minZ, Math.min(ball.position.z, maxZ));
  const dx = ball.position.x - cx;
  const dz = ball.position.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= BALL_R * BALL_R) return;

  const inside = d2 < 1e-9;
  let nx: number, nz: number, pen: number;
  if (inside) {
    // Ball center inside box: push out along the least-penetrated axis.
    const penX = OBST_HALF.x + BALL_R - Math.abs(ball.position.x - OBST_CENTER.x);
    const penZ = OBST_HALF.z + BALL_R - Math.abs(ball.position.z - OBST_CENTER.z);
    if (penX < penZ) {
      nx = Math.sign(ball.position.x - OBST_CENTER.x) || 1;
      nz = 0;
      pen = penX;
    } else {
      nx = 0;
      nz = Math.sign(ball.position.z - OBST_CENTER.z) || 1;
      pen = penZ;
    }
  } else {
    const d = Math.sqrt(d2);
    nx = dx / d;
    nz = dz / d;
    pen = BALL_R - d;
  }

  // Positional correction.
  ball.position.x += nx * pen;
  ball.position.z += nz * pen;

  // Reflect velocity about the contact normal.
  const vn = ballVel.x * nx + ballVel.z * nz;
  if (vn < 0) {
    ballVel.x -= (1 + RESTITUTION) * vn * nx;
    ballVel.z -= (1 + RESTITUTION) * vn * nz;
  }
}

function sinkBall() {
  won = true;
  ballVel.set(0, 0, 0);
  ball.position.set(HOLE.x, -BALL_R * 0.5, HOLE.z);
  const par = 3;
  const diff = strokes - par;
  let label: string;
  if (strokes === 1) label = "Hole in One! 🏆";
  else if (diff <= -2) label = "Eagle! 🦅";
  else if (diff === -1) label = "Birdie! 🐦";
  else if (diff === 0) label = "Par 🎯";
  else if (diff === 1) label = "Bogey";
  else label = `+${diff}`;
  bannerSub.textContent = `${strokes} stroke${strokes === 1 ? "" : "s"} — ${label}`;
  banner.style.display = "flex";
  hintEl.textContent = "Hole complete — press R to play again.";
}

// ---- Follow camera ---------------------------------------------------------
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const lookDesired = new THREE.Vector3();
// Offset behind (+z) and above the ball.
const CAM_OFFSET = new THREE.Vector3(0, 7.5, 11);

function updateCamera(dt: number) {
  camDesired.set(
    ball.position.x + CAM_OFFSET.x,
    CAM_OFFSET.y,
    ball.position.z + CAM_OFFSET.z
  );
  // Smooth follow (frame-rate independent lerp).
  const k = 1 - Math.exp(-4 * dt);
  camera.position.lerp(camDesired, k);
  lookDesired.set(ball.position.x, ball.position.y + 0.5, ball.position.z);
  camTarget.lerp(lookDesired, k);
  camera.lookAt(camTarget);
}

// Initialize camera immediately so the very first frame is framed on the ball.
camera.position.set(START.x + CAM_OFFSET.x, CAM_OFFSET.y, START.z + CAM_OFFSET.z);
camTarget.copy(START);
camera.lookAt(camTarget);

// ---- Resize ----------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Main loop -------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 1 / 30);

  // Sub-step physics for stability at high speeds.
  const sub = 4;
  for (let i = 0; i < sub; i++) stepPhysics(dt / sub);

  // Animate the flag waving.
  const t = performance.now() * 0.004;
  cloth.position.x = 0.55 + Math.sin(t) * 0.05;
  cloth.rotation.y = Math.sin(t) * 0.25;

  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// Remove the placeholder element if present.
document.querySelector("#app")?.remove();
