// Prompt 08 — Procedural City Block
//
// A procedurally generated city block built entirely from Aura3D public
// primitives (no assets): 20 box buildings of varying heights with windows,
// a grid of streets with lane markings, street lights, and a day/night toggle
// that swaps the sky (scene background) and the lighting rig.
//
// Public Aura3D imports only.
import {
  createAuraApp,
  scene,
  primitives,
  material,
  lights,
  camera,
  effects,
  interactions,
  type AuraApp,
  type AuraSceneBuilder,
} from "@aura3d/engine";

type Mode = "day" | "night";

// ---------------------------------------------------------------------------
// Deterministic PRNG so the city layout is identical across day/night toggles.
// ---------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rng = makeRng(0x9e3779b1);

// ---------------------------------------------------------------------------
// Procedural city description (generated once, reused by both modes).
// ---------------------------------------------------------------------------
interface Window3D {
  pos: readonly [number, number, number];
  scale: readonly [number, number, number];
  lit: boolean; // at night: glowing? otherwise dark glass
  warm: boolean; // warm vs cool light tint
}

interface Building {
  x: number;
  z: number;
  w: number; // footprint width (x)
  d: number; // footprint depth (z)
  h: number; // height
  body: string; // base wall color
  windows: Window3D[];
}

interface StreetLight {
  x: number;
  z: number;
  poleH: number;
  glow: boolean; // gets a real point light at night
}

// Grid of 5 columns x 4 rows = 20 lots, separated by streets.
const COLS = [-18, -9, 0, 9, 18];
const ROWS = [-13.5, -4.5, 4.5, 13.5];

const WALL_COLORS = [
  "#8d97a6",
  "#6f7b8c",
  "#9aa3ad",
  "#7e8a7d",
  "#a39b8c",
  "#5f6b7a",
  "#909aa8",
  "#74808f",
];

function buildBuildings(): Building[] {
  const buildings: Building[] = [];
  for (const z of ROWS) {
    for (const x of COLS) {
      // Varying heights: a mix of low-rise and a few towers.
      const tall = rng() > 0.62;
      const h = tall ? 12 + rng() * 10 : 5 + rng() * 6;
      const w = 4 + rng() * 1.6;
      const d = 4 + rng() * 1.6;
      const body = WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)];
      const warmBuilding = rng() > 0.5;

      const windows: Window3D[] = [];
      const winW = 0.62;
      const winH = 0.82;
      const stepY = 1.7;
      const startY = 1.6;

      const addFace = (face: "x" | "z") => {
        const spanW = face === "z" ? w : d;
        const cols = Math.max(2, Math.floor((spanW - 0.8) / 1.35));
        const usable = spanW - 1.0;
        for (let yi = 0; startY + yi * stepY < h - 0.9; yi++) {
          const y = startY + yi * stepY;
          for (let ci = 0; ci < cols; ci++) {
            const t = cols === 1 ? 0.5 : ci / (cols - 1);
            const offset = -usable / 2 + t * usable;
            const lit = rng() > 0.34; // ~66% of windows lit at night
            const warm = warmBuilding ? rng() > 0.25 : rng() > 0.75;
            if (face === "z") {
              windows.push({
                pos: [x + offset, y, z + d / 2 + 0.04],
                scale: [winW, winH, 0.1],
                lit,
                warm,
              });
            } else {
              windows.push({
                pos: [x + w / 2 + 0.04, y, z + offset],
                scale: [0.1, winH, winW],
                lit,
                warm,
              });
            }
          }
        }
      };

      // Only the two camera-facing faces (+X and +Z) carry windows; every
      // building presents these faces toward the elevated camera.
      addFace("z");
      addFace("x");

      buildings.push({ x, z, w, d, h, body, windows });
    }
  }
  return buildings;
}

const BUILDINGS = buildBuildings();

// Street lights line the sidewalks beside the main avenues.
const STREET_LIGHTS: StreetLight[] = (() => {
  const list: StreetLight[] = [];
  const xLines = [-13.5, 4.5]; // sidewalk strips next to two vertical avenues
  const zStops = [-13.5, -4.5, 4.5, 13.5];
  let i = 0;
  for (const x of xLines) {
    for (const z of zStops) {
      list.push({ x, z, poleH: 4.6, glow: i % 2 === 0 });
      i++;
    }
  }
  // A couple along the central cross street as well.
  list.push({ x: -4.5, z: 0, poleH: 4.6, glow: true });
  list.push({ x: 13.5, z: 0, poleH: 4.6, glow: true });
  return list;
})();

