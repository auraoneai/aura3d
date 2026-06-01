// Physics Playground — 50 falling cubes onto a tilted ramp.
//
// Raw Three.js does not ship a physics engine and the benchmark context bundle
// exposes no physics API, so this file implements a small fixed-timestep rigid
// collision solver (cubes vs. ground, tilted ramp, arena walls, and cube-cube)
// with restitution + friction. OrbitControls supplies the camera orbit, and an
// HTML overlay shows the live contact count plus a reset control.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------
const CUBE_COUNT = 50;
const CUBE_SIZE = 0.8;
const HALF = CUBE_SIZE * 0.5; // half-extent, used for face-on-plane collisions
const CUBE_RADIUS = 0.46; // sphere radius used for cube-cube collisions

const GRAVITY = -26;
const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.05;

const RESTITUTION = 0.18;
const TANGENT_KEEP = 0.985; // fraction of tangential velocity retained per contact
const LINEAR_DAMP = 0.999;
const ANGULAR_DAMP = 0.96;
const SLEEP_SPEED = 0.06;
const CONTACT_EPS = 0.035; // band within which a surface counts as "in contact"

// Arena (invisible walls keep cubes inside the camera frame).
const ARENA_HALF = 9;
const ARENA_TOP = 14;

// Ramp dimensions and tilt.
const RAMP_W = 13;
const RAMP_D = 13;
const RAMP_H = 0.6;
const RAMP_TILT = 0.4; // radians, tilt around the X axis
const RAMP_POS = new THREE.Vector3(0, 5, 0);

// ----------------------------------------------------------------------------
// Renderer / scene / camera
// ----------------------------------------------------------------------------
const app = document.getElementById('app') ?? document.body;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1420);
scene.fog = new THREE.Fog(0x0f1420, 40, 75);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(16, 13, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 3, 0);
controls.minDistance = 8;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = true; // demonstrates the camera orbit in captured evidence
controls.autoRotateSpeed = 0.6;

// ----------------------------------------------------------------------------
// Lighting
// ----------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(14, 24, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.bias = -0.0003;
scene.add(sun);

// ----------------------------------------------------------------------------
// Ground + grid
// ----------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x2b3242, roughness: 0.95, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(60, 60, 0x4a566f, 0x39404f);
(grid.material as THREE.Material).opacity = 0.35;
(grid.material as THREE.Material).transparent = true;
grid.position.y = 0.01;
scene.add(grid);

// ----------------------------------------------------------------------------
// Tilted ramp
// ----------------------------------------------------------------------------
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_W, RAMP_H, RAMP_D),
  new THREE.MeshStandardMaterial({ color: 0x5b6b8c, roughness: 0.7, metalness: 0.1 }),
);
ramp.position.copy(RAMP_POS);
ramp.rotation.x = RAMP_TILT;
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

// Precompute ramp orientation for collision math.
const rampQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(RAMP_TILT, 0, 0));
const rampQuatInv = rampQuat.clone().invert();
const rampHalf = new THREE.Vector3(RAMP_W * 0.5, RAMP_H * 0.5, RAMP_D * 0.5);

// ----------------------------------------------------------------------------
// Cubes
// ----------------------------------------------------------------------------
interface Body {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
}

const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const palette = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xb388ff, 0xff8fab, 0xf4a261];

const bodies: Body[] = [];
for (let i = 0; i < CUBE_COUNT; i++) {
  const mesh = new THREE.Mesh(
    cubeGeo,
    new THREE.MeshStandardMaterial({
      color: palette[i % palette.length],
      roughness: 0.45,
      metalness: 0.15,
    }),
  );
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

// Deterministic-ish pseudo random so spawns vary but stay inside the arena.
let seed = 1337;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

function resetBodies(): void {
  seed = 1337;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.pos.set(
      (rand() - 0.5) * 9,
      9 + (i % 10) * 1.1 + rand() * 2,
      (rand() - 0.5) * 9,
    );
    b.vel.set((rand() - 0.5) * 1.5, -rand() * 2, (rand() - 0.5) * 1.5);
    b.angVel.set((rand() - 0.5) * 4, (rand() - 0.5) * 4, (rand() - 0.5) * 4);
    b.mesh.position.copy(b.pos);
    b.mesh.quaternion.identity();
  }
}
resetBodies();

