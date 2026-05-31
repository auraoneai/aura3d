// Physics Playground — 50 falling cubes onto a tilted ramp.
//
// Three.js has no bundled physics engine in this context bundle, so a small,
// stable rigid-body collision solver is implemented here directly:
//   - axis-aligned dynamic cubes (gravity + velocity integration)
//   - cube vs static AABB (ground + containment walls)
//   - cube vs oriented ramp plane (tilted slope with friction)
//   - cube vs cube (AABB min-translation resolution)
// A live contact count, a reset button, and an orbiting camera are provided.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CUBE_COUNT = 50;
const CUBE_SIZE = 1;
const CUBE_HALF = CUBE_SIZE / 2;
const GRAVITY = -26;
const RESTITUTION = 0.18; // bounciness
const FRICTION = 0.55; // tangential damping on contact
const LINEAR_DAMPING = 0.012;
const FIXED_DT = 1 / 120; // physics sub-step
const MAX_SUBSTEPS = 6;
const SOLVER_ITERATIONS = 3;
const CONTACT_SLOP = 0.06; // proximity that still counts as a resting contact

// ---------------------------------------------------------------------------
// Scene, camera, renderer
// ---------------------------------------------------------------------------

const app = document.getElementById('app') as HTMLDivElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 60, 140);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(26, 22, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 4, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 12;
controls.maxDistance = 120;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202830, 0.75));

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(24, 34, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------------------------------------------------------------------------
// Static geometry: ground, containment walls, tilted ramp
// ---------------------------------------------------------------------------

interface StaticBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

const staticBoxes: StaticBox[] = [];

function addStaticBox(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  color: number,
  visible = true,
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, cy, cz);
  mesh.receiveShadow = true;
  mesh.visible = visible;
  scene.add(mesh);

  staticBoxes.push({
    min: new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
    max: new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
  });
  return mesh;
}

const GROUND_SIZE = 64;

// Ground (top surface at y = 0).
addStaticBox(0, -1, 0, GROUND_SIZE, 2, GROUND_SIZE, 0x2a3340);

// Grid for spatial reference / readability.
const grid = new THREE.GridHelper(GROUND_SIZE, 32, 0x3d4b5c, 0x222b36);
grid.position.y = 0.01;
scene.add(grid);

// Low containment walls so cubes pile up and contacts stay visible.
const WALL_H = 3;
const half = GROUND_SIZE / 2;
addStaticBox(0, WALL_H / 2, half, GROUND_SIZE, WALL_H, 1, 0x39465a);
addStaticBox(0, WALL_H / 2, -half, GROUND_SIZE, WALL_H, 1, 0x39465a);
addStaticBox(half, WALL_H / 2, 0, 1, WALL_H, GROUND_SIZE, 0x39465a);
addStaticBox(-half, WALL_H / 2, 0, 1, WALL_H, GROUND_SIZE, 0x39465a);

// --- Tilted ramp (oriented plane collider) -------------------------------
const RAMP_TILT = THREE.MathUtils.degToRad(26); // slope angle
const RAMP_HX = 13; // half width  (across slope, world Z after rotation)
const RAMP_HY = 0.5; // half thickness
const RAMP_HZ = 11; // half length (down the slope)
const rampCenter = new THREE.Vector3(-2, 7.5, 0);

const rampQuat = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, 0, RAMP_TILT),
);
// Local axes of the ramp expressed in world space.
const rampNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(rampQuat); // local +Y
const rampAxisX = new THREE.Vector3(1, 0, 0).applyQuaternion(rampQuat); // local +X (down-slope)
const rampAxisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(rampQuat); // local +Z (across)

const rampGeo = new THREE.BoxGeometry(RAMP_HZ * 2, RAMP_HY * 2, RAMP_HX * 2);
const rampMat = new THREE.MeshStandardMaterial({
  color: 0x6c8cff,
  roughness: 0.6,
  metalness: 0.1,
});
const rampMesh = new THREE.Mesh(rampGeo, rampMat);
rampMesh.position.copy(rampCenter);
rampMesh.quaternion.copy(rampQuat);
rampMesh.castShadow = true;
rampMesh.receiveShadow = true;
scene.add(rampMesh);

