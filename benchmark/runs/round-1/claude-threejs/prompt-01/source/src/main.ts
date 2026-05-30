// Physics Playground — 50 falling cubes onto a tilted ramp.
//
// No physics library is bundled with this benchmark, so the rigid-body
// simulation is implemented procedurally on top of three.js:
//   - Cubes are dynamic rigid bodies (position, orientation, linear &
//     angular velocity). A cube has isotropic inertia, so its inverse
//     inertia tensor is a single scalar regardless of orientation.
//   - Static colliders (ground, ramp, four boundary walls) are oriented
//     boxes (OBBs). Each dynamic cube collides via its 8 corners against
//     every static OBB (point-vs-OBB -> minimum-penetration axis).
//   - Cube-vs-cube collision is approximated with bounding spheres so the
//     cubes can pile up without tunnelling.
//   - Contacts are resolved with a sequential-impulse solver (restitution
//     + Coulomb friction + Baumgarte positional bias).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const CUBE_COUNT = 50;
const GRAVITY = new THREE.Vector3(0, -22, 0);
const SUBSTEPS = 4;
const SOLVER_ITERATIONS = 10;
const RESTITUTION = 0.18;
const FRICTION = 0.45;
const BAUMGARTE = 0.2; // positional correction factor
const PENETRATION_SLOP = 0.005;
const MAX_FRAME_DT = 1 / 30;

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141c);
scene.fog = new THREE.Fog(0x10141c, 38, 90);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(17, 13, 21);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(2, 2, 0);
controls.maxPolarAngle = Math.PI * 0.495; // stay above the floor
controls.minDistance = 8;
controls.maxDistance = 70;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x202028, 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(14, 24, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
sun.shadow.bias = -0.0002;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x7790ff, 0.5);
fill.position.set(-12, 8, -10);
scene.add(fill);

// ---------------------------------------------------------------------------
// Rigid body model
// ---------------------------------------------------------------------------
class Body {
  isStatic: boolean;
  position = new THREE.Vector3();
  quaternion = new THREE.Quaternion();
  velocity = new THREE.Vector3();
  angularVelocity = new THREE.Vector3();
  invMass = 0;
  invInertia = 0; // scalar (cubes are isotropic)
  half = new THREE.Vector3(0.5, 0.5, 0.5); // half-extents (OBB)
  radius = 0; // bounding sphere radius (cube-cube)
  mesh: THREE.Object3D | null = null;

  constructor(isStatic: boolean) {
    this.isStatic = isStatic;
  }
}

// Scratch vectors (avoid per-frame allocation in hot paths).
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
const _invQ = new THREE.Quaternion();

// Velocity of a body at world-space lever arm r (r = contactPoint - center).
function velocityAt(b: Body, r: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.crossVectors(b.angularVelocity, r).add(b.velocity);
  return out;
}

