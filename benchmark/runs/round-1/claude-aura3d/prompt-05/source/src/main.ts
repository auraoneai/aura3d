// 3D Data Visualization — 6x6 grid of animated bars.
//
// The scene is authored with the @aura3d/engine public API (see auraScene.ts)
// and rendered here through an interactive Three.js renderer (the same Three
// the engine ships) so the prompt's dynamic requirements are met:
//   - 36 bars whose heights animate from random values
//   - color corresponds to height (recomputed every frame)
//   - hover-highlight with a readout tooltip
//   - orbit camera (drag / scroll / auto-rotate)
//   - readable 3D axis labels + on-screen legend

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";

import {
  buildAuraScene,
  ORBIT_DISTANCE,
  ORBIT_TARGET,
} from "./auraScene";
import {
  FOOTPRINT,
  GRID,
  HALF_EXTENT,
  SPACING,
  valueToHeight,
  type BarDatum,
} from "./barData";
import { heightToColor, heightToHex, legendGradientCss } from "./palette";

const REROLL_SECONDS = 3.2; // how often bars pick fresh random targets
const EASE_RATE = 2.6; // higher = snappier height animation

// ---------------------------------------------------------------------------
// DOM scaffold
// ---------------------------------------------------------------------------

const mount = document.querySelector<HTMLDivElement>("#app");
if (!mount) {
  throw new Error("Missing #app mount element");
}

injectStyles();

const container = document.createElement("div");
container.className = "viz-root";
mount.appendChild(container);

const hud = buildHud();
container.appendChild(hud);

const tooltip = document.createElement("div");
tooltip.className = "viz-tooltip";
tooltip.style.display = "none";
container.appendChild(tooltip);

// ---------------------------------------------------------------------------
// Engine-authored scene -> live Three.js scene
// ---------------------------------------------------------------------------

const { snapshot, bars } = buildAuraScene();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = "viz-canvas";
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "viz-labels";
container.appendChild(labelRenderer.domElement);

const threeScene = new THREE.Scene();
threeScene.background = new THREE.Color(snapshot.background);

const camera = new THREE.PerspectiveCamera(
  snapshot.camera.fov ?? 50,
  1,
  0.1,
  200,
);
camera.position.set(
  ORBIT_TARGET[0] + ORBIT_DISTANCE * 0.62,
  ORBIT_TARGET[1] + ORBIT_DISTANCE * 0.5,
  ORBIT_TARGET[2] + ORBIT_DISTANCE * 0.78,
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(ORBIT_TARGET[0], ORBIT_TARGET[1], ORBIT_TARGET[2]);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 24;
controls.maxPolarAngle = Math.PI * 0.49; // stay above the floor
controls.autoRotate = true;
controls.autoRotateSpeed = 0.7;

// Lights translated from the engine snapshot's light nodes.
addLightsFromSnapshot();

// Floor + reference grid.
addFloorAndGrid();

// Bars: one mesh per primitive box node, linked back to its BarDatum by name.
const barByName = new Map<string, BarDatum>(bars.map((bar) => [bar.name, bar]));
const barMeshes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];

for (const node of snapshot.nodes) {
  if (node.kind !== "primitive" || node.primitive !== "box" || !node.name) {
    continue;
  }
  const datum = barByName.get(node.name);
  if (!datum) {
    continue;
  }
  const geometry = new THREE.BoxGeometry(FOOTPRINT, 1, FOOTPRINT);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(heightToHex(datum.value)),
    roughness: 0.4,
    metalness: 0.08,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(datum.x, 0, datum.z);
  mesh.userData.index = datum.index;
  threeScene.add(mesh);
  barMeshes.push(mesh);
}

// Axis labels + titles (readable DOM elements positioned in 3D space).
addAxisLabels();

// ---------------------------------------------------------------------------
// Hover-highlight via raycasting
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
let hoveredIndex = -1;

renderer.domElement.addEventListener("pointermove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerInside = true;
  tooltip.style.left = `${event.clientX - rect.left + 14}px`;
  tooltip.style.top = `${event.clientY - rect.top + 14}px`;
});

renderer.domElement.addEventListener("pointerleave", () => {
  pointerInside = false;
});

function updateHover(): void {
  let nextHover = -1;
  if (pointerInside) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(barMeshes, false);
    if (hits.length > 0) {
      nextHover = (hits[0].object.userData.index as number) ?? -1;
    }
  }

  if (nextHover !== hoveredIndex) {
    hoveredIndex = nextHover;
    renderer.domElement.style.cursor = hoveredIndex >= 0 ? "pointer" : "grab";
  }

  if (hoveredIndex >= 0) {
    const datum = bars[hoveredIndex];
    tooltip.style.display = "block";
    tooltip.innerHTML =
      `<strong>Col ${datum.col + 1} &middot; Row ${datum.row + 1}</strong>` +
      `<span>Value ${Math.round(datum.value * 100)} / 100</span>`;
  } else {
    tooltip.style.display = "none";
  }
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

