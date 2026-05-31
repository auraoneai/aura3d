import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* -------------------------------------------------------------------------- *
 * Prompt 05 — 3D Data Visualization
 * A 6x6 grid of bars whose heights animate from random values.
 *   - color encodes height (blue -> green -> yellow -> red)
 *   - hover-highlight via raycasting (glow + grow + live value readout)
 *   - orbit camera (OrbitControls: drag to orbit, scroll to zoom)
 *   - readable axis labels (canvas-texture sprites)
 * Built with the bundled `three` + `three/examples/jsm` addons only.
 * -------------------------------------------------------------------------- */

const GRID = 6; // 6 x 6 = 36 bars
const BAR_COUNT = GRID * GRID;
const SPACING = 1.6; // distance between bar centers
const BAR_SIZE = 1.0; // footprint of each bar (x / z)
const H_MIN = 0.4; // minimum animated height
const H_MAX = 6.0; // maximum animated height
const RESHUFFLE_MS = 3500; // how often fresh random targets are chosen

/* ----------------------------- DOM + overlay ------------------------------ */
const app = document.getElementById("app") as HTMLDivElement;

const style = document.createElement("style");
style.textContent = `
  html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0e16; }
  #app { position: fixed; inset: 0; }
  #app canvas { display: block; }
  .viz-hud {
    position: fixed; top: 14px; left: 16px; z-index: 10; max-width: 360px;
    color: #e8edf7; pointer-events: none;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    text-shadow: 0 1px 3px rgba(0,0,0,0.85);
  }
  .viz-hud h1 { margin: 0 0 4px; font-size: 18px; font-weight: 700; }
  .viz-hud p { margin: 2px 0; font-size: 12px; line-height: 1.45; opacity: 0.85; }
  .viz-readout {
    position: fixed; bottom: 14px; left: 16px; z-index: 10;
    color: #aef3c0; font-size: 13px; font-variant-numeric: tabular-nums;
    background: rgba(8,12,20,0.55); padding: 6px 10px; border-radius: 6px;
    pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.85);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
`;
document.head.appendChild(style);

const hud = document.createElement("div");
hud.className = "viz-hud";
hud.innerHTML = `
  <h1>3D Bar Chart · 6×6 Grid</h1>
  <p>36 bars animate from random values. Color encodes height (blue&nbsp;→&nbsp;red).</p>
  <p>Drag to orbit · scroll to zoom · hover a bar to highlight it.</p>
`;
document.body.appendChild(hud);

const readout = document.createElement("div");
readout.className = "viz-readout";
readout.textContent = "Hover a bar to inspect its value.";
document.body.appendChild(readout);

/* -------------------------------- renderer -------------------------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

/* ---------------------------------- scene --------------------------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e16);
scene.fog = new THREE.Fog(0x0b0e16, 30, 64);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(11, 10, 13);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI * 0.49; // keep the camera above the ground
controls.target.set(0, 2, 0);

/* --------------------------------- lights --------------------------------- */
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x202830, 0.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(8, 16, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 60;
const shadowSpan = 14;
keyLight.shadow.camera.left = -shadowSpan;
keyLight.shadow.camera.right = shadowSpan;
keyLight.shadow.camera.top = shadowSpan;
keyLight.shadow.camera.bottom = -shadowSpan;
scene.add(keyLight);

/* ---------------------------------- ground -------------------------------- */
const span = (GRID - 1) * SPACING;
const groundSize = span + 6;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(groundSize, GRID + 6, 0x33405c, 0x222b3d);
const gridMat = grid.material as THREE.LineBasicMaterial;
gridMat.transparent = true;
gridMat.opacity = 0.5;
grid.position.y = 0.001;
scene.add(grid);

/* ---------------------------- color-by-height ----------------------------- */
const tmpColor = new THREE.Color();
function heightColor(height: number): THREE.Color {
  const t = THREE.MathUtils.clamp((height - H_MIN) / (H_MAX - H_MIN), 0, 1);
  // hue 0.66 (blue, low) -> 0.0 (red, high), passing through cyan/green/yellow
  const hue = (1 - t) * 0.66;
  return tmpColor.setHSL(hue, 0.85, 0.52).clone();
}

/* ----------------------------------- bars --------------------------------- */
interface BarData {
  current: number;
  target: number;
  row: number;
  col: number;
}

type Bar = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

const barGeo = new THREE.BoxGeometry(BAR_SIZE, 1, BAR_SIZE);
barGeo.translate(0, 0.5, 0); // move pivot to the base so scaling grows upward

const bars: Bar[] = [];
const offset = -span / 2;

function randomHeight(): number {
  return H_MIN + Math.random() * (H_MAX - H_MIN);
}

for (let r = 0; r < GRID; r++) {
  for (let c = 0; c < GRID; c++) {
    const target = randomHeight();
    const material = new THREE.MeshStandardMaterial({
      color: heightColor(target),
      roughness: 0.45,
      metalness: 0.15,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const bar: Bar = new THREE.Mesh(barGeo, material);
    bar.position.set(offset + c * SPACING, 0, offset + r * SPACING);
    bar.scale.y = 0.0001; // start flat, animate up from (near) zero
    bar.castShadow = true;
    bar.receiveShadow = true;
    const data: BarData = { current: 0.0001, target, row: r, col: c };
    bar.userData = data;
    scene.add(bar);
    bars.push(bar);
  }
}

/* --------------------------------- labels --------------------------------- */
interface LabelOptions {
  fg?: string;
  bg?: string;
  scale?: number;
  bold?: boolean;
}

function makeLabel(text: string, opts: LabelOptions = {}): THREE.Sprite {
  const fg = opts.fg ?? "#eef3ff";
  const bg = opts.bg ?? "transparent";
  const scale = opts.scale ?? 1;
  const bold = opts.bold ?? false;

  const pad = 24;
  const fontSize = 64;
  const font = `${bold ? "700" : "500"} ${fontSize}px system-ui, Arial, sans-serif`;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  const w = textWidth + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w;
  canvas.height = h;

  // resizing the canvas resets its 2d state, so configure again
  ctx.font = font;
  if (bg !== "transparent") {
    const radius = 14;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.arcTo(w, 0, w, h, radius);
    ctx.arcTo(w, h, 0, h, radius);
    ctx.arcTo(0, h, 0, 0, radius);
    ctx.arcTo(0, 0, w, 0, radius);
    ctx.closePath();
    ctx.fill();
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.78)";
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  const worldHeight = 0.9 * scale;
  sprite.scale.set((w / h) * worldHeight, worldHeight, 1);
  return sprite;
}

const labelGroup = new THREE.Group();
scene.add(labelGroup);

// Column labels along the front edge (X axis)
for (let c = 0; c < GRID; c++) {
  const label = makeLabel(`C${c + 1}`, { fg: "#9fd0ff" });
  label.position.set(offset + c * SPACING, 0.55, offset - SPACING * 0.9);
  labelGroup.add(label);
}
// Row labels along the left edge (Z axis)
for (let r = 0; r < GRID; r++) {
  const label = makeLabel(`R${r + 1}`, { fg: "#ffd59f" });
  label.position.set(offset - SPACING * 0.9, 0.55, offset + r * SPACING);
  labelGroup.add(label);
}

// Axis title labels
const xTitle = makeLabel("Columns  (X)", { bold: true, scale: 1.25, bg: "rgba(10,14,22,0.55)" });
xTitle.position.set(0, 0.55, offset - SPACING * 1.9);
labelGroup.add(xTitle);

const zTitle = makeLabel("Rows  (Z)", { bold: true, scale: 1.25, bg: "rgba(10,14,22,0.55)" });
zTitle.position.set(offset - SPACING * 1.9, 0.55, 0);
labelGroup.add(zTitle);

// Value (Y) axis: a vertical reference line with numeric tick labels
const yAxisX = offset - SPACING * 1.9;
const yAxisZ = offset - SPACING * 1.9;
const axisLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(yAxisX, 0, yAxisZ),
    new THREE.Vector3(yAxisX, H_MAX, yAxisZ),
  ]),
  new THREE.LineBasicMaterial({ color: 0x6e86b8 }),
);
scene.add(axisLine);

