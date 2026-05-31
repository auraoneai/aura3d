// Prompt 05: 3D Data Visualization
// A 6x6 grid (36 bars) whose heights animate from random values, colored by
// height, with hover-highlight, an orbit camera, and readable axis labels.

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
const BAR_SIZE = 0.85; // footprint (width / depth) of each bar
const MAX_HEIGHT = 5; // tallest a bar can grow
const MIN_HEIGHT = 0.4; // shortest a bar can be
const RESHUFFLE_SECONDS = 3.5; // pick fresh random targets on this cadence

const container = document.getElementById('app') as HTMLDivElement;

// ---------------------------------------------------------------------------
// Renderer + label renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
container.appendChild(labelRenderer.domElement);

// ---------------------------------------------------------------------------
// Scene + camera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1320);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(11, 9, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.6, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 6;
controls.maxDistance = 40;

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(8, 14, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 50;
key.shadow.camera.left = -12;
key.shadow.camera.right = 12;
key.shadow.camera.top = 12;
key.shadow.camera.bottom = -12;
scene.add(key);

const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
fill.position.set(-8, 6, -8);
scene.add(fill);

// ---------------------------------------------------------------------------
// Ground / floor plane
// ---------------------------------------------------------------------------
const span = (GRID - 1) * SPACING;
const floorSize = span + SPACING * 3;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(floorSize, floorSize),
  new THREE.MeshStandardMaterial({ color: 0x151b2b, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(floorSize, GRID + 2, 0x2a3550, 0x202a40);
grid.position.y = 0.001;
scene.add(grid);

// ---------------------------------------------------------------------------
// Color-by-height ramp (blue -> cyan -> green -> yellow -> red)
// ---------------------------------------------------------------------------
function colorForHeight(t: number, target: THREE.Color): THREE.Color {
  // t in [0, 1]. Hue sweeps from blue (0.66) down to red (0.0).
  const hue = (1 - THREE.MathUtils.clamp(t, 0, 1)) * 0.66;
  return target.setHSL(hue, 0.85, 0.55);
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------
interface Bar {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  current: number; // current animated height
  target: number; // height being eased toward
}

// Geometry is a unit-height box translated so its base sits at y = 0; scaling
// y therefore grows the bar upward from the floor.
const barGeometry = new THREE.BoxGeometry(BAR_SIZE, 1, BAR_SIZE);
barGeometry.translate(0, 0.5, 0);

const bars: Bar[] = [];

function randomTarget(): number {
  return MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
}

for (let row = 0; row < GRID; row++) {
  for (let col = 0; col < GRID; col++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.15,
      emissive: 0x000000,
    });

    const mesh = new THREE.Mesh(barGeometry, material);
    mesh.position.x = (col - (GRID - 1) / 2) * SPACING;
    mesh.position.z = (row - (GRID - 1) / 2) * SPACING;
    mesh.scale.y = 0.0001; // start flat, animate up
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const bar: Bar = { mesh, material, current: 0, target: randomTarget() };
    mesh.userData.bar = bar;

    scene.add(mesh);
    bars.push(bar);
  }
}

// ---------------------------------------------------------------------------
// Axis labels (readable HTML overlays via CSS2DRenderer)
// ---------------------------------------------------------------------------
function makeLabel(text: string, cssClass: string): CSS2DObject {
  const div = document.createElement('div');
  div.className = cssClass;
  div.textContent = text;
  return new CSS2DObject(div);
}

const half = span / 2;
const edge = half + SPACING * 0.9;

// X-axis column labels (X1..X6) along the front edge.
for (let col = 0; col < GRID; col++) {
  const label = makeLabel(`X${col + 1}`, 'axis-label axis-x');
  label.position.set(
    (col - (GRID - 1) / 2) * SPACING,
    0.15,
    edge,
  );
  scene.add(label);
}

// Z-axis row labels (Z1..Z6) along the left edge.
for (let row = 0; row < GRID; row++) {
  const label = makeLabel(`Z${row + 1}`, 'axis-label axis-z');
  label.position.set(
    -edge,
    0.15,
    (row - (GRID - 1) / 2) * SPACING,
  );
  scene.add(label);
}

// Y-axis (value) ticks along a vertical post at the back-left corner.
for (let v = 0; v <= MAX_HEIGHT; v++) {
  const label = makeLabel(`${v}`, 'axis-label axis-y');
  label.position.set(-edge, v, -edge);
  scene.add(label);
}
const yTitle = makeLabel('VALUE', 'axis-title');
yTitle.position.set(-edge, MAX_HEIGHT + 0.9, -edge);
scene.add(yTitle);

const xTitle = makeLabel('X AXIS', 'axis-title');
xTitle.position.set(0, 0.15, edge + SPACING * 0.8);
scene.add(xTitle);

const zTitle = makeLabel('Z AXIS', 'axis-title');
zTitle.position.set(-edge - SPACING * 0.8, 0.15, 0);
scene.add(zTitle);

// ---------------------------------------------------------------------------
// Hover-highlight via raycasting
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerActive = false;
let hovered: Bar | null = null;

renderer.domElement.addEventListener('pointermove', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerActive = true;
});

renderer.domElement.addEventListener('pointerleave', () => {
  pointerActive = false;
});

const hoverReadout = document.getElementById('readout') as HTMLDivElement;

function updateHover() {
  let hit: Bar | null = null;

  if (pointerActive) {
    raycaster.setFromCamera(pointer, camera);
    const meshes = bars.map((b) => b.mesh);
    const intersections = raycaster.intersectObjects(meshes, false);
    if (intersections.length > 0) {
      hit = intersections[0].object.userData.bar as Bar;
    }
  }

  if (hit === hovered) {
    if (hovered) {
      hoverReadout.textContent = `Hover: height ${hovered.current.toFixed(2)}`;
    }
    return;
  }

  // Clear previous highlight.
  if (hovered) {
    hovered.material.emissive.setHex(0x000000);
    hovered.mesh.scale.x = 1;
    hovered.mesh.scale.z = 1;
  }

  hovered = hit;

  if (hovered) {
    hovered.material.emissive.setHex(0xffffff);
    hovered.material.emissiveIntensity = 0.35;
    // Slight grow on X/Z so the highlight reads clearly.
    hovered.mesh.scale.x = 1.12;
    hovered.mesh.scale.z = 1.12;
    hoverReadout.textContent = `Hover: height ${hovered.current.toFixed(2)}`;
    document.body.style.cursor = 'pointer';
  } else {
    hoverReadout.textContent = 'Hover a bar to highlight it';
    document.body.style.cursor = 'default';
  }
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let sinceReshuffle = 0;
const tmpColor = new THREE.Color();

function animate() {
  const dt = clock.getDelta();
  sinceReshuffle += dt;

  if (sinceReshuffle >= RESHUFFLE_SECONDS) {
    sinceReshuffle = 0;
    for (const bar of bars) bar.target = randomTarget();
  }

  for (const bar of bars) {
    // Ease current height toward the target (framerate-independent).
    bar.current += (bar.target - bar.current) * (1 - Math.exp(-4 * dt));
    bar.mesh.scale.y = Math.max(bar.current, 0.0001);

    // Recolor by normalized height.
    const t = (bar.current - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
    colorForHeight(t, tmpColor);
    bar.material.color.copy(tmpColor);
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