let rerollTimer = 0;
let lastTime = performance.now();
let rafId = 0;
let stopped = false;
const highlight = new THREE.Color();
const baseEmissive = new THREE.Color("#000000");

function frame(now: number): void {
  if (stopped) {
    return;
  }
  // Clamp dt to a sane positive range so the easing stays stable even after a
  // long tab stall or a frame-time hiccup.
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;

  // Periodically give every bar a fresh random target to animate toward.
  rerollTimer += dt;
  if (rerollTimer >= REROLL_SECONDS) {
    rerollTimer = 0;
    for (const bar of bars) {
      bar.target = 0.06 + Math.random() * 0.92;
    }
  }

  // Frame-rate independent easing toward the target value.
  const k = 1 - Math.exp(-EASE_RATE * dt);

  updateHover();

  for (let i = 0; i < barMeshes.length; i += 1) {
    const datum = bars[i];
    const mesh = barMeshes[i];
    datum.value = Math.max(0, Math.min(1, datum.value + (datum.target - datum.value) * k));

    const height = valueToHeight(datum.value);
    mesh.scale.y = height;
    mesh.position.y = height / 2;

    // Color tracks the live height every frame.
    const rgb = heightToColor(datum.value);
    mesh.material.color.setRGB(rgb.r, rgb.g, rgb.b);

    if (i === hoveredIndex) {
      highlight.setRGB(rgb.r, rgb.g, rgb.b);
      mesh.material.emissive.copy(highlight);
      mesh.material.emissiveIntensity = 0.85;
      mesh.scale.x = 1.16;
      mesh.scale.z = 1.16;
    } else {
      mesh.material.emissive.copy(baseEmissive);
      mesh.material.emissiveIntensity = 0;
      mesh.scale.x = 1;
      mesh.scale.z = 1;
    }
  }

  controls.update();
  renderer.render(threeScene, camera);
  labelRenderer.render(threeScene, camera);
  rafId = requestAnimationFrame(frame);
}

// Pause auto-rotate while the user is interacting, resume shortly after.
let resumeTimer = 0;
controls.addEventListener("start", () => {
  controls.autoRotate = false;
  window.clearTimeout(resumeTimer);
});
controls.addEventListener("end", () => {
  resumeTimer = window.setTimeout(() => {
    controls.autoRotate = true;
  }, 2500);
});

window.addEventListener("resize", resize);
resize();
rafId = requestAnimationFrame(frame);

