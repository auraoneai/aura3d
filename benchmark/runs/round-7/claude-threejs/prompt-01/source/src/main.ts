// Physics Playground — 50 falling cubes onto a tilted ramp.
//
// The three.js context bundle ships no physics engine, so this file implements
// a small, self-contained rigid-body solver (semi-implicit Euler + substeps):
//   - cubes are integrated as bounding spheres for fast, stable collision tests
//   - cube vs. ground and cube vs. tilted ramp use oriented-plane contacts
//   - cube vs. cube uses sphere/sphere impulse resolution
// Cubes are drawn as real boxes via an InstancedMesh and tumble on impact, and a
// live contact count is reported to the HUD every frame.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const CUBE_COUNT = 50;
const CUBE_SIZE = 1.0;
const CUBE_RADIUS = CUBE_SIZE * 0.5; // sphere radius used for collision
const GRAVITY = -22; // world units / s^2
const RESTITUTION = 0.28; // bounciness
const FRICTION = 0.16; // tangential energy loss on contact
const LINEAR_DAMPING = 0.012;
const ANGULAR_DAMPING = 0.06;
const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 8;

// Tilted ramp definition
const RAMP_TILT = THREE.MathUtils.degToRad(20);
const RAMP_HALF_W = 5; // x
const RAMP_HALF_L = 6.5; // z
const RAMP_HALF_T = 0.3; // y (thickness)
const RAMP_CENTER = new THREE.Vector3(0, 3.4, 0);

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
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141c);
scene.fog = new THREE.Fog(0x10141c, 40, 90);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(15, 12, 19);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 8;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 2.5, 0);
controls.update();

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x202833, 0.9));

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(16, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.95, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(200, 100, 0x3a4456, 0x252c39);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.5;
grid.position.y = 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// Tilted ramp
// ---------------------------------------------------------------------------
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_HALF_W * 2, RAMP_HALF_T * 2, RAMP_HALF_L * 2),
  new THREE.MeshStandardMaterial({ color: 0x47597a, roughness: 0.6, metalness: 0.1 }),
);
ramp.position.copy(RAMP_CENTER);
ramp.rotation.x = RAMP_TILT; // tilt so cubes slide along +Z (downhill)
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

// Precompute ramp frame for collision (world <-> ramp-local)
ramp.updateMatrixWorld(true);
const rampQuat = ramp.quaternion.clone();
const rampNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(rampQuat); // top face normal
const rampInverse = new THREE.Matrix4().copy(ramp.matrixWorld).invert();

// A short lip wall at the low edge keeps some cubes piling on the ramp so the
// contact behaviour reads clearly in a still frame.
const lip = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_HALF_W * 2, 1.0, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x3a4a66, roughness: 0.7 }),
);
lip.position.set(0, 0.5, RAMP_HALF_L - 0.2);
lip.castShadow = true;
lip.receiveShadow = true;
ramp.add(lip); // child of ramp so it inherits the tilt

// ---------------------------------------------------------------------------
// Cubes (rendered as one InstancedMesh)
// ---------------------------------------------------------------------------
interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  quat: THREE.Quaternion;
  angVel: THREE.Vector3; // axis * speed (rad/s)
}

const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const cubeMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.15 });
const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, CUBE_COUNT);
cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cubes.castShadow = true;
cubes.receiveShadow = true;
scene.add(cubes);

const palette = [0xff6b6b, 0xffd93d, 0x6bcB77, 0x4d96ff, 0xff9f43, 0xa66bff, 0x2ec4b6];
const baseColor = new THREE.Color();
for (let i = 0; i < CUBE_COUNT; i++) {
  baseColor.setHex(palette[i % palette.length]);
  cubes.setColorAt(i, baseColor);
}

const bodies: Body[] = [];
for (let i = 0; i < CUBE_COUNT; i++) {
  bodies.push({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    angVel: new THREE.Vector3(),
  });
}

