/**
 * Physics Playground — Prompt 01
 *
 * 50 procedurally generated cubes fall onto a tilted ramp and pile up at its
 * base. The rigid-body simulation (gravity, broadphase, contact detection,
 * collision response, friction, sleeping) is the real Aura3D physics engine
 * imported from `@aura3d/engine/physics`. Rendering uses `three` — the same
 * renderer the Aura3D engine ships and uses internally — driven each frame from
 * the physics body transforms. The HTML overlay exposes a reset control and a
 * live contact count read straight from the physics world snapshot.
 *
 * No external assets: the ramp, ground and cubes are all built procedurally.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PhysicsWorld, Shape, type RigidBody } from "@aura3d/engine/physics";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const CUBE_COUNT = 50;
const CUBE_SIZE = 1; // full edge length
const HALF = CUBE_SIZE / 2;
const RAMP_ANGLE = THREE.MathUtils.degToRad(22); // tilt of the ramp
const RAMP_SURFACE_AT_X0 = 3; // world Y where the ramp surface crosses x = 0
const RAMP_THICKNESS = 0.5;
const GRAVITY_Y = -12;
const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 6;

// Ramp plane: normal tilted about Z so the ramp is high on -x, low on +x.
const RAMP_NORMAL: readonly [number, number, number] = [
  Math.sin(RAMP_ANGLE),
  Math.cos(RAMP_ANGLE),
  0,
];
const RAMP_CONSTANT = -RAMP_SURFACE_AT_X0 * Math.cos(RAMP_ANGLE);

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>("#app")!;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0d1424");
scene.fog = new THREE.Fog("#0d1424", 45, 95);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
camera.position.set(16, 12, 19);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(2.5, 1.5, 0);
controls.minDistance = 6;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.495; // keep the camera above the floor
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

scene.add(new THREE.HemisphereLight("#9fc0ff", "#1b2233", 0.75));
scene.add(new THREE.AmbientLight("#ffffff", 0.25));

const sun = new THREE.DirectionalLight("#fff4e0", 2.1);
sun.position.set(14, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.bias = -0.0004;
scene.add(sun);

const rim = new THREE.DirectionalLight("#5e8bff", 0.6);
rim.position.set(-16, 10, -14);
scene.add(rim);

// ---------------------------------------------------------------------------
// Physics world (the real Aura3D rigid-body engine)
// ---------------------------------------------------------------------------

const world = new PhysicsWorld({
  gravity: [0, GRAVITY_Y, 0],
  fixedDelta: FIXED_DT,
  solverIterations: 8,
  enableSleeping: true,
  sleepVelocityThreshold: 0.28,
  sleepDelay: 0.8,
});

// ---------------------------------------------------------------------------
// Static geometry: ground + tilted ramp (visual + physics)
// ---------------------------------------------------------------------------

// --- Ground (visual) ---
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: "#141c2e", roughness: 0.95, metalness: 0.05 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(120, 60, 0x2c3a5a, 0x1b2436);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.5;
grid.position.y = 0.01;
scene.add(grid);

// --- Ground (physics): infinite horizontal plane at y = 0 ---
{
  const body = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.6 });
  world.createCollider(body, {
    shape: Shape.plane([0, 1, 0], 0),
    material: { friction: 0.6, restitution: 0.0 },
  });
}

// --- Ramp (physics): tilted infinite plane ---
{
  const body = world.createRigidBody({ type: "static", position: [0, 0, 0], friction: 0.5 });
  world.createCollider(body, {
    shape: Shape.plane(RAMP_NORMAL, RAMP_CONSTANT),
    material: { friction: 0.45, restitution: 0.08 },
  });
}

// --- Ramp (visual): a tilted slab whose top face lies on the physics plane ---
{
  const rampLength = 20;
  const rampWidth = 12;
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(rampLength, RAMP_THICKNESS, rampWidth),
    new THREE.MeshStandardMaterial({ color: "#3a5a86", roughness: 0.6, metalness: 0.15 }),
  );
  ramp.receiveShadow = true;
  ramp.castShadow = true;
  // Rotating a box about Z by -angle turns its +Y face normal into RAMP_NORMAL.
  ramp.rotation.z = -RAMP_ANGLE;
  // Place so the slab's top face sits exactly on the physics plane near x = 0.
  ramp.position.set(
    -(RAMP_THICKNESS / 2) * Math.sin(RAMP_ANGLE),
    RAMP_SURFACE_AT_X0 - (RAMP_THICKNESS / 2) * Math.cos(RAMP_ANGLE),
    0,
  );
  scene.add(ramp);

  // Side rails so the slope reads clearly as a ramp.
  const railMat = new THREE.MeshStandardMaterial({ color: "#5a7db0", roughness: 0.5, metalness: 0.2 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rampLength, 0.5, 0.4), railMat);
    rail.castShadow = true;
    rail.receiveShadow = true;
    rail.rotation.z = -RAMP_ANGLE;
    rail.position.set(
      ramp.position.x + Math.sin(RAMP_ANGLE) * 0.45,
      ramp.position.y + Math.cos(RAMP_ANGLE) * 0.45,
      side * (rampWidth / 2 - 0.2),
    );
    scene.add(rail);
  }
}

// ---------------------------------------------------------------------------
// Falling cubes
// ---------------------------------------------------------------------------

interface Cube {
  body: RigidBody;
  mesh: THREE.Mesh;
}

const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const cubes: Cube[] = [];

function randomDrop(): [number, number, number] {
  return [
    -5 + Math.random() * 6, // x: over the upper half of the ramp
    7 + Math.random() * 11, // y: staggered heights so they cascade, not clump
    -3.5 + Math.random() * 7, // z
  ];
}

function randomSpin(): [number, number, number] {
  return [
    (Math.random() - 0.5) * 2.5,
    (Math.random() - 0.5) * 2.5,
    (Math.random() - 0.5) * 2.5,
  ];
}

function createCubes(): void {
  for (let i = 0; i < CUBE_COUNT; i++) {
    const body = world.createRigidBody({
      type: "dynamic",
      position: randomDrop(),
      angularVelocity: randomSpin(),
      mass: 1,
      restitution: 0.12,
      friction: 0.5,
      linearDamping: 0.02,
      angularDamping: 0.35,
    });
    world.createCollider(body, {
      shape: Shape.box(HALF, HALF, HALF),
      material: { friction: 0.5, restitution: 0.12 },
    });

    const color = new THREE.Color().setHSL(i / CUBE_COUNT, 0.62, 0.56);
    const mesh = new THREE.Mesh(
      cubeGeo,
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    cubes.push({ body, mesh });
  }
}

function resetCubes(): void {
  for (const { body } of cubes) {
    body.setPosition(randomDrop());
    body.setVelocity([0, 0, 0]);
    body.setAngularVelocity(randomSpin());
    body.setRotation([0, 0, 0, 1]);
    body.wake();
  }
}

createCubes();

function syncMeshes(): void {
  for (const { body, mesh } of cubes) {
    mesh.position.set(body.position[0], body.position[1], body.position[2]);
    mesh.quaternion.set(body.rotation[0], body.rotation[1], body.rotation[2], body.rotation[3]);
  }
}
syncMeshes();

// ---------------------------------------------------------------------------
// Overlay UI: title, live contact count, reset control
// ---------------------------------------------------------------------------

const ui = document.createElement("div");
ui.className = "aura-ui";
ui.innerHTML = `
  <div class="panel">
    <h1>Physics Playground</h1>
    <p class="sub">${CUBE_COUNT} rigid-body cubes · tilted ramp · Aura3D physics</p>
    <div class="stats">
      <div class="stat"><span class="label">Live contacts</span><span class="value" id="contacts">0</span></div>
      <div class="stat"><span class="label">Cubes</span><span class="value" id="cubeCount">${CUBE_COUNT}</span></div>
      <div class="stat"><span class="label">Settled</span><span class="value" id="settled">0</span></div>
      <div class="stat"><span class="label">FPS</span><span class="value" id="fps">–</span></div>
    </div>
    <button id="reset">⟳ Reset Simulation</button>
    <p class="hint">Drag to orbit · scroll to zoom · right-drag to pan</p>
  </div>
`;
app.appendChild(ui);

const style = document.createElement("style");
style.textContent = `
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; background: #0d1424; overflow: hidden; }
  #app { position: fixed; inset: 0; }
  #app canvas { display: block; width: 100%; height: 100%; }
  .aura-ui {
    position: absolute; top: 18px; left: 18px; z-index: 10;
    font-family: "Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #eaf1ff; pointer-events: none;
  }
  .panel {
    pointer-events: auto;
    background: rgba(15, 22, 40, 0.82);
    border: 1px solid rgba(120, 160, 230, 0.28);
    border-radius: 14px;
    padding: 16px 18px;
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
    width: 250px;
  }
  .panel h1 { margin: 0; font-size: 18px; letter-spacing: 0.2px; }
  .panel .sub { margin: 4px 0 14px; font-size: 11.5px; color: #9fb2d6; line-height: 1.4; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .stat {
    background: rgba(40, 56, 92, 0.45);
    border: 1px solid rgba(120, 160, 230, 0.18);
    border-radius: 9px; padding: 8px 10px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .stat .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #8ea3c9; }
  .stat .value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  #contacts { color: #6ee7a8; }
  button#reset {
    width: 100%; cursor: pointer;
    background: linear-gradient(135deg, #4f7cff, #6a5cff);
    color: white; border: none; border-radius: 10px;
    padding: 11px 12px; font-size: 14px; font-weight: 600;
    transition: transform 0.08s ease, filter 0.15s ease;
  }
  button#reset:hover { filter: brightness(1.1); }
  button#reset:active { transform: scale(0.97); }
  .panel .hint { margin: 11px 0 0; font-size: 10.5px; color: #7f93b8; text-align: center; }
`;
document.head.appendChild(style);

const contactsEl = document.getElementById("contacts")!;
const settledEl = document.getElementById("settled")!;
const fpsEl = document.getElementById("fps")!;
document.getElementById("reset")!.addEventListener("click", resetCubes);

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function resize(): void {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------------------------------------------------------------------------
// Main loop: fixed-step physics, sync, render, live stats
// ---------------------------------------------------------------------------

let lastTime = performance.now();
let accumulator = 0;
let liveContacts = 0;
let fpsSmooth = 60;

function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  fpsSmooth += (1 / Math.max(dt, 1e-4) - fpsSmooth) * 0.1;

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    world.step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps > 0) {
    // Live contact count straight from the physics world snapshot.
    liveContacts = world.snapshot().stats.contacts;
  }

  syncMeshes();

  let settled = 0;
  for (const { body } of cubes) if (body.sleeping) settled++;

  contactsEl.textContent = String(liveContacts);
  settledEl.textContent = String(settled);
  fpsEl.textContent = String(Math.round(fpsSmooth));

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
