// Glint Courier — scene builder + per-frame visual sync.
// World units: 1 tile = 1 unit. Maze 19×21 centered at origin:
// worldX = tile.x - 9, worldZ = tile.y - 10.

import {
  game, looks, lights, effects, scene, camera, instances,
  primitives, material, type AuraApp
} from "@aura3d/engine";
import { idx, type ParsedMaze } from "./grid.js";
import { MAZES, type MazeId } from "./mazes.js";
import {
  GHOST_TINT, st, normPos, normGhostPos, type GhostId
} from "./sim.js";
import type { FruitKind } from "./grid.js";
import { fitDistanceScale, projectNdc, scalePose, type CameraPose } from "./camera.js";
import { boardLook, hexToRgb, pylonLayout, REFERENCE_LOOK, type BoardLook } from "./palette.js";

export const TILE = 1;
export const OX = -9, OZ = -10; // world offset of tile(0,0)
export const wx = (x: number): number => x + OX;
export const wz = (y: number): number => y + OZ;

const OVERLOAD_COLOR = "#6f8f95";   // sentries dim to slate while a surge is active
const OVERLOAD_FLASH = "#ffffff";
const CORE_COLOR = "#aef7ff";       // a disabled sentry returns to the hub as a bare core

/** Shared camera pose so build + follow sync can never drift apart. */
const CAMERA_RIG = {
  position: [0, 17.2, 13.8] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  fov: 48,
  followX: 0.16,
  followZ: 0.12
} as const;

/** Cache gem colour per bonus kind (kind ids are internal; labels live in mazes.ts). */
const GEM_COLOR: Record<FruitKind, string> = {
  cherry: "#ff3b5c",
  strawberry: "#ff8fc7",
  orange: "#ffb23e",
  apple: "#3dff9a",
  melon: "#3de7ff",
  star: "#e9d6ff"
};
const TROPHY_COLORS = ["#ff3b5c", "#ffb23e", "#3dff9a", "#3de7ff", "#b78bff", "#ff8fc7"] as const;

let app: AuraApp | null = null;
export function bindApp(a: AuraApp): void { app = a; }

/** Reduced motion / reduced flash (session settings or the OS preference): steady death shrink, slow sentry pulse, no red fade. */
let calmMotion = false;
let calmFlash = false;
export function setMotionPrefs(p: { reducedMotion: boolean; reducedFlash: boolean }): void {
  calmMotion = p.reducedMotion;
  calmFlash = p.reducedFlash || p.reducedMotion;
}

/** Last camera pose the game set and the aspect it was fitted for (QA hook + score pop-up projection). */
let lastPose: CameraPose = { position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov };
let fitAspect = 0;
let fitK = 1;
export function cameraPose(): CameraPose & { readonly aspect: number; readonly pullBack: number } {
  return { ...lastPose, aspect: fitAspect, pullBack: fitK };
}
function viewAspect(): number {
  const c = app?.canvas as HTMLCanvasElement | null | undefined;
  if (c && c.clientWidth > 0 && c.clientHeight > 0) return c.clientWidth / c.clientHeight;
  return typeof window !== "undefined" && window.innerHeight > 0 ? window.innerWidth / window.innerHeight : 16 / 9;
}
/** Screen position (CSS px inside the canvas) of a tile, or null when it is off-screen. */
export function tileToScreen(tx: number, ty: number, y = 0.6): { x: number; y: number } | null {
  const c = app?.canvas as HTMLCanvasElement | null | undefined;
  const w = c?.clientWidth ?? window.innerWidth, h = c?.clientHeight ?? window.innerHeight;
  const ndc = projectNdc(lastPose, w / Math.max(1, h), [wx(tx), y, wz(ty)]);
  if (!ndc || Math.abs(ndc[0]) > 1 || Math.abs(ndc[1]) > 1) return null;
  return { x: (ndc[0] * 0.5 + 0.5) * w, y: (0.5 - ndc[1] * 0.5) * h };
}

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
  glow: 120,
  hero: 2,       // courier faceted shell (+ wrap echo)
  halo: 2,       // courier spinning ring
  shC: 2,        // sentry silhouettes: cone, cube, ring, saucer (+ wrap echo each)
  shB: 2,
  shT: 2,
  shY: 2,
  trophy: 12     // perimeter gems on pedestals + the cache gem
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
  const rgb = hexToRgb(color); // cached per colour string
  p.col[p.n * 3] = rgb[0];
  p.col[p.n * 3 + 1] = rgb[1];
  p.col[p.n * 3 + 2] = rgb[2];
  p.n++;
}

