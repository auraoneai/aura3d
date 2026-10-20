// Dot Dash 3D — scene builder + per-frame visual sync.
// World units: 1 tile = 1 unit. Maze 19×21 centered at origin:
// worldX = tile.x - 9, worldZ = tile.y - 10.

import {
  game, looks, lights, effects, model, scene, camera, instances,
  primitives, material, type AuraApp
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import { idx, type ParsedMaze } from "./grid.js";
import { MAZES, type MazeId } from "./mazes.js";
import {
  GHOST_TINT, st, normPos, normGhostPos, type GhostId
} from "./sim.js";
import type { FruitKind } from "./grid.js";

export const TILE = 1;
export const OX = -9, OZ = -10; // world offset of tile(0,0)
export const wx = (x: number): number => x + OX;
export const wz = (y: number): number => y + OZ;

const FRIGHT_COLOR = "#2b3dff";
const FRIGHT_FLASH = "#e8ecff";
const EYES_COLOR = "#dbe9ff";

/** Shared camera pose so build + follow sync can never drift apart. */
const CAMERA_RIG = {
  position: [0, 17.2, 13.8] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  fov: 48,
  followX: 0.16,
  followZ: 0.12
} as const;

const GHOST_EMISSIVE: Record<GhostId, string> = {
  blitz: "#ff1a3b",
  flick: "#ff33aa",
  dim: "#00b8ff",
  sly: "#ff6a00"
};

const FRUIT_ASSET: Record<FruitKind, keyof typeof assets | null> = {
  cherry: "fruitCherry",
  strawberry: "fruitStrawberry",
  orange: "fruitOrange",
  apple: "fruitApple",
  melon: "fruitMelon",
  star: "fruitStar"
};

let app: AuraApp | null = null;
export function bindApp(a: AuraApp): void { app = a; }

// ---------------------------------------------------------------------------
// Static-ish instanced pools — rebuilt when the maze changes.
// ---------------------------------------------------------------------------
const CAP = {
  wall: 420,
  rail: 900,
  dot: 220,
  orb: 8,
  marker: 8,      // ghost-school target tiles
  eyes: 12,       // eyes-only specter state (2 per ghost max + margin)
  dress: 140,
  glow: 120
} as const;

type Pool = { mat: Float32Array; col: Float32Array; n: number };
const POOL = {} as Record<keyof typeof CAP, Pool>;
for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) {
  // IMPORTANT: Aura3D setInstanceTransforms expects 3 floats (RGB) per instance!
  POOL[k] = { mat: new Float32Array(CAP[k] * 16), col: new Float32Array(CAP[k] * 3), n: 0 };
}

function writeMat(buf: Float32Array, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0): void {
  const c = Math.cos(ry), s = Math.sin(ry);
  const o = i * 16;
  buf[o + 0] = c * sx; buf[o + 1] = 0; buf[o + 2] = -s * sx; buf[o + 3] = 0;
  buf[o + 4] = 0; buf[o + 5] = sy; buf[o + 6] = 0; buf[o + 7] = 0;
  buf[o + 8] = s * sz; buf[o + 9] = 0; buf[o + 10] = c * sz; buf[o + 11] = 0;
  buf[o + 12] = x; buf[o + 13] = y; buf[o + 14] = z; buf[o + 15] = 1;
}

function inst(k: keyof typeof CAP, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, ry = 0): void {
  const p = POOL[k];
  if (p.n >= CAP[k]) return;
  writeMat(p.mat, p.n, x, y, z, sx, sy, sz, ry);
  const v = parseInt(color.slice(1), 16);
  p.col[p.n * 3] = ((v >> 16) & 255) / 255;
  p.col[p.n * 3 + 1] = ((v >> 8) & 255) / 255;
  p.col[p.n * 3 + 2] = (v & 255) / 255;
  p.n++;
}