function applyImpulse(b: Body, impulse: THREE.Vector3, r: THREE.Vector3, sign: number) {
  if (b.isStatic) return;
  b.velocity.addScaledVector(impulse, sign * b.invMass);
  _tmpC.crossVectors(r, impulse).multiplyScalar(sign * b.invInertia);
  b.angularVelocity.add(_tmpC);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
interface Contact {
  a: Body;
  b: Body;
  ra: THREE.Vector3; // contact - a.center
  rb: THREE.Vector3; // contact - b.center
  normal: THREE.Vector3; // unit, points from b toward a
  penetration: number;
  normalMass: number;
  restitutionBias: number; // target bounce velocity
  nImpulse: number;
  tImpulse: number;
}

// Effective mass of a constraint along axis n with lever arms ra/rb.
function effectiveMass(a: Body, b: Body, ra: THREE.Vector3, rb: THREE.Vector3, n: THREE.Vector3): number {
  let k = a.invMass + b.invMass;
  _tmpA.crossVectors(ra, n);
  k += a.invInertia * _tmpA.lengthSq();
  _tmpB.crossVectors(rb, n);
  k += b.invInertia * _tmpB.lengthSq();
  return k;
}

function buildContact(
  a: Body,
  b: Body,
  contactPoint: THREE.Vector3,
  normal: THREE.Vector3,
  penetration: number,
): Contact {
  const ra = new THREE.Vector3().subVectors(contactPoint, a.position);
  const rb = new THREE.Vector3().subVectors(contactPoint, b.position);

  const normalMass = effectiveMass(a, b, ra, rb, normal);

  // Relative velocity along the normal at contact (for restitution).
  const va = velocityAt(a, ra, _tmpA);
  const vb = velocityAt(b, rb, _tmpB);
  const relVn = _tmpC.subVectors(va, vb).dot(normal);
  const restitutionBias = relVn < -1.0 ? -RESTITUTION * relVn : 0;

  return {
    a,
    b,
    ra,
    rb,
    normal: normal.clone(),
    penetration,
    normalMass,
    restitutionBias,
    nImpulse: 0,
    tImpulse: 0,
  };
}

// Point vs oriented box. If `point` is inside box `b`, push the dynamic body
// `a` out along the minimum-penetration axis.
function pointVsOBB(a: Body, point: THREE.Vector3, b: Body, contacts: Contact[]) {
  _invQ.copy(b.quaternion).invert();
  const local = _tmpA.subVectors(point, b.position).applyQuaternion(_invQ);

  const px = b.half.x - Math.abs(local.x);
  if (px <= 0) return;
  const py = b.half.y - Math.abs(local.y);
  if (py <= 0) return;
  const pz = b.half.z - Math.abs(local.z);
  if (pz <= 0) return;

  const nLocal = _tmpB.set(0, 0, 0);
  let penetration: number;
  if (px <= py && px <= pz) {
    nLocal.x = local.x < 0 ? -1 : 1;
    penetration = px;
  } else if (py <= pz) {
    nLocal.y = local.y < 0 ? -1 : 1;
    penetration = py;
  } else {
    nLocal.z = local.z < 0 ? -1 : 1;
    penetration = pz;
  }

  const normal = nLocal.applyQuaternion(b.quaternion).normalize(); // world, b->a
  contacts.push(buildContact(a, b, point.clone(), normal, penetration));
}

// Sphere-approximated cube-vs-cube contact.
function sphereVsSphere(a: Body, b: Body, contacts: Contact[]) {
  const delta = _tmpA.subVectors(a.position, b.position);
  const distSq = delta.lengthSq();
  const r = a.radius + b.radius;
  if (distSq >= r * r || distSq < 1e-9) return;

  const dist = Math.sqrt(distSq);
  const normal = delta.multiplyScalar(1 / dist); // b -> a
  const penetration = r - dist;
  // Contact point on the surface between the two spheres.
  const contactPoint = _tmpB
    .copy(b.position)
    .addScaledVector(normal, b.radius + 0.5 * (a.radius - b.radius));
  contacts.push(buildContact(a, b, contactPoint.clone(), normal.clone(), penetration));
}

// ---------------------------------------------------------------------------
// World setup (static colliders + meshes)
// ---------------------------------------------------------------------------
const statics: Body[] = [];
const cubes: Body[] = [];

function makeStaticBox(
  size: THREE.Vector3,
  position: THREE.Vector3,
  euler: THREE.Euler,
  material: THREE.Material,
  visible = true,
): Body {
  const body = new Body(true);
  body.half.copy(size).multiplyScalar(0.5);
  body.position.copy(position);
  body.quaternion.setFromEuler(euler);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.quaternion.copy(body.quaternion);
  mesh.castShadow = visible;
  mesh.receiveShadow = visible;
  mesh.visible = visible;
  body.mesh = mesh;
  scene.add(mesh);

  statics.push(body);
  return body;
}

// Ground.
makeStaticBox(
  new THREE.Vector3(44, 1, 44),
  new THREE.Vector3(0, -0.5, 0),
  new THREE.Euler(0, 0, 0),
  new THREE.MeshStandardMaterial({ color: 0x2b3242, roughness: 0.95, metalness: 0.0 }),
);

// Reference grid on the floor.
const grid = new THREE.GridHelper(44, 44, 0x55617a, 0x39425a);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.5;
grid.position.y = 0.02;
scene.add(grid);

// Tilted ramp — clearly visible, ~24 degree tilt about the Z axis.
const RAMP_TILT = THREE.MathUtils.degToRad(24);
makeStaticBox(
  new THREE.Vector3(13, 0.6, 9),
  new THREE.Vector3(-2, 3.6, 0),
  new THREE.Euler(0, 0, RAMP_TILT),
  new THREE.MeshStandardMaterial({
    color: 0xc7732f,
    roughness: 0.65,
    metalness: 0.05,
    emissive: 0x3a1d05,
    emissiveIntensity: 0.45,
  }),
);

// Four low boundary walls corral the pile so the scene stays readable.
const WALL_H = 2.4;
const WALL_T = 0.6;
const WALL_SPAN = 22;
const wallMatColor = 0x394056;
const wallMat = () =>
  new THREE.MeshStandardMaterial({
    color: wallMatColor,
    roughness: 0.9,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  });
const wallY = WALL_H / 2;
const halfSpan = WALL_SPAN / 2;
makeStaticBox(new THREE.Vector3(WALL_SPAN, WALL_H, WALL_T), new THREE.Vector3(0, wallY, -halfSpan), new THREE.Euler(), wallMat());
makeStaticBox(new THREE.Vector3(WALL_SPAN, WALL_H, WALL_T), new THREE.Vector3(0, wallY, halfSpan), new THREE.Euler(), wallMat());
makeStaticBox(new THREE.Vector3(WALL_T, WALL_H, WALL_SPAN), new THREE.Vector3(-halfSpan, wallY, 0), new THREE.Euler(), wallMat());
makeStaticBox(new THREE.Vector3(WALL_T, WALL_H, WALL_SPAN), new THREE.Vector3(halfSpan, wallY, 0), new THREE.Euler(), wallMat());

// ---------------------------------------------------------------------------
// Cubes
// ---------------------------------------------------------------------------
// Unit local corner offsets (multiplied by half-extents per cube).
const CORNER_SIGNS: [number, number, number][] = [
  [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

// A tiny seeded RNG so the layout is reproducible between resets but varied.
let seed = 1337;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
}
function rand(min: number, max: number): number {
  return min + (max - min) * rnd();
}

function createCubes() {
  for (let i = 0; i < CUBE_COUNT; i++) {
    const body = new Body(false);
    const s = rand(0.7, 1.15); // edge length
    const h = s / 2;
    body.half.set(h, h, h);
    body.radius = h; // inscribed sphere for cube-cube contacts

    const mass = s * s * s;
    body.invMass = 1 / mass;
    // Cube inertia I = (1/6) m s^2  ->  invInertia = 6 / (m s^2).
    body.invInertia = 6 / (mass * s * s);

    const color = new THREE.Color().setHSL(rand(0, 1), 0.62, 0.55);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
    const mesh = new THREE.Mesh(cubeGeo, mat);
    mesh.scale.set(s, s, s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.mesh = mesh;
    scene.add(mesh);

    cubes.push(body);
  }
}

function resetCubes() {
  seed = 1337;
  for (let i = 0; i < cubes.length; i++) {
    const body = cubes[i];
    // Stack the spawn cloud above the high (left) end of the ramp.
    const col = i % 5;
    const row = Math.floor(i / 5) % 5;
    const layer = Math.floor(i / 25);
    body.position.set(
      -6 + col * 1.5 + rand(-0.25, 0.25),
      9 + layer * 3 + row * 0.15 + rand(0, 0.4),
      -3 + row * 1.5 + rand(-0.25, 0.25),
    );
    body.quaternion.setFromEuler(
      new THREE.Euler(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI)),
    );
    body.velocity.set(rand(-1, 1), rand(-2, 0), rand(-1, 1));
    body.angularVelocity.set(rand(-3, 3), rand(-3, 3), rand(-3, 3));
    syncMesh(body);
  }
}

function syncMesh(body: Body) {
  if (!body.mesh) return;
  body.mesh.position.copy(body.position);
  body.mesh.quaternion.copy(body.quaternion);
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------
const _corner = new THREE.Vector3();
const _impulse = new THREE.Vector3();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _tangentVel = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _spin = new THREE.Quaternion();

let liveContacts = 0;

function generateContacts(): Contact[] {
  const contacts: Contact[] = [];

  // Cube corners vs static OBBs.
  for (const cube of cubes) {
    for (const sign of CORNER_SIGNS) {
      _corner.set(sign[0] * cube.half.x, sign[1] * cube.half.y, sign[2] * cube.half.z);
      _corner.applyQuaternion(cube.quaternion).add(cube.position);
      for (const s of statics) {
        pointVsOBB(cube, _corner, s, contacts);
      }
    }
  }

  // Cube vs cube (sphere approximation).
  for (let i = 0; i < cubes.length; i++) {
    for (let j = i + 1; j < cubes.length; j++) {
      sphereVsSphere(cubes[i], cubes[j], contacts);
    }
  }

  return contacts;
}

function solveContact(c: Contact, invDt: number) {
  const { a, b, ra, rb, normal } = c;

  // --- Normal impulse ---
  const va = velocityAt(a, ra, _va);
  const vb = velocityAt(b, rb, _vb);
  _rel.subVectors(va, vb);
  const vn = _rel.dot(normal);

  const bias = (BAUMGARTE * invDt) * Math.max(c.penetration - PENETRATION_SLOP, 0);
  const target = c.restitutionBias + bias;
  let lambda = (target - vn) / c.normalMass;

  const oldN = c.nImpulse;
  c.nImpulse = Math.max(0, oldN + lambda);
  lambda = c.nImpulse - oldN;

  _impulse.copy(normal).multiplyScalar(lambda);
  applyImpulse(a, _impulse, ra, 1);
  applyImpulse(b, _impulse, rb, -1);

  // --- Friction impulse ---
  const va2 = velocityAt(a, ra, _va);
  const vb2 = velocityAt(b, rb, _vb);
  _rel.subVectors(va2, vb2);
  _tangentVel.copy(_rel).addScaledVector(normal, -_rel.dot(normal));
  const tvLen = _tangentVel.length();
  if (tvLen > 1e-6) {
    _tangent.copy(_tangentVel).multiplyScalar(1 / tvLen);
    const tMass = effectiveMass(a, b, ra, rb, _tangent);
    let lambdaT = -_rel.dot(_tangent) / tMass;

    const maxF = FRICTION * c.nImpulse;
    const oldT = c.tImpulse;
    c.tImpulse = THREE.MathUtils.clamp(oldT + lambdaT, -maxF, maxF);
    lambdaT = c.tImpulse - oldT;

    _impulse.copy(_tangent).multiplyScalar(lambdaT);
    applyImpulse(a, _impulse, ra, 1);
    applyImpulse(b, _impulse, rb, -1);
  }
}

function integrate(dt: number) {
  for (const cube of cubes) {
    cube.velocity.addScaledVector(GRAVITY, dt);
  }

  const contacts = generateContacts();
  liveContacts = contacts.length;

  const invDt = dt > 0 ? 1 / dt : 0;
  for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
    for (const c of contacts) solveContact(c, invDt);
  }

  for (const cube of cubes) {
    // Linear damping for stability.
    cube.velocity.multiplyScalar(0.999);
    cube.angularVelocity.multiplyScalar(0.995);

    cube.position.addScaledVector(cube.velocity, dt);

    // Integrate orientation: q += 0.5 * (w as quat) * q * dt.
    _spin.set(cube.angularVelocity.x, cube.angularVelocity.y, cube.angularVelocity.z, 0);
    _dq.multiplyQuaternions(_spin, cube.quaternion);
    cube.quaternion.x += 0.5 * _dq.x * dt;
    cube.quaternion.y += 0.5 * _dq.y * dt;
    cube.quaternion.z += 0.5 * _dq.z * dt;
    cube.quaternion.w += 0.5 * _dq.w * dt;
    cube.quaternion.normalize();
  }
}

function step(frameDt: number) {
  const dt = Math.min(frameDt, MAX_FRAME_DT) / SUBSTEPS;
  if (dt <= 0) return;
  for (let s = 0; s < SUBSTEPS; s++) {
    integrate(dt);
  }
  for (const cube of cubes) syncMesh(cube);
}

// ---------------------------------------------------------------------------
// HUD / overlay
// ---------------------------------------------------------------------------
const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <div class="title">Physics Playground</div>
  <div class="row"><span>Cubes</span><b id="cubeCount">${CUBE_COUNT}</b></div>
  <div class="row"><span>Live contacts</span><b id="contactCount">0</b></div>
  <div class="row"><span>FPS</span><b id="fps">--</b></div>
  <button id="resetBtn">Reset (R)</button>
  <div class="hint">Drag to orbit · scroll to zoom · right-drag to pan</div>
`;
app.appendChild(hud);

const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: #10141c;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  #app { position: fixed; inset: 0; }
  canvas { display: block; }
  #hud {
    position: fixed; top: 16px; left: 16px; z-index: 10;
    min-width: 220px; padding: 16px 18px;
    background: rgba(16, 20, 28, 0.82);
    border: 1px solid rgba(120, 140, 190, 0.35);
    border-radius: 12px;
    color: #dfe6f5; backdrop-filter: blur(8px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.45);
    user-select: none;
  }
  #hud .title { font-size: 15px; font-weight: 700; letter-spacing: 0.4px;
    margin-bottom: 12px; color: #ffd9a8; }
  #hud .row { display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; padding: 3px 0; color: #aab4cc; }
  #hud .row b { color: #ffffff; font-variant-numeric: tabular-nums; font-size: 14px; }
  #hud #contactCount { color: #7dff9b; }
  #hud button {
    margin-top: 12px; width: 100%; padding: 9px 12px;
    font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
    color: #10141c; background: #ffd9a8; border: none; border-radius: 8px;
    transition: transform 0.06s ease, background 0.15s ease;
  }
  #hud button:hover { background: #ffe6c4; }
  #hud button:active { transform: translateY(1px); }
  #hud .hint { margin-top: 10px; font-size: 11px; color: #6b7794; line-height: 1.4; }
`;
document.head.appendChild(style);

const contactCountEl = document.getElementById('contactCount') as HTMLElement;
const fpsEl = document.getElementById('fps') as HTMLElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;

resetBtn.addEventListener('click', () => resetCubes());
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') resetCubes();
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
createCubes();
resetCubes();

const clock = new THREE.Clock();
let fpsAccum = 0;
let fpsFrames = 0;

function animate() {
  const dt = clock.getDelta();

  step(dt);
  controls.update();
  renderer.render(scene, camera);

  // HUD updates.
  contactCountEl.textContent = String(liveContacts);
  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsEl.textContent = String(Math.round(fpsFrames / fpsAccum));
    fpsAccum = 0;
    fpsFrames = 0;
  }
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
