// Prompt 05 — 3D Data Visualization
// A 6x6 grid of 36 bars. Heights animate from random values, color maps to
// height, hovering a bar highlights it, an orbit camera lets you fly around,
// and CSS2D axis labels mark the X / Z grid axes and the value (Y) axis.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CSS2DRenderer,
  CSS2DObject,
} from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GRID = 6; // 6 x 6 = 36 bars
const SPACING = 1.5; // distance between bar centres
const BAR_SIZE = 0.9; // footprint (x/z) of each bar
const MAX_HEIGHT = 6; // tallest a bar can grow
const MIN_HEIGHT = 0.4; // shortest a bar can be
const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F']; // X axis labels
const ROWS = ['1', '2', '3', '4', '5', '6']; // Z axis labels

// Colour ramp from low (cool blue) -> mid (green) -> high (warm red).
const COLOR_LOW = new THREE.Color('#1e3a8a'); // deep blue
const COLOR_MID = new THREE.Color('#22c55e'); // green
const COLOR_HIGH = new THREE.Color('#ef4444'); // red

function colorForHeight(t: number): THREE.Color {
  // t in [0, 1]. Two-segment gradient through the mid colour.
  const c = new THREE.Color();
  if (t < 0.5) {
    c.copy(COLOR_LOW).lerp(COLOR_MID, t / 0.5);
  } else {
    c.copy(COLOR_MID).lerp(COLOR_HIGH, (t - 0.5) / 0.5);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

const app = document.getElementById('app') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// CSS2D overlay renderer used for crisp, always-readable axis labels.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b1020');

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
controls.target.set(0, 1.5, 0);
controls.minDistance = 6;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.495; // keep camera above the floor

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(8, 14, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 50;
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
fillLight.position.set(-8, 6, -8);
scene.add(fillLight);

// ---------------------------------------------------------------------------
// Floor + grid helper
// ---------------------------------------------------------------------------

const extent = (GRID - 1) * SPACING; // span from first to last bar centre
const floorSize = extent + SPACING * 2;

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(floorSize, floorSize),
  new THREE.MeshStandardMaterial({ color: '#141a30', roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(floorSize, GRID + 2, 0x2a3358, 0x1c2340);
grid.position.y = 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

interface Bar {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  current: number; // current animated height
  target: number; // height we are animating toward
  baseColor: THREE.Color; // height-derived colour (no hover highlight)
  row: number;
  col: number;
}

const bars: Bar[] = [];
const barMeshes: THREE.Object3D[] = [];

// Unit box (height 1) anchored at its base so scaling Y grows it upward.
const barGeometry = new THREE.BoxGeometry(BAR_SIZE, 1, BAR_SIZE);
barGeometry.translate(0, 0.5, 0);

function randomHeight(): number {
  return MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
}

const offset = extent / 2; // centre the grid on the origin

for (let r = 0; r < GRID; r++) {
  for (let c = 0; c < GRID; c++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.15,
    });
    const mesh = new THREE.Mesh(barGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(c * SPACING - offset, 0, r * SPACING - offset);
    mesh.scale.y = 0.01; // start flat, animate up

    const bar: Bar = {
      mesh,
      current: 0.01,
      target: randomHeight(),
      baseColor: new THREE.Color(),
      row: r,
      col: c,
    };
    mesh.userData.bar = bar;
    scene.add(mesh);

    bars.push(bar);
    barMeshes.push(mesh);
  }
}

// Refresh a bar's base colour from its current height and apply it unless the
// bar is currently the hovered (highlighted) one.
function applyColor(bar: Bar): void {
  const t = THREE.MathUtils.clamp(
    (bar.current - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT),
    0,
    1,
  );
  bar.baseColor.copy(colorForHeight(t));
  if (bar !== hoveredBar) {
    bar.mesh.material.color.copy(bar.baseColor);
    bar.mesh.material.emissive.setRGB(0, 0, 0);
  }
}

// ---------------------------------------------------------------------------
// Axis labels (CSS2D) — column letters, row numbers, and a value axis ruler.
// ---------------------------------------------------------------------------

function makeLabel(text: string, className: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

const labelGroup = new THREE.Group();
scene.add(labelGroup);

// Column (X) tick labels along the front edge.
const frontZ = offset + SPACING * 0.9;
for (let c = 0; c < GRID; c++) {
  const label = makeLabel(COLUMNS[c], 'axis-tick');
  label.position.set(c * SPACING - offset, 0.15, frontZ);
  labelGroup.add(label);
}

// Row (Z) tick labels along the left edge.
const leftX = -offset - SPACING * 0.9;
for (let r = 0; r < GRID; r++) {
  const label = makeLabel(ROWS[r], 'axis-tick');
  label.position.set(leftX, 0.15, r * SPACING - offset);
  labelGroup.add(label);
}

// Axis titles for X and Z.
const xTitle = makeLabel('X AXIS  ·  Columns A–F', 'axis-title');
xTitle.position.set(0, 0.15, frontZ + SPACING * 0.8);
labelGroup.add(xTitle);

const zTitle = makeLabel('Z AXIS  ·  Rows 1–6', 'axis-title');
zTitle.position.set(leftX - SPACING * 0.8, 0.15, 0);
labelGroup.add(zTitle);

// Value (Y) axis: a vertical ruler at the back-left corner with tick labels.
const axisX = -offset - SPACING;
const axisZ = -offset - SPACING;

const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(axisX, 0, axisZ),
  new THREE.Vector3(axisX, MAX_HEIGHT, axisZ),
]);
scene.add(
  new THREE.Line(yAxisGeom, new THREE.LineBasicMaterial({ color: 0x6b7db3 })),
);

const Y_TICKS = 4;
for (let i = 0; i <= Y_TICKS; i++) {
  const value = (i / Y_TICKS) * MAX_HEIGHT;
  const label = makeLabel(value.toFixed(1), 'axis-tick value-tick');
  label.position.set(axisX, value, axisZ);
  labelGroup.add(label);
}

const yTitle = makeLabel('VALUE (Y)', 'axis-title');
yTitle.position.set(axisX, MAX_HEIGHT + 0.6, axisZ);
labelGroup.add(yTitle);

// ---------------------------------------------------------------------------
// Hover highlight via raycasting
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredBar: Bar | null = null;
let pointerInside = false;

const readout = document.getElementById('readout') as HTMLDivElement;

window.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  pointerInside = true;
});

window.addEventListener('pointerleave', () => {
  pointerInside = false;
});

function setHovered(bar: Bar | null): void {
  if (bar === hoveredBar) return;

  // Restore the previously hovered bar to its height-based colour + size.
  if (hoveredBar) {
    hoveredBar.mesh.material.color.copy(hoveredBar.baseColor);
    hoveredBar.mesh.material.emissive.setRGB(0, 0, 0);
    hoveredBar.mesh.scale.x = 1;
    hoveredBar.mesh.scale.z = 1;
  }

  hoveredBar = bar;

  if (hoveredBar) {
    // Highlight: brighten the colour, add an emissive glow, thicken slightly.
    hoveredBar.mesh.material.color
      .copy(hoveredBar.baseColor)
      .offsetHSL(0, 0, 0.2);
    hoveredBar.mesh.material.emissive
      .copy(hoveredBar.baseColor)
      .multiplyScalar(0.6);
    hoveredBar.mesh.scale.x = 1.12;
    hoveredBar.mesh.scale.z = 1.12;

    const { col, row } = hoveredBar;
    readout.style.display = 'block';
    readout.innerHTML =
      `<strong>${COLUMNS[col]}${ROWS[row]}</strong> &nbsp; value ` +
      `<strong>${hoveredBar.current.toFixed(2)}</strong>`;
    document.body.style.cursor = 'pointer';
  } else {
    readout.style.display = 'none';
    document.body.style.cursor = 'default';
  }
}

function updateHover(): void {
  if (!pointerInside) {
    setHovered(null);
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(barMeshes, false);
  setHovered(hits.length > 0 ? (hits[0].object.userData.bar as Bar) : null);
}

// ---------------------------------------------------------------------------
// Re-randomise targets so "animate from random values" is repeatable on demand
// (button) as well as on a gentle timer, in addition to the initial grow-in.
// ---------------------------------------------------------------------------

function randomise(): void {
  for (const bar of bars) bar.target = randomHeight();
}

const shuffleBtn = document.getElementById('shuffle') as HTMLButtonElement;
shuffleBtn.addEventListener('click', randomise);

window.setInterval(randomise, 4500);

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

function animate(): void {
  // Ease each bar's height toward its target and recolour by the new height.
  for (const bar of bars) {
    bar.current += (bar.target - bar.current) * 0.06;
    bar.mesh.scale.y = bar.current;
    applyColor(bar);
  }

  // Keep the hovered bar's readout value current as it animates.
  if (hoveredBar) {
    readout.innerHTML =
      `<strong>${COLUMNS[hoveredBar.col]}${ROWS[hoveredBar.row]}</strong> ` +
      `&nbsp; value <strong>${hoveredBar.current.toFixed(2)}</strong>`;
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
