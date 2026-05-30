import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import "./style.css";

// ---------------------------------------------------------------------------
// 3D Data Visualization: 6x6 grid of bars.
//   - Heights animate (tween) from/to random values, re-rolled periodically.
//   - Color is mapped from bar height (low -> high gradient).
//   - Hover-highlight: the bar under the cursor brightens, fattens slightly and
//     shows a value tooltip.
//   - Orbit camera (drag to rotate, scroll to zoom, right-drag to pan).
//   - Readable axis labels (X/Z grid indices, Y value ticks) via CSS2D.
// ---------------------------------------------------------------------------

const GRID = 6; // 6 x 6 => 36 bars
const SPACING = 1.6; // distance between bar centers
const BAR_SIZE = 0.9; // footprint of each bar (x & z)
const MAX_HEIGHT = 6; // tallest possible bar
const MIN_HEIGHT = 0.4; // shortest possible bar

const root = document.querySelector<HTMLElement>("#app")!;
root.innerHTML = "";

// --- Legend / instructions overlay -----------------------------------------
const legend = document.createElement("div");
legend.id = "legend";
legend.innerHTML = `
  <h1>3D Data Visualization</h1>
  <div>6&times;6 grid (36 bars). Heights animate from random values and
  re-roll every few seconds.</div>
  <div class="ramp"></div>
  <div class="ramp-labels"><span>low</span><span>height &rarr; color</span><span>high</span></div>
  <div style="margin-top:7px">Drag to orbit &middot; scroll to zoom &middot; hover a bar to highlight it.</div>
`;
root.appendChild(legend);

// --- Renderers -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.style.display = "block";
root.appendChild(renderer.domElement);

// CSS2D renderer for crisp, always-readable text labels.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.left = "0";
labelRenderer.domElement.style.pointerEvents = "none";
root.appendChild(labelRenderer.domElement);

// --- Scene & camera --------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12151c);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(11, 10, 13);

const controls = new OrbitControls(camera, labelRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 1.5, 0);

// --- Lights ----------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(8, 16, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
key.shadow.camera.left = -14;
key.shadow.camera.right = 14;
key.shadow.camera.top = 14;
key.shadow.camera.bottom = -14;
scene.add(key);

const fill = new THREE.HemisphereLight(0x88aaff, 0x202028, 0.6);
scene.add(fill);

// --- Ground & grid ---------------------------------------------------------
const span = (GRID - 1) * SPACING;
const half = span / 2;
const groundSize = span + SPACING * 2;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(groundSize, GRID + 2, 0x3a4a66, 0x2a3346);
grid.position.y = 0.001;
scene.add(grid);

// --- Color ramp (height -> color) ------------------------------------------
// Cool (low) through green/yellow to warm (high). Color clearly tracks height.
const RAMP = [
  new THREE.Color(0x2c7bb6), // low  - blue
  new THREE.Color(0x00a6ca),
  new THREE.Color(0x66c2a5), // teal/green
  new THREE.Color(0xf9d057), // yellow
  new THREE.Color(0xf29e2e),
  new THREE.Color(0xd7191c), // high - red
];

function colorForT(t: number, target: THREE.Color): THREE.Color {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (RAMP.length - 1);
  const i = Math.min(Math.floor(scaled), RAMP.length - 2);
  return target.copy(RAMP[i]).lerp(RAMP[i + 1], scaled - i);
}

// --- Bars ------------------------------------------------------------------
interface Bar {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  current: number; // current animated height
  target: number; // height being tweened toward
  start: number; // height at the start of the current tween
  t: number; // tween progress 0..1
  col: number;
  row: number;
}

const bars: Bar[] = [];
const barGroup = new THREE.Group();
scene.add(barGroup);

const sharedGeo = new THREE.BoxGeometry(BAR_SIZE, 1, BAR_SIZE);

function randomHeight(): number {
  return MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
}