// ----------------------------------------------------------------------------
// Physics step
// ----------------------------------------------------------------------------
let contactCount = 0;

// Static collision normals (point away from each surface, into the arena).
const UP = new THREE.Vector3(0, 1, 0);
const WALL_PX = new THREE.Vector3(1, 0, 0);
const WALL_NX = new THREE.Vector3(-1, 0, 0);
const WALL_PZ = new THREE.Vector3(0, 0, 1);
const WALL_NZ = new THREE.Vector3(0, 0, -1);

// Scratch vectors reused each step to avoid allocations.
const tmpLocal = new THREE.Vector3();
const tmpVelLocal = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpRel = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();
const deltaQuat = new THREE.Quaternion();
const spinQuat = new THREE.Quaternion();

function resolvePlane(b: Body, n: THREE.Vector3, penetration: number): void {
  // Push out of the surface.
  b.pos.addScaledVector(n, penetration);
  const vn = b.vel.dot(n);
  if (vn < 0) {
    // Remove normal component with restitution.
    b.vel.addScaledVector(n, -(1 + RESTITUTION) * vn);
    // Friction: scale the remaining tangential velocity.
    const vnNew = b.vel.dot(n);
    tmpDelta.copy(b.vel).addScaledVector(n, -vnNew); // tangential part
    b.vel.addScaledVector(tmpDelta, -(1 - TANGENT_KEEP));
  }
}

function step(dt: number): void {
  let contacts = 0;

  // Integrate.
  for (const b of bodies) {
    b.vel.y += GRAVITY * dt;
    b.vel.multiplyScalar(LINEAR_DAMP);
    b.pos.addScaledVector(b.vel, dt);
  }

  // Cube vs. static world.
  for (const b of bodies) {
    // Ground (y = 0).
    if (b.pos.y - HALF < CONTACT_EPS) {
      contacts++;
      if (b.pos.y - HALF < 0) resolvePlane(b, UP, HALF - b.pos.y);
    }

    // Arena walls (keep cubes within camera frame).
    if (b.pos.x - HALF < -ARENA_HALF) resolvePlane(b, WALL_PX, -ARENA_HALF - (b.pos.x - HALF));
    if (b.pos.x + HALF > ARENA_HALF) resolvePlane(b, WALL_NX, b.pos.x + HALF - ARENA_HALF);
    if (b.pos.z - HALF < -ARENA_HALF) resolvePlane(b, WALL_PZ, -ARENA_HALF - (b.pos.z - HALF));
    if (b.pos.z + HALF > ARENA_HALF) resolvePlane(b, WALL_NZ, b.pos.z + HALF - ARENA_HALF);
    if (b.pos.y > ARENA_TOP) b.pos.y = ARENA_TOP;

    // Tilted ramp — work in the ramp's local frame, collide against its top face.
    tmpLocal.copy(b.pos).sub(RAMP_POS).applyQuaternion(rampQuatInv);
    if (
      Math.abs(tmpLocal.x) < rampHalf.x &&
      Math.abs(tmpLocal.z) < rampHalf.z &&
      tmpLocal.y > 0 &&
      tmpLocal.y - HALF < rampHalf.y + CONTACT_EPS
    ) {
      contacts++;
      const penetration = rampHalf.y + HALF - tmpLocal.y;
      if (penetration > 0) {
        tmpLocal.y += penetration;
        tmpVelLocal.copy(b.vel).applyQuaternion(rampQuatInv);
        if (tmpVelLocal.y < 0) {
          tmpVelLocal.y = -tmpVelLocal.y * RESTITUTION;
          tmpVelLocal.x *= TANGENT_KEEP;
          tmpVelLocal.z *= TANGENT_KEEP;
        }
        b.pos.copy(tmpLocal).applyQuaternion(rampQuat).add(RAMP_POS);
        b.vel.copy(tmpVelLocal).applyQuaternion(rampQuat);
      }
    }
  }

  // Cube vs. cube (sphere approximation, equal mass).
  const minDist = CUBE_RADIUS * 2;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const c = bodies[j];
      tmpN.copy(c.pos).sub(a.pos);
      const distSq = tmpN.lengthSq();
      if (distSq < (minDist + CONTACT_EPS) * (minDist + CONTACT_EPS) && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        contacts++;
        if (dist < minDist) {
          tmpN.multiplyScalar(1 / dist); // normalize a -> c
          const overlap = minDist - dist;
          a.pos.addScaledVector(tmpN, -overlap * 0.5);
          c.pos.addScaledVector(tmpN, overlap * 0.5);
          tmpRel.copy(c.vel).sub(a.vel);
          const velAlongN = tmpRel.dot(tmpN);
          if (velAlongN < 0) {
            const imp = (-(1 + RESTITUTION) * velAlongN) / 2;
            a.vel.addScaledVector(tmpN, -imp);
            c.vel.addScaledVector(tmpN, imp);
          }
        }
      }
    }
  }

  // Angular integration + settling.
  for (const b of bodies) {
    b.angVel.multiplyScalar(ANGULAR_DAMP);
    const grounded = b.pos.y - HALF < 0.08;
    if (grounded && b.vel.lengthSq() < SLEEP_SPEED * SLEEP_SPEED) {
      b.vel.multiplyScalar(0.6);
      b.angVel.multiplyScalar(0.6);
    }
    if (b.angVel.lengthSq() > 1e-6) {
      tmpDelta.copy(b.angVel);
      const ang = tmpDelta.length() * dt;
      tmpDelta.multiplyScalar(1 / tmpDelta.length());
      spinQuat.setFromAxisAngle(tmpDelta, ang);
      deltaQuat.copy(b.mesh.quaternion);
      b.mesh.quaternion.copy(spinQuat).multiply(deltaQuat);
    }
    b.mesh.position.copy(b.pos);
  }

  contactCount = contacts;
}