// Deterministic-ish pseudo random so resets feel varied but stable per index.
let seed = 1;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function resetSimulation(): void {
  seed = 1;
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    // Stack cubes in a loose grid high above the upper end of the ramp so they
    // cascade down across it.
    const col = i % 5;
    const row = Math.floor(i / 5) % 5;
    const layer = Math.floor(i / 25);
    b.pos.set(
      -RAMP_HALF_W + 1 + col * 2 + (rand() - 0.5) * 0.4,
      11 + layer * 3 + row * 1.4 + rand() * 1.2,
      -RAMP_HALF_L + 1 + row * 1.6 + (rand() - 0.5) * 0.4,
    );
    b.vel.set((rand() - 0.5) * 1.5, 0, (rand() - 0.5) * 1.5);
    b.quat.setFromEuler(
      new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI),
    );
    b.angVel.set((rand() - 0.5) * 2, (rand() - 0.5) * 2, (rand() - 0.5) * 2);
  }
  contactCount = 0;
}

// ---------------------------------------------------------------------------
// Physics solver
// ---------------------------------------------------------------------------
const GROUND_Y = 0;
let contactCount = 0;

const _local = new THREE.Vector3();
const _n = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _spin = new THREE.Quaternion();
const _omega = new THREE.Quaternion();

function resolvePlaneContact(b: Body, normal: THREE.Vector3, penetration: number): void {
  // Push out of the surface.
  b.pos.addScaledVector(normal, penetration);
  const vn = b.vel.dot(normal);
  if (vn < 0) {
    // Reflect normal component with restitution.
    b.vel.addScaledVector(normal, -(1 + RESTITUTION) * vn);
    // Tangential friction.
    _tan.copy(b.vel).addScaledVector(normal, -b.vel.dot(normal));
    b.vel.addScaledVector(_tan, -FRICTION);
    // Tumbling: convert tangential slide into spin about (normal x tangent).
    if (_tan.lengthSq() > 1e-4) {
      _n.copy(normal).cross(_tan);
      b.angVel.addScaledVector(_n, 0.5);
    }
  }
}

