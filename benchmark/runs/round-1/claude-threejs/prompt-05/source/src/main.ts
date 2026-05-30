// 3D Data Visualization — 6x6 grid of animated bars.
//
// Features:
//  - 36 bars (6 columns x 6 rows) on a ground grid.
//  - Heights animate (ease) toward randomized target values; re-randomized
//    periodically and on demand.
//  - Bar color is derived from its (normalized) height via a heatmap gradient.
//  - Hover-highlight: the bar under the pointer brightens and a tooltip shows
//    its grid coordinate and value.
//  - Orbit camera (OrbitControls) — drag to rotate, scroll to zoom, right-drag
//    to pan.
//  - Readable axis labels rendered as crisp DOM overlays (CSS2DRenderer):
//    column/row tick labels, a vertical value axis with ticks, and axis titles.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CSS2DRenderer,
  CSS2DObject,
} from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GRID = 6; // 6 x 6 = 36 bars
const SPACING = 1.4; // distance between bar centers
const BAR_SIZE = 0.85; // bar footprint (x/z extent)
const MAX_HEIGHT = 6; // tallest a bar can grow
const MIN_HEIGHT = 0.3; // shortest a bar can be
const HALF = ((GRID - 1) * SPACING) / 2; // half-extent of the grid in world units
const REROLL_MS = 4000; // auto re-randomize interval

// ---------------------------------------------------------------------------
// Renderer + scene + camera
// ---------------------------------------------------------------------------

const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// CSS2D overlay renderer for crisp, always-readable text labels.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10131c);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(11, 9, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.49; // keep camera above the ground
controls.target.set(0, MAX_HEIGHT * 0.35, 0);

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0x88aaff, 0x223044, 0.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(8, 14, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 50;
const sc = keyLight.shadow.camera as THREE.OrthographicCamera;
sc.left = -12;
sc.right = 12;
sc.top = 12;
sc.bottom = -12;
scene.add(keyLight);

// ---------------------------------------------------------------------------
// Ground + grid helper
// ---------------------------------------------------------------------------

const groundSize = GRID * SPACING + 2;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(groundSize, GRID + 2, 0x3a4b6b, 0x26304a);
scene.add(gridHelper);

// ---------------------------------------------------------------------------
// Color-by-height heatmap
// ---------------------------------------------------------------------------

// Map a normalized value t in [0,1] to a heatmap color:
// low -> blue, mid -> green/yellow, high -> red.
function heatColor(t: number, target = new THREE.Color()): THREE.Color {
  const hue = (1 - THREE.MathUtils.clamp(t, 0, 1)) * 0.66; // 0.66 (blue) -> 0 (red)
  return target.setHSL(hue, 0.85, 0.52);
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

interface Bar {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  col: number;
  row: number;
  height: number; // current (animated) height
  target: number; // height we are easing toward
  baseColor: THREE.Color; // color for current height (restored after hover)
  hovered: boolean;
}

// Unit-height box; we scale Y and offset position so the base sits on y = 0.
const barGeometry = new THREE.BoxGeometry(BAR_SIZE, 1, BAR_SIZE);

const bars: Bar[] = [];
const barGroup = new THREE.Group();
scene.add(barGroup);

function randomTarget(): number {
  return MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
}

for (let col = 0; col < GRID; col++) {
  for (let row = 0; row < GRID; row++) {
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.15,
    });

    const mesh = new THREE.Mesh(barGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.x = col * SPACING - HALF;
    mesh.position.z = row * SPACING - HALF;

    const bar: Bar = {
      mesh,
      material,
      col,
      row,
      height: 0,
      target: randomTarget(),
      baseColor: new THREE.Color(),
      hovered: false,
    };
    mesh.userData.bar = bar;

    barGroup.add(mesh);
    bars.push(bar);
  }
}

function applyHeight(bar: Bar): void {
  const h = Math.max(bar.height, 0.0001);
  bar.mesh.scale.y = h;
  bar.mesh.position.y = h / 2;

  const t = (h - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
  heatColor(t, bar.baseColor);
  if (!bar.hovered) {
    bar.material.color.copy(bar.baseColor);
    bar.material.emissive.setRGB(0, 0, 0);
  }
}

function reroll(): void {
  for (const bar of bars) bar.target = randomTarget();
}

// ---------------------------------------------------------------------------
// Axis labels (CSS2DRenderer DOM overlays — always crisp & readable)
// ---------------------------------------------------------------------------

function makeLabel(text: string, className: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

const labelGroup = new THREE.Group();
scene.add(labelGroup);

const edge = HALF + SPACING * 0.55;

// Column tick labels (X axis): C1..C6 along the front edge.
for (let col = 0; col < GRID; col++) {
  const label = makeLabel(`C${col + 1}`, 'tick tick-col');
  label.position.set(col * SPACING - HALF, 0.05, edge);
  labelGroup.add(label);
}

// Row tick labels (Z axis): R1..R6 along the left edge.
for (let row = 0; row < GRID; row++) {
  const label = makeLabel(`R${row + 1}`, 'tick tick-row');
  label.position.set(-edge, 0.05, row * SPACING - HALF);
  labelGroup.add(label);
}

// Value axis (Y): a vertical line with numeric ticks at a back corner.
const axisX = -edge;
const axisZ = -edge;
const valueAxis = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(axisX, 0, axisZ),
    new THREE.Vector3(axisX, MAX_HEIGHT, axisZ),
  ]),
  new THREE.LineBasicMaterial({ color: 0x7f8db0 }),
);
scene.add(valueAxis);

