// Dot Dash 3D — scene builder + per-frame visual sync.
// World units: 1 tile = 1 unit. Maze 19×21 centered at origin:
// worldX = tile.x - 9, worldZ = tile.y - 10.

import {
  game, looks, model, scene, camera, instances,
  primitives, material, type AuraApp
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import { idx, type ParsedMaze } from "./grid.js";
import { MAZES, type MazeId } from "./mazes.js";
import {
  GHOST_TINT, st, normPos, normGhostPos
} from "./sim.js";
import type { FruitKind } from "./grid.js";

export const TILE = 1;
export const OX = -9, OZ = -10; // world offset of tile(0,0)
export const wx = (x: number): number => x + OX;
export const wz = (y: number): number => y + OZ;

const FRIGHT_COLOR = "#2b3dff";
const FRIGHT_FLASH = "#e8ecff";
const EYES_COLOR = "#dbe9ff";

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
  POOL[k] = { mat: new Float32Array(CAP[k] * 16), col: new Float32Array(CAP[k] * 4), n: 0 };
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
  p.col[p.n * 4] = ((v >> 16) & 255) / 255;
  p.col[p.n * 4 + 1] = ((v >> 8) & 255) / 255;
  p.col[p.n * 4 + 2] = (v & 255) / 255;
  p.col[p.n * 4 + 3] = 1;
  p.n++;
}

