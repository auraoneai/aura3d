/**
 * Physics Playground — 50 procedurally simulated cubes tumbling onto a tilted
 * ramp, with collision response, orbiting camera, a reset button and a live
 * contact-count overlay. The rigid-body solver lives in ./physics.ts.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  PhysicsWorld,
  RigidBody,
  PlaneCollider,
  RampCollider,
} from "./physics";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CUBE_COUNT = 50;
const CUBE_SIZE = 0.9;
const HALF = CUBE_SIZE / 2;

const FLOOR_HALF = 13;
const WALL_HEIGHT = 6;

const RAMP_CENTER = new THREE.Vector3(-1.5, 5, 0);
const RAMP_TILT = -0.42; // radians, about the Z axis
const RAMP_HALF_X = 6.5;
const RAMP_HALF_Z = 5;
const RAMP_THICKNESS = 0.7;

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10141c);
scene.fog = new THREE.Fog(0x10141c, 35, 70);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(17, 13, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 8;
controls.maxDistance = 60;
controls.autoRotate = false;
controls.update();

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x202024, 0.6));
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ---------------------------------------------------------------------------
// Physics world + static colliders
// ---------------------------------------------------------------------------
const world = new PhysicsWorld();

// Ground plane (infinite half-space, normal up).
world.addStatic(
  new PlaneCollider(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)),
);
// Containing walls so the pile stays in frame.
world.addStatic(
  new PlaneCollider(new THREE.Vector3(FLOOR_HALF, 0, 0), new THREE.Vector3(-1, 0, 0)),
);
world.addStatic(
  new PlaneCollider(new THREE.Vector3(-FLOOR_HALF, 0, 0), new THREE.Vector3(1, 0, 0)),
);
world.addStatic(
  new PlaneCollider(new THREE.Vector3(0, 0, FLOOR_HALF), new THREE.Vector3(0, 0, -1)),
);
world.addStatic(
  new PlaneCollider(new THREE.Vector3(0, 0, -FLOOR_HALF), new THREE.Vector3(0, 0, 1)),
);

// Tilted ramp.
const rampQuat = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, 0, RAMP_TILT),
);
world.addStatic(
  new RampCollider(
    RAMP_CENTER,
    rampQuat,
    RAMP_HALF_X,
    RAMP_HALF_Z,
    RAMP_THICKNESS,
  ),
);

// ---------------------------------------------------------------------------
// Visual environment meshes
// ---------------------------------------------------------------------------
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(FLOOR_HALF * 2, 0.4, FLOOR_HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.95 }),
);
floor.position.y = -0.2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(
  FLOOR_HALF * 2,
  FLOOR_HALF * 2,
  0x4a5570,
  0x33394a,
);
grid.position.y = 0.011;
scene.add(grid);

// Low containing walls (visual only — collision handled by PlaneColliders).
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x3a4256,
  roughness: 0.9,
  transparent: true,
  opacity: 0.32,
});
function addWall(w: number, d: number, x: number, z: number) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
  wall.position.set(x, WALL_HEIGHT / 2, z);
  scene.add(wall);
}
addWall(0.3, FLOOR_HALF * 2, FLOOR_HALF, 0);
addWall(0.3, FLOOR_HALF * 2, -FLOOR_HALF, 0);
addWall(FLOOR_HALF * 2, 0.3, 0, FLOOR_HALF);
addWall(FLOOR_HALF * 2, 0.3, 0, -FLOOR_HALF);

// Ramp mesh.
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(RAMP_HALF_X * 2, RAMP_THICKNESS, RAMP_HALF_Z * 2),
  new THREE.MeshStandardMaterial({
    color: 0xc9762f,
    roughness: 0.7,
    metalness: 0.05,
  }),
);
ramp.position.copy(RAMP_CENTER);
ramp.quaternion.copy(rampQuat);
ramp.castShadow = true;
ramp.receiveShadow = true;
scene.add(ramp);

// ---------------------------------------------------------------------------
// Cubes
// ---------------------------------------------------------------------------
const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
const cubeMeshes: THREE.Mesh[] = [];
const cubeBodies: RigidBody[] = [];

for (let i = 0; i < CUBE_COUNT; i++) {
  const hue = (i / CUBE_COUNT) * 0.85;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.62, 0.55),
    roughness: 0.45,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(cubeGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  cubeMeshes.push(mesh);

  const body = new RigidBody(new THREE.Vector3(HALF, HALF, HALF), 1);
  world.addBody(body);
  cubeBodies.push(body);
}

function resetCubes(): void {
  for (let i = 0; i < CUBE_COUNT; i++) {
    const body = cubeBodies[i];
    // Loose cloud above the high (−X) side of the ramp so cubes land, slide
    // down the slope, tumble off the low edge and pile against the wall.
    body.position.set(
      -7 + Math.random() * 6,
      9 + Math.random() * 9,
      -4 + Math.random() * 8,
    );
    body.quaternion
      .setFromEuler(
        new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        ),
      )
      .normalize();
    body.velocity.set((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
    );
  }
}
resetCubes();

function syncMeshes(): void {
  for (let i = 0; i < CUBE_COUNT; i++) {
    cubeMeshes[i].position.copy(cubeBodies[i].position);
    cubeMeshes[i].quaternion.copy(cubeBodies[i].quaternion);
  }
}
syncMeshes();

// ---------------------------------------------------------------------------
// UI overlay
// ---------------------------------------------------------------------------
const overlay = document.createElement("div");
overlay.style.cssText = `
  position: fixed; top: 16px; left: 16px; z-index: 10;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e8edf6; background: rgba(16, 20, 28, 0.78);
  border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
  padding: 14px 16px; min-width: 210px; backdrop-filter: blur(6px);
  box-shadow: 0 8px 28px rgba(0,0,0,0.45); user-select: none;
`;
overlay.innerHTML = `
  <div style="font-size:15px;font-weight:700;letter-spacing:.3px;margin-bottom:8px;">
    Physics Playground
  </div>
  <div style="font-size:12px;line-height:1.7;opacity:.92;">
    <div>Cubes: <b id="hud-cubes">${CUBE_COUNT}</b></div>
    <div>Live contacts: <b id="hud-contacts" style="color:#ffd166;">0</b></div>
    <div>FPS: <b id="hud-fps">–</b></div>
  </div>
  <button id="hud-reset" style="
    margin-top:12px; width:100%; cursor:pointer;
    font-family:inherit; font-size:13px; font-weight:600;
    color:#10141c; background:#ffd166; border:none; border-radius:7px;
    padding:9px 12px;">↻ Reset</button>
  <div style="font-size:11px;opacity:.6;margin-top:10px;line-height:1.5;">
    Drag to orbit · scroll to zoom
  </div>
`;
document.body.appendChild(overlay);

const hudContacts = overlay.querySelector<HTMLElement>("#hud-contacts")!;
const hudFps = overlay.querySelector<HTMLElement>("#hud-fps")!;
const resetBtn = overlay.querySelector<HTMLButtonElement>("#hud-reset")!;
resetBtn.addEventListener("click", () => {
  resetCubes();
  syncMeshes();
});

// ---------------------------------------------------------------------------
// Main loop (fixed-timestep physics)
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let accumulator = 0;
const FIXED_DT = 1 / 60;
let fpsTimer = 0;
let frames = 0;

function animate(): void {
  const frameDt = Math.min(clock.getDelta(), 0.05);
  accumulator += frameDt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 5) {
    world.step(FIXED_DT, 2);
    accumulator -= FIXED_DT;
    steps++;
  }

  syncMeshes();
  controls.update();
  renderer.render(scene, camera);

  hudContacts.textContent = String(world.contactCount);

  frames++;
  fpsTimer += frameDt;
  if (fpsTimer >= 0.5) {
    hudFps.textContent = String(Math.round(frames / fpsTimer));
    frames = 0;
    fpsTimer = 0;
  }
}
renderer.setAnimationLoop(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