const VALUE_TICKS = 6;
for (let i = 0; i <= VALUE_TICKS; i++) {
  const v = (i / VALUE_TICKS) * MAX_HEIGHT;
  const label = makeLabel(v.toFixed(1), 'tick tick-value');
  label.position.set(axisX, v, axisZ);
  labelGroup.add(label);
}

// Axis titles.
const titleX = makeLabel('Column (X)', 'axis-title');
titleX.position.set(0, -0.2, edge + SPACING * 0.6);
labelGroup.add(titleX);

const titleZ = makeLabel('Row (Z)', 'axis-title');
titleZ.position.set(-edge - SPACING * 0.6, -0.2, 0);
labelGroup.add(titleZ);

const titleY = makeLabel('Value (Y)', 'axis-title');
titleY.position.set(axisX, MAX_HEIGHT + 0.7, axisZ);
labelGroup.add(titleY);

// ---------------------------------------------------------------------------
// Hover-highlight (raycasting)
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerActive = false;
let hoveredBar: Bar | null = null;

const tooltip = document.createElement('div');
tooltip.id = 'tooltip';
tooltip.style.display = 'none';
document.body.appendChild(tooltip);

renderer.domElement.addEventListener('pointermove', (e: PointerEvent) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerActive = true;
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top = `${e.clientY + 14}px`;
});

renderer.domElement.addEventListener('pointerleave', () => {
  pointerActive = false;
});

function setHovered(bar: Bar | null): void {
  if (hoveredBar === bar) return;

  // Restore the previously hovered bar.
  if (hoveredBar) {
    hoveredBar.hovered = false;
    hoveredBar.material.color.copy(hoveredBar.baseColor);
    hoveredBar.material.emissive.setRGB(0, 0, 0);
  }

  hoveredBar = bar;

  if (bar) {
    bar.hovered = true;
    // Brighten the bar and add an emissive glow tinted by its own color.
    bar.material.color.copy(bar.baseColor).offsetHSL(0, 0, 0.18);
    bar.material.emissive.copy(bar.baseColor).multiplyScalar(0.6);
    tooltip.style.display = 'block';
  } else {
    tooltip.style.display = 'none';
  }
}

function updateHover(): void {
  if (!pointerActive) {
    setHovered(null);
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(barGroup.children, false);
  if (hits.length > 0) {
    const bar = hits[0].object.userData.bar as Bar;
    setHovered(bar);
    // Keep the tooltip value live as the bar animates.
    tooltip.innerHTML = `C${bar.col + 1} &middot; R${bar.row + 1}<br><b>${bar.height.toFixed(2)}</b>`;
  } else {
    setHovered(null);
  }
}

// ---------------------------------------------------------------------------
// UI: re-randomize button + on-screen help
// ---------------------------------------------------------------------------

const ui = document.createElement('div');
ui.id = 'ui';
ui.innerHTML = `
  <h1>3D Data Visualization</h1>
  <p>6&times;6 grid &middot; 36 bars &middot; color encodes height</p>
  <button id="reroll">Randomize heights</button>
  <p class="hint">Drag to orbit &middot; scroll to zoom &middot; hover a bar to highlight</p>
`;
document.body.appendChild(ui);
(document.getElementById('reroll') as HTMLButtonElement).addEventListener(
  'click',
  reroll,
);

let lastReroll = performance.now();

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function animate(): void {
  const dt = clock.getDelta();
  const now = performance.now();

  if (now - lastReroll > REROLL_MS) {
    reroll();
    lastReroll = now;
  }

  // Ease each bar's height toward its target.
  const ease = 1 - Math.exp(-4 * dt); // frame-rate independent smoothing
  for (const bar of bars) {
    if (Math.abs(bar.target - bar.height) > 0.0005) {
      bar.height += (bar.target - bar.height) * ease;
      applyHeight(bar);
    }
  }

  updateHover();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize bar heights/colors at zero so the first frame animates upward.
for (const bar of bars) applyHeight(bar);