function step(dt: number): void {
  // Integrate forces.
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    b.vel.y += GRAVITY * dt;
    b.vel.multiplyScalar(1 - LINEAR_DAMPING * dt);
    b.pos.addScaledVector(b.vel, dt);
  }

  let contacts = 0;

  // Cube vs ground.
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    const pen = CUBE_RADIUS - (b.pos.y - GROUND_Y);
    if (pen > 0) {
      resolvePlaneContact(b, UP, pen);
      contacts++;
    }
  }

  // Cube vs tilted ramp (finite oriented slab — collide against the top face).
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    _local.copy(b.pos).applyMatrix4(rampInverse); // ramp-local coords
    if (
      _local.x > -RAMP_HALF_W - CUBE_RADIUS &&
      _local.x < RAMP_HALF_W + CUBE_RADIUS &&
      _local.z > -RAMP_HALF_L - CUBE_RADIUS &&
      _local.z < RAMP_HALF_L + CUBE_RADIUS
    ) {
      const surface = RAMP_HALF_T + CUBE_RADIUS;
      // Only treat as a top-face contact when the cube is above/at the surface.
      if (_local.y < surface && _local.y > -RAMP_HALF_T - CUBE_RADIUS) {
        const pen = surface - _local.y;
        if (pen > 0) {
          resolvePlaneContact(b, rampNormal, pen);
          contacts++;
        }
      }
    }
  }

  // Cube vs cube (sphere/sphere).
  const minDist = CUBE_RADIUS * 2;
  for (let i = 0; i < CUBE_COUNT; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < CUBE_COUNT; j++) {
      const b = bodies[j];
      _delta.copy(a.pos).sub(b.pos);
      const d2 = _delta.lengthSq();
      if (d2 > 0 && d2 < minDist * minDist) {
        const d = Math.sqrt(d2);
        _n.copy(_delta).multiplyScalar(1 / d); // a <- b normal
        const pen = minDist - d;
        // Positional correction (split evenly).
        a.pos.addScaledVector(_n, pen * 0.5);
        b.pos.addScaledVector(_n, -pen * 0.5);
        // Impulse along the contact normal.
        _rel.copy(a.vel).sub(b.vel);
        const vn = _rel.dot(_n);
        if (vn < 0) {
          const jImp = -(1 + RESTITUTION) * vn * 0.5;
          a.vel.addScaledVector(_n, jImp);
          b.vel.addScaledVector(_n, -jImp);
          // A little shared spin so collisions look lively.
          a.angVel.addScaledVector(_n, 0.15);
          b.angVel.addScaledVector(_n, -0.15);
        }
        contacts++;
      }
    }
  }

  // Integrate orientation from angular velocity, with damping.
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    b.angVel.multiplyScalar(1 - ANGULAR_DAMPING * dt * 6);
    const w = b.angVel;
    _omega.set(w.x * dt, w.y * dt, w.z * dt, 0).multiply(b.quat);
    b.quat.x += 0.5 * _omega.x;
    b.quat.y += 0.5 * _omega.y;
    b.quat.z += 0.5 * _omega.z;
    b.quat.w += 0.5 * _omega.w;
    b.quat.normalize();
  }

  contactCount = contacts;
}

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// HUD overlay (contact count + reset)
// ---------------------------------------------------------------------------
function buildHud(): { contactEl: HTMLSpanElement } {
  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; overflow: hidden; background: #10141c;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
    #hud { position: fixed; top: 16px; left: 16px; z-index: 10;
      background: rgba(18, 22, 32, 0.82); color: #e8edf6; padding: 16px 18px;
      border: 1px solid rgba(120, 150, 200, 0.25); border-radius: 12px;
      backdrop-filter: blur(6px); min-width: 220px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
    #hud h1 { margin: 0 0 4px; font-size: 15px; letter-spacing: 0.3px; }
    #hud .sub { margin: 0 0 12px; font-size: 12px; color: #9fb0c8; }
    .stat { display: flex; align-items: baseline; justify-content: space-between;
      margin: 6px 0; font-size: 13px; color: #c7d3e6; }
    .stat .val { font-size: 22px; font-weight: 700; color: #ffd93d;
      font-variant-numeric: tabular-nums; }
    .stat.cubes .val { color: #6bcB77; font-size: 16px; font-weight: 600; }
    #reset { margin-top: 12px; width: 100%; cursor: pointer; border: none;
      padding: 10px 14px; border-radius: 9px; font-size: 13px; font-weight: 600;
      color: #0d1018; background: linear-gradient(180deg, #ffd93d, #f4b400);
      transition: transform 0.06s ease, filter 0.15s ease; }
    #reset:hover { filter: brightness(1.07); }
    #reset:active { transform: translateY(1px); }
    #hint { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%);
      z-index: 10; color: #8a99b3; font-size: 12px; background: rgba(18,22,32,0.6);
      padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(120,150,200,0.15); }
  `;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <h1>Physics Playground</h1>
    <p class="sub">50 cubes falling onto a tilted ramp</p>
    <div class="stat"><span>Live contacts</span><span class="val" id="contacts">0</span></div>
    <div class="stat cubes"><span>Falling cubes</span><span class="val">${CUBE_COUNT}</span></div>
    <button id="reset">⟳ Reset simulation</button>
  `;
  document.body.appendChild(hud);

  const hint = document.createElement('div');
  hint.id = 'hint';
  hint.textContent = 'Drag to orbit • Scroll to zoom • Right-drag to pan';
  document.body.appendChild(hint);

  const btn = hud.querySelector('#reset') as HTMLButtonElement;
  btn.addEventListener('click', () => resetSimulation());

  return { contactEl: hud.querySelector('#contacts') as HTMLSpanElement };
}

const { contactEl } = buildHud();

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const dummy = new THREE.Object3D();
const scaleVec = new THREE.Vector3(1, 1, 1);
const clock = new THREE.Clock();
let displayedContacts = -1;

function syncInstances(): void {
  for (let i = 0; i < CUBE_COUNT; i++) {
    const b = bodies[i];
    dummy.position.copy(b.pos);
    dummy.quaternion.copy(b.quat);
    dummy.scale.copy(scaleVec);
    dummy.updateMatrix();
    cubes.setMatrixAt(i, dummy.matrix);
  }
  cubes.instanceMatrix.needsUpdate = true;
}

function animate(): void {
  requestAnimationFrame(animate);

  let frameDt = clock.getDelta();
  if (frameDt > 0.05) frameDt = 0.05; // avoid huge steps after a stall

  let remaining = frameDt;
  let steps = 0;
  while (remaining > 1e-5 && steps < MAX_SUBSTEPS) {
    step(Math.min(FIXED_DT, remaining));
    remaining -= FIXED_DT;
    steps++;
  }

  syncInstances();
  controls.update();

  if (contactCount !== displayedContacts) {
    contactEl.textContent = String(contactCount);
    displayedContacts = contactCount;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetSimulation();
syncInstances();
animate();
