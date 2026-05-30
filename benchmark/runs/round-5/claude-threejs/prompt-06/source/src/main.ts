import "./style.css";
import * as THREE from "three";

/* ------------------------------------------------------------------ *
 *  Mini-Golf Hole
 *  - Flat green with one obstacle and a cup (the "hole")
 *  - Ball with simple rolling physics (velocity + friction + bounces)
 *  - Click / drag to aim toward a point, release to shoot (power = drag)
 *  - Stroke counter HUD
 *  - Camera smoothly follows the ball
 * ------------------------------------------------------------------ */

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

// --- Renderer -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene & Camera -------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b6e8);
scene.fog = new THREE.Fog(0x87b6e8, 30, 70);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 9, 14);

// --- Lights ---------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5f2a, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(10, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
scene.add(sun);

// --- Course dimensions ---------------------------------------------
const HALF_W = 7; // half width  (x)
const HALF_L = 11; // half length (z)
const WALL_H = 0.9;
const WALL_T = 0.5;
const BALL_R = 0.45;

// --- Green (the flat putting surface) ------------------------------
const green = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2),
  new THREE.MeshStandardMaterial({ color: 0x3fa14a, roughness: 1 })
);
green.rotation.x = -Math.PI / 2;
green.receiveShadow = true;
scene.add(green);

// Subtle darker stripe pattern for depth (decorative, non-colliding)
for (let i = 0; i < 6; i++) {
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2 / 12),
    new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? 0x46ad52 : 0x3a9646,
      roughness: 1,
    })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.002, -HALF_L + (i * 2 + 1) * (HALF_L * 2 / 12));
  stripe.receiveShadow = true;
  scene.add(stripe);
}

// Ground apron around the green
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 1 })
);
apron.rotation.x = -Math.PI / 2;
apron.position.y = -0.05;
apron.receiveShadow = true;
scene.add(apron);

// --- Boundary walls -------------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
function makeWall(w: number, d: number, x: number, z: number) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  wall.position.set(x, WALL_H / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}
makeWall(HALF_W * 2 + WALL_T * 2, WALL_T, 0, -HALF_L - WALL_T / 2); // far
makeWall(HALF_W * 2 + WALL_T * 2, WALL_T, 0, HALF_L + WALL_T / 2); // near
makeWall(WALL_T, HALF_L * 2 + WALL_T * 2, -HALF_W - WALL_T / 2, 0); // left
makeWall(WALL_T, HALF_L * 2 + WALL_T * 2, HALF_W + WALL_T / 2, 0); // right

// --- Obstacle (one) -------------------------------------------------
// A solid block the ball must navigate around / bounce off.
const OBST = { x: 0, z: -1, hx: 2.4, hz: 0.6 }; // center + half extents (XZ)
const obstacle = new THREE.Mesh(
  new THREE.BoxGeometry(OBST.hx * 2, 1.4, OBST.hz * 2),
  new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6, metalness: 0.1 })
);
obstacle.position.set(OBST.x, 0.7, OBST.z);
obstacle.castShadow = true;
obstacle.receiveShadow = true;
scene.add(obstacle);

// --- Hole / cup + flag ---------------------------------------------
const HOLE = new THREE.Vector3(0, 0, -HALF_L + 2.2);
const HOLE_R = 0.7;

const cup = new THREE.Mesh(
  new THREE.CircleGeometry(HOLE_R, 32),
  new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 })
);
cup.rotation.x = -Math.PI / 2;
cup.position.set(HOLE.x, 0.01, HOLE.z);
scene.add(cup);

// Flag pole + flag
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.05, 3, 12),
  new THREE.MeshStandardMaterial({ color: 0xffffff })
);
pole.position.set(HOLE.x, 1.5, HOLE.z);
pole.castShadow = true;
scene.add(pole);

const flag = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 0.7),
  new THREE.MeshStandardMaterial({ color: 0xffd400, side: THREE.DoubleSide })
);
flag.position.set(HOLE.x + 0.6, 2.6, HOLE.z);
scene.add(flag);