const pad = (n: number) => Array.from({ length: n }, () => ({ position: [0, -999, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));

// ---------------------------------------------------------------------------
// Scene definition — one static graph; instanced pools get re-filled per frame.
// ---------------------------------------------------------------------------
export function buildScene(): unknown {
  const s = scene()
    // Punchier neon without clipping the maze: lift mid-tones, keep whites in
    // the rails/orbs, and add a soft frame to focus the eye on the board.
    .add(effects.bloom({ name: "arcade-bloom", intensity: 0.36, threshold: 0.74, radius: 0.4 }))
    .add(effects.vignette({ intensity: 0.22, smoothness: 0.65 }))
    // Gentle haze so the far maze rows settle into the deck tone without
    // dimming hazards at the top of the board.
    .add(effects.fog({ color: "#101a3f", density: 0.0035 }))
    .add(looks.preset("neon-arcade", { fogDensityScale: 0, exposureEv: 0.05, background: "#0d1736", accent: "#22d3ee" }).runtime(game.runtimeNode("look")))
    .add(lights.ambient({ color: "#b4ccff", intensity: 0.92 }))
    .add(lights.hemisphere({ skyColor: "#cce0ff", groundColor: "#243b6b", intensity: 0.85 }))
    .add(lights.directional({ position: [8, 22, 12], target: [0, 0, 0], color: "#eef4ff", intensity: 1.25, shadow: true }))
    .camera(camera.perspective({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }));

  // IMPORTANT: In Aura3D's instanced shader, v_instanceColor multiplies u_baseColor (color), NOT u_emissiveColor!
  // Never set emissive: "#ffffff" on instanced pools, or every instance emits pure white regardless of instance color.
  const wallMat = material.pbr({ color: "#ffffff", emissive: "#183464", emissiveIntensity: 0.38, roughness: 0.42, metalness: 0.18 });
  const railMat = material.pbr({ color: "#ffffff", emissive: "#22d3ee", emissiveIntensity: 0.48, roughness: 0.28, metalness: 0.1 });
  const dotMat = material.pbr({ color: "#ffffff", emissive: "#ffaa00", emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.1 });
  const orbMat = material.pbr({ color: "#ffffff", emissive: "#ff3df0", emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.15 });
  const markerMat = material.pbr({ color: "#ffffff", roughness: 0.4, metalness: 0.05 });
  const eyesMat = material.pbr({ color: "#ffffff", roughness: 0.25, metalness: 0.05 });
  const dressMat = material.pbr({ color: "#ffffff", emissive: "#162d57", emissiveIntensity: 0.32, roughness: 0.5, metalness: 0.18 });
  const glowMat = material.pbr({ color: "#ffffff", emissive: "#22d3ee", emissiveIntensity: 0.38, roughness: 0.35 });

  const byteMat = material.pbr({ color: "#ffcb1f", emissive: "#ff9900", emissiveIntensity: 0.22, roughness: 0.28, metalness: 0.08 });
  const blitzMat = material.pbr({ color: "#ff2a4b", emissive: "#ff1a3b", emissiveIntensity: 0.18, roughness: 0.32, metalness: 0.06 });
  const flickMat = material.pbr({ color: "#ff66cc", emissive: "#ff33aa", emissiveIntensity: 0.18, roughness: 0.32, metalness: 0.06 });
  const dimMat = material.pbr({ color: "#1fe0ff", emissive: "#00b8ff", emissiveIntensity: 0.18, roughness: 0.32, metalness: 0.06 });
  const slyMat = material.pbr({ color: "#ff881f", emissive: "#ff6a00", emissiveIntensity: 0.18, roughness: 0.32, metalness: 0.06 });

  const cherryMat = material.pbr({ color: "#ff2244", emissive: "#cc0022", emissiveIntensity: 0.14, roughness: 0.25, metalness: 0.08 });
  const strawberryMat = material.pbr({ color: "#ff3366", emissive: "#cc1144", emissiveIntensity: 0.14, roughness: 0.3, metalness: 0.06 });
  const orangeMat = material.pbr({ color: "#ff8800", emissive: "#cc5500", emissiveIntensity: 0.14, roughness: 0.3, metalness: 0.06 });
  const appleMat = material.pbr({ color: "#dd1122", emissive: "#aa0011", emissiveIntensity: 0.14, roughness: 0.25, metalness: 0.08 });
  const melonMat = material.pbr({ color: "#22cc55", emissive: "#009933", emissiveIntensity: 0.14, roughness: 0.3, metalness: 0.06 });
  const starMat = material.pbr({ color: "#ffd700", emissive: "#ffaa00", emissiveIntensity: 0.25, roughness: 0.22, metalness: 0.35 });

  s.addMany([
    // ground slab — sapphire arcade deck with a low-gloss sheen so the key
    // light rakes across it instead of reading as flat navy.
    primitives.box({ name: "board", size: [46.0, 0.32, 36.0], material: material.pbr({ color: "#223a6e", emissive: "#172b54", emissiveIntensity: 0.38, roughness: 0.42, metalness: 0.28 }) })
      .position(0, -0.18, 0)
      .runtime(game.runtimeNode("board")),
    // instanced pools
    instances.box({ name: "walls", size: [1, 1, 1], material: wallMat, transforms: pad(CAP.wall), castShadow: true, receiveShadow: true }).runtime(game.runtimeNode("pool-wall")),
    instances.box({ name: "rails", size: [1, 1, 1], material: railMat, transforms: pad(CAP.rail), castShadow: false }).runtime(game.runtimeNode("pool-rail")),
    instances.sphere({ name: "dots", size: [1, 1, 1], material: dotMat, transforms: pad(CAP.dot), castShadow: false }).runtime(game.runtimeNode("pool-dot")),
    instances.sphere({ name: "orbs", size: [1, 1, 1], material: orbMat, transforms: pad(CAP.orb), castShadow: false }).runtime(game.runtimeNode("pool-orb")),
    instances.box({ name: "markers", size: [1, 1, 1], material: markerMat, transforms: pad(CAP.marker), castShadow: false }).runtime(game.runtimeNode("pool-marker")),
    instances.sphere({ name: "eyes", size: [1, 1, 1], material: eyesMat, transforms: pad(CAP.eyes), castShadow: false }).runtime(game.runtimeNode("pool-eyes")),
    instances.box({ name: "dress", size: [1, 1, 1], material: dressMat, transforms: pad(CAP.dress), castShadow: true }).runtime(game.runtimeNode("pool-dress")),
    instances.box({ name: "glow", size: [1, 1, 1], material: glowMat, transforms: pad(CAP.glow), castShadow: false }).runtime(game.runtimeNode("pool-glow")),

    // actors — Byte + four specters + echo copies for wrap edges + six fruit + 3D Meshy arcade statues
    ...(() => {
      const q = new URLSearchParams(globalThis.location?.search ?? "");
      const tier = q.get("models") ?? (q.has("lite") ? "none" : "all");
      const core = [
        model(assets.byte, { name: "byte", targetHeight: 0.72, castShadow: true, material: byteMat })
          .position(wx(st.maze.spawn.x), 0.36, wz(st.maze.spawn.y))
          .runtime(game.runtimeNode("byte")),
        model(assets.specterBlitz, { name: "ghost-blitz", targetHeight: 0.74, castShadow: true, material: blitzMat }).position(0, 0.36, -3).runtime(game.runtimeNode("ghost-blitz")),
        model(assets.specterSly, { name: "ghost-sly", targetHeight: 0.74, castShadow: true, material: slyMat }).position(4, 0.36, 3).runtime(game.runtimeNode("ghost-sly")),
        model(assets.specterFlick, { name: "ghost-flick", targetHeight: 0.74, castShadow: true, material: flickMat }).position(-5, 0.36, -5).runtime(game.runtimeNode("ghost-flick")),
        model(assets.specterDim, { name: "ghost-dim", targetHeight: 0.74, castShadow: true, material: dimMat }).position(5, 0.36, -5).runtime(game.runtimeNode("ghost-dim"))
      ];
      const extra = [
        model(assets.byte, { name: "byte-echo", targetHeight: 0.72, castShadow: false, visible: false, material: byteMat })
          .position(0, -999, 0)
          .runtime(game.runtimeNode("byte-echo")),
        model(assets.specterBlitz, { name: "ghost-blitz-echo", targetHeight: 0.74, castShadow: false, visible: false, material: blitzMat }).position(0, -999, 0).runtime(game.runtimeNode("ghost-blitz-echo")),
        model(assets.specterSly, { name: "ghost-sly-echo", targetHeight: 0.74, castShadow: false, visible: false, material: slyMat }).position(0, -999, 0).runtime(game.runtimeNode("ghost-sly-echo")),
        model(assets.specterFlick, { name: "ghost-flick-echo", targetHeight: 0.74, castShadow: false, visible: false, material: flickMat }).position(0, -999, 0).runtime(game.runtimeNode("ghost-flick-echo")),
        model(assets.specterDim, { name: "ghost-dim-echo", targetHeight: 0.74, castShadow: false, visible: false, material: dimMat }).position(0, -999, 0).runtime(game.runtimeNode("ghost-dim-echo")),
        model(assets.fruitCherry, { name: "fruit-cherry", targetHeight: 0.68, castShadow: true, visible: false, material: cherryMat }).position(0, -999, 0).runtime(game.runtimeNode("fruit-cherry")),
        model(assets.fruitStrawberry, { name: "fruit-strawberry", targetHeight: 0.68, castShadow: true, visible: false, material: strawberryMat }).position(0, -999, 0).runtime(game.runtimeNode("fruit-strawberry")),
        model(assets.fruitOrange, { name: "fruit-orange", targetHeight: 0.68, castShadow: true, visible: false, material: orangeMat }).position(0, -999, 0).runtime(game.runtimeNode("fruit-orange")),
        model(assets.fruitApple, { name: "fruit-apple", targetHeight: 0.68, castShadow: true, visible: false, material: appleMat }).position(0, -999, 0).runtime(game.runtimeNode("fruit-apple")),
        model(assets.fruitMelon, { name: "fruit-melon", targetHeight: 0.72, castShadow: true, visible: false, material: melonMat }).position(0, -999, 0).runtime(game.runtimeNode("fruit-melon")),
        model(assets.fruitStar, { name: "fruit-star", targetHeight: 0.74, castShadow: true, visible: false, material: starMat }).position(0, -999, 0).runtime(game.runtimeNode("fruit-star")),
        // 3D Meshy arcade prize & guardian statues flanking the maze perimeter
        model(assets.fruitCherry, { name: "trophy-cherry", targetHeight: 1.35, castShadow: true, material: cherryMat }).position(-10.8, 0.85, 6.0).runtime(game.runtimeNode("trophy-cherry")),
        model(assets.fruitStrawberry, { name: "trophy-strawberry", targetHeight: 1.35, castShadow: true, material: strawberryMat }).position(10.8, 0.85, 6.0).runtime(game.runtimeNode("trophy-strawberry")),
        model(assets.fruitOrange, { name: "trophy-orange", targetHeight: 1.35, castShadow: true, material: orangeMat }).position(-10.8, 0.85, 1.5).runtime(game.runtimeNode("trophy-orange")),
        model(assets.fruitApple, { name: "trophy-apple", targetHeight: 1.35, castShadow: true, material: appleMat }).position(10.8, 0.85, 1.5).runtime(game.runtimeNode("trophy-apple")),
        model(assets.fruitMelon, { name: "trophy-melon", targetHeight: 1.45, castShadow: true, material: melonMat }).position(-10.8, 0.9, -3.5).runtime(game.runtimeNode("trophy-melon")),
        model(assets.fruitStar, { name: "trophy-star", targetHeight: 1.55, castShadow: true, material: starMat }).position(10.8, 0.95, -3.5).runtime(game.runtimeNode("trophy-star")),
        model(assets.specterBlitz, { name: "statue-blitz", targetHeight: 1.65, castShadow: true, material: blitzMat }).position(-10.8, 1.0, 9.2).rotate(0, 0.45, 0),
        model(assets.specterSly, { name: "statue-sly", targetHeight: 1.65, castShadow: true, material: slyMat }).position(10.8, 1.0, 9.2).rotate(0, -0.45, 0),
        model(assets.specterFlick, { name: "statue-flick", targetHeight: 1.65, castShadow: true, material: flickMat }).position(-10.8, 1.0, -8.5).rotate(0, 0.65, 0),
        model(assets.specterDim, { name: "statue-dim", targetHeight: 1.65, castShadow: true, material: dimMat }).position(10.8, 1.0, -8.5).rotate(0, -0.65, 0)
      ];
      return tier === "none" ? [] : tier === "core" ? core : [...core, ...extra];
    })(),

    // ghost house door slab + school beacon
    primitives.box({ name: "door", size: [1.02, 0.5, 0.12], material: material.pbr({ color: "#ff9ed2", emissive: "#ff66cc", emissiveIntensity: 0.65, roughness: 0.4, opacity: 0.78 }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("door")),
    primitives.cylinder({ name: "school-beam", size: [0.35, 3.2, 0.35], material: material.pbr({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 0.65, roughness: 0.4, opacity: 0.45 }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("school-beam"))
  ]);

  // ------------------------------------------------------------ deck rim
  // The fixed chase camera looks steeply down, so anything raised behind the
  // board falls outside the frustum. Frame the playfield with lit rim strips at
  // deck level instead: they are always visible and cost four boxes.
  const deckEdgeMat = material.emissive({ color: "#07242a", emissive: "#22d3ee", emissiveIntensity: 1.05 });
  const deckEdgePinkMat = material.emissive({ color: "#25081f", emissive: "#ff3df0", emissiveIntensity: 0.95 });
  s.addMany([
    primitives.box({ name: "deck-edge-n", size: [46.6, 0.06, 0.16], material: deckEdgeMat, castShadow: false }).position(0, 0.02, -18.2),
    primitives.box({ name: "deck-edge-s", size: [46.6, 0.06, 0.16], material: deckEdgePinkMat, castShadow: false }).position(0, 0.02, 18.2),
    primitives.box({ name: "deck-edge-w", size: [0.16, 0.06, 36.6], material: deckEdgePinkMat, castShadow: false }).position(-23.2, 0.02, 0),
    primitives.box({ name: "deck-edge-e", size: [0.16, 0.06, 36.6], material: deckEdgeMat, castShadow: false }).position(23.2, 0.02, 0)
  ]);
  return s.toJSON();
}

// ---------------------------------------------------------------------------
// Maze → instanced walls/rails/floor dressing (refreshed on maze change)
// ---------------------------------------------------------------------------
let builtFor: MazeId | "" = "";

function paintMaze(m: ParsedMaze): void {
  const def = m.def;
  const P = def.palette;
  const wallColor = def.id === "classic" ? "#20427a" : P.wall;
  const edgeColor = def.id === "classic" ? "#22d3ee" : P.edge;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      const X = wx(x), Z = wz(y);
      if (m.wall[i]) {
        inst("wall", X, 0.32, Z, 0.94, 0.64, 0.94, wallColor);
        // glowing top rail along each corridor-adjacent face
        for (const [dx, dy, ex, ez, sx, sz] of [
          [0, -1, 0, -0.485, 0.96, 0.05],
          [0, 1, 0, 0.485, 0.96, 0.05],
          [-1, 0, -0.485, 0, 0.05, 0.96],
          [1, 0, 0.485, 0, 0.05, 0.96]
        ] as const) {
          const ni = idx(m.width, x + dx, y + dy);
          if (x + dx >= 0 && y + dy >= 0 && x + dx < m.width && y + dy < m.height && !m.wall[ni]) {
            inst("rail", X + ex, 0.65, Z + ez, sx, 0.055, sz, edgeColor);
          }
        }
      }
      // Corridor floor uses the sleek dark #090d1a board slab directly (never push floor tiles into glow!).
    }
  }
  // ghost-house door slab position + non-emissive interior floor pad
  const d = m.door;
  for (const i of m.houseTiles) {
    const hx = i % m.width, hy = (i / m.width) | 0;
    inst("dress", wx(hx), 0.0, wz(hy), 0.96, 0.02, 0.96, "#1f325c");
  }
  try {
    app?.nodes?.require("door").setPosition(wx(d.x), 0.28, wz(d.y) + 0.46);
  } catch { /* boot race */ }
}

/** Perimeter dressing per maze theme — neon pedestals under 3D Meshy trophies & guardians. */
function paintDressing(m: ParsedMaze): void {
  const P = m.def.palette;
  const wallColor = m.def.id === "classic" ? "#20427a" : P.wall;
  const accentColor = m.def.id === "classic" ? "#22d3ee" : P.accent;
  const pedestals: readonly [number, number][] = [
    [-10.8, 9.2], [10.8, 9.2],
    [-10.8, 6.0], [10.8, 6.0],
    [-10.8, 1.5], [10.8, 1.5],
    [-10.8, -3.5], [10.8, -3.5],
    [-10.8, -8.5], [10.8, -8.5]
  ];
  for (const [px, pz] of pedestals) {
    inst("dress", px, 0.22, pz, 1.25, 0.44, 1.25, wallColor);
    inst("glow", px, 0.45, pz, 1.05, 0.06, 1.05, accentColor);
  }
  for (let c = 0; c < 18; c++) {
    const r1 = Math.abs(Math.sin(c * 37.3 + m.width)) % 1;
    const r2 = Math.abs(Math.sin(c * 91.7 + m.height)) % 1;
    const side = c % 2 === 0 ? -1 : 1;
    const edgeX = side * (12.6 + r1 * 3.5);
    const edgeZ = -9.5 + r2 * 19;
    const h = 0.65 + r1 * 1.9;
    inst("dress", edgeX, h * 0.5, edgeZ, 0.55, h, 0.55, wallColor);
    if (r2 < 0.65) inst("glow", edgeX, h + 0.06, edgeZ, 0.42, 0.1, 0.42, accentColor);
  }
}

const lastGhostMatState: Partial<Record<GhostId, "normal" | "fright" | "flash">> = {};

// ---------------------------------------------------------------------------
// Per-frame visual sync
// ---------------------------------------------------------------------------
export function syncVisuals(_dt: number): void {
  if (!app) return;
  const nodes = app.nodes;
  const m = st.maze;
  if (builtFor !== m.def.id) {
    builtFor = m.def.id as MazeId;
  }
  for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) POOL[k].n = 0;
  paintMaze(m);
  paintDressing(m);

  // dots & power orbs
  const pulse = 0.5 + 0.5 * Math.sin(st.time * 6);
  const dotColor = m.def.id === "classic" ? "#ffd147" : m.def.palette.dot;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      if (st.dots[i]) inst("dot", wx(x), 0.25, wz(y), 0.21, 0.21, 0.21, dotColor);
      if (st.orbs[i]) {
        const s = 0.36 + pulse * 0.12;
        const orbCol = pulse > 0.5 ? "#ff3df0" : "#22d3ee";
        inst("orb", wx(x), 0.36 + pulse * 0.06, wz(y), s, s, s, orbCol);
      }
    }
  }
  // ghost-school target markers
  if (st.school) {
    for (const g of st.ghosts) {
      inst("marker", wx(g.target.x), 0.035, wz(g.target.y), 0.92, 0.03, 0.92, GHOST_TINT[g.id]);
    }
  }
  // eyes (eaten specters)
  for (const g of st.ghosts) {
    if (g.state !== "eyes") continue;
    const gp = normGhostPos(g);
    const ox = g.dir.z !== 0 ? 0.16 : 0, oz = g.dir.x !== 0 ? 0.16 : 0;
    inst("eyes", wx(gp.x) - 0.1 + ox, 0.45, wz(gp.y) - 0.1 + oz, 0.15, 0.15, 0.15, EYES_COLOR);
    inst("eyes", wx(gp.x) + 0.1 - ox, 0.45, wz(gp.y) + 0.1 - oz, 0.15, 0.15, 0.15, EYES_COLOR);
    inst("eyes", wx(gp.x) - 0.1 + ox + g.dir.x * 0.05, 0.45, wz(gp.y) - 0.1 + oz + g.dir.z * 0.05, 0.06, 0.06, 0.06, "#2233cc");
    inst("eyes", wx(gp.x) + 0.1 - ox + g.dir.x * 0.05, 0.45, wz(gp.y) + 0.1 - oz + g.dir.z * 0.05, 0.06, 0.06, 0.06, "#2233cc");
  }

  // ---- actors
  try {
    const pp = normPos(m);
    const moving = st.autopilot || st.hasMoved;
    const chomp = moving ? Math.abs(Math.sin(st.time * 14)) : Math.sin(st.time * 4) * 0.25;
    const bob = moving ? chomp * 0.08 : Math.sin(st.time * 4) * 0.025;
    const pitch = moving ? Math.sin(st.time * 14) * 0.16 : 0;
    const dead = st.mode === "dying";
    const byte = nodes.require("byte");
    byte.setPosition(wx(pp.x), 0.36 + (dead ? 0 : bob), wz(pp.y));
    byte.setRotation(dead ? 0 : pitch, yawOf(st.player.dir) + Math.PI, dead ? Math.sin(st.time * 20) * 0.5 : 0);
    if (dead) {
      byte.setScale(Math.max(0.05, (st.deathT / 1.6) * 0.76));
    } else if (st.player.dashT > 0) {
      const ds = 0.82 + Math.sin(st.time * 40) * 0.05;
      byte.setScale([ds * 1.06, ds * 0.94, ds * 1.06]);
    } else if (moving) {
      byte.setScale([0.76 * (1 + chomp * 0.08), 0.76 * (1 - chomp * 0.06), 0.76 * (1 + chomp * 0.08)]);
    } else {
      byte.setScale(0.76);
    }
    byte.setVisible(!dead || Math.sin(st.time * 24) > -0.2);
    // wrap echo copy
    const ex = echoOffset(m, pp.x, pp.y);
    const echo = nodes.require("byte-echo");
    if (ex) {
      echo.setVisible(!dead);
      echo.setPosition(wx(ex.x), 0.36 + bob, wz(ex.y));
      echo.setRotation(dead ? 0 : pitch, yawOf(st.player.dir) + Math.PI, 0);
      echo.setScale(0.76);
    } else echo.setVisible(false);

    // specters — distinct arcade colors, switching to fright blue/flash when Power Orb is active
    for (const g of st.ghosts) {
      const h = nodes.require(`ghost-${g.id}`);
      const gp = normGhostPos(g);
      const wob = Math.sin(st.time * 7 + g.px) * 0.04;
      h.setPosition(wx(gp.x), 0.36 + wob, wz(gp.y));
      const frightened = st.fright > 0 && g.state === "active";
      const matState: "normal" | "fright" | "flash" = frightened
        ? (st.fright < 1.8 && Math.sin(st.time * 18) > 0 ? "flash" : "fright")
        : "normal";
      if (lastGhostMatState[g.id] !== matState) {
        lastGhostMatState[g.id] = matState;
        const col = matState === "flash" ? FRIGHT_FLASH : matState === "fright" ? FRIGHT_COLOR : GHOST_TINT[g.id];
        const em = matState === "flash" ? "#88aaff" : matState === "fright" ? "#1122aa" : GHOST_EMISSIVE[g.id];
        const mh = h as unknown as {
          materials?: { setMaterialOverrides(o: readonly Record<string, unknown>[]): void };
          setTint?: (c: string) => void;
        };
        mh.materials?.setMaterialOverrides([{
          color: col,
          colorMode: "replace",
          emissive: em,
          emissiveIntensity: 0.2,
          roughness: 0.32,
          metallic: 0.06
        }]);
        mh.setTint?.(col);
      }
      const yaw = yawOf(g.dir);
      h.setRotation(frightened ? Math.sin(st.time * 10) * 0.3 : 0, yaw + Math.PI, frightened ? Math.sin(st.time * 13) * 0.2 : 0);
      const hidden = g.state === "eyes" || g.state === "entering";
      h.setVisible(!hidden);
      h.setScale(frightened ? 0.68 + Math.sin(st.time * 14) * 0.05 : g.state === "house" ? 0.72 : 0.76);
      // wrap echoes for ghosts
      const gx = echoOffset(m, gp.x, gp.y);
      const ge = nodes.get(`ghost-${g.id}-echo`);
      if (ge) {
        if (gx && !hidden) {
          ge.setVisible(true);
          ge.setPosition(wx(gx.x), 0.36 + wob, wz(gx.y));
          ge.setRotation(0, yawOf(g.dir) + Math.PI, 0);
          ge.setScale(0.76);
        } else ge.setVisible(false);
      }
    }

    // fruit
    for (const kind of Object.keys(FRUIT_ASSET)) {
      const node = nodes.get(`fruit-${kind}`);
      if (!node) continue;
      if (st.fruitActive && m.def.fruit === kind) {
        node.setVisible(true);
        node.setPosition(wx(m.fruitTile.x), 0.38 + Math.sin(st.time * 4) * 0.06, wz(m.fruitTile.y));
        node.setRotation(0, st.time * 1.6, 0);
        node.setScale(0.74);
      } else node.setVisible(false);
    }

    // rotate 3D Meshy perimeter trophies
    for (const tk of ["trophy-cherry", "trophy-strawberry", "trophy-orange", "trophy-apple", "trophy-melon", "trophy-star"]) {
      nodes.get(tk)?.setRotation(0, st.time * 1.2, 0);
    }

    // school beacon over the active specter of interest (first active ghost)
    const beam = nodes.get("school-beam");
    if (beam) {
      if (st.school) {
        const lead = st.ghosts.find((g) => g.state === "active") ?? st.ghosts[0];
        if (lead) {
          const gp = normGhostPos(lead);
          beam.setVisible(true);
          beam.setPosition(wx(gp.x), 1.8, wz(gp.y));
        }
      } else beam.setVisible(false);
    }
  } catch { st.nodesOk = false; }

  // camera — slightly lower/wider than the old rig so the lit deck and neon
  // horizon fill the frame; the whole maze and every hazard stay in view.
  const pp2 = normPos(m);
  if (st.camera === "overhead") {
    app.camera?.setPose({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov });
  } else {
    const bx = wx(pp2.x) * CAMERA_RIG.followX, bz = wz(pp2.y) * CAMERA_RIG.followZ;
    app.camera?.setPose({
      position: [bx, CAMERA_RIG.position[1], CAMERA_RIG.position[2] + bz],
      target: [bx * 0.75, 0, CAMERA_RIG.target[2] + bz * 0.65],
      fov: CAMERA_RIG.fov
    });
  }
  app.output?.setOutputOverlay(
    st.mode === "dying" ? { fade: [0.4, 0.02, 0.1, 0.45] }
    : st.fright > 0 && st.fright < 1.8 ? { vignette: [0.05, 0.05, 0.35, 0.5] }
    : {}
  );

  // submit pools
  for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) {
    const p = POOL[k];
    try {
      (nodes.require(`pool-${k}`) as unknown as { setInstanceTransforms(m: Float32Array, n: number, c?: Float32Array): void })
        .setInstanceTransforms(p.mat, p.n, p.col);
    } catch { st.nodesOk = false; }
  }
}

function yawOf(d: { x: number; z: number }): number {
  if (d.x > 0) return Math.PI / 2;
  if (d.x < 0) return -Math.PI / 2;
  if (d.z > 0) return 0;
  return Math.PI;
}

/** If an actor straddles a wrap edge, return the echo tile position. */
function echoOffset(m: ParsedMaze, x: number, y: number): { x: number; y: number } | null {
  let ex: number | null = null, ey: number | null = null;
  if (m.def.wrapX) {
    if (x < 0.55) ex = x + m.width;
    else if (x > m.width - 1.55) ex = x - m.width;
  }
  if (m.def.wrapY) {
    if (y < 0.55) ey = y + m.height;
    else if (y > m.height - 1.55) ey = y - m.height;
  }
  if (ex === null && ey === null) return null;
  return { x: ex ?? x, y: ey ?? y };
}

