import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------------------------------------------------------------------------
// Physics playground: 50 falling cubes onto a tilted ramp.
//
// three.js ships no physics engine, so this implements a small, dedicated
// rigid-body step: cubes are simulated as bounding spheres (gravity +
// restitution + friction), collided against the ground, an oriented ramp
// (sphere-vs-OBB) and each other (sphere-vs-sphere). Each cube is rendered as
// a real box so the pile reads as cubes resting on the ramp. The number of
// active contacts resolved per frame drives the live overlay.
// ---------------------------------------------------------------------------

const CUBE_COUNT = 50;
const CUBE_SIZE = 0.7;
const CUBE_RADIUS = CUBE_SIZE * 0.5; // inscribed sphere proxy for collisions
const GRAVITY = -22;
const RESTITUTION = 0.32; // bounciness
const FRICTION = 0.86; // tangential velocity retained per contact
const SLEEP_SPEED = 0.18; // below this, damp rotation so cubes settle
const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 6;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

// --- Renderer --------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene & camera --------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1018);
scene.fog = new THREE.Fog(0x0a1018, 45, 90);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(16, 12, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 2.5, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 8;
controls.maxDistance = 70;
controls.update();

// --- Lighting --------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x9fc6ff, 0x202830, 1.0));

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -25;
sc.right = 25;
sc.top = 25;
sc.bottom = -25;
sc.updateProjectionMatrix();
scene.add(sun);

// --- Ground ----------------------------------------------------------------
const GROUND_Y = 0;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x141c26, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(120, 60, 0x2a3a4d, 0x1a2531);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
grid.position.y = GROUND_Y + 0.01;
scene.add(grid);

// --- Tilted ramp (oriented box) -------------------------------------------
const RAMP_TILT = THREE.MathUtils.degToRad(24); // tilt about Z so cubes slide
const RAMP_HALF = new THREE.Vector3(9, 0.4, 9); // half-extents
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_HALF.x * 2, RAMP_HALF.y * 2, RAMP_HALF.z * 2),
  new THREE.MeshStandardMaterial({ color: 0x3d6ea5, roughness: 0.5, metalness: 0.15 }),
);
ramp.position.set(0, 5, 0);
ramp.rotation.z = RAMP_TILT;
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

// Cache ramp world transform / basis for collision (static, computed once).
ramp.updateMatrixWorld(true);
const rampInv = ramp.matrixWorld.clone().invert();
const rampQuat = ramp.quaternion.clone();

// --- Cubes -----------------------------------------------------------------
interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  angVel: THREE.Vector3;
  contacts: number; // contacts touching this body this frame
}

const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const palette = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xc77dff, 0xff9f1c];
const cubeMesh = new THREE.InstancedMesh(
  cubeGeo,
  new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }),
  CUBE_COUNT,
);
cubeMesh.castShadow = true;
cubeMesh.receiveShadow = true;
cubeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(cubeMesh);

const color = new THREE.Color();
for (let i = 0; i < CUBE_COUNT; i++) {
  color.setHex(palette[i % palette.length]);
  cubeMesh.setColorAt(i, color);
}

const bodies: Body[] = [];
for (let i = 0; i < CUBE_COUNT; i++) {
  bodies.push({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    angVel: new THREE.Vector3(),
    contacts: 0,
  });
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function resetSimulation(): void {
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    // Stagger cubes high above the upper edge of the ramp so they rain down.
    b.pos.set(rand(-6, 4), rand(14, 30), rand(-5, 5));
    b.vel.set(rand(-1, 1), rand(-2, 0), rand(-1, 1));
    b.quat.setFromEuler(
      new THREE.Euler(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI)),
    );
    b.angVel.set(rand(-3, 3), rand(-3, 3), rand(-3, 3));
    b.contacts = 0;
  }
}
resetSimulation();

// --- Collision helpers -----------------------------------------------------
const _local = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _tmp = new THREE.Vector3();

// Sphere (world center, radius) vs the oriented ramp box. Resolves position
// and velocity in place; returns true on contact.
function collideRamp(b: Body): boolean {
  _local.copy(b.pos).applyMatrix4(rampInv); // into ramp local space
  _closest.set(
    THREE.MathUtils.clamp(_local.x, -RAMP_HALF.x, RAMP_HALF.x),
    THREE.MathUtils.clamp(_local.y, -RAMP_HALF.y, RAMP_HALF.y),
    THREE.MathUtils.clamp(_local.z, -RAMP_HALF.z, RAMP_HALF.z),
  );
  _delta.copy(_local).sub(_closest);
  let dist = _delta.length();

  if (dist > CUBE_RADIUS) return false;

  if (dist > 1e-5) {
    _normal.copy(_delta).divideScalar(dist);
  } else {
    // Center inside the box: push out along the least-penetrating face.
    const dx = RAMP_HALF.x - Math.abs(_local.x);
    const dy = RAMP_HALF.y - Math.abs(_local.y);
    const dz = RAMP_HALF.z - Math.abs(_local.z);
    if (dx <= dy && dx <= dz) _normal.set(Math.sign(_local.x) || 1, 0, 0);
    else if (dy <= dz) _normal.set(0, Math.sign(_local.y) || 1, 0);
    else _normal.set(0, 0, Math.sign(_local.z) || 1);
    dist = 0;
  }

  // Normal from ramp-local to world (rotation only).
  _normal.applyQuaternion(rampQuat).normalize();

  const penetration = CUBE_RADIUS - dist;
  b.pos.addScaledVector(_normal, penetration);

  const vn = b.vel.dot(_normal);
  if (vn < 0) {
    // Remove normal component (with restitution), damp tangential (friction).
    _tmp.copy(_normal).multiplyScalar(vn);
    b.vel.sub(_tmp); // tangential part
    b.vel.multiplyScalar(FRICTION);
    b.vel.addScaledVector(_normal, -vn * RESTITUTION);
  }
  return true;
}