/** Pools that only change with the board: painted and submitted once per board, not every frame. */
const STATIC_POOLS = ["wall", "rail", "dress", "glow"] as const satisfies readonly (keyof typeof CAP)[];
const DYNAMIC_POOLS = (Object.keys(CAP) as (keyof typeof CAP)[]).filter((k) => !(STATIC_POOLS as readonly string[]).includes(k));

const pad = (n: number) => Array.from({ length: n }, () => ({ position: [0, -999, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));

const wallMaterial = (emissive: string) => material.pbr({ color: "#ffffff", emissive, emissiveIntensity: 0.38, roughness: 0.42, metalness: 0.18 });
const boardMaterial = (color: string, emissive: string) => material.pbr({ color, emissive, emissiveIntensity: 0.5, roughness: 0.42, metalness: 0.28 });

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
    .add(effects.fog({ color: "#0e1a17", density: 0.0035 }))
    .add(looks.preset("neon-arcade", { fogDensityScale: 0, exposureEv: 0.05, background: "#0e1a17", accent: "#ffb23e" }).runtime(game.runtimeNode("look")))
    .add(lights.ambient({ color: "#ffe9cc", intensity: 0.92 }))
    // 0.5, not 0.85: since the engine applies the hemisphere per normal (sky on up-facing
    // surfaces), 0.85 lifted the board from 29.5 to 31.5 mean luma. 0.5 holds the audited 4.5.0
    // look (remote runs g13w2-before / g13w2-grid / g13w2-after, docs/audits/lanes/g13.md).
    .add(lights.hemisphere({ skyColor: "#ffe3b8", groundColor: "#2a3a32", intensity: 0.5 }))
    .add(lights.directional({ position: [8, 22, 12], target: [0, 0, 0], color: "#fff2dc", intensity: 1.25, shadow: true }))
    .camera(camera.perspective({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }));

  // IMPORTANT: In Aura3D's instanced shader, v_instanceColor multiplies u_baseColor (color), NOT u_emissiveColor!
  // Never set emissive: "#ffffff" on instanced pools, or every instance emits pure white regardless of instance color.
  const wallMat = wallMaterial(REFERENCE_LOOK.wallEmissive);
  const railMat = material.pbr({ color: "#ffffff", emissive: "#ffb23e", emissiveIntensity: 0.48, roughness: 0.28, metalness: 0.1 });
  const dotMat = material.pbr({ color: "#ffffff", emissive: "#2fd6e6", emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.25 });
  const orbMat = material.pbr({ color: "#ffffff", emissive: "#ffb23e", emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3 });
  const markerMat = material.pbr({ color: "#ffffff", roughness: 0.4, metalness: 0.05 });
  const eyesMat = material.pbr({ color: "#ffffff", roughness: 0.25, metalness: 0.05 });
  const dressMat = material.pbr({ color: "#ffffff", emissive: "#2a1a10", emissiveIntensity: 0.32, roughness: 0.5, metalness: 0.18 });
  const glowMat = material.pbr({ color: "#ffffff", emissive: "#ffb23e", emissiveIntensity: 0.38, roughness: 0.35 });

  // Courier: a bright cyan-white core inside a faceted shell and a spinning amber ring.
  const coreMat = material.emissive({ color: "#bffcff", emissive: "#6ff2ff", emissiveIntensity: 1.6 });
  const shellMat = material.pbr({ color: "#ffffff", emissive: "#2fb8c8", emissiveIntensity: 0.55, roughness: 0.18, metalness: 0.4, opacity: 0.72 });
  const haloMat = material.pbr({ color: "#ffffff", emissive: "#ffb23e", emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3 });
  // Sentries: one distinct silhouette each; per-instance colour carries identity and the surge state.
  const sentryMat = material.pbr({ color: "#ffffff", emissive: "#2a2a2a", emissiveIntensity: 0.32, roughness: 0.32, metalness: 0.35 });
  const gemMat = material.pbr({ color: "#ffffff", emissive: "#555555", emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.45 });

  s.addMany([
    // ground slab — graphite circuit board with a low-gloss sheen so the key
    // light rakes across it instead of reading as flat navy.
    primitives.box({ name: "board", size: [46.0, 0.32, 36.0], material: boardMaterial(REFERENCE_LOOK.slab, REFERENCE_LOOK.slabEmissive) })
      .position(0, -0.18, 0)
      .runtime(game.runtimeNode("board")),
    // instanced pools
    instances.box({ name: "walls", size: [1, 1, 1], material: wallMat, transforms: pad(CAP.wall), castShadow: true, receiveShadow: true }).runtime(game.runtimeNode("pool-wall")),
    instances.box({ name: "rails", size: [1, 1, 1], material: railMat, transforms: pad(CAP.rail), castShadow: false }).runtime(game.runtimeNode("pool-rail")),
    instances.box({ name: "shards", size: [1, 1, 1], material: dotMat, transforms: pad(CAP.dot), castShadow: false }).runtime(game.runtimeNode("pool-dot")),
    instances.cylinder({ name: "cells", size: [1, 1, 1], material: orbMat, transforms: pad(CAP.orb), castShadow: false }).runtime(game.runtimeNode("pool-orb")),
    instances.box({ name: "markers", size: [1, 1, 1], material: markerMat, transforms: pad(CAP.marker), castShadow: false }).runtime(game.runtimeNode("pool-marker")),
    instances.sphere({ name: "eyes", size: [1, 1, 1], material: eyesMat, transforms: pad(CAP.eyes), castShadow: false }).runtime(game.runtimeNode("pool-eyes")),
    instances.box({ name: "dress", size: [1, 1, 1], material: dressMat, transforms: pad(CAP.dress), castShadow: true }).runtime(game.runtimeNode("pool-dress")),
    instances.box({ name: "glow", size: [1, 1, 1], material: glowMat, transforms: pad(CAP.glow), castShadow: false }).runtime(game.runtimeNode("pool-glow")),
    instances.polyhedron({ name: "courier-shell", params: { variant: "octahedron" }, size: [1, 1, 1], material: shellMat, transforms: pad(CAP.hero), castShadow: true }).runtime(game.runtimeNode("pool-hero")),
    instances.torus({ name: "courier-halo", size: [1, 1, 1], material: haloMat, transforms: pad(CAP.halo), castShadow: false }).runtime(game.runtimeNode("pool-halo")),
    instances.cone({ name: "sentry-hunter", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shC), castShadow: true }).runtime(game.runtimeNode("pool-shC")),
    instances.box({ name: "sentry-ambusher", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shB), castShadow: true }).runtime(game.runtimeNode("pool-shB")),
    instances.torus({ name: "sentry-drifter", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shT), castShadow: true }).runtime(game.runtimeNode("pool-shT")),
    instances.cylinder({ name: "sentry-skittish", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shY), castShadow: true }).runtime(game.runtimeNode("pool-shY")),
    instances.polyhedron({ name: "gems", params: { variant: "icosahedron" }, size: [1, 1, 1], material: gemMat, transforms: pad(CAP.trophy), castShadow: true }).runtime(game.runtimeNode("pool-trophy")),

    // courier core: a small bright sphere (also the trail anchor); shell, halo, sentries and gems are instanced pools above
    primitives.sphere({ name: "byte", size: [0.34, 0.34, 0.34], material: coreMat, castShadow: false })
      .position(wx(st.maze.spawn.x), 0.36, wz(st.maze.spawn.y))
      .runtime(game.runtimeNode("byte")),
    primitives.sphere({ name: "byte-echo", size: [0.34, 0.34, 0.34], material: coreMat, castShadow: false })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("byte-echo")),

    // ghost house door slab + school beacon
    primitives.box({ name: "door", size: [1.02, 0.5, 0.12], material: material.pbr({ color: "#ffd9a0", emissive: "#ffb23e", emissiveIntensity: 0.65, roughness: 0.4, opacity: 0.78 }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("door")),
    primitives.cylinder({ name: "school-beam", size: [0.35, 3.2, 0.35], material: material.pbr({ color: "#ffb23e", emissive: "#ffb23e", emissiveIntensity: 0.65, roughness: 0.4, opacity: 0.45 }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("school-beam"))
  ]);

  // ------------------------------------------------------------ deck rim
  // The fixed chase camera looks steeply down, so anything raised behind the
  // board falls outside the frustum. Frame the playfield with lit rim strips at
  // deck level instead: they are always visible and cost four boxes.
  const deckEdgeMat = material.emissive({ color: "#0b2a2d", emissive: "#5ff3ff", emissiveIntensity: 1.05 });
  const deckEdgePinkMat = material.emissive({ color: "#2a1a08", emissive: "#ffb23e", emissiveIntensity: 0.95 });
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
  const wallColor = P.wall;
  const edgeColor = P.edge;
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
    inst("dress", wx(hx), 0.0, wz(hy), 0.96, 0.02, 0.96, "#2a2a22");
  }
  try {
    app?.nodes?.require("door").setPosition(wx(d.x), 0.28, wz(d.y) + 0.46);
  } catch { /* boot race */ }
}