const pad = (n: number) => Array.from({ length: n }, () => ({ position: [0, -999, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));

// ---------------------------------------------------------------------------
// Scene definition — one static graph; instanced pools get re-filled per frame.
// ---------------------------------------------------------------------------
export function buildScene(): unknown {
  const def = MAZES[st.mazeId];
  const s = scene()
    .add(looks.preset("neon-arcade", { fogDensityScale: 1.0, exposureEv: 0 }).runtime(game.runtimeNode("look")))
    .camera(camera.perspective({ position: [0, 14, 11], target: [0, 0, -2], fov: 52 }));

  const wallMat = material.pbr({ color: "#ffffff", roughness: 0.5, metalness: 0.25 });
  const railMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2.1, roughness: 0.35 });
  const dotMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.9, roughness: 0.4 });
  const orbMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 3.0, roughness: 0.3 });
  const markerMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.4, roughness: 0.5 });
  const eyesMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.5, roughness: 0.4 });
  const dressMat = material.pbr({ color: "#ffffff", roughness: 0.7, metalness: 0.1 });
  const glowMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.7, roughness: 0.4 });

  s.addMany([
    // ground slab
    primitives.box({ name: "board", size: [21.6, 0.3, 23.6], material: material.pbr({ color: def.palette.floor, roughness: 0.95, metalness: 0 }) })
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

    // actors — Byte + four specters + echo copies for wrap edges.
    // `?lite=1` drops the GLB set for remote capture bisection.
    ...(new URLSearchParams(globalThis.location?.search ?? "").has("lite") ? [] : [
    model(assets.byte, { name: "byte", targetHeight: 0.62, castShadow: true })
      .position(wx(st.maze.spawn.x), 0.34, wz(st.maze.spawn.y))
      .runtime(game.runtimeNode("byte")),
    model(assets.byte, { name: "byte-echo", targetHeight: 0.62, castShadow: false, visible: false })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("byte-echo")),
    model(assets.specterBlitz, { name: "ghost-blitz", targetHeight: 0.6, castShadow: true }).position(0, -999, 0).runtime(game.runtimeNode("ghost-blitz")),
    model(assets.specterSly, { name: "ghost-sly", targetHeight: 0.6, castShadow: true }).position(0, -999, 0).runtime(game.runtimeNode("ghost-sly")),
    model(assets.specterFlick, { name: "ghost-flick", targetHeight: 0.6, castShadow: true }).position(0, -999, 0).runtime(game.runtimeNode("ghost-flick")),
    model(assets.specterDim, { name: "ghost-dim", targetHeight: 0.6, castShadow: true }).position(0, -999, 0).runtime(game.runtimeNode("ghost-dim")),
    model(assets.specterBlitz, { name: "ghost-blitz-echo", targetHeight: 0.6, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("ghost-blitz-echo")),
    model(assets.specterSly, { name: "ghost-sly-echo", targetHeight: 0.6, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("ghost-sly-echo")),
    model(assets.specterFlick, { name: "ghost-flick-echo", targetHeight: 0.6, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("ghost-flick-echo")),
    model(assets.specterDim, { name: "ghost-dim-echo", targetHeight: 0.6, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("ghost-dim-echo")),

    // fruit — a model node per kind; visibility toggles
    model(assets.fruitCherry, { name: "fruit-cherry", targetHeight: 0.5, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("fruit-cherry")),
    model(assets.fruitStrawberry, { name: "fruit-strawberry", targetHeight: 0.5, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("fruit-strawberry")),
    model(assets.fruitOrange, { name: "fruit-orange", targetHeight: 0.5, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("fruit-orange")),
    model(assets.fruitApple, { name: "fruit-apple", targetHeight: 0.5, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("fruit-apple")),
    model(assets.fruitMelon, { name: "fruit-melon", targetHeight: 0.55, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("fruit-melon")),
    model(assets.fruitStar, { name: "fruit-star", targetHeight: 0.55, castShadow: false, visible: false }).position(0, -999, 0).runtime(game.runtimeNode("fruit-star"))
    ]),

    // ghost house door slab + school beacon
    primitives.box({ name: "door", size: [1.02, 0.5, 0.12], material: material.pbr({ color: "#ff9ed2", emissive: "#ff9ed2", emissiveIntensity: 1.6, roughness: 0.4, opacity: 0.75 }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("door")),
    primitives.cylinder({ name: "school-beam", size: [0.35, 3.2, 0.35], material: material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2.4, roughness: 0.4, opacity: 0.5 }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("school-beam"))
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
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      const X = wx(x), Z = wz(y);
      if (m.wall[i]) {
        inst("wall", X, 0.28, Z, 1.0, 0.56, 1.0, P.wall);
        // glowing top rail along each corridor-adjacent face
        for (const [dx, dy, ex, ez, sx, sz] of [
          [0, -1, 0, -0.485, 0.96, 0.045],
          [0, 1, 0, 0.485, 0.96, 0.045],
          [-1, 0, -0.485, 0, 0.045, 0.96],
          [1, 0, 0.485, 0, 0.045, 0.96]
        ] as const) {
          const ni = idx(m.width, x + dx, y + dy);
          if (x + dx >= 0 && y + dy >= 0 && x + dx < m.width && y + dy < m.height && !m.wall[ni]) {
            inst("rail", X + ex, 0.575, Z + ez, sx, 0.05, sz, P.edge);
          }
        }
      } else {
        // corridor floor: subtle inlay
        inst("glow", X, -0.015, Z, 0.98, 0.02, 0.98, P.floor);
      }
    }
  }
  // ghost-house door slab position + interior light pad
  const d = m.door;
  for (const i of m.houseTiles) {
    const hx = i % m.width, hy = (i / m.width) | 0;
    inst("glow", wx(hx), 0.0, wz(hy), 0.98, 0.02, 0.98, "#1a1030");
  }
  try {
    app?.nodes?.require("door").setPosition(wx(d.x), 0.26, wz(d.y) + 0.46);
  } catch { /* boot race */ }
}

/** Perimeter dressing per maze theme — cheap neon garden props. */
function paintDressing(m: ParsedMaze): void {
  const P = m.def.palette;
  const theme = m.def.theme;
  for (let c = 0; c < 30; c++) {
    const r1 = Math.abs(Math.sin(c * 37.3 + m.width)) % 1;
    const r2 = Math.abs(Math.sin(c * 91.7 + m.height)) % 1;
    const side = c % 2 === 0 ? -1 : 1;
    const edgeX = side * (11.6 + r1 * 5);
    const edgeZ = -10 + r2 * 20;
    const h = 0.7 + r1 * 2.6;
    if (theme === "garden") {
      inst("dress", edgeX, h * 0.32, edgeZ, 0.5, h * 0.66, 0.5, "#12321c");
      inst("glow", edgeX, h * 0.66 + 0.1, edgeZ, 0.34, 0.14, 0.34, P.accent);
    } else if (theme === "foundry" || theme === "reactor") {
      inst("dress", edgeX, h / 2, edgeZ, 0.55, h, 0.55, theme === "foundry" ? "#241204" : "#20062a");
      if (r2 < 0.6) inst("glow", edgeX, h + 0.08, edgeZ, 0.4, 0.16, 0.4, P.accent);
    } else if (theme === "towers") {
      inst("dress", edgeX, h * 0.8, edgeZ, 0.8, h * 1.6, 0.8, "#0a2032");
      inst("glow", edgeX, h * 1.6 + 0.06, edgeZ, 0.5, 0.1, 0.5, P.accent);
    } else {
      inst("dress", edgeX, h * 0.5, edgeZ, 0.4, h, 0.4, P.wall);
      if (r2 < 0.5) inst("glow", edgeX, h + 0.08, edgeZ, 0.26, 0.12, 0.26, P.accent);
    }
    const edgeZ2 = side * (12.8 + r2 * 4);
    const edgeX2 = -8 + r1 * 16;
    inst("dress", edgeX2, 0.35, edgeZ2, 0.5, 0.7, 0.5, P.wall);
  }
}

// ---------------------------------------------------------------------------
// Per-frame visual sync
// ---------------------------------------------------------------------------
export function syncVisuals(dt: number): void {
  if (!app) return;
  const nodes = app.nodes;
  const m = st.maze;
  if (builtFor !== m.def.id) {
    builtFor = m.def.id as MazeId;
    // pools get rebuilt below anyway; nothing else needed
  }
  for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) POOL[k].n = 0;
  paintMaze(m);
  paintDressing(m);

  // dots
  const pulse = 0.5 + 0.5 * Math.sin(st.time * 6);
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      if (st.dots[i]) inst("dot", wx(x), 0.22, wz(y), 0.13, 0.13, 0.13, m.def.palette.dot);
      if (st.orbs[i]) {
        const s = 0.26 + pulse * 0.1;
        inst("orb", wx(x), 0.32 + pulse * 0.07, wz(y), s, s, s, st.profile.orbColor);
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
    inst("eyes", wx(gp.x) - 0.1 + ox, 0.4, wz(gp.y) - 0.1 + oz, 0.13, 0.13, 0.13, EYES_COLOR);
    inst("eyes", wx(gp.x) + 0.1 - ox, 0.4, wz(gp.y) + 0.1 - oz, 0.13, 0.13, 0.13, EYES_COLOR);
    inst("eyes", wx(gp.x) - 0.1 + ox + g.dir.x * 0.05, 0.4, wz(gp.y) - 0.1 + oz + g.dir.z * 0.05, 0.05, 0.05, 0.05, "#2233cc");
    inst("eyes", wx(gp.x) + 0.1 - ox + g.dir.x * 0.05, 0.4, wz(gp.y) + 0.1 - oz + g.dir.z * 0.05, 0.05, 0.05, 0.05, "#2233cc");
  }

  // ---- actors
  try {
    const pp = normPos(m);
    const bob = Math.sin(st.time * 9) * 0.05;
    const dead = st.mode === "dying";
    const byte = nodes.require("byte");
    byte.setPosition(wx(pp.x), 0.34 + (dead ? 0 : bob), wz(pp.y));
    byte.setRotation(0, yawOf(st.player.dir) + Math.PI, dead ? Math.sin(st.time * 20) * 0.5 : 0);
    byte.setScale(st.player.dashT > 0 ? 1.0 + Math.sin(st.time * 40) * 0.06 : dead ? Math.max(0.05, st.deathT / 1.6) : 1.0);
    byte.setVisible(!dead || Math.sin(st.time * 24) > -0.2);
    // wrap echo copy
    const ex = echoOffset(m, pp.x, pp.y);
    const echo = nodes.require("byte-echo");
    if (ex) {
      echo.setVisible(!dead);
      echo.setPosition(wx(ex.x), 0.34 + bob, wz(ex.y));
      echo.setRotation(0, yawOf(st.player.dir) + Math.PI, 0);
    } else echo.setVisible(false);

    // specters
    for (const g of st.ghosts) {
      const h = nodes.require(`ghost-${g.id}`);
      const gp = normGhostPos(g);
      const wob = Math.sin(st.time * 7 + g.px) * 0.045;
      h.setPosition(wx(gp.x), 0.32 + wob, wz(gp.y));
      const frightened = st.fright > 0 && g.state === "active";
      const yaw = yawOf(g.dir);
      h.setRotation(frightened ? Math.sin(st.time * 10) * 0.3 : 0, yaw + Math.PI, frightened ? Math.sin(st.time * 13) * 0.2 : 0);
      const hidden = g.state === "eyes" || g.state === "entering";
      h.setVisible(!hidden);
      h.setScale(g.state === "house" ? 0.9 : 1.0);
      if (frightened) {
        const flash = st.fright < 1.8 && Math.sin(st.time * 14) > 0;
        setNodeMaterial(h, flash ? "fright-flash" : "fright");
      } else if (g.state === "house" && st.fright > 0) {
        setNodeMaterial(h, "fright");
      } else {
        setNodeMaterial(h, `ghost-${g.id}`);
      }
      // wrap echoes for ghosts
      const gx = echoOffset(m, gp.x, gp.y);
      const ge = nodes.get(`ghost-${g.id}-echo`);
      if (ge) {
        if (gx && !hidden) {
          ge.setVisible(true);
          ge.setPosition(wx(gx.x), 0.32 + wob, wz(gx.y));
          ge.setRotation(0, yawOf(g.dir) + Math.PI, 0);
        } else ge.setVisible(false);
      }
    }

    // fruit
    for (const kind of Object.keys(FRUIT_ASSET)) {
      const node = nodes.get(`fruit-${kind}`);
      if (!node) continue;
      if (st.fruitActive && m.def.fruit === kind) {
        node.setVisible(true);
        node.setPosition(wx(m.fruitTile.x), 0.3 + Math.sin(st.time * 4) * 0.08, wz(m.fruitTile.y));
        node.setRotation(0, st.time * 1.6, 0);
      } else node.setVisible(false);
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

  // camera
  const pp2 = normPos(m);
  if (st.camera === "overhead") {
    app.camera?.setPose({ position: [0, 24.5, 5.5], target: [0, 0, -0.8], fov: 46 });
  } else {
    const d = st.player.dir;
    const bx = wx(pp2.x) - d.x * 4.4, bz = wz(pp2.y) - d.z * 4.4;
    app.camera?.setPose({
      position: [bx * 0.9, 8.6, bz + 3.4],
      target: [wx(pp2.x) + d.x * 2.4, 0.35, wz(pp2.y) + d.z * 2.4],
      fov: 54
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

// material cache + swap
const MAT = new Map<string, unknown>();
function setNodeMaterial(h: unknown, key: string): void {
  try {
    let spec = MAT.get(key);
    if (!spec) {
      spec = key === "fright"
        ? material.pbr({ color: FRIGHT_COLOR, emissive: FRIGHT_COLOR, emissiveIntensity: 1.3, roughness: 0.5 })
        : key === "fright-flash"
          ? material.pbr({ color: FRIGHT_FLASH, emissive: FRIGHT_FLASH, emissiveIntensity: 2.2, roughness: 0.4 })
          : material.pbr({ color: GHOST_TINT[key.replace("ghost-", "") as keyof typeof GHOST_TINT] ?? "#ffffff", emissive: GHOST_TINT[key.replace("ghost-", "") as keyof typeof GHOST_TINT] ?? "#ffffff", emissiveIntensity: 0.5, roughness: 0.55 });
      MAT.set(key, spec);
    }
    (h as { setMaterial(s: unknown): void }).setMaterial(spec);
  } catch { /* model handle may not support setMaterial — tint via scale only */ }
}
