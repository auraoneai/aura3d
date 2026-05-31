// Physics Playground — 50 falling cubes onto a tilted ramp.
//
// Three.js has no built-in physics engine and none is bundled in this context,
// so a small fixed-timestep rigid-body solver is implemented here. Cubes are
// approximated as spheres (radius = half the cube edge) for cube/cube contacts
// and resolved against oriented half-spaces for the ramp, floor and bounding
// walls. This is enough for visible collision response: cubes cascade down the
// tilted ramp and pile up at its base.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CUBE_COUNT = 50;
const CUBE_SIZE = 1.0;
const CUBE_RADIUS = CUBE_SIZE * 0.5; // collision radius (half edge)
const GRAVITY = new THREE.Vector3(0, -22, 0);
const RESTITUTION = 0.22; // bounciness on planar contacts
const FRICTION = 0.12; // tangential damping per substep on contact
const LINEAR_DAMPING = 0.9985;
const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 8;

const RAMP_WIDTH = 16;
const RAMP_DEPTH = 12;
const RAMP_THICKNESS = 0.5;
const RAMP_TILT = THREE.MathUtils.degToRad(24);
const RAMP_CENTER = new THREE.Vector3(0, 3.2, 0);

const BOUND_X = 9; // half-extent of invisible walls keeping the pile in frame
const BOUND_Z = 9;

const FLOOR_POINT = new THREE.Vector3(0, 0, 0);
const FLOOR_NORMAL = new THREE.Vector3(0, 1, 0);

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
scene.background = new THREE.Color(0x12161d);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(14, 11, 16);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, 2);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 8;
controls.maxDistance = 60;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x202830, 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2e0, 2.4);
sun.position.set(14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.bias = -0.0002;
scene.add(sun);

// ---------------------------------------------------------------------------
// Static geometry: floor + tilted ramp
// ---------------------------------------------------------------------------

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.95, metalness: 0.0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(80, 80, 0x3a4658, 0x2c3542);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.4;
grid.position.y = 0.01;
scene.add(grid);

// Ramp as a rotated slab. Its top face is the collision surface.
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_WIDTH, RAMP_THICKNESS, RAMP_DEPTH),
  new THREE.MeshStandardMaterial({ color: 0x6b7689, roughness: 0.6, metalness: 0.1 }),
);
ramp.position.copy(RAMP_CENTER);
ramp.rotation.x = RAMP_TILT;
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

// Derived ramp plane (world space) for collision queries.
// Rotation about X by +tilt gives this surface normal and in-plane axes.
const rampNormal = new THREE.Vector3(0, Math.cos(RAMP_TILT), Math.sin(RAMP_TILT)).normalize();
const rampAxisU = new THREE.Vector3(1, 0, 0); // along width (unchanged by X rotation)
const rampAxisV = new THREE.Vector3(0, -Math.sin(RAMP_TILT), Math.cos(RAMP_TILT)).normalize();
const rampTop = RAMP_CENTER.clone().addScaledVector(rampNormal, RAMP_THICKNESS / 2);
const rampHalfU = RAMP_WIDTH / 2;
const rampHalfV = RAMP_DEPTH / 2;

// ---------------------------------------------------------------------------
// Dynamic bodies: 50 cubes
// ---------------------------------------------------------------------------

interface Body {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
}

const bodies: Body[] = [];
const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const palette = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xb983ff, 0xff9f45, 0x00c2c7];