// Road network: planes laid in the gaps between building lots.
const V_ROADS = [-13.5, -4.5, 4.5, 13.5]; // run along Z, centered between columns
const H_ROADS = [-9, 0, 9]; // run along X, centered between rows
const ROAD_W = 3.6;
const ROAD_SPAN = 48;

// ---------------------------------------------------------------------------
// Scene construction for a given mode.
// ---------------------------------------------------------------------------
function buildScene(mode: Mode): AuraSceneBuilder {
  const day = mode === "day";
  const s = scene();

  // Sky / background.
  s.background(day ? "#9fc6ec" : "#070b1c");

  // Ground (sidewalk / lots).
  s.add(
    primitives
      .plane({
        name: "ground",
        material: material.pbr({
          color: day ? "#6a7468" : "#0f141d",
          roughness: 0.97,
        }),
      })
      .position(0, 0, 0)
      .scale([ROAD_SPAN + 12, 1, ROAD_SPAN + 12]),
  );

  // Asphalt roads.
  const asphalt = material.pbr({
    color: day ? "#3a3f47" : "#0a0d14",
    roughness: 0.92,
    metallic: 0.0,
  });
  for (const x of V_ROADS) {
    s.add(
      primitives
        .plane({ name: "road-v", material: asphalt })
        .position(x, 0.02, 0)
        .scale([ROAD_W, 1, ROAD_SPAN]),
    );
  }
  for (const z of H_ROADS) {
    s.add(
      primitives
        .plane({ name: "road-h", material: asphalt })
        .position(0, 0.02, z)
        .scale([ROAD_SPAN, 1, ROAD_W]),
    );
  }

  // Lane markings (dashed center lines). Mildly emissive so they read at night.
  const mark = material.emissive({
    color: "#d8c98a",
    emissive: day ? "#6b6242" : "#c8b878",
  });
  const dash = (x: number, z: number, sx: number, sz: number) =>
    s.add(
      primitives
        .box({ name: "lane", material: mark })
        .position(x, 0.05, z)
        .scale([sx, 0.04, sz]),
    );
  for (const x of V_ROADS) {
    for (let z = -ROAD_SPAN / 2 + 2; z <= ROAD_SPAN / 2 - 2; z += 4) {
      dash(x, z, 0.18, 1.4);
    }
  }
  for (const z of H_ROADS) {
    for (let x = -ROAD_SPAN / 2 + 2; x <= ROAD_SPAN / 2 - 2; x += 4) {
      dash(x, z, 1.4, 0.18);
    }
  }

  // Buildings + windows.
  for (const b of BUILDINGS) {
    s.add(
      primitives
        .box({
          name: "building",
          material: material.pbr({
            color: b.body,
            roughness: 0.78,
            metallic: 0.05,
          }),
        })
        .position(b.x, b.h / 2, b.z)
        .scale([b.w, b.h, b.d]),
    );

    for (const win of b.windows) {
      let color: string;
      let emissive: string;
      if (day) {
        // Daytime glass: cool reflective panes.
        color = "#bcd6ef";
        emissive = "#456a86";
      } else if (win.lit) {
        // Lit interior at night.
        color = win.warm ? "#ffd98a" : "#bfe0ff";
        emissive = win.warm ? "#ffcf72" : "#9fd2ff";
      } else {
        // Dark / unlit window at night.
        color = "#10141d";
        emissive = "#0a0d14";
      }
      s.add(
        primitives
          .box({ name: "window", material: material.emissive({ color, emissive }) })
          .position(win.pos[0], win.pos[1], win.pos[2])
          .scale([win.scale[0], win.scale[1], win.scale[2]]),
      );
    }
  }

  // Street lights: dark pole + glowing lamp head.
  for (const sl of STREET_LIGHTS) {
    s.add(
      primitives
        .box({
          name: "pole",
          material: material.pbr({ color: "#23282f", roughness: 0.6, metallic: 0.4 }),
        })
        .position(sl.x, sl.poleH / 2, sl.z)
        .scale([0.22, sl.poleH, 0.22]),
    );
    // Lamp arm.
    s.add(
      primitives
        .box({
          name: "lamp-arm",
          material: material.pbr({ color: "#23282f", roughness: 0.6, metallic: 0.4 }),
        })
        .position(sl.x, sl.poleH - 0.15, sl.z + 0.45)
        .scale([0.12, 0.12, 1.0]),
    );
    // Lamp head — warm glow at night, neutral fixture by day.
    s.add(
      primitives
        .box({
          name: "lamp",
          material: material.emissive({
            color: day ? "#cdd3d9" : "#fff0c2",
            emissive: day ? "#3a3f44" : "#ffd98a",
          }),
        })
        .position(sl.x, sl.poleH - 0.18, sl.z + 0.95)
        .scale([0.4, 0.26, 0.5]),
    );
  }

  // Lighting rig + sky-driven mood.
  if (day) {
    s.add(lights.ambient({ name: "sky-fill", intensity: 0.6, color: "#bcd6f2" }));
    s.add(
      lights.directional({
        name: "sun",
        position: [34, 46, 26],
        intensity: 1.9,
        color: "#fff3df",
      }),
    );
    s.add(
      lights.directional({
        name: "sky-bounce",
        position: [-30, 24, -18],
        intensity: 0.4,
        color: "#9fc0e6",
      }),
    );
  } else {
    s.add(lights.ambient({ name: "night-sky", intensity: 0.12, color: "#26324d" }));
    s.add(
      lights.directional({
        name: "moon",
        position: [-26, 38, -14],
        intensity: 0.22,
        color: "#5d76aa",
      }),
    );
    // Warm pools of light from the glowing street lamps.
    for (const sl of STREET_LIGHTS) {
      if (!sl.glow) continue;
      s.add(
        lights.point({
          name: "lamp-light",
          position: [sl.x, sl.poleH - 0.2, sl.z + 0.95],
          intensity: 0.9,
          color: "#ffcf8a",
        }),
      );
    }
    // Subtle haze adds depth to the night skyline.
    s.add(effects.fog({ density: 0.05, color: "#0a1024" }));
    // Bloom makes the lit windows and lamps glow.
    s.add(effects.bloom({ intensity: 0.5, color: "#ffe2ad" }));
  }

  // Elevated 3/4 view that frames the whole block.
  s.camera(
    camera.perspective({
      position: [33, 26, 37],
      target: [0, 5, 0],
      fov: 50,
    }),
  );
  s.add(interactions.orbit());

  return s;
}