const PEDESTALS: readonly (readonly [number, number])[] = [
  [-10.8, 9.2], [10.8, 9.2],
  [-10.8, 6.0], [10.8, 6.0],
  [-10.8, 1.5], [10.8, 1.5],
  [-10.8, -3.5], [10.8, -3.5],
  [-10.8, -8.5], [10.8, -8.5]
];

/** Perimeter dressing per board theme — pedestals under spinning gems, plus pylon stubs. */
function paintDressing(m: ParsedMaze): void {
  const P = m.def.palette;
  const wallColor = P.wall;
  const accentColor = P.accent;
  PEDESTALS.forEach(([px, pz]) => {
    inst("dress", px, 0.22, pz, 1.25, 0.44, 1.25, wallColor);
    inst("glow", px, 0.45, pz, 1.05, 0.06, 1.05, accentColor);
  });
  // pylon stubs: layout seeded from the board id, height and count from its theme
  for (const py of pylonLayout(m.def.id, m.def.theme)) {
    inst("dress", py.x, py.h * 0.5, py.z, py.w, py.h, py.w, wallColor);
    if (py.cap) inst("glow", py.x, py.h + 0.06, py.z, py.w * 0.76, 0.1, py.w * 0.76, accentColor);
  }
}

/** Spinning trophy gems on the pedestals (dynamic: they bob and turn). */
function paintTrophies(): void {
  PEDESTALS.forEach(([px, pz], i) => {
    inst("trophy", px, 1.05 + Math.sin(st.time * 2 + i) * 0.06, pz, 0.78, 0.78, 0.78, TROPHY_COLORS[i % TROPHY_COLORS.length]!, st.time * 1.1 + i);
  });
}