for (let i = 0; i < CUBE_COUNT; i++) {
  const mat = new THREE.MeshStandardMaterial({
    color: palette[i % palette.length],
    roughness: 0.4,
    metalness: 0.15,
  });
  const mesh = new THREE.Mesh(cubeGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  bodies.push({
    mesh,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    angVel: new THREE.Vector3(),
  });
}

// Place cubes in a stacked block hovering over the HIGH end of the ramp so they
// tumble down its face and collide on the way to the base.
function resetBodies(): void {
  let i = 0;
  const cols = 5;
  const rows = 5;
  for (let layer = 0; layer < 2; layer++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (i >= CUBE_COUNT) break;
        const b = bodies[i++];
        const x = (c - (cols - 1) / 2) * 1.5 + (Math.random() - 0.5) * 0.3;
        const z = -5 + r * 0.9 + (Math.random() - 0.5) * 0.3; // high end of ramp
        const y = 9 + layer * 1.8 + r * 0.4 + Math.random() * 0.4;
        b.pos.set(x, y, z);
        b.vel.set((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
        b.angVel.set(
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 3,
        );
        b.mesh.quaternion.identity();
        b.mesh.position.copy(b.pos);
      }
    }
  }
}
resetBodies();

// ---------------------------------------------------------------------------
// Physics solver
// ---------------------------------------------------------------------------

let contactCount = 0;

const tmpRel = new THREE.Vector3();
const tmpTang = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

// Resolve a body against an oriented, bounded half-space (ramp / floor).
function resolveHalfSpace(
  b: Body,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  axisU: THREE.Vector3 | null,
  halfU: number,
  axisV: THREE.Vector3 | null,
  halfV: number,
): boolean {
  tmpRel.copy(b.pos).sub(point);
  const d = tmpRel.dot(normal); // signed distance from surface
  if (d >= CUBE_RADIUS) return false; // not touching
  if (d < -CUBE_RADIUS * 4) return false; // ignore deep/back side

  // Bound the contact to the finite surface extent.
  if (axisU && Math.abs(tmpRel.dot(axisU)) > halfU + CUBE_RADIUS) return false;
  if (axisV && Math.abs(tmpRel.dot(axisV)) > halfV + CUBE_RADIUS) return false;

  // Positional correction: push out along the normal.
  const penetration = CUBE_RADIUS - d;
  b.pos.addScaledVector(normal, penetration);

  // Velocity response.
  const vn = b.vel.dot(normal);
  if (vn < 0) b.vel.addScaledVector(normal, -vn * (1 + RESTITUTION));

  // Tangential friction.
  tmpTang.copy(b.vel).addScaledVector(normal, -b.vel.dot(normal));
  b.vel.addScaledVector(tmpTang, -FRICTION);

  // Damp tumbling on contact.
  b.angVel.multiplyScalar(0.88);
  return true;
}

function step(dt: number): void {
  // Integrate forces.
  for (const b of bodies) {
    b.vel.addScaledVector(GRAVITY, dt);
    b.vel.multiplyScalar(LINEAR_DAMPING);
    b.pos.addScaledVector(b.vel, dt);
  }

  let contacts = 0;

  // Cube vs cube (sphere approximation), a couple of relaxation iterations.
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        tmpDelta.copy(b.pos).sub(a.pos);
        const distSq = tmpDelta.lengthSq();
        const min = CUBE_SIZE; // 2 * radius
        if (distSq > 1e-8 && distSq < min * min) {
          const dist = Math.sqrt(distSq);
          tmpDelta.multiplyScalar(1 / dist);
          const overlap = min - dist;
          // Split positional correction.
          a.pos.addScaledVector(tmpDelta, -overlap * 0.5);
          b.pos.addScaledVector(tmpDelta, overlap * 0.5);
          // Exchange velocity along the contact normal.
          const va = a.vel.dot(tmpDelta);
          const vb = b.vel.dot(tmpDelta);
          if (va - vb > 0) {
            const imp = (va - vb) * (1 + RESTITUTION) * 0.5;
            a.vel.addScaledVector(tmpDelta, -imp);
            b.vel.addScaledVector(tmpDelta, imp);
          }
          if (iter === 0) contacts++;
        }
      }
    }
  }

  // Cube vs static surfaces.
  for (const b of bodies) {
    if (resolveHalfSpace(b, rampTop, rampNormal, rampAxisU, rampHalfU, rampAxisV, rampHalfV)) {
      contacts++;
    }
    if (resolveHalfSpace(b, FLOOR_POINT, FLOOR_NORMAL, null, 0, null, 0)) {
      contacts++;
    }
    // Bounding walls (inward) keep the pile in frame.
    if (b.pos.x < -BOUND_X + CUBE_RADIUS) { b.pos.x = -BOUND_X + CUBE_RADIUS; if (b.vel.x < 0) b.vel.x *= -RESTITUTION; contacts++; }
    if (b.pos.x > BOUND_X - CUBE_RADIUS) { b.pos.x = BOUND_X - CUBE_RADIUS; if (b.vel.x > 0) b.vel.x *= -RESTITUTION; contacts++; }
    if (b.pos.z < -BOUND_Z + CUBE_RADIUS) { b.pos.z = -BOUND_Z + CUBE_RADIUS; if (b.vel.z < 0) b.vel.z *= -RESTITUTION; contacts++; }
    if (b.pos.z > BOUND_Z - CUBE_RADIUS) { b.pos.z = BOUND_Z - CUBE_RADIUS; if (b.vel.z > 0) b.vel.z *= -RESTITUTION; contacts++; }
  }

  contactCount = contacts;
}

// ---------------------------------------------------------------------------
// UI overlay: contact count + reset
// ---------------------------------------------------------------------------

const overlay = document.createElement('div');
overlay.style.cssText = `
  position: fixed; top: 16px; left: 16px; z-index: 10;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: #e9eef5; background: rgba(18,22,29,0.78);
  border: 1px solid rgba(140,160,190,0.35); border-radius: 10px;
  padding: 14px 16px; backdrop-filter: blur(6px); min-width: 220px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.4);
`;
overlay.innerHTML = `
  <div style="font-size:15px;font-weight:600;letter-spacing:.3px;margin-bottom:8px;">
    Physics Playground
  </div>
  <div style="font-size:13px;opacity:.8;margin-bottom:4px;">Cubes: ${CUBE_COUNT} &nbsp;|&nbsp; Tilted ramp</div>
  <div style="font-size:22px;font-weight:700;margin:6px 0 12px;">
    Contacts: <span id="contact-count" style="color:#ffd93d;">0</span>
  </div>
  <button id="reset-btn" style="
    width:100%; cursor:pointer; font:600 14px ui-monospace,monospace;
    color:#12161d; background:#ffd93d; border:none; border-radius:8px;
    padding:9px 12px;">&#8635; Reset Drop</button>
  <div style="font-size:11px;opacity:.6;margin-top:10px;">Drag to orbit &middot; scroll to zoom</div>
`;
document.body.appendChild(overlay);

const contactLabel = overlay.querySelector('#contact-count') as HTMLSpanElement;
const resetBtn = overlay.querySelector('#reset-btn') as HTMLButtonElement;
resetBtn.addEventListener('click', () => {
  resetBodies();
  contactCount = 0;
});

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const spin = new THREE.Quaternion();
const euler = new THREE.Euler();
const clock = new THREE.Clock();
let accumulator = 0;

function animate(): void {
  let frameDt = clock.getDelta();
  if (frameDt > 0.05) frameDt = 0.05; // clamp after stalls
  accumulator += frameDt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }

  // Sync visuals: position + a little tumble for liveliness.
  for (const b of bodies) {
    b.mesh.position.copy(b.pos);
    if (b.angVel.lengthSq() > 1e-4) {
      euler.set(b.angVel.x * frameDt, b.angVel.y * frameDt, b.angVel.z * frameDt);
      spin.setFromEuler(euler);
      b.mesh.quaternion.multiply(spin);
    }
  }

  contactLabel.textContent = String(contactCount);
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
