/**
 * Procedural City Block — Aura3D
 *
 * A procedurally generated city block built entirely from Aura3D primitives:
 *   - 20 box buildings (5 x 4 grid) of varying, seeded heights
 *   - lit/glass windows on all four faces of every building
 *   - an asphalt street grid with painted lane markings
 *   - street lamps (pole + glowing head) lining the avenues
 *   - a day / night toggle that rebuilds the scene with different lighting,
 *     sky color, sun vs. moon + stars, and window/lamp illumination.
 *
 * The Aura3D agent API renders a declarative scene snapshot, so the toggle is
 * implemented by rebuilding the snapshot for the requested mode and recreating
 * the app on the same container.
 */
import {
  createAuraApp,
  scene,
  primitives,
  lights,
  effects,
  camera,
} from "@aura3d/engine";
import type { AuraSceneNode, AuraMaterialSpec } from "@aura3d/engine";

type Mode = "day" | "night";
type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helpers (stable across rebuilds / both modes).
// ---------------------------------------------------------------------------
function rng(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function pick<T>(items: readonly T[], seed: number): T {
  return items[Math.floor(rng(seed) * items.length) % items.length];
}

// ---------------------------------------------------------------------------
// City layout. A 5 (x) x 4 (z) grid = 20 buildings, with a road network
// running through the gaps between the building lots.
// ---------------------------------------------------------------------------
const COLS = [-9, -4.5, 0, 4.5, 9];
const ROWS = [-6.75, -2.25, 2.25, 6.75];

const WALL_PALETTE = [
  "#48515f",
  "#3a434f",
  "#525c6b",
  "#414b58",
  "#333b46",
  "#5a6473",
];

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

const BUILDINGS: Building[] = (() => {
  const list: Building[] = [];
  let i = 0;
  for (const x of COLS) {
    for (const z of ROWS) {
      // Heights vary clearly: integer "stories" 3..11 plus a fractional cap.
      const h = 3 + Math.floor(rng(i * 5.3) * 9) + rng(i * 1.7) * 1.2;
      const w = 2.5 + rng(i * 7.7) * 0.6;
      const d = 2.5 + rng(i * 9.2) * 0.6;
      list.push({ x, z, w, d, h, color: pick(WALL_PALETTE, i * 2.9) });
      i += 1;
    }
  }
  return list;
})();

// Road network: vertical roads run along Z, horizontal roads run along X.
const V_ROADS_X = [-11.25, -6.75, -2.25, 2.25, 6.75, 11.25];
const H_ROADS_Z = [-9, -4.5, 0, 4.5, 9];
const ROAD_W = 1.85;
const GROUND_X = 34;
const GROUND_Z = 28;

// Street-lamp positions, placed on road-grid intersections.
const LAMPS: Vec3[] = (() => {
  const pts: Vec3[] = [];
  for (const lx of [-6.75, -2.25, 2.25, 6.75]) {
    for (const lz of [-4.5, 0, 4.5]) pts.push([lx, 0, lz]);
  }
  pts.push([-11.25, 0, 0]);
  pts.push([11.25, 0, 0]);
  return pts;
})();

const LIT_WINDOW_COLORS = ["#ffd98a", "#ffe7b0", "#ffcf72", "#9fd4ff"];

// ---------------------------------------------------------------------------
// Small builders that return plain scene nodes (`.toJSON()`), so heterogeneous
// node lists collect cleanly into a single AuraSceneNode[].
// ---------------------------------------------------------------------------
function box(material: AuraMaterialSpec, pos: Vec3, scale: Vec3): AuraSceneNode {
  return primitives
    .box({ material })
    .position(pos[0], pos[1], pos[2])
    .scale(scale)
    .toJSON();
}
function sphere(material: AuraMaterialSpec, pos: Vec3, size: number): AuraSceneNode {
  return primitives
    .sphere({ material })
    .position(pos[0], pos[1], pos[2])
    .scale(size)
    .toJSON();
}
function plane(material: AuraMaterialSpec, pos: Vec3, scale: Vec3): AuraSceneNode {
  return primitives
    .plane({ material })
    .position(pos[0], pos[1], pos[2])
    .scale(scale)
    .toJSON();
}

// ---------------------------------------------------------------------------
// Windows for one building — two columns per face, seeded floors. At night a
// share of windows are "lit" (emissive); by day they read as glass panels.
// ---------------------------------------------------------------------------
function windowsFor(b: Building, bi: number, mode: Mode): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  const floors = Math.min(6, Math.max(2, Math.floor((b.h - 1) / 1.1)));
  const depth = 0.06;
  const winW = 0.6;
  const winH = 0.55;
  const offX = b.w * 0.24;
  const offZ = b.d * 0.24;

  const faces = [
    { axis: "z", sign: 1 },
    { axis: "z", sign: -1 },
    { axis: "x", sign: 1 },
    { axis: "x", sign: -1 },
  ] as const;

  let wi = 0;
  for (const face of faces) {
    for (let floor = 0; floor < floors; floor += 1) {
      const y = 1 + floor * 1.1;
      if (y > b.h - 0.5) continue;
      for (let col = 0; col < 2; col += 1) {
        const side = col === 0 ? -1 : 1;
        let material: AuraMaterialSpec;
        if (mode === "night") {
          const lit = rng(bi * 31.3 + wi * 7.1) > 0.3;
          material = lit
            ? { color: "#0a0c12", emissive: pick(LIT_WINDOW_COLORS, bi * 5.7 + wi * 3.3) }
            : { color: "#0c0f16", roughness: 0.5, metallic: 0.1 };
        } else {
          material = { color: "#bcd6f0", roughness: 0.22, metallic: 0 };
        }

        let pos: Vec3;
        let scale: Vec3;
        if (face.axis === "z") {
          pos = [b.x + side * offX, y, b.z + face.sign * (b.d / 2 + depth / 2)];
          scale = [winW, winH, depth];
        } else {
          pos = [b.x + face.sign * (b.w / 2 + depth / 2), y, b.z + side * offZ];
          scale = [depth, winH, winW];
        }
        out.push(box(material, pos, scale));
        wi += 1;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Street lamp: dark pole + lamp head (glowing at night).
// ---------------------------------------------------------------------------
function lampFor(p: Vec3, mode: Mode): AuraSceneNode[] {
  const [x, , z] = p;
  const poleMat: AuraMaterialSpec = { color: "#23262c", roughness: 0.6, metallic: 0.1 };
  const headMat: AuraMaterialSpec =
    mode === "night"
      ? { color: "#3a2f12", emissive: "#ffd28a" }
      : { color: "#2c2f34", roughness: 0.5, metallic: 0.1 };
  const nodes: AuraSceneNode[] = [
    box(poleMat, [x, 1.65, z], [0.14, 3.3, 0.14]),
    box(headMat, [x, 3.4, z], [0.52, 0.22, 0.52]),
  ];
  if (mode === "night") {
    nodes.push(sphere({ color: "#3a2f12", emissive: "#ffce86" }, [x, 3.18, z], 0.2));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Build a full scene snapshot for the requested mode.
// ---------------------------------------------------------------------------
function buildScene(mode: Mode) {
  const day = mode === "day";
  const s = scene().background(day ? "#8fbce6" : "#0a1430");
  const nodes: AuraSceneNode[] = [];

  // Ground / sidewalks.
  nodes.push(
    plane(
      { color: day ? "#6b7178" : "#161a22", roughness: 0.95, metallic: 0 },
      [0, 0, 0],
      [GROUND_X, 1, GROUND_Z],
    ),
  );

  // Asphalt road grid (horizontal roads sit a hair higher to avoid z-fighting).
  const asphalt: AuraMaterialSpec = {
    color: day ? "#21252b" : "#0e1117",
    roughness: 0.92,
    metallic: 0,
  };
  for (const rx of V_ROADS_X) nodes.push(box(asphalt, [rx, 0.05, 0], [ROAD_W, 0.08, GROUND_Z]));
  for (const rz of H_ROADS_Z) nodes.push(box(asphalt, [0, 0.06, rz], [GROUND_X, 0.08, ROAD_W]));

  // Painted lane markings down the center of every road.
  const markMat: AuraMaterialSpec = day
    ? { color: "#d8d6b0", roughness: 0.6, metallic: 0 }
    : { color: "#3a3417", emissive: "#c9a948" };
  for (const rx of V_ROADS_X) nodes.push(box(markMat, [rx, 0.12, 0], [0.12, 0.02, GROUND_Z - 1]));
  for (const rz of H_ROADS_Z) nodes.push(box(markMat, [0, 0.13, rz], [GROUND_X - 1, 0.02, 0.12]));

  // Buildings + their windows.
  BUILDINGS.forEach((b, bi) => {
    nodes.push(
      box(
        { color: b.color, roughness: 0.78, metallic: 0.04 },
        [b.x, b.h / 2, b.z],
        [b.w, b.h, b.d],
      ),
    );
    // Rooftop cap for a touch of silhouette variety.
    nodes.push(
      box(
        { color: day ? "#5b626d" : "#1b2029", roughness: 0.7, metallic: 0.05 },
        [b.x, b.h + 0.12, b.z],
        [b.w * 0.55, 0.24, b.d * 0.55],
      ),
    );
    for (const w of windowsFor(b, bi, mode)) nodes.push(w);
  });

  // Street lamps.
  LAMPS.forEach((p) => {
    for (const n of lampFor(p, mode)) nodes.push(n);
  });

  // Sky body: sun by day, moon + stars by night.
  if (day) {
    nodes.push(sphere({ color: "#fff2b0", emissive: "#ffe488" }, [-16, 18, -12], 2.4));
  } else {
    nodes.push(sphere({ color: "#c7d0ec", emissive: "#dfe6fb" }, [-15, 17, -11], 1.7));
    for (let k = 0; k < 46; k += 1) {
      const sx = (rng(k * 1.7) * 2 - 1) * 22;
      const sy = 11 + rng(k * 2.3) * 11;
      const sz = -2 - rng(k * 3.9) * 22;
      nodes.push(sphere({ color: "#0b1020", emissive: "#eaf0ff" }, [sx, sy, sz], 0.12));
    }
  }

  for (const node of nodes) s.add(node);

  // Lighting.
  if (day) {
    s.add(lights.ambient({ color: "#cfe2ff", intensity: 0.85 }));
    s.add(lights.directional({ color: "#fff2d8", intensity: 1.5, position: [-16, 18, -10] }));
  } else {
    s.add(lights.ambient({ color: "#2b3a5c", intensity: 0.34 }));
    s.add(lights.directional({ color: "#5566a0", intensity: 0.32, position: [-14, 16, -8] }));
    // A handful of warm pools of light beneath select lamps (kept low to bound
    // shadow-casting point lights).
    LAMPS.forEach((p, idx) => {
      if (idx % 3 !== 0) return;
      s.add(lights.point({ color: "#ffce86", intensity: 0.7, position: [p[0], 3.2, p[2]] }));
    });
  }

  // Atmosphere + glow.
  s.add(effects.fog({ density: day ? 0.06 : 0.1, color: day ? "#bcd6ec" : "#0a1228" }));
  s.add(effects.bloom({ intensity: day ? 0.22 : 0.46, color: day ? "#ffffff" : "#ffe6b0" }));

  // Elevated 3/4 camera framing the whole block.
  s.camera(camera.perspective({ position: [14, 12.5, 22], target: [0, 3, -1], fov: 50 }));

  return s;
}

// ---------------------------------------------------------------------------
// Mount + day/night toggle.
// ---------------------------------------------------------------------------
const container = "#app";
let mode: Mode = "day";
let app = createAuraApp(container, { scene: buildScene(mode) });

const toggleButton = document.getElementById("dayNightToggle");
const toggleLabel = document.getElementById("toggleLabel");
const toggleIcon = toggleButton?.querySelector<HTMLElement>(".toggle__icon");

function syncToggleUi(): void {
  document.body.dataset.mode = mode;
  if (toggleLabel) toggleLabel.textContent = mode === "day" ? "Switch to Night" : "Switch to Day";
  if (toggleIcon) toggleIcon.textContent = mode === "day" ? "🌙" : "☀️";
}

function setMode(next: Mode): void {
  if (next === mode) return;
  mode = next;
  app.dispose();
  // createAuraApp appends a fresh canvas to the container; remove the old one
  // so toggling does not stack canvases.
  document.querySelectorAll("#app canvas").forEach((c) => c.remove());
  app = createAuraApp(container, { scene: buildScene(mode) });
  syncToggleUi();
}

toggleButton?.addEventListener("click", () => {
  setMode(mode === "day" ? "night" : "day");
});

syncToggleUi();