// ---------------------------------------------------------------------------
// Per-frame visual sync
// ---------------------------------------------------------------------------
export function syncVisuals(_dt: number): void {
  if (!app) return;
  const nodes = app.nodes;
  const m = st.maze;
  if (builtFor !== m.def.id) {
    // board change: repaint the static pools and apply this board's palette (slab, wall glow, background)
    for (const k of STATIC_POOLS) POOL[k].n = 0;
    paintMaze(m);
    paintDressing(m);
    if (submit(STATIC_POOLS) && applyBoardLook(m.def.id as MazeId)) builtFor = m.def.id as MazeId;
  }
  for (const k of DYNAMIC_POOLS) POOL[k].n = 0;
  paintTrophies();

  // dots & power orbs
  const pulse = 0.5 + 0.5 * Math.sin(st.time * 6);
  const dotColor = m.def.palette.dot;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      // data shards are flat chips that slowly turn; surge cells are upright battery cylinders
      if (st.dots[i]) inst("dot", wx(x), 0.2, wz(y), 0.3, 0.07, 0.2, dotColor, st.time * 1.6 + x * 0.7 + y * 0.3);
      if (st.orbs[i]) {
        const s = 0.34 + pulse * 0.08;
        const orbCol = pulse > 0.5 ? "#ffb23e" : "#fff1c9";
        inst("orb", wx(x), 0.34 + pulse * 0.05, wz(y), s, 0.5 + pulse * 0.08, s, orbCol, st.time * 1.2);
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
    const bob = 0.45 + Math.sin(st.time * 9 + g.px) * 0.05;
    inst("eyes", wx(gp.x), bob, wz(gp.y), 0.2, 0.2, 0.2, CORE_COLOR);
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
    byte.setRotation(dead ? 0 : pitch, yawOf(st.player.dir) + Math.PI, dead && !calmMotion ? Math.sin(st.time * 20) * 0.5 : 0);
    if (dead) {
      byte.setScale(Math.max(0.05, (st.deathT / 1.6) * 0.76)); // a steady shrink; the flicker below is skipped when calm
    } else if (st.player.dashT > 0) {
      const ds = 0.82 + Math.sin(st.time * 40) * 0.05;
      byte.setScale([ds * 1.06, ds * 0.94, ds * 1.06]);
    } else if (moving) {
      byte.setScale([0.76 * (1 + chomp * 0.08), 0.76 * (1 - chomp * 0.06), 0.76 * (1 + chomp * 0.08)]);
    } else {
      byte.setScale(0.76);
    }
    const flickerOn = !dead || calmMotion || calmFlash || Math.sin(st.time * 24) > -0.2;
    byte.setVisible(flickerOn);
    // wrap echo copy
    const ex = echoOffset(m, pp.x, pp.y);
    const echo = nodes.require("byte-echo");
    if (ex) {
      echo.setVisible(!dead);
      echo.setPosition(wx(ex.x), 0.36 + bob, wz(ex.y));
      echo.setRotation(dead ? 0 : pitch, yawOf(st.player.dir) + Math.PI, 0);
      echo.setScale(0.76);
    } else echo.setVisible(false);

    // courier shell (faceted) and halo ring ride on the core node's position
    {
      const hpos = [wx(pp.x), 0.4 + (dead ? 0 : bob), wz(pp.y)] as const;
      const shell = dead ? Math.max(0.05, (st.deathT / 1.6) * 0.62) : st.player.dashT > 0 ? 0.72 : 0.6;
      if (flickerOn) {
        inst("hero", hpos[0], hpos[1], hpos[2], shell, shell * 1.15, shell, st.profile.orbColor, st.time * (st.player.dashT > 0 ? 7 : 2.4));
        inst("halo", hpos[0], hpos[1], hpos[2], shell * 1.35, shell * 1.35, shell * 1.35, "#ffb23e", yawOf(st.player.dir) + st.time * 3.2);
        if (ex) {
          inst("hero", wx(ex.x), 0.4 + bob, wz(ex.y), shell, shell * 1.15, shell, st.profile.orbColor, st.time * 2.4);
          inst("halo", wx(ex.x), 0.4 + bob, wz(ex.y), shell * 1.35, shell * 1.35, shell * 1.35, "#ffb23e", yawOf(st.player.dir) + st.time * 3.2);
        }
      }
    }

    // sentries — one silhouette each (cone, cube, ring, saucer); colour carries identity and the surge state
    for (const g of st.ghosts) {
      const gp = normGhostPos(g);
      const wob = Math.sin(st.time * 7 + g.px) * 0.04;
      const frightened = st.fright > 0 && g.state === "active";
      // surge ending: a white strobe, or a slow 1 Hz pulse between slate and white when motion/flash is reduced
      const ending = frightened && st.fright < 1.8;
      const flash = ending && !calmFlash && Math.sin(st.time * 18) > 0;
      const col = !frightened ? GHOST_TINT[g.id] : flash ? OVERLOAD_FLASH : ending && calmFlash ? mixHex(OVERLOAD_COLOR, OVERLOAD_FLASH, 0.5 + 0.5 * Math.sin(st.time * Math.PI * 2)) : OVERLOAD_COLOR;
      const hidden = g.state === "eyes" || g.state === "entering";
      if (hidden) continue;
      const k = frightened ? 0.82 + (calmMotion ? 0 : Math.sin(st.time * 14) * 0.05) : g.state === "house" ? 0.86 : 0.94;
      const yaw = yawOf(g.dir);
      const place = (x: number, z: number): void => {
        const y = 0.42 + wob;
        switch (g.id) {
          case "blitz": inst("shC", x, y + 0.08, z, 0.62 * k, 0.9 * k, 0.62 * k, col, yaw); break;
          case "sly": inst("shB", x, y, z, 0.56 * k, 0.56 * k, 0.56 * k, col, st.time * 2.2); break;
          case "flick": inst("shT", x, y, z, 0.78 * k, 0.78 * k, 0.78 * k, col, st.time * 3.1); break;
          case "dim": inst("shY", x, y - 0.06, z, 0.8 * k, 0.26 * k, 0.8 * k, col, st.time * 1.4); break;
        }
      };
      place(wx(gp.x), wz(gp.y));
      const gx = echoOffset(m, gp.x, gp.y);
      if (gx) place(wx(gx.x), wz(gx.y));
    }

    // cache gem (bonus) — an icosahedron in the kind's colour
    if (st.fruitActive) {
      const kind = m.def.fruit;
      inst("trophy", wx(m.fruitTile.x), 0.4 + Math.sin(st.time * 4) * 0.06, wz(m.fruitTile.y), 0.52, 0.52, 0.52, GEM_COLOR[kind], st.time * 1.6);
    }

    // school beacon over the active sentry of interest (first active ghost)
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
  // Aspect fit (DD-3): the rig pulls back along its own view direction until the whole board is in frame, so a
  // portrait phone sees all 19 columns instead of the middle 9. Desktop stays within a few percent of the old rig.
  const aspect = viewAspect();
  if (Math.abs(aspect - fitAspect) > 1e-3) {
    fitAspect = aspect;
    fitK = fitDistanceScale({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }, aspect);
  }
  const rig = scalePose({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }, fitK);
  const pp2 = normPos(m);
  if (st.camera === "overhead") {
    lastPose = rig;
  } else {
    const bx = wx(pp2.x) * CAMERA_RIG.followX, bz = wz(pp2.y) * CAMERA_RIG.followZ;
    lastPose = {
      position: [bx, rig.position[1], rig.position[2] + bz],
      target: [bx * 0.75, 0, rig.target[2] + bz * 0.65],
      fov: CAMERA_RIG.fov
    };
  }
  app.camera?.setPose({ position: lastPose.position, target: lastPose.target, fov: lastPose.fov });
  app.output?.setOutputOverlay(
    st.mode === "dying" && !calmFlash ? { fade: [0.4, 0.02, 0.1, 0.45] }
    : st.fright > 0 && st.fright < 1.8 ? { vignette: [0.05, 0.05, 0.35, 0.5] }
    : {}
  );

  // submit the dynamic pools (the static ones went up once, on the board change)
  submit(DYNAMIC_POOLS);
}

/** Upload pools to their instanced nodes; false while the nodes are not mounted yet (boot race). */
function submit(keys: readonly (keyof typeof CAP)[]): boolean {
  const nodes = app?.nodes;
  if (!nodes) return false;
  let ok = true;
  for (const k of keys) {
    const p = POOL[k];
    try {
      (nodes.require(`pool-${k}`) as unknown as { setInstanceTransforms(m: Float32Array, n: number, c?: Float32Array): void })
        .setInstanceTransforms(p.mat, p.n, p.col);
    } catch { st.nodesOk = false; ok = false; }
  }
  return ok;
}

/** Per-board palette: slab and wall glow keep board 1's brightness in each board's own hue; the clear colour follows. */
function applyBoardLook(id: MazeId): boolean {
  const nodes = app?.nodes;
  if (!nodes) return false;
  const look = boardLook(MAZES[id]);
  if (look === appliedLook) return true; // board 1 on first boot: the authored materials already are this look
  try {
    nodes.require("board").setMaterial(boardMaterial(look.slab, look.slabEmissive));
    nodes.require("pool-wall").setMaterial(wallMaterial(look.wallEmissive));
  } catch { return false; }
  try { (app as unknown as { setClearColor?(c: string): void }).setClearColor?.(look.background); } catch { /* optional */ }
  appliedLook = look;
  return true;
}
let appliedLook: BoardLook = REFERENCE_LOOK;

function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${h(ca[0] + (cb[0] - ca[0]) * t)}${h(ca[1] + (cb[1] - ca[1]) * t)}${h(ca[2] + (cb[2] - ca[2]) * t)}`;
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