function collideGround(b: Body): boolean {
  const floor = GROUND_Y + CUBE_RADIUS;
  if (b.pos.y >= floor) return false;
  b.pos.y = floor;
  if (b.vel.y < 0) {
    b.vel.x *= FRICTION;
    b.vel.z *= FRICTION;
    b.vel.y = -b.vel.y * RESTITUTION;
  }
  return true;
}

const _diff = new THREE.Vector3();
// Sphere-sphere resolution between two cubes. Returns true if in contact.
function collidePair(a: Body, b: Body): boolean {
  _diff.copy(b.pos).sub(a.pos);
  const minDist = CUBE_RADIUS * 2;
  const d2 = _diff.lengthSq();
  if (d2 >= minDist * minDist || d2 < 1e-9) return false;

  const d = Math.sqrt(d2);
  _diff.divideScalar(d); // contact normal a -> b
  const overlap = minDist - d;

  // Positional correction split evenly.
  a.pos.addScaledVector(_diff, -overlap * 0.5);
  b.pos.addScaledVector(_diff, overlap * 0.5);

  // Relative velocity along the normal.
  _tmp.copy(b.vel).sub(a.vel);
  const vn = _tmp.dot(_diff);
  if (vn < 0) {
    const j = -(1 + RESTITUTION) * vn * 0.5; // equal-mass impulse
    a.vel.addScaledVector(_diff, -j);
    b.vel.addScaledVector(_diff, j);
  }
  return true;
}

// --- Simulation step -------------------------------------------------------
const _spin = new THREE.Quaternion();
const _euler = new THREE.Euler();

function step(dt: number): void {
  for (let i = 0; i < CUBE_COUNT; i++) bodies[i].contacts = 0;

  // Integrate.
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    b.vel.y += GRAVITY * dt;
    b.pos.addScaledVector(b.vel, dt);
    // Integrate orientation from angular velocity.
    _euler.set(b.angVel.x * dt, b.angVel.y * dt, b.angVel.z * dt);
    _spin.setFromEuler(_euler);
    b.quat.premultiply(_spin).normalize();
  }

  // Cube vs cube.
  for (let i = 0; i < CUBE_COUNT; i++) {
    for (let j = i + 1; j < CUBE_COUNT; j++) {
      if (collidePair(bodies[i], bodies[j])) {
        bodies[i].contacts++;
        bodies[j].contacts++;
      }
    }
  }

  // Cube vs static geometry.
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    if (collideRamp(b)) b.contacts++;
    if (collideGround(b)) b.contacts++;
    // Damp angular velocity when nearly at rest so cubes settle.
    if (b.contacts > 0 && b.vel.lengthSq() < SLEEP_SPEED * SLEEP_SPEED) {
      b.angVel.multiplyScalar(0.6);
    }
  }
}

// --- HUD overlay -----------------------------------------------------------
const hud = document.createElement("div");
hud.className = "hud";
hud.innerHTML = `
  <div class="hud-title">Physics Playground</div>
  <div class="hud-row"><span>Cubes</span><b>${CUBE_COUNT}</b></div>
  <div class="hud-row"><span>Live contacts</span><b id="contact-count">0</b></div>
  <button id="reset-btn">Reset</button>
  <div class="hud-hint">Drag to orbit &middot; scroll to zoom</div>
`;
app.appendChild(hud);

const contactEl = document.getElementById("contact-count")!;
document.getElementById("reset-btn")!.addEventListener("click", () => {
  resetSimulation();
  controls.target.set(0, 2.5, 0);
});

// --- Main loop -------------------------------------------------------------
const _mat = new THREE.Matrix4();
const _scl = new THREE.Vector3(1, 1, 1);
const clock = new THREE.Clock();
let accumulator = 0;

function animate(): void {
  let frameDt = clock.getDelta();
  if (frameDt > 0.1) frameDt = 0.1; // avoid spiral after tab switch
  accumulator += frameDt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_SUBSTEPS) accumulator = 0; // shed backlog

  // Count total contacts (each contact pair counted once) for the overlay.
  let total = 0;
  for (let i = 0; i < CUBE_COUNT; i++) total += bodies[i].contacts;
  contactEl.textContent = String(total);

  // Push transforms to the instanced mesh.
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    _mat.compose(b.pos, b.quat, _scl);
    cubeMesh.setMatrixAt(i, _mat);
  }
  cubeMesh.instanceMatrix.needsUpdate = true;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// --- Resize ----------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
