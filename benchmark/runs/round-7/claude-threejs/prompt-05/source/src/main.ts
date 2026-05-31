// Prompt 05 — 3D Data Visualization
// A 6x6 grid of 36 bars built procedurally with three.js:
//  - heights animate (grow) from random values on load
//  - color corresponds to height (blue -> green -> red)
//  - hover-highlight via raycasting (emissive glow + brighten + value readout)
//  - orbit camera (OrbitControls from the bundle's three/addons)
//  - readable axis labels + numeric ticks (canvas-texture sprites, no assets)

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d10);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
camera.position.set(12, 11, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 60;

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(8, 14, 10);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
fill.position.set(-10, 6, -8);
scene.add(fill);

// ---------------------------------------------------------------------------
// Deterministic RNG (fixed seed -> reproducible scene)
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = makeRng(20260530);

// ---------------------------------------------------------------------------
// Grid configuration
// ---------------------------------------------------------------------------

const N = 6; // 6 x 6 = 36 bars
const SPACING = 1.6;
const BAR_W = 0.9;
const MAX_H = 6; // tallest possible bar (world units)
const EDGE = ((N - 1) / 2) * SPACING;

// Color ramp: normalized height (0..1) -> blue -> green -> red.
const COLD = new THREE.Color(0x2a59ff);
const MID = new THREE.Color(0x29c76b);
const HOT = new THREE.Color(0xff3b30);
function heightColor(norm: number, out: THREE.Color): THREE.Color {
  if (norm < 0.5) return out.copy(COLD).lerp(MID, norm / 0.5);
  return out.copy(MID).lerp(HOT, (norm - 0.5) / 0.5);
}

function randomTarget(): number {
  return 0.5 + rng() * (MAX_H - 0.5); // clearly varying heights
}

interface Bar {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
  ix: number;
  iz: number;
  target: number;
  start: number;
  current: number;
  t: number; // animation progress 0..1
}

const bars: Bar[] = [];
const barMeshes: THREE.Mesh[] = [];
const unitBox = new THREE.BoxGeometry(BAR_W, 1, BAR_W); // height 1 -> scale by value

for (let ix = 0; ix < N; ix++) {
  for (let iz = 0; iz < N; iz++) {
    const target = randomTarget();
    const baseColor = heightColor(target / MAX_H, new THREE.Color());
    const material = new THREE.MeshStandardMaterial({
      color: baseColor.clone(),
      roughness: 0.55,
      metalness: 0.1,
      emissive: new THREE.Color(0x000000),
    });
    const mesh = new THREE.Mesh(unitBox, material);
    mesh.position.set((ix - (N - 1) / 2) * SPACING, 0, (iz - (N - 1) / 2) * SPACING);

    const bar: Bar = {
      mesh,
      material,
      baseColor,
      ix,
      iz,
      target,
      start: 0.001,
      current: 0.001,
      t: 0,
    };
    mesh.userData.bar = bar;
    applyHeight(bar, 0.001);
    scene.add(mesh);
    bars.push(bar);
    barMeshes.push(mesh);
  }
}

// A box of base height 1 centered at origin: scale.y = h, lift by h/2 so it
// grows up from the ground plane.
function applyHeight(bar: Bar, h: number): void {
  bar.current = h;
  bar.mesh.scale.y = h;
  bar.mesh.position.y = h / 2;
}

// ---------------------------------------------------------------------------
// Ground + reference grid
// ---------------------------------------------------------------------------

const gridSize = EDGE * 2 + SPACING * 2;
const grid = new THREE.GridHelper(gridSize, N + 2, 0x33405c, 0x1d2436);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.6;
scene.add(grid);

// ---------------------------------------------------------------------------
// Text labels via canvas textures (procedural, no font assets)
// ---------------------------------------------------------------------------

function makeLabel(text: string, color = "#ffffff", px = 56): THREE.Sprite {
  const pad = 12;
  const font = `bold ${px}px system-ui, sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = px + pad * 2;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  // world-size scale proportional to texel size for crisp, readable text
  const scale = 0.012 * px;
  sprite.scale.set((w / h) * scale, scale, 1);
  return sprite;
}

function addLabel(text: string, x: number, y: number, z: number, color?: string, px?: number) {
  const s = makeLabel(text, color, px);
  s.position.set(x, y, z);
  scene.add(s);
}

// Axis titles
addLabel("X axis", 0, -0.5, EDGE + 2.0, "#9fd0ff", 64);
addLabel("Z axis", EDGE + 2.0, -0.5, 0, "#9fffc4", 64);
addLabel("Height (value)", -EDGE - 2.6, MAX_H * 0.62, -EDGE, "#ffd166", 56);

// Numeric tick labels along X and Z (1..6)
for (let k = 0; k < N; k++) {
  const p = (k - (N - 1) / 2) * SPACING;
  addLabel(String(k + 1), p, -0.35, EDGE + 1.0, "#9fd0ff", 40);
  addLabel(String(k + 1), EDGE + 1.0, -0.35, p, "#9fffc4", 40);
}

// Height-scale ticks along the vertical axis
for (let v = 0; v <= MAX_H; v += 2) {
  addLabel(String(v), -EDGE - 1.1, v, -EDGE, "#ffd166", 36);
}

// ---------------------------------------------------------------------------
// Hover-highlight via raycasting
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerActive = false;
let hovered: Bar | null = null;
const readout = document.querySelector<HTMLDivElement>("#readout")!;
const tmpColor = new THREE.Color();

renderer.domElement.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerActive = true;
});
renderer.domElement.addEventListener("pointerleave", () => {
  pointerActive = false;
  setHover(null);
});

function setHover(bar: Bar | null): void {
  if (hovered === bar) return;
  if (hovered) {
    hovered.material.color.copy(hovered.baseColor);
    hovered.material.emissive.setHex(0x000000);
  }
  hovered = bar;
  if (bar) {
    bar.material.color.copy(bar.baseColor).lerp(tmpColor.setRGB(1, 1, 1), 0.4);
    bar.material.emissive.copy(bar.baseColor).multiplyScalar(0.6);
    readout.textContent =
      `Bar (x=${bar.ix + 1}, z=${bar.iz + 1}) — value ${bar.target.toFixed(2)}`;
    document.body.style.cursor = "pointer";
  } else {
    readout.textContent = "Hover a bar to inspect its value.";
    document.body.style.cursor = "default";
  }
}

function updateHover(): void {
  if (!pointerActive) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(barMeshes, false);
  setHover(hits.length ? (hits[0].object.userData.bar as Bar) : null);
}

// ---------------------------------------------------------------------------
// Re-roll dataset (press R) — re-animates from current heights
// ---------------------------------------------------------------------------

let rerollSeed = 1;
window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    rng = makeRng(20260530 + rerollSeed++ * 7919);
    for (const bar of bars) {
      bar.start = bar.current;
      bar.target = randomTarget();
      heightColor(bar.target / MAX_H, bar.baseColor);
      if (bar !== hovered) bar.material.color.copy(bar.baseColor);
      bar.t = 0;
    }
  }
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

const ANIM_DURATION = 1.3; // seconds for the grow animation
const clock = new THREE.Clock();
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  for (const bar of bars) {
    if (bar.t < 1) {
      bar.t = Math.min(1, bar.t + dt / ANIM_DURATION);
      const h = bar.start + (bar.target - bar.start) * easeOutCubic(bar.t);
      applyHeight(bar, h);
    }
  }

  controls.update();
  updateHover();
  renderer.render(scene, camera);
}
animate();

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