// During `vite dev`, hot reloads would otherwise stack a new animation loop on
// top of the old one. Tear the previous loop down so only one ever runs.
const hot = (import.meta as unknown as {
  hot?: { dispose(cb: () => void): void };
}).hot;
if (hot) {
  hot.dispose(() => {
    stopped = true;
    cancelAnimationFrame(rafId);
    window.clearTimeout(resumeTimer);
    renderer.dispose();
    labelRenderer.domElement.remove();
    mount.removeChild(container);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resize(): void {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

function addLightsFromSnapshot(): void {
  let hasLight = false;
  for (const node of snapshot.nodes) {
    if (node.kind !== "light") {
      continue;
    }
    hasLight = true;
    const color = new THREE.Color(node.color ?? "#ffffff");
    if (node.light === "ambient") {
      const hemi = new THREE.HemisphereLight(
        color,
        new THREE.Color("#060912"),
        node.intensity * 1.6,
      );
      threeScene.add(hemi);
      continue;
    }
    const dir = new THREE.DirectionalLight(color, node.intensity);
    const [px, py, pz] = node.position ?? [5, 8, 5];
    dir.position.set(px, py, pz);
    if (node.intensity >= 1) {
      dir.castShadow = true;
      dir.shadow.mapSize.set(2048, 2048);
      const cam = dir.shadow.camera;
      cam.near = 0.5;
      cam.far = 40;
      cam.left = -HALF_EXTENT - 2;
      cam.right = HALF_EXTENT + 2;
      cam.top = HALF_EXTENT + 2;
      cam.bottom = -HALF_EXTENT - 2;
      dir.shadow.bias = -0.0008;
    }
    threeScene.add(dir);
  }
  if (!hasLight) {
    threeScene.add(new THREE.HemisphereLight("#dfefff", "#05070b", 1.2));
  }
}

function addFloorAndGrid(): void {
  const floorSize = HALF_EXTENT * 2 + 2.4;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshStandardMaterial({ color: "#0e1530", roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  threeScene.add(floor);

  const grid = new THREE.GridHelper(
    GRID * SPACING,
    GRID,
    new THREE.Color("#3b4d80"),
    new THREE.Color("#1c2748"),
  );
  grid.position.y = 0.01;
  threeScene.add(grid);
}

function makeLabel(text: string, variant: "tick" | "axis"): CSS2DObject {
  const el = document.createElement("div");
  el.className = `viz-label viz-label--${variant}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

function addAxisLabels(): void {
  const edge = HALF_EXTENT + 0.55;

  // Column labels (along X), placed just in front of the grid.
  for (let col = 0; col < GRID; col += 1) {
    const label = makeLabel(`C${col + 1}`, "tick");
    label.position.set(col * SPACING - HALF_EXTENT, 0.05, edge);
    threeScene.add(label);
  }

  // Row labels (along Z), placed to the left of the grid.
  for (let row = 0; row < GRID; row += 1) {
    const label = makeLabel(`R${row + 1}`, "tick");
    label.position.set(-edge, 0.05, row * SPACING - HALF_EXTENT);
    threeScene.add(label);
  }

  // Axis titles.
  const colTitle = makeLabel("Columns (X)", "axis");
  colTitle.position.set(0, 0.05, edge + 0.9);
  threeScene.add(colTitle);

  const rowTitle = makeLabel("Rows (Z)", "axis");
  rowTitle.position.set(-edge - 0.9, 0.05, 0);
  threeScene.add(rowTitle);

  // Vertical value axis with tick labels in the back corner.
  const axisX = -HALF_EXTENT - 0.55;
  const axisZ = -HALF_EXTENT - 0.55;
  const axisHeight = valueToHeight(1) + 0.1;
  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, axisHeight, 8),
    new THREE.MeshBasicMaterial({ color: "#5e74b0" }),
  );
  axis.position.set(axisX, axisHeight / 2, axisZ);
  threeScene.add(axis);

  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const label = makeLabel(String(Math.round(t * 100)), "tick");
    label.position.set(axisX - 0.18, valueToHeight(t), axisZ - 0.18);
    threeScene.add(label);
  }

  const valueTitle = makeLabel("Value (Y)", "axis");
  valueTitle.position.set(axisX - 0.2, valueToHeight(1) + 0.55, axisZ - 0.2);
  threeScene.add(valueTitle);
}

function buildHud(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "viz-hud";
  el.innerHTML = `
    <h1>3D Data Visualization</h1>
    <p class="viz-sub">6&times;6 grid &middot; 36 bars &middot; heights animate from random values</p>
    <div class="viz-legend">
      <span class="viz-legend__label">low</span>
      <span class="viz-legend__bar" style="background:${legendGradientCss()}"></span>
      <span class="viz-legend__label">high</span>
    </div>
    <p class="viz-hint">Drag to orbit &middot; scroll to zoom &middot; hover a bar to highlight it</p>
  `;
  return el;
}

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body, #app { margin: 0; height: 100%; width: 100%; }
    body { font-family: "Inter", system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0a0f1f; overflow: hidden; }
    .viz-root { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
    .viz-canvas { position: absolute; inset: 0; display: block; cursor: grab; }
    .viz-canvas:active { cursor: grabbing; }
    .viz-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .viz-label {
      pointer-events: none;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-shadow: 0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9);
      white-space: nowrap;
    }
    .viz-label--tick { font-size: 13px; color: #cdd9f5; }
    .viz-label--axis { font-size: 14px; color: #9fc4ff; text-transform: uppercase; letter-spacing: 0.08em; }
    .viz-hud {
      position: absolute; top: 20px; left: 22px; z-index: 5;
      pointer-events: none; color: #eaf1ff; max-width: 340px;
      background: rgba(10,16,34,0.55); border: 1px solid rgba(122,162,255,0.22);
      border-radius: 12px; padding: 16px 18px; backdrop-filter: blur(6px);
    }
    .viz-hud h1 { margin: 0 0 4px; font-size: 19px; font-weight: 700; }
    .viz-sub { margin: 0 0 12px; font-size: 12.5px; color: #9fb0d6; }
    .viz-legend { display: flex; align-items: center; gap: 8px; }
    .viz-legend__bar { flex: 1; height: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.18); }
    .viz-legend__label { font-size: 11px; color: #9fb0d6; text-transform: uppercase; letter-spacing: 0.06em; }
    .viz-hint { margin: 12px 0 0; font-size: 11.5px; color: #7f90b8; }
    .viz-tooltip {
      position: absolute; z-index: 6; pointer-events: none;
      background: rgba(8,12,26,0.92); border: 1px solid rgba(122,162,255,0.4);
      border-radius: 8px; padding: 7px 10px; color: #eaf1ff; font-size: 12.5px;
      display: flex; flex-direction: column; gap: 2px; min-width: 120px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    }
    .viz-tooltip strong { font-size: 13px; }
    .viz-tooltip span { color: #9fc4ff; }
  `;
  document.head.appendChild(style);
}
