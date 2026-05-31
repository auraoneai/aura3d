import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CSS2DRenderer,
  CSS2DObject,
} from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// 3D Data Visualization: a 6x6 grid of bars.
//  - Heights animate from random values (each bar lerps toward a target that
//    is periodically re-randomized).
//  - Color is mapped from bar height (low = cool blue, high = warm red).
//  - Hovering a bar highlights it (raycaster on pointermove).
//  - Orbit camera via OrbitControls.
//  - Readable axis labels rendered as HTML overlays via CSS2DRenderer.
// ---------------------------------------------------------------------------

const GRID = 6; // 6 x 6 = 36 bars
const COUNT = GRID * GRID;
const SPACING = 1.4; // distance between bar centers
const BAR_FOOT = 0.85; // footprint (x/z) of each bar
const MAX_HEIGHT = 6; // tallest a bar can grow
const MIN_HEIGHT = 0.3;
const RETARGET_MS = 2600; // how often new random targets are chosen

const app = document.getElementById('app') as HTMLDivElement;

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// Label renderer overlays the WebGL canvas.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

// --- Scene / Camera -------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1220);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(11, 9, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 2, 0);
controls.maxPolarAngle = Math.PI * 0.49; // stay above the floor
controls.minDistance = 6;
controls.maxDistance = 40;

// --- Lighting -------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202535, 0.7));
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(8, 16, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
const s = 14;
key.shadow.camera.left = -s;
key.shadow.camera.right = s;
key.shadow.camera.top = s;
key.shadow.camera.bottom = -s;
scene.add(key);

// --- Floor ----------------------------------------------------------------
const floorSize = GRID * SPACING + 3;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(floorSize, floorSize),
  new THREE.MeshStandardMaterial({ color: 0x161b2e, roughness: 0.95, metalness: 0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(floorSize, GRID + 2, 0x33405f, 0x222a40);
grid.position.y = 0.001;
scene.add(grid);

// --- Bars -----------------------------------------------------------------
// Unit-height box (height 1) so we can scale.y to the live height and keep the
// foot planted on the floor by offsetting position.y.
const barGeo = new THREE.BoxGeometry(BAR_FOOT, 1, BAR_FOOT);
barGeo.translate(0, 0.5, 0); // origin at the bottom face

interface Bar {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  current: number;
  target: number;
}

const bars: Bar[] = [];
const offset = ((GRID - 1) * SPACING) / 2;
const color = new THREE.Color();

function heightToColor(h: number): THREE.Color {
  const t = THREE.MathUtils.clamp((h - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT), 0, 1);
  // Hue sweep: 0.62 (blue) -> 0.0 (red) as height increases.
  return color.setHSL(0.62 * (1 - t), 0.85, 0.55);
}

function randomHeight(): number {
  return MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
}

for (let r = 0; r < GRID; r++) {
  for (let c = 0; c < GRID; c++) {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.15,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 1,
    });
    const mesh = new THREE.Mesh(barGeo, mat);
    mesh.position.set(c * SPACING - offset, 0, r * SPACING - offset);
    mesh.scale.y = 0.001;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    bars.push({ mesh, current: 0, target: randomHeight() });
  }
}

// --- Axis labels (readable HTML overlays) ---------------------------------
function makeLabel(text: string, className: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

const labelStyle = document.createElement('style');
labelStyle.textContent = `
  .axis-label {
    font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #dce6ff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    white-space: nowrap;
  }
  .axis-title {
    font: 700 18px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #ffffff;
    letter-spacing: 0.04em;
    text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  }
  #hud {
    position: absolute; top: 14px; left: 16px;
    font: 500 13px/1.5 system-ui, sans-serif; color: #aeb9d6;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none;
  }
  #hud b { color: #fff; }
`;
document.head.appendChild(labelStyle);

const edge = offset + SPACING * 0.9;

// Column labels (X axis) along the front edge.
for (let c = 0; c < GRID; c++) {
  const l = makeLabel(`C${c + 1}`, 'axis-label');
  l.position.set(c * SPACING - offset, 0.05, edge);
  scene.add(l);
}
// Row labels (Z axis) along the left edge.
for (let r = 0; r < GRID; r++) {
  const l = makeLabel(`R${r + 1}`, 'axis-label');
  l.position.set(-edge, 0.05, r * SPACING - offset);
  scene.add(l);
}

// Axis titles.
const xTitle = makeLabel('X — COLUMN', 'axis-title');
xTitle.position.set(0, 0.05, edge + SPACING);
scene.add(xTitle);

const zTitle = makeLabel('Z — ROW', 'axis-title');
zTitle.position.set(-edge - SPACING, 0.05, 0);
scene.add(zTitle);

// Vertical (height / value) axis with tick labels.
const yAxisX = -edge;
const yAxisZ = -edge;
const yTitle = makeLabel('Y — VALUE', 'axis-title');
yTitle.position.set(yAxisX, MAX_HEIGHT + 0.8, yAxisZ);
scene.add(yTitle);

const axisLineMat = new THREE.LineBasicMaterial({ color: 0x6c7bb0 });
const axisLineGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(yAxisX, 0, yAxisZ),
  new THREE.Vector3(yAxisX, MAX_HEIGHT, yAxisZ),
]);
scene.add(new THREE.Line(axisLineGeo, axisLineMat));

const TICKS = 6;
for (let i = 0; i <= TICKS; i++) {
  const v = (MAX_HEIGHT / TICKS) * i;
  const l = makeLabel(v.toFixed(0), 'axis-label');
  l.position.set(yAxisX - 0.1, v, yAxisZ);
  scene.add(l);
}

// --- Hover highlight ------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered: Bar | null = null;
let hasPointer = false;

renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  hasPointer = true;
});
renderer.domElement.addEventListener('pointerleave', () => {
  hasPointer = false;
});

const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML =
  '<b>3D Data Visualization</b> — 6×6 = 36 bars<br>' +
  'Drag to orbit · scroll to zoom · hover a bar to highlight';
app.appendChild(hud);

function updateHover() {
  if (!hasPointer) {
    if (hovered) {
      hovered.mesh.material.emissive.setHex(0x000000);
      hovered = null;
    }
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(bars.map((b) => b.mesh), false)[0];
  const next = hit ? bars.find((b) => b.mesh === hit.object) ?? null : null;
  if (next !== hovered) {
    if (hovered) hovered.mesh.material.emissive.setHex(0x000000);
    hovered = next;
    if (hovered) hovered.mesh.material.emissive.setHex(0x4d4d4d);
  }
}

// --- Animation ------------------------------------------------------------
const clock = new THREE.Clock();
let retargetTimer = 0;

function retarget() {
  for (const b of bars) b.target = randomHeight();
}

function animate() {
  const dt = clock.getDelta();

  retargetTimer += dt * 1000;
  if (retargetTimer >= RETARGET_MS) {
    retargetTimer = 0;
    retarget();
  }

  // Smoothly approach targets and recolor by current height.
  const k = 1 - Math.pow(0.001, dt); // frame-rate independent smoothing
  for (const b of bars) {
    b.current += (b.target - b.current) * k;
    b.mesh.scale.y = Math.max(b.current, 0.001);
    b.mesh.position.y = 0;
    b.mesh.material.color.copy(heightToColor(b.current));
  }

  updateHover();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// --- Resize ---------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});