// --- Ball -----------------------------------------------------------
const START = new THREE.Vector3(0, BALL_R, HALF_L - 2);
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 })
);
ball.position.copy(START);
ball.castShadow = true;
scene.add(ball);

const velocity = new THREE.Vector2(0, 0); // XZ-plane velocity
const FRICTION = 1.4; // units/s^2 deceleration
const STOP_SPEED = 0.25;
const MAX_SHOT_SPEED = 16;
let holed = false;

// --- Aim arrow ------------------------------------------------------
const aimArrow = new THREE.ArrowHelper(
  new THREE.Vector3(0, 0, -1),
  ball.position.clone(),
  0,
  0xffe600,
  0.7,
  0.5
);
aimArrow.visible = false;
scene.add(aimArrow);

// --- HUD ------------------------------------------------------------
const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <div class="score">Strokes: <span id="strokes">0</span></div>
  <div class="par">Par 3</div>
  <div class="hint" id="hint">Click &amp; drag from the ball toward your target, then release to shoot.</div>
`;
app.appendChild(hud);
const strokesEl = hud.querySelector<HTMLSpanElement>("#strokes")!;
const hintEl = hud.querySelector<HTMLDivElement>("#hint")!;
let strokes = 0;

const banner = document.createElement("div");
banner.className = "banner hidden";
app.appendChild(banner);

// --- Input: click-to-aim-and-shoot ---------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
let aiming = false;
const aimDir = new THREE.Vector3();
let aimPower = 0; // 0..1

function pointerToGround(ev: PointerEvent): boolean {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, hitPoint) !== null;
}

function ballIsResting(): boolean {
  return velocity.length() < STOP_SPEED;
}

function updateAim() {
  const dx = hitPoint.x - ball.position.x;
  const dz = hitPoint.z - ball.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) {
    aimPower = 0;
    aimArrow.visible = false;
    return;
  }
  aimDir.set(dx / dist, 0, dz / dist);
  aimPower = Math.min(dist / 7, 1); // 7 units of drag == full power
  aimArrow.position.copy(ball.position);
  aimArrow.setDirection(aimDir);
  aimArrow.setLength(0.8 + aimPower * 4.5, 0.7, 0.5);
  aimArrow.setColor(new THREE.Color().setHSL(0.33 - aimPower * 0.33, 1, 0.5));
  aimArrow.visible = true;
}

renderer.domElement.addEventListener("pointerdown", (ev) => {
  if (holed || !ballIsResting()) return;
  if (!pointerToGround(ev)) return;
  aiming = true;
  updateAim();
});

renderer.domElement.addEventListener("pointermove", (ev) => {
  if (!aiming) return;
  if (pointerToGround(ev)) updateAim();
});

function shoot() {
  if (!aiming) return;
  aiming = false;
  aimArrow.visible = false;
  if (aimPower <= 0.02) return;
  const speed = aimPower * MAX_SHOT_SPEED;
  velocity.set(aimDir.x * speed, aimDir.z * speed);
  strokes += 1;
  strokesEl.textContent = String(strokes);
  hintEl.textContent = "Watch it roll…";
}

renderer.domElement.addEventListener("pointerup", shoot);
renderer.domElement.addEventListener("pointerleave", shoot);

// --- Physics helpers ------------------------------------------------
function clampToWalls() {
  const minX = -HALF_W + BALL_R;
  const maxX = HALF_W - BALL_R;
  const minZ = -HALF_L + BALL_R;
  const maxZ = HALF_L - BALL_R;
  if (ball.position.x < minX) { ball.position.x = minX; velocity.x = Math.abs(velocity.x) * 0.7; }
  if (ball.position.x > maxX) { ball.position.x = maxX; velocity.x = -Math.abs(velocity.x) * 0.7; }
  if (ball.position.z < minZ) { ball.position.z = minZ; velocity.y = Math.abs(velocity.y) * 0.7; }
  if (ball.position.z > maxZ) { ball.position.z = maxZ; velocity.y = -Math.abs(velocity.y) * 0.7; }
}

function collideObstacle() {
  // Circle (ball) vs expanded AABB (obstacle) in XZ.
  const ex = OBST.hx + BALL_R;
  const ez = OBST.hz + BALL_R;
  const rx = ball.position.x - OBST.x;
  const rz = ball.position.z - OBST.z;
  if (Math.abs(rx) >= ex || Math.abs(rz) >= ez) return; // outside
  // Penetration depth on each axis -> resolve along the shallower one.
  const px = ex - Math.abs(rx);
  const pz = ez - Math.abs(rz);
  if (px < pz) {
    ball.position.x = OBST.x + Math.sign(rx || 1) * ex;
    velocity.x = -velocity.x * 0.7;
  } else {
    ball.position.z = OBST.z + Math.sign(rz || 1) * ez;
    velocity.y = -velocity.y * 0.7;
  }
}

function checkHole(dt: number) {
  if (holed) return;
  const dx = ball.position.x - HOLE.x;
  const dz = ball.position.z - HOLE.z;
  const d = Math.hypot(dx, dz);
  const speed = velocity.length();
  // Must be near the cup and not blasting past it.
  if (d < HOLE_R * 0.85 && speed < 7) {
    holed = true;
    velocity.set(0, 0);
    // Drop the ball into the cup over a moment.
    sinkStart = elapsed;
  }
}

let sinkStart = -1;
let elapsed = 0;

// --- Camera follow --------------------------------------------------
const camOffset = new THREE.Vector3(0, 7.5, 11);
const camTarget = new THREE.Vector3();
const desiredCam = new THREE.Vector3();

// --- Loop -----------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (!holed) {
    const speed = velocity.length();
    if (speed > 0) {
      // apply friction
      const drop = FRICTION * dt;
      const ns = Math.max(0, speed - drop);
      velocity.multiplyScalar(speed > 0 ? ns / speed : 0);
    }
    // integrate
    ball.position.x += velocity.x * dt;
    ball.position.z += velocity.y * dt;
    ball.position.y = BALL_R;

    clampToWalls();
    collideObstacle();
    checkHole(dt);

    // rolling rotation for visual feedback
    if (velocity.length() > 0.001) {
      const axis = new THREE.Vector3(velocity.y, 0, -velocity.x).normalize();
      const ang = (velocity.length() * dt) / BALL_R;
      ball.rotateOnWorldAxis(axis, ang);
    }

    if (velocity.length() < STOP_SPEED && velocity.length() > 0) {
      velocity.set(0, 0);
      if (!aiming && strokes > 0) hintEl.textContent = "Aim your next shot.";
    }
  } else if (sinkStart >= 0) {
    // sink animation
    const t = Math.min((elapsed - sinkStart) / 0.4, 1);
    ball.position.x = HOLE.x;
    ball.position.z = HOLE.z;
    ball.position.y = BALL_R - t * (BALL_R + 0.2);
    if (t >= 1 && banner.classList.contains("hidden")) {
      banner.classList.remove("hidden");
      const word = strokes <= 1 ? "Hole in one!" :
        strokes <= 3 ? "Nice — in the cup!" : "Holed out!";
      banner.innerHTML = `${word}<br><span>${strokes} stroke${strokes === 1 ? "" : "s"}</span><br><button id="again">Play again</button>`;
      banner.querySelector<HTMLButtonElement>("#again")!.addEventListener("click", resetGame);
    }
  }

  // flag wave
  flag.rotation.y = Math.sin(elapsed * 2) * 0.25;

  // Camera follows the ball.
  camTarget.copy(ball.position);
  desiredCam.copy(ball.position).add(camOffset);
  camera.position.lerp(desiredCam, 1 - Math.pow(0.001, dt));
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

function resetGame() {
  ball.position.copy(START);
  ball.rotation.set(0, 0, 0);
  velocity.set(0, 0);
  holed = false;
  sinkStart = -1;
  strokes = 0;
  strokesEl.textContent = "0";
  hintEl.textContent = "Click & drag from the ball toward your target, then release to shoot.";
  banner.classList.add("hidden");
}

// --- Resize ---------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