const yTitle = makeLabel("Value (Y)", { bold: true, scale: 1.25, bg: "rgba(10,14,22,0.55)" });
yTitle.position.set(yAxisX, H_MAX + 0.7, yAxisZ);
labelGroup.add(yTitle);

for (let v = 0; v <= H_MAX; v += 2) {
  const tick = makeLabel(v.toFixed(0), { fg: "#cfe0ff", scale: 0.8 });
  tick.position.set(yAxisX - 0.5, v, yAxisZ);
  labelGroup.add(tick);
}

/* --------------------------- hover / raycasting --------------------------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered: Bar | null = null;
let hasPointer = false;

window.addEventListener("pointermove", (event: PointerEvent) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  hasPointer = true;
});
window.addEventListener("pointerleave", () => {
  hasPointer = false;
});

function describe(bar: Bar): string {
  const d = bar.userData as BarData;
  return `Bar R${d.row + 1}·C${d.col + 1}  —  value ${d.current.toFixed(2)}`;
}

function setHover(bar: Bar | null): void {
  if (hovered === bar) return;

  if (hovered) {
    // restore the previously hovered bar
    hovered.material.emissive.setHex(0x000000);
    hovered.material.emissiveIntensity = 0;
    hovered.scale.x = 1;
    hovered.scale.z = 1;
  }

  hovered = bar;

  if (hovered) {
    // highlight: glow in its own color and grow the footprint a touch
    hovered.material.emissive.copy(hovered.material.color);
    hovered.material.emissiveIntensity = 0.85;
    hovered.scale.x = 1.18;
    hovered.scale.z = 1.18;
    readout.textContent = describe(hovered);
    document.body.style.cursor = "pointer";
  } else {
    readout.textContent = "Hover a bar to inspect its value.";
    document.body.style.cursor = "default";
  }
}

/* -------------------------------- animation ------------------------------- */
function reshuffle(): void {
  for (const bar of bars) {
    (bar.userData as BarData).target = randomHeight();
  }
}
window.setInterval(reshuffle, RESHUFFLE_MS);

const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  // frame-rate independent easing toward each bar's target height
  const lerp = 1 - Math.pow(0.0025, dt);
  for (const bar of bars) {
    const d = bar.userData as BarData;
    d.current += (d.target - d.current) * lerp;
    bar.scale.y = d.current;
    const color = heightColor(d.current);
    bar.material.color.copy(color);
    if (bar === hovered) {
      bar.material.emissive.copy(color);
    }
  }

  if (hasPointer) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects<Bar>(bars, false);
    setHover(hits.length > 0 ? hits[0].object : null);
  } else {
    setHover(null);
  }

  if (hovered) {
    readout.textContent = describe(hovered);
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

/* --------------------------------- resize --------------------------------- */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Expose a couple of values for debugging / inspection.
console.info(`3D data visualization ready: ${BAR_COUNT} bars in a ${GRID}x${GRID} grid.`);