// A lip at the low edge of the ramp so some cubes catch and contact there.
const lip = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 1.4, RAMP_HX * 2),
  rampMat,
);
lip.position
  .copy(rampCenter)
  .addScaledVector(rampAxisX, RAMP_HZ)
  .addScaledVector(rampNormal, 0.7);
lip.quaternion.copy(rampQuat);
lip.castShadow = true;
lip.receiveShadow = true;
scene.add(lip);

// ---------------------------------------------------------------------------
// Dynamic cubes
// ---------------------------------------------------------------------------

interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  mesh: THREE.Mesh;
}

const palette = [
  0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xff8e3c, 0xc77dff, 0x00d2d3,
  0xff5d8f,
];

const bodies: Body[] = [];
const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

for (let i = 0; i < CUBE_COUNT; i++) {
  const mat = new THREE.MeshStandardMaterial({
    color: palette[i % palette.length],
    roughness: 0.4,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(cubeGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  bodies.push({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    mesh,
  });
}

// Small linear-congruential RNG so resets vary but stay controlled.
let seed = 1337;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function resetSimulation(): void {
  seed = (Date.now() % 100000) + 7;
  // Spawn cubes in a loose cluster above the high end of the ramp.
  const high = rampCenter
    .clone()
    .addScaledVector(rampAxisX, -RAMP_HZ * 0.6)
    .addScaledVector(rampNormal, 6);
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.pos.set(
      high.x + (rand() - 0.5) * 10,
      high.y + 4 + rand() * 18,
      high.z + (rand() - 0.5) * 16,
    );
    b.vel.set((rand() - 0.5) * 2, -rand() * 2, (rand() - 0.5) * 2);
    b.mesh.position.copy(b.pos);
  }
}

resetSimulation();

// ---------------------------------------------------------------------------
// Collision solver
// ---------------------------------------------------------------------------

let contactCount = 0;
const tmp = new THREE.Vector3();
const rel = new THREE.Vector3();

// Reflect velocity about a contact normal with restitution + friction.
function applyContactResponse(
  vel: THREE.Vector3,
  nx: number,
  ny: number,
  nz: number,
): void {
  const vn = vel.x * nx + vel.y * ny + vel.z * nz;
  if (vn < 0) {
    // Remove normal component (with a little bounce), apply friction to rest.
    const tx = vel.x - vn * nx;
    const ty = vel.y - vn * ny;
    const tz = vel.z - vn * nz;
    const bounce = -vn * RESTITUTION;
    vel.x = tx * (1 - FRICTION) + nx * bounce;
    vel.y = ty * (1 - FRICTION) + ny * bounce;
    vel.z = tz * (1 - FRICTION) + nz * bounce;
  }
}

function isNearStaticBox(b: Body, box: StaticBox): boolean {
  const p = b.pos;
  const cx = Math.max(box.min.x, Math.min(p.x, box.max.x));
  const cy = Math.max(box.min.y, Math.min(p.y, box.max.y));
  const cz = Math.max(box.min.z, Math.min(p.z, box.max.z));
  const dx = p.x - cx;
  const dy = p.y - cy;
  const dz = p.z - cz;
  const d2 = dx * dx + dy * dy + dz * dz;
  const reach = CUBE_HALF + CONTACT_SLOP;
  return d2 < reach * reach;
}

// Resolve a dynamic cube against a static AABB. Returns true on contact.
function solveStaticBox(b: Body, box: StaticBox): boolean {
  // Expand the box by the cube half-extent => point-vs-box test.
  const minX = box.min.x - CUBE_HALF;
  const minY = box.min.y - CUBE_HALF;
  const minZ = box.min.z - CUBE_HALF;
  const maxX = box.max.x + CUBE_HALF;
  const maxY = box.max.y + CUBE_HALF;
  const maxZ = box.max.z + CUBE_HALF;

  const p = b.pos;
  if (
    p.x <= minX ||
    p.x >= maxX ||
    p.y <= minY ||
    p.y >= maxY ||
    p.z <= minZ ||
    p.z >= maxZ
  ) {
    // Outside the expanded box: only report resting proximity.
    return isNearStaticBox(b, box);
  }

  // Inside => penetrating. Find minimum translation axis.
  const dxMin = p.x - minX;
  const dxMax = maxX - p.x;
  const dyMin = p.y - minY;
  const dyMax = maxY - p.y;
  const dzMin = p.z - minZ;
  const dzMax = maxZ - p.z;

  let pen = dxMin;
  let nx = -1;
  let ny = 0;
  let nz = 0;
  if (dxMax < pen) {
    pen = dxMax;
    nx = 1;
    ny = 0;
    nz = 0;
  }
  if (dyMin < pen) {
    pen = dyMin;
    nx = 0;
    ny = -1;
    nz = 0;
  }
  if (dyMax < pen) {
    pen = dyMax;
    nx = 0;
    ny = 1;
    nz = 0;
  }
  if (dzMin < pen) {
    pen = dzMin;
    nx = 0;
    ny = 0;
    nz = -1;
  }
  if (dzMax < pen) {
    pen = dzMax;
    nx = 0;
    ny = 0;
    nz = 1;
  }

  // Push out along the contact normal.
  p.x += nx * pen;
  p.y += ny * pen;
  p.z += nz * pen;

  applyContactResponse(b.vel, nx, ny, nz);
  return true;
}

// Resolve a dynamic cube against the finite oriented ramp surface.
function solveRamp(b: Body): boolean {
  rel.copy(b.pos).sub(rampCenter);
  const along = rel.dot(rampAxisX); // down-slope coordinate
  const across = rel.dot(rampAxisZ); // across-slope coordinate
  const height = rel.dot(rampNormal); // distance above ramp mid-plane

  // Reject if outside the ramp footprint.
  if (Math.abs(along) > RAMP_HZ + CUBE_HALF) return false;
  if (Math.abs(across) > RAMP_HX + CUBE_HALF) return false;

  // Support of an axis-aligned cube along the (tilted) ramp normal.
  const support =
    CUBE_HALF *
    (Math.abs(rampNormal.x) +
      Math.abs(rampNormal.y) +
      Math.abs(rampNormal.z));
  const surface = RAMP_HY + support;
  const gap = height - surface;

  if (gap < 0) {
    // Penetrating top face: push out along the ramp normal.
    b.pos.addScaledVector(rampNormal, -gap);
    applyContactResponse(b.vel, rampNormal.x, rampNormal.y, rampNormal.z);
    return true;
  }
  return gap < CONTACT_SLOP;
}

// Resolve two dynamic cubes (axis-aligned) against each other.
function solvePair(a: Body, b: Body): boolean {
  tmp.copy(b.pos).sub(a.pos);
  const overlapX = CUBE_SIZE - Math.abs(tmp.x);
  if (overlapX <= -CONTACT_SLOP) return false;
  const overlapY = CUBE_SIZE - Math.abs(tmp.y);
  if (overlapY <= -CONTACT_SLOP) return false;
  const overlapZ = CUBE_SIZE - Math.abs(tmp.z);
  if (overlapZ <= -CONTACT_SLOP) return false;

  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
    // Within slop but not truly overlapping => resting contact.
    return true;
  }

  // Resolve along the axis of least penetration.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let pen: number;
  if (overlapX <= overlapY && overlapX <= overlapZ) {
    nx = tmp.x < 0 ? -1 : 1;
    pen = overlapX;
  } else if (overlapY <= overlapZ) {
    ny = tmp.y < 0 ? -1 : 1;
    pen = overlapY;
  } else {
    nz = tmp.z < 0 ? -1 : 1;
    pen = overlapZ;
  }

  const correction = pen / 2;
  a.pos.x -= nx * correction;
  a.pos.y -= ny * correction;
  a.pos.z -= nz * correction;
  b.pos.x += nx * correction;
  b.pos.y += ny * correction;
  b.pos.z += nz * correction;

  // Exchange the normal component of relative velocity (equal masses).
  const rvx = b.vel.x - a.vel.x;
  const rvy = b.vel.y - a.vel.y;
  const rvz = b.vel.z - a.vel.z;
  const vn = rvx * nx + rvy * ny + rvz * nz;
  if (vn < 0) {
    const j = (-(1 + RESTITUTION) * vn) / 2;
    a.vel.x -= j * nx;
    a.vel.y -= j * ny;
    a.vel.z -= j * nz;
    b.vel.x += j * nx;
    b.vel.y += j * ny;
    b.vel.z += j * nz;
  }
  return true;
}

function step(dt: number): void {
  contactCount = 0;

  // Integrate.
  for (const b of bodies) {
    b.vel.y += GRAVITY * dt;
    b.vel.multiplyScalar(1 - LINEAR_DAMPING);
    b.pos.addScaledVector(b.vel, dt);
  }

  // Iteratively resolve contacts for stability.
  for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
    const last = iter === SOLVER_ITERATIONS - 1;

    for (const b of bodies) {
      for (const box of staticBoxes) {
        if (solveStaticBox(b, box) && last) contactCount++;
      }
      if (solveRamp(b) && last) contactCount++;
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (solvePair(bodies[i], bodies[j]) && last) contactCount++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// HUD: contact overlay + reset button
// ---------------------------------------------------------------------------

const hud = document.createElement('div');
hud.style.cssText = [
  'position:fixed',
  'top:16px',
  'left:16px',
  'padding:14px 18px',
  'background:rgba(13,17,23,0.82)',
  'border:1px solid #2f3b4c',
  'border-radius:10px',
  'color:#e6edf3',
  "font-family:'Segoe UI',system-ui,sans-serif",
  'font-size:14px',
  'line-height:1.5',
  'user-select:none',
  'box-shadow:0 6px 20px rgba(0,0,0,0.4)',
  'z-index:10',
].join(';');

const title = document.createElement('div');
title.textContent = 'Physics Playground';
title.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:6px;';

const contactLine = document.createElement('div');
const cubesLine = document.createElement('div');
cubesLine.textContent = `Cubes: ${CUBE_COUNT}`;

const hint = document.createElement('div');
hint.textContent = 'Drag to orbit · scroll to zoom';
hint.style.cssText = 'color:#8b98a8;font-size:12px;margin-top:6px;';

const resetBtn = document.createElement('button');
resetBtn.textContent = '⟲ Reset';
resetBtn.style.cssText = [
  'margin-top:12px',
  'width:100%',
  'padding:9px 14px',
  'background:#6c8cff',
  'color:#0d1117',
  'border:none',
  'border-radius:8px',
  'font-weight:700',
  'font-size:14px',
  'cursor:pointer',
].join(';');
resetBtn.addEventListener('mouseenter', () => {
  resetBtn.style.background = '#8aa3ff';
});
resetBtn.addEventListener('mouseleave', () => {
  resetBtn.style.background = '#6c8cff';
});
resetBtn.addEventListener('click', () => resetSimulation());

hud.append(title, contactLine, cubesLine, hint, resetBtn);
document.body.appendChild(hud);

// ---------------------------------------------------------------------------
// Main loop (fixed-step accumulator)
// ---------------------------------------------------------------------------

let lastTime = performance.now();
let accumulator = 0;

function animate(now: number): void {
  const frame = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += frame;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_SUBSTEPS) accumulator = 0; // avoid spiral of death

  for (const b of bodies) b.mesh.position.copy(b.pos);

  contactLine.textContent = `Live contacts: ${contactCount}`;

  controls.update();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