// ---------------------------------------------------------------------------
// Mount + day/night toggle UI.
// ---------------------------------------------------------------------------
function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body { margin: 0; height: 100%; background: #05070d; overflow: hidden; }
    #app { position: fixed; inset: 0; width: 100vw; height: 100vh; }
    #app canvas { display: block; width: 100%; height: 100%; }
    .ui {
      position: fixed; top: 16px; left: 16px; z-index: 10;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #f4f7fb; user-select: none;
    }
    .ui h1 { margin: 0 0 8px; font-size: 15px; font-weight: 600; letter-spacing: .3px;
      text-shadow: 0 1px 4px rgba(0,0,0,.6); }
    .toggle {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 16px; border: 0; border-radius: 999px; cursor: pointer;
      font-size: 14px; font-weight: 600; color: #0c1118;
      background: linear-gradient(135deg, #ffe39a, #ffd166);
      box-shadow: 0 6px 18px rgba(0,0,0,.35);
      transition: transform .08s ease, background .2s ease, color .2s ease;
    }
    .toggle:active { transform: translateY(1px); }
    .toggle.night { background: linear-gradient(135deg, #2b3c66, #16213f); color: #dfe8ff; }
    .hint { margin-top: 8px; font-size: 12px; opacity: .8;
      text-shadow: 0 1px 3px rgba(0,0,0,.6); }
  `;
  document.head.appendChild(style);
}

function main(): void {
  injectStyles();

  const container = document.getElementById("app");
  if (!container) throw new Error("Missing #app container");

  // Overlay UI.
  const ui = document.createElement("div");
  ui.className = "ui";
  const title = document.createElement("h1");
  title.textContent = "Procedural City Block";
  const button = document.createElement("button");
  button.className = "toggle";
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "20 procedurally generated buildings";
  ui.append(title, button, hint);
  document.body.appendChild(ui);

  // Initial mode may be set via ?mode=night (defaults to day).
  let mode: Mode =
    new URLSearchParams(window.location.search).get("mode") === "night"
      ? "night"
      : "day";
  let app: AuraApp | undefined;

  const render = () => {
    app?.dispose();
    container.querySelectorAll("canvas").forEach((c) => c.remove());
    app = createAuraApp(container, { scene: buildScene(mode), diagnostics: false });
    button.textContent =
      mode === "day" ? "☀️ Day — switch to Night" : "🌙 Night — switch to Day";
    button.classList.toggle("night", mode === "night");
  };

  button.addEventListener("click", () => {
    mode = mode === "day" ? "night" : "day";
    render();
  });

  // Re-mount on resize so the canvas backing store matches the viewport.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 200);
  });

  render();
}

main();