for (let col = 0; col < GRID; col++) {
  for (let row = 0; row < GRID; row++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(sharedGeo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.x = col * SPACING - half;
    mesh.position.z = row * SPACING - half;

    const bar: Bar = {
      mesh,
      current: 0,
      target: randomHeight(),
      start: 0,
      t: 0,
      col,
      row,
    };
    mesh.userData.bar = bar;
    bars.push(bar);
    barGroup.add(mesh);
  }
}

const TWEEN_DURATION = 1.6; // seconds for a height transition
const tmpColor = new THREE.Color();

function applyBar(bar: Bar): void {
  const h = Math.max(bar.current, 0.0001);
  bar.mesh.scale.y = h;
  bar.mesh.position.y = h / 2;
  const t = (h - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
  colorForT(t, tmpColor);
  bar.mesh.material.color.copy(tmpColor);
  if (bar !== hovered) {
    bar.mesh.material.emissive.copy(tmpColor).multiplyScalar(0.08);
  }
}

// Re-roll every bar to a new random target, restarting the tween.
function reroll(): void {
  for (const bar of bars) {
    bar.start = bar.current;
    bar.target = randomHeight();
    bar.t = 0;
  }
}

// Smoothstep easing for pleasant motion.
function ease(x: number): number {
  return x * x * (3 - 2 * x);
}

// --- Axis labels (CSS2D) ---------------------------------------------------
function makeLabel(text: string, cls: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = cls;
  el.textContent = text;
  return new CSS2DObject(el);
}

const labelGroup = new THREE.Group();
scene.add(labelGroup);

// X-axis index labels (along the front edge, one per column).
for (let col = 0; col < GRID; col++) {
  const l = makeLabel(`X${col}`, "axis-tick");
  l.position.set(col * SPACING - half, 0.05, half + SPACING * 0.85);
  labelGroup.add(l);
}
// Z-axis index labels (along the left edge, one per row).
for (let row = 0; row < GRID; row++) {
  const l = makeLabel(`Z${row}`, "axis-tick");
  l.position.set(-half - SPACING * 0.85, 0.05, row * SPACING - half);
  labelGroup.add(l);
}
// Y-axis value ticks (along a vertical reference edge).
const yTickCorner = new THREE.Vector3(
  -half - SPACING * 0.6,
  0,
  -half - SPACING * 0.6,
);
for (let v = 0; v <= MAX_HEIGHT; v += 1) {
  const l = makeLabel(v.toString(), "axis-tick axis-tick--y");
  l.position.set(yTickCorner.x, v, yTickCorner.z);
  labelGroup.add(l);
}

// Axis titles.
const xTitle = makeLabel("X axis (columns)", "axis-title");
xTitle.position.set(0, 0.05, half + SPACING * 1.7);
labelGroup.add(xTitle);

const zTitle = makeLabel("Z axis (rows)", "axis-title");
zTitle.position.set(-half - SPACING * 1.7, 0.05, 0);
labelGroup.add(zTitle);

const yTitle = makeLabel("Value (height)", "axis-title");
yTitle.position.set(yTickCorner.x, MAX_HEIGHT + 1, yTickCorner.z);
labelGroup.add(yTitle);

// --- Hover highlighting ----------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered: Bar | null = null;
let hasPointer = false;

const tooltip = document.createElement("div");
tooltip.id = "tooltip";
tooltip.style.display = "none";
root.appendChild(tooltip);

renderer.domElement.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  hasPointer = true;
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top = `${e.clientY + 14}px`;
});

renderer.domElement.addEventListener("pointerleave", () => {
  hasPointer = false;
});

function setHover(bar: Bar | null): void {
  if (hovered === bar) return;
  // Restore the previously hovered bar to its height-based appearance.
  if (hovered) {
    hovered.mesh.scale.x = 1;
    hovered.mesh.scale.z = 1;
    const h = Math.max(hovered.current, 0.0001);
    const t = (h - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
    colorForT(t, tmpColor);
    hovered.mesh.material.emissive.copy(tmpColor).multiplyScalar(0.08);
  }
  hovered = bar;
  if (hovered) {
    // Highlight: fatten footprint + strong emissive glow.
    hovered.mesh.scale.x = 1.18;
    hovered.mesh.scale.z = 1.18;
    hovered.mesh.material.emissive.setRGB(0.6, 0.6, 0.65);
  }
}

function updateHover(): void {
  if (!hasPointer) {
    setHover(null);
    tooltip.style.display = "none";
    return;
  }
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(barGroup.children, false);
  if (hits.length > 0) {
    const bar = hits[0].object.userData.bar as Bar;
    setHover(bar);
    tooltip.style.display = "block";
    tooltip.textContent = `[X${bar.col}, Z${bar.row}]  value ${bar.current.toFixed(2)}`;
  } else {
    setHover(null);
    tooltip.style.display = "none";
  }
}

// --- Resize ----------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Animation loop --------------------------------------------------------
let lastReroll = 0;
const clock = new THREE.Clock();

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  // Re-roll all targets every 4s so the viz keeps animating.
  if (elapsed - lastReroll > 4) {
    reroll();
    lastReroll = elapsed;
  }

  for (const bar of bars) {
    if (bar.t < 1) {
      bar.t = Math.min(bar.t + dt / TWEEN_DURATION, 1);
      bar.current = bar.start + (bar.target - bar.start) * ease(bar.t);
    } else {
      bar.current = bar.target;
    }
    applyBar(bar);
  }

  updateHover();
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// Initial state: every bar starts at 0 and tweens up to its random value.
for (const bar of bars) {
  bar.start = 0;
  bar.t = 0;
  applyBar(bar);
}

renderer.setAnimationLoop(animate);