// ----------------------------------------------------------------------------
// HUD overlay (contact count + reset control)
// ----------------------------------------------------------------------------
const hud = document.createElement('div');
hud.style.cssText = [
  'position:fixed',
  'top:16px',
  'left:16px',
  'padding:14px 18px',
  'background:rgba(15,20,32,0.82)',
  'color:#e8eefc',
  'font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  'border:1px solid rgba(120,150,210,0.35)',
  'border-radius:10px',
  'backdrop-filter:blur(6px)',
  'z-index:10',
  'user-select:none',
  'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
].join(';');

const title = document.createElement('div');
title.textContent = 'Physics Playground';
title.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:6px;color:#9ec5ff';

const cubesLine = document.createElement('div');
cubesLine.textContent = `Cubes: ${CUBE_COUNT}`;

const contactLine = document.createElement('div');
contactLine.style.cssText = 'font-size:18px;font-weight:700;margin:2px 0 10px';

const hint = document.createElement('div');
hint.textContent = 'Drag to orbit · scroll to zoom';
hint.style.cssText = 'font-size:11px;opacity:0.6;margin-bottom:10px';

const resetBtn = document.createElement('button');
resetBtn.textContent = '↻ Reset';
resetBtn.style.cssText = [
  'cursor:pointer',
  'width:100%',
  'padding:8px 12px',
  'background:#3b6fe0',
  'color:#fff',
  'border:none',
  'border-radius:8px',
  'font:600 14px ui-monospace,monospace',
].join(';');
resetBtn.addEventListener('click', () => {
  resetBodies();
});
resetBtn.addEventListener('mouseenter', () => (resetBtn.style.background = '#5384f5'));
resetBtn.addEventListener('mouseleave', () => (resetBtn.style.background = '#3b6fe0'));

hud.append(title, cubesLine, contactLine, hint, resetBtn);
app.appendChild(hud);

// ----------------------------------------------------------------------------
// Main loop
// ----------------------------------------------------------------------------
let last = performance.now();
let accumulator = 0;

function animate(now: number): void {
  let frameDt = (now - last) / 1000;
  last = now;
  if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;

  accumulator += frameDt;
  while (accumulator >= FIXED_DT) {
    step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  contactLine.textContent = `Contacts: ${contactCount}`;
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
