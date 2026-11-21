// Glint Courier — scene builder + per-frame visual sync.
// World units: 1 tile = 1 unit. Maze 19×21 centered at origin:
// worldX = tile.x - 9, worldZ = tile.y - 10.
//
// Arcade-readability pass (owner review 2026-11-18, "make them like pacman type"): the classic maze-chase cabinet
// look with original characters. A near-top-down camera frames the whole maze; walls are thin neon outlines on a
// near-black floor; the gold courier orb-bot is the brightest thing on screen; the four sentries are flat spinning
// star drones in solid red / magenta / cyan / orange with big white eyes that look where they move; pellets are small
// warm-white beads and power cells larger pulsing beads. Nothing outside the maze competes (no bench, lamp, pylons,
// gem caches, PCB texture or lens clutter). The sim and its rules are untouched; this file only draws.

import {
  game, lights, effects, scene, camera, environments, defineAuraAssets, primitives, material, type AuraApp
} from "@aura3d/engine";
import { createFlipbookAtlas, createGradingLut, createSnapshotInterpolator, type SnapshotInterpolator } from "@aura3d/engine/game";
import { BONUS_RELIC_KINDS, buildBonusArcadeRelicNode } from "../art/proceduralModels.js";
import { ARCADE_CAPS, COURIER_FRAME, buildArcadePoolNodes, neonSegments, type ArcadePoolKey } from "../art/arcadeActors.js";
import { idx, type ParsedMaze } from "./grid.js";
import type { MazeId } from "./mazes.js";
import { GHOST_TINT, st, normPos, normGhostPos, type GhostId } from "./sim.js";
import { DEATH_TIME } from "./sim.js";
import { fitArcadeRig, fitPlayRig, projectNdc, type CameraPose } from "./camera.js";
import { hexToRgb } from "./palette.js";
import { ARCADE, FRAME_PULL_BACK, LOOK_HDRI } from "./look.js";
import { REDUCED_AMPLITUDE, stepCourierPose, type CourierPose } from "./motion.js";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";
import { dualEnergyFieldSpec } from "./shaders.js";

/** Procedural cyber-neon grading LUT (vfx-pack): reported in the evidence payload. */
export const CYBER_NEON_LUT = createGradingLut("cyber-neon");
const SPARKS_ATLAS = createFlipbookAtlas("sparks", [255, 214, 118]);

/** The workshop HDRI (CC0, Poly Haven, public/hdri/ATTRIBUTION.md): a low IBL fill for the relic models, never drawn. */
const lookAssets = defineAuraAssets({
  workshopHdr: {
    type: "texture",
    format: "hdr",
    url: LOOK_HDRI.url,
    hash: "sha256-3a7dd0110ad011289abae4f4637aa0a0e58abcbd8a3fe1f5f3ba664276dbb351",
    metadata: { license: "CC0-1.0", sourcePath: "public/hdri/indoor-workshop_1k.hdr" }
  }
});

export const TILE = 1;
export const OX = -9, OZ = -10; // world offset of tile(0,0)
export const wx = (x: number): number => x + OX;
export const wz = (y: number): number => y + OZ;

// ---------------------------------------------------------------------------
// Actor sizes (tiles). The neon lines sit NEON.inset inside the wall tiles, so a corridor reads 1.5 tiles wide
// between its lines; the courier (fins) is ~77% of that, the sentries ~73%.
// ---------------------------------------------------------------------------
export const ACTOR = {
  /** Courier dome diameter (its side fins reach 1.15 tiles across, the nose notch ~0.1 forward). */
  courier: 1.0,
  /** Sentry star tip-to-tip diameter and shell height. */
  sentry: 1.1,
  sentryHeight: 0.36,
  /** Soft glow disc under each actor (diameter). */
  courierGlow: 1.35,
  sentryGlow: 1.55,
  /** Big eyes: each white is this fraction of the sentry diameter, pupils half of that. */
  eye: 0.3,
  pupil: 0.5
} as const;
/** Pellets and power cells (diameter, tiles). */
export const PELLET_SIZE = 0.2;
export const CELL_SIZE = 0.46;
/** Sentry star spin (rad/s): the moving part that keeps every drone alive on screen. */
export const SENTRY_SPIN: Record<GhostId, number> = { blitz: 3.4, sly: -1.8, flick: 2.4, dim: -2.8 };
const SENTRY_POOL: Record<GhostId, ArcadePoolKey> = { blitz: "sentryBlitz", sly: "sentrySly", flick: "sentryFlick", dim: "sentryDim" };
/** Courier frame scale: the dome (2 x COURIER_FRAME.bodyRadius local units) is ACTOR.courier tiles wide. */
export const COURIER_SCALE = ACTOR.courier / (2 * COURIER_FRAME.bodyRadius);

/** Sentry body sentry-arcade colours (sim GHOST_TINT; HUD and markers use the same). */
export const SENTRY_ARCADE: Readonly<Record<GhostId, string>> = GHOST_TINT;

/** Tilted 3/4 "Tilt Cam" (V): the pre-arcade rig, following the courier. The default is the arcade top-down rig. */
export const CAMERA_RIG = {
  position: [0, 17.2, 13.8] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  fov: 48
} as const;

let app: AuraApp | null = null;
export function bindApp(a: AuraApp): void { app = a; }

/** Reduced motion / reduced flash (session settings or the OS preference). */
let calmMotion = false;
let calmFlash = false;
export function setMotionPrefs(p: { reducedMotion: boolean; reducedFlash: boolean }): void {
  calmMotion = p.reducedMotion;
  calmFlash = p.reducedFlash || p.reducedMotion;
}

/** Tilt Cam: the fitted 3/4 rig pulled in to FOLLOW_ZOOM around a smoothed courier focus. */
export const FOLLOW_ZOOM = 0.62;
export const FOLLOW_ZOOM_PORTRAIT = 0.42;
const followFocus = { x: 0, z: 0, init: false };
export function followCameraPose(rig: CameraPose, pp: { x: number; y: number }, aspect: number, dt: number): CameraPose {
  const portrait = aspect < 0.82;
  const zoom = portrait ? FOLLOW_ZOOM_PORTRAIT : FOLLOW_ZOOM;
  const lim = portrait ? [6.4, 6.6] : [5.2, 3.6];
  const tx = Math.max(-lim[0]!, Math.min(lim[0]!, wx(pp.x))), tz = Math.max(-lim[1]!, Math.min(lim[1]!, wz(pp.y)));
  if (!followFocus.init || dt <= 0) { followFocus.x = tx; followFocus.z = tz; followFocus.init = true; }
  else { const a = 1 - Math.exp(-dt * 4); followFocus.x += (tx - followFocus.x) * a; followFocus.z += (tz - followFocus.z) * a; }
  const off = [rig.position[0] - rig.target[0], rig.position[1] - rig.target[1], rig.position[2] - rig.target[2]];
  const target: [number, number, number] = [rig.target[0] + followFocus.x, rig.target[1], rig.target[2] + followFocus.z];
  return { position: [target[0] + off[0]! * zoom, target[1] + off[1]! * zoom, target[2] + off[2]! * zoom], target, fov: rig.fov };
}

/** The default camera pose for an aspect (the arcade top-down rig). */
export function defaultCameraPose(aspect: number): CameraPose { return fitArcadeRig(aspect); }

/** Last camera pose the game set and the aspect it was fitted for (QA hook + score pop-up projection). */
let lastPose: CameraPose = fitArcadeRig(16 / 9);
let fitAspect = 0;
export function cameraPose(): CameraPose & { readonly aspect: number; readonly pullBack: number } {
  return { ...lastPose, aspect: fitAspect, pullBack: 1 };
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
// Instanced pools (arcadeActors.ts): every geometry is unit-bounded, so instances are sized with scale factors.
// ---------------------------------------------------------------------------
const CAP = ARCADE_CAPS;
type Pool = { mat: Float32Array; col: Float32Array; n: number };
const POOL = {} as Record<ArcadePoolKey, Pool>;
for (const k of Object.keys(CAP) as ArcadePoolKey[]) {
  // Aura3D setInstanceTransforms takes 3 floats (RGB) per instance.
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

function inst(k: ArcadePoolKey, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, ry = 0, gain = 1): void {
  const rgb = hexToRgb(color);
  instRgb(k, x, y, z, sx, sy, sz, rgb[0] * gain, rgb[1] * gain, rgb[2] * gain, ry);
}

function instRgb(k: ArcadePoolKey, x: number, y: number, z: number, sx: number, sy: number, sz: number, r: number, g: number, b: number, ry = 0): void {
  const p = POOL[k];
  if (p.n >= CAP[k]) return;
  writeMat(p.mat, p.n, x, y, z, sx, sy, sz, ry);
  p.col[p.n * 3] = r;
  p.col[p.n * 3 + 1] = g;
  p.col[p.n * 3 + 2] = b;
  p.n++;
}

/** Pools that only change with the board (painted once per board; the neon is re-tinted for the clear flash). */
const STATIC_POOLS = ["neon"] as const satisfies readonly ArcadePoolKey[];
const DYNAMIC_POOLS = (Object.keys(CAP) as ArcadePoolKey[]).filter((k) => !(STATIC_POOLS as readonly string[]).includes(k));

const pad = (n: number) => Array.from({ length: n }, () => ({ position: [0, -999, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));

// ---------------------------------------------------------------------------
// Scene definition — one static graph; instanced pools get re-filled per frame.
// ---------------------------------------------------------------------------
const SPARK_POOL_SIZE = 6;

export function buildScene(): unknown {
  const pose = fitArcadeRig(16 / 9);
  const s = scene()
    // Neon bloom on what glows (walls, pellets, actors); FXAA for the thin outlines. No vignette, grain, fringing,
    // fog, depth of field or grade: the floor stays black and the colours stay saturated.
    .add(effects.cinematicBloom({ name: "neon bloom", intensity: ARCADE.bloom.intensity, threshold: ARCADE.bloom.threshold, radius: ARCADE.bloom.radius }))
    .add(effects.antiAlias({ mode: "fxaa" }))
    // Low IBL fill (never drawn) so the relic models keep their shape; one overhead key casts the only shadows.
    .add(environments.hdri({ name: "arcade ibl", texture: lookAssets.workshopHdr, intensity: ARCADE.ibl, rotation: 0, background: false })
      .runtime(game.runtimeNode("workshop-ibl")))
    .add(lights.directional({
      name: "arcade key",
      position: [...ARCADE.key.position],
      target: [0, 0, 0],
      color: ARCADE.key.color,
      intensity: ARCADE.key.intensity,
      shadow: { softness: ARCADE.key.shadowSoftness }
    }))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: pose.position as [number, number, number], target: pose.target as [number, number, number], fov: pose.fov }));

  const doorMat = material.custom(dualEnergyFieldSpec({ coreColor: [1.0, 0.45, 0.78], edgeColor: [1.0, 0.85, 0.95], pulseSpeed: 3.4, scanScale: 15.0, opacity: 0.85 }));
  const portalMat = material.custom(dualEnergyFieldSpec({ coreColor: [0.2, 0.42, 1.0], edgeColor: [0.7, 0.85, 1.0], pulseSpeed: 3.2, scanScale: 12.0, opacity: 0.5 }));
  const beamMat = material.custom(dualEnergyFieldSpec({ coreColor: [1.0, 0.68, 0.22], edgeColor: [1.0, 0.94, 0.64], pulseSpeed: 4.0, scanScale: 10.0, opacity: 0.5 }));

  s.addMany([
    // no floor mesh: the maze sits on the near-black cabinet clear colour (a lit floor read as a grey slab on the GPU)
    ...buildArcadePoolNodes(pad),
    // bonus relics (the board's fruit), one node per kind, parked until active
    ...BONUS_RELIC_KINDS.map((kind) => buildBonusArcadeRelicNode(kind)),
    // sentry-house door: a pink energy bar across the door tile
    primitives.box({ name: "door", size: [1.02, 0.12, 0.14], material: doorMat, castShadow: false })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("door")),
    primitives.cylinder({ name: "school-beam", size: [0.34, 3.2, 0.34], material: beamMat, castShadow: false })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("school-beam")),
    ...Array.from({ length: 4 }, (_, i) =>
      primitives.box({ name: `wrap-portal-${i}`, size: [0.12, 0.3, 0.96], material: portalMat, castShadow: false })
        .position(0, -999, 0)
        .runtime(game.runtimeNode(`portal-${i}`))
    ),
    ...Array.from({ length: SPARK_POOL_SIZE }, (_, i) =>
      effects.flipbook({
        name: `spark-burst-${i}`,
        texture: SPARKS_ATLAS.texture,
        spriteColumns: SPARKS_ATLAS.columns,
        spriteRows: SPARKS_ATLAS.rows,
        frameRate: 30,
        size: 0.9,
        intensity: 1.35,
        color: "#ffd27a",
        blend: "additive",
        loop: true,
        position: [0, -999, 0]
      }).runtime(game.runtimeNode(`spark-burst-${i}`))
    )
  ]);
  return s.toJSON();
}

// ---------------------------------------------------------------------------
// Spark flipbook bursts (pickups, sentry disabled)
// ---------------------------------------------------------------------------
interface SparkBurstSlot {
  active: boolean; x: number; z: number; y: number; age: number; duration: number; scale: number;
  tint: readonly [number, number, number];
}
const sparkPool: SparkBurstSlot[] = Array.from({ length: SPARK_POOL_SIZE }, () => ({
  active: false, x: 0, z: 0, y: -999, age: 0, duration: 0.36, scale: 0.9, tint: [1, 0.85, 0.45]
}));
let sparkCursor = 0;

/** Spawns an 8x4 sprite-sheet spark flipbook burst (`createFlipbookAtlas("sparks")`) at tile `(tx, ty)`. */
export function spawnSparkBurst(tx: number, ty: number, hexColor = "#ffd27a", scale = 0.88): void {
  const slot = sparkPool[sparkCursor % SPARK_POOL_SIZE]!;
  sparkCursor++;
  slot.active = true;
  slot.x = wx(tx);
  slot.z = wz(ty);
  slot.y = 0.5;
  slot.age = 0;
  slot.duration = calmMotion ? 0.24 : 0.38;
  slot.scale = calmMotion ? scale * 0.72 : scale;
  slot.tint = hexToRgb(hexColor);
}

function syncSparkBursts(dt: number): void {
  const nodes = app?.nodes;
  if (!nodes) return;
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    const slot = sparkPool[i]!;
    const h = nodes.get(`spark-burst-${i}`) as (ReturnType<typeof nodes.get> & { setUniform?(n: string, v: unknown): void }) | undefined;
    if (!h) continue;
    if (!slot.active) { h.setVisible(false); continue; }
    slot.age += Math.max(0, dt);
    const t = slot.age / Math.max(0.05, slot.duration);
    if (t >= 1) {
      slot.active = false;
      h.setVisible(false);
      h.setPosition(0, -999, 0);
      continue;
    }
    h.setVisible(true);
    h.setPosition(slot.x, slot.y, slot.z);
    const s = slot.scale * (0.72 + 0.52 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5));
    const fade = calmFlash ? (1 - t) * 0.55 : 1 - t * t;
    h.setScale([s * Math.max(0.15, fade), s * Math.max(0.15, fade), s * Math.max(0.15, fade)]);
  }
}

// ---------------------------------------------------------------------------
// Maze → neon outline (refreshed on maze change), door and wrap portals
// ---------------------------------------------------------------------------
let builtFor: MazeId | "" = "";
let neonFlashOn = false;

function paintMaze(m: ParsedMaze, flash: boolean): void {
  POOL.neon.n = 0;
  const col = flash ? ARCADE.neonFlash : ARCADE.neon[m.def.id as MazeId] ?? ARCADE.neon.classic;
  for (const seg of neonSegments(m.width, m.height, (x, y) => m.wall[idx(m.width, x, y)] === true)) {
    inst("neon", wx(seg.x), 0.05, wz(seg.z), seg.sx, 0.1, seg.sz, col);
  }
}

function placeDoorAndPortals(m: ParsedMaze): void {
  try {
    const d = m.door;
    app?.nodes?.require("door").setPosition(wx(d.x), 0.06, wz(d.y));
    const portals: { pos: [number, number, number]; rotY: number }[] = [];
    if (m.def.wrapX) {
      for (let y = 0; y < m.height && portals.length < 4; y++) {
        if (!m.wall[idx(m.width, 0, y)] && !m.wall[idx(m.width, m.width - 1, y)]) {
          portals.push({ pos: [wx(-0.46), 0.15, wz(y)], rotY: 0 });
          portals.push({ pos: [wx(m.width - 0.54), 0.15, wz(y)], rotY: 0 });
        }
      }
    }
    if (m.def.wrapY) {
      for (let x = 0; x < m.width && portals.length < 4; x++) {
        if (!m.wall[idx(m.width, x, 0)] && !m.wall[idx(m.width, x, m.height - 1)]) {
          portals.push({ pos: [wx(x), 0.15, wz(-0.46)], rotY: Math.PI / 2 });
          portals.push({ pos: [wx(x), 0.15, wz(m.height - 0.54)], rotY: Math.PI / 2 });
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      const pNode = app?.nodes?.get(`portal-${i}`);
      const spec = portals[i];
      if (!pNode) continue;
      if (spec) {
        pNode.setVisible(true);
        pNode.setPosition(...spec.pos);
        pNode.setRotation(0, spec.rotY, 0);
      } else {
        pNode.setVisible(false);
        pNode.setPosition(0, -999, 0);
      }
    }
  } catch { /* boot race */ }
}

/** Normalised 0..1 screen box around a world point, `half` world units each side (crop capture). */
function cropAround(x: number, z: number, half: number, aspect: number): { x: number; y: number; w: number; h: number } | null {
  const a = projectNdc(lastPose, aspect, [x - half, 0.3, z - half]);
  const b = projectNdc(lastPose, aspect, [x + half, 0.3, z + half]);
  if (!a || !b) return null;
  const x0 = Math.max(0, Math.min(a[0], b[0]) * 0.5 + 0.5), x1 = Math.min(1, Math.max(a[0], b[0]) * 0.5 + 0.5);
  const y0 = Math.max(0, 0.5 - Math.max(a[1], b[1]) * 0.5), y1 = Math.min(1, 0.5 - Math.min(a[1], b[1]) * 0.5);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** QA crops (window.__AURA_QA__.crops, normalised): the courier's 3x3 tiles, an empty corridor and the board centre. */
function publishCrops(pp: { x: number; y: number }, aspect: number): void {
  if (typeof window === "undefined") return;
  const crops: { name: string; x: number; y: number; w: number; h: number }[] = [];
  const add = (name: string, c: { x: number; y: number; w: number; h: number } | null): void => { if (c) crops.push({ name, ...c }); };
  add("courier", cropAround(wx(pp.x), wz(pp.y), 1.5, aspect));
  const m = st.maze;
  let best = -1, bx = 0, by = 0;
  for (let i = 0; i < m.walkable.length; i++) {
    if (!m.walkable[i] || st.dots[i] || st.orbs[i]) continue;
    const tx = i % m.width, ty = (i / m.width) | 0;
    const d = Math.hypot(tx - pp.x, ty - pp.y);
    if (d > best) { best = d; bx = tx; by = ty; }
  }
  if (best >= 0) add("corridor", cropAround(wx(bx), wz(by), 0.5, aspect));
  add("board-centre", cropAround(0, 0, 2, aspect));
  const w = window as unknown as { __AURA_QA__?: Record<string, unknown> };
  w.__AURA_QA__ = { ...(w.__AURA_QA__ ?? {}), crops };
}

export interface ActorPoseSample { readonly x: number; readonly y: number }
export interface ActorBlendState {
  readonly mazeId: MazeId;
  readonly courier: ActorPoseSample;
  readonly ghosts: Readonly<Record<GhostId, ActorPoseSample>>;
}
export interface FrameFeel {
  readonly shakeOffset: readonly [number, number, number];
  readonly fovDeltaDeg: number;
}

export function snapshotActors(): ActorBlendState {
  const m = st.maze;
  const pp = normPos(m);
  const ghosts = {} as Record<GhostId, ActorPoseSample>;
  for (const g of st.ghosts) {
    const gp = normGhostPos(g);
    ghosts[g.id] = { x: gp.x, y: gp.y };
  }
  return { mazeId: st.mazeId, courier: { x: pp.x, y: pp.y }, ghosts };
}

export const WRAP_SNAP_DISTANCE = 2.4;

function lerpActor(a: ActorPoseSample | undefined, b: ActorPoseSample, t: number): ActorPoseSample {
  if (!a || Math.hypot(b.x - a.x, b.y - a.y) > WRAP_SNAP_DISTANCE) return b;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function blendActors(a: ActorBlendState, b: ActorBlendState, t: number): ActorBlendState {
  if (a.mazeId !== b.mazeId) return b;
  const ghosts = {} as Record<GhostId, ActorPoseSample>;
  for (const id of ["blitz", "sly", "flick", "dim"] as const) {
    const target = b.ghosts[id];
    if (target) ghosts[id] = lerpActor(a.ghosts[id], target, t);
  }
  return { mazeId: b.mazeId, courier: lerpActor(a.courier, b.courier, t), ghosts };
}

/** Fixed-step render interpolator on Aura3D 5.7.2 `createSnapshotInterpolator` (preserving wrap-tunnel snap `2.4`). */
export function createActorInterpolator(): SnapshotInterpolator<ActorBlendState> {
  return createSnapshotInterpolator<ActorBlendState>({
    snapshot: snapshotActors,
    blend: blendActors,
    snap: (prev, next) =>
      prev.mazeId !== next.mazeId ||
      Math.hypot(next.courier.x - prev.courier.x, next.courier.y - prev.courier.y) > WRAP_SNAP_DISTANCE
  });
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------
let courierPose: CourierPose = { yaw: Math.PI, roll: 0 };
/** Collect pulse (1 on a pickup, decays): the courier "gulps" (scale pulse) and its visor flashes white. */
let collectPulse = 0;
let lastCollected = -1;
/** Short courier trail: recent positions, newest first. */
const TRAIL_LEN = 6;
const trail: { x: number; z: number }[] = [];
let trailClock = 0;

/** Soft glow under an actor: a faint wide disc plus a brighter inner one (a cheap radial falloff). */
function glowDisc(x: number, z: number, d: number, color: string, gain: number, y = 0.012): void {
  inst("glow", x, y, z, d, 1, d, color, 0, gain * 0.5);
  inst("glow", x, y + 0.002, z, d * 0.62, 1, d * 0.62, color, 0, gain * 0.75);
}

/** Big white eyes with dark pupils looking along `yaw` (eaten sentries draw only these). */
function drawEyes(x: number, y: number, z: number, yaw: number, size: number, mode: "look" | "fright"): void {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  if (mode === "fright") {
    const e = size * ACTOR.eye * 0.5;
    for (const side of [-1, 1]) inst("eye", x + rx * size * 0.15 * side, y, z + rz * size * 0.15 * side, e, e * 0.5, e, ARCADE.frightenedEye);
    return;
  }
  const e = size * ACTOR.eye;
  const p = e * ACTOR.pupil;
  for (const side of [-1, 1]) {
    const ex = x + rx * size * 0.17 * side + fx * size * 0.05, ez = z + rz * size * 0.17 * side + fz * size * 0.05;
    inst("eye", ex, y, ez, e, e * 0.45, e, ARCADE.eyeWhite);
    inst("eye", ex + fx * (e - p) * 0.5, y + e * 0.16, ez + fz * (e - p) * 0.5, p, p * 0.5, p, ARCADE.pupil);
  }
}

/** Sentry body colour: its own colour, one dark blue while a surge runs, flashing white near the end. */
export function sentryColor(id: GhostId, fright: number, active: boolean, t: number, reducedFlash: boolean): string {
  if (!(fright > 0) || !active) return SENTRY_ARCADE[id];
  if (fright < 1.8) {
    if (reducedFlash) return mixHex(ARCADE.frightened, ARCADE.frightenedFlash, 0.5 + 0.5 * Math.sin(t * Math.PI * 2));
    return Math.sin(t * 18) > 0 ? ARCADE.frightenedFlash : ARCADE.frightened;
  }
  return ARCADE.frightened;
}

function syncActors(dt: number, blend: ActorBlendState | undefined, pp: { x: number; y: number }): void {
  const m = st.maze;
  const amp = calmMotion ? REDUCED_AMPLITUDE : 1;
  const dead = st.mode === "dying";
  const deathK = dead ? Math.max(0, st.deathT / DEATH_TIME) : 1;

  // --- courier: gold orb-bot, nose toward travel, gulp pulse on every pickup, soft halo + short trail
  if (st.dotsEaten !== lastCollected) {
    if (lastCollected >= 0 && st.dotsEaten > lastCollected) collectPulse = 1;
    lastCollected = st.dotsEaten;
  }
  collectPulse = Math.max(0, collectPulse - dt / 0.16);
  courierPose = stepCourierPose(courierPose, yawOf(st.player.dir) + Math.PI, dt, calmMotion);
  const yaw = courierPose.yaw - Math.PI;
  const moving = st.mode === "play" && (st.autopilot || st.hasMoved);
  const breathe = moving ? 0 : Math.sin(st.time * 3) * 0.03 * amp;
  const gulp = 1 + collectPulse * 0.16 * amp + breathe;
  // death: the courier spins down and shrinks to nothing while a red shock ring spreads from it
  const dashing = st.player.dashT > 0 && !dead;
  const dashStretch = dashing && !calmMotion ? 1.18 : 1;
  const dashSquash = dashing && !calmMotion ? 0.88 : 1;
  const s = COURIER_SCALE * gulp * (dead ? Math.max(0.04, deathK) : 1);
  const spinYaw = dead && !calmMotion ? yaw + (1 - deathK) * 9 : yaw;
  const y = -COURIER_FRAME.bottom * s + 0.03;
  const visor = collectPulse > 0.75 ? "#ffffff" : st.profile.orbColor || "#18f0ff";
  const drawCourier = (x: number, z: number): void => {
    glowDisc(x, z, ACTOR.courierGlow * (dead ? deathK : 1), dashing ? "#5ff3ff" : ARCADE.courierGlow, dashing ? 1.1 : 0.85);
    inst("courier", x, y, z, s * dashSquash, s * dashSquash, s * dashStretch, ARCADE.courier, spinYaw);
    inst("courierVisor", x, y, z, s * dashSquash, s * dashSquash, s * dashStretch, visor, spinYaw);
  };
  const cx = wx(pp.x), cz = wz(pp.y);
  // trail (newest first), sampled every 40 ms while moving; cleared on wrap jumps and respawns
  trailClock += dt;
  const head = trail[0];
  if (!moving || (head && Math.hypot(head.x - cx, head.z - cz) > 1.5)) trail.length = 0;
  else if (trailClock >= 0.04) {
    trailClock = 0;
    trail.unshift({ x: cx, z: cz });
    if (trail.length > TRAIL_LEN) trail.length = TRAIL_LEN;
  }
  if (!dead) {
    for (let i = 1; i < trail.length; i++) {
      const t = trail[i]!, f = 1 - i / TRAIL_LEN;
      const trailCol = dashing ? "#5ff3ff" : (st.profile.trailColor || ARCADE.courierGlow);
      inst("glow", t.x, 0.011, t.z, (dashing ? 1.15 : 0.9) * f + 0.2, 1, (dashing ? 1.15 : 0.9) * f + 0.2, trailCol, 0, (dashing ? 1.25 : 0.95) * f);
    }
    // subtle 1-tile queued-turn indicator when a buffered turn differs from current travel heading
    const want = st.player.want;
    if (!st.autopilot && st.player.wantT > 0 && (want.x !== st.player.dir.x || want.z !== st.player.dir.z)) {
      inst("glow", cx + want.x * 0.72, 0.014, cz + want.z * 0.72, 0.34, 1, 0.34, "#5ff3ff", 0, 0.72);
    }
  }
  drawCourier(cx, cz);
  const ex = echoOffset(m, pp.x, pp.y);
  if (ex && !dead) drawCourier(wx(ex.x), wz(ex.y));
  if (dead) {
    // caught: a red shock ring spreads from the courier (reads clearly at any size)
    const t = 1 - deathK;
    const r = 1.2 + t * 3.6;
    inst("glow", cx, 0.02, cz, r, 1, r, "#ff2a3a", 0, Math.max(0, 1.4 - t * 1.4));
  }

  // --- sentries: flat spinning star drones in solid colours, big eyes looking along the move direction
  for (const g of st.ghosts) {
    const gp = blend?.mazeId === st.mazeId && blend.ghosts[g.id] ? blend.ghosts[g.id] : normGhostPos(g);
    const gyaw = yawOf(g.dir);
    const eaten = g.state === "eyes" || g.state === "entering";
    const place = (x: number, z: number): void => {
      if (eaten) {
        drawEyes(x, 0.3, z, gyaw, ACTOR.sentry, "look");
        return;
      }
      const frightened = st.fright > 0 && g.state === "active";
      const col = sentryColor(g.id, st.fright, g.state === "active", st.time, calmFlash);
      const k = g.state === "house" ? 0.9 : 1;
      const size = ACTOR.sentry * k;
      const h = ACTOR.sentryHeight * k;
      const hover = 0.06 + Math.sin(st.time * 6 + g.px) * 0.02 * amp;
      const spin = st.time * SENTRY_SPIN[g.id] * (calmMotion ? 0.25 : frightened ? 0.5 : 1);
      if (frightened) {
        // pulsing cyan/white halo separates deep indigo-violet frightened sentries from blue neon walls
        const pulseRate = st.fright < 1.8 ? (calmFlash ? 4 : 16) : (calmFlash ? 2 : 7);
        const hp = 0.5 + 0.5 * Math.sin(st.time * pulseRate);
        const haloCol = mixHex(ARCADE.frightenedHalo, ARCADE.frightenedFlash, hp);
        glowDisc(x, z, ACTOR.sentryGlow * k * (1.04 + 0.1 * hp * amp), haloCol, 0.65 + 0.35 * hp);
      } else {
        glowDisc(x, z, ACTOR.sentryGlow * k, col, 0.45);
      }
      inst(SENTRY_POOL[g.id], x, hover + h / 2, z, size, h, size, col, spin);
      drawEyes(x, hover + h + 0.012, z, gyaw, size, frightened ? "fright" : "look");
    };
    place(wx(gp.x), wz(gp.y));
    const gx = echoOffset(m, gp.x, gp.y);
    if (gx) place(wx(gx.x), wz(gx.y));
  }
}

let fittedArcade: CameraPose = lastPose;
let fittedTilt: CameraPose = { position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov };
let cropTick = 0;

// ---------------------------------------------------------------------------
// Per-frame visual sync
// ---------------------------------------------------------------------------
export function syncVisuals(dt: number, blend?: ActorBlendState, feel?: FrameFeel): void {
  if (!app) return;
  const nodes = app.nodes;
  const m = st.maze;
  // arcade board-clear flash: the neon outline blinks white (steady pale on reduced flash)
  const flash = st.mode === "cleared" && (calmFlash ? true : Math.sin(st.time * Math.PI * 5) > 0);
  if (builtFor !== m.def.id || flash !== neonFlashOn) {
    paintMaze(m, flash);
    if (builtFor !== m.def.id) placeDoorAndPortals(m);
    if (submit(STATIC_POOLS) && applyBoardLook()) { builtFor = m.def.id as MazeId; neonFlashOn = flash; }
  }
  for (const k of DYNAMIC_POOLS) POOL[k].n = 0;
  syncSparkBursts(dt);

  // pellets: small warm-white beads; power cells: larger beads that pulse (and blink, unless reduced flash)
  const mw = m.width;
  for (let d = 0; d < m.dots.length; d++) {
    const i = m.dots[d]!;
    if (!st.dots[i]) continue;
    inst("dot", wx(i % mw), 0.16, wz((i / mw) | 0), PELLET_SIZE, PELLET_SIZE, PELLET_SIZE, ARCADE.pellet);
  }
  const pulse = 0.5 + 0.5 * Math.sin(st.time * (calmFlash ? 2.2 : 7));
  for (let o = 0; o < m.orbs.length; o++) {
    const i = m.orbs[o]!;
    if (!st.orbs[i]) continue;
    const x = wx(i % mw), z = wz((i / mw) | 0);
    const k = CELL_SIZE * (0.84 + 0.24 * pulse * (calmMotion ? 0.4 : 1));
    inst("cell", x, 0.26, z, k, k, k, ARCADE.cell, 0, 0.7 + 0.3 * pulse);
    glowDisc(x, z, k * 2.4, ARCADE.cellGlow, 0.45 + 0.35 * pulse, 0.011);
  }
  if (st.school) {
    for (const g of st.ghosts) inst("marker", wx(g.target.x), 0.02, wz(g.target.y), 0.92, 0.04, 0.92, GHOST_TINT[g.id]);
  }

  const pp = blend?.mazeId === st.mazeId ? blend.courier : normPos(m);
  try {
    syncActors(dt, blend, pp);

    // bonus relic (the board's fruit) on an octagonal plinth
    const activeFruit = st.fruitActive ? m.def.fruit : null;
    const bobRelic = Math.sin(st.time * 4) * (calmMotion ? 0.02 : 0.055);
    if (activeFruit) inst("gem", wx(m.fruitTile.x), 0.03, wz(m.fruitTile.y), 0.9, 0.06, 0.9, "#ffd27a", st.time * 0.8);
    for (const kind of BONUS_RELIC_KINDS) {
      const relicNode = nodes.get(`bonus-relic-${kind}`);
      if (!relicNode) continue;
      if (activeFruit === kind) {
        relicNode.setVisible(true);
        relicNode.setPosition(wx(m.fruitTile.x), 0.5 + bobRelic, wz(m.fruitTile.y));
        relicNode.setRotation(0, calmMotion ? 0.4 : st.time * 1.6, 0);
        relicNode.setScale(1.05);
      } else {
        relicNode.setVisible(false);
        relicNode.setPosition(0, -999, 0);
      }
    }

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

  // camera: the arcade top-down rig (default) or the 3/4 Tilt Cam following the courier
  const aspect = viewAspect();
  const aspectChanged = Math.abs(aspect - fitAspect) > 1e-3;
  if (aspectChanged) {
    fitAspect = aspect;
    fittedArcade = fitArcadeRig(aspect);
    fittedTilt = fitPlayRig({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }, aspect, FRAME_PULL_BACK).pose;
  }
  lastPose = st.camera === "follow" ? followCameraPose(fittedTilt, pp, aspect, dt) : fittedArcade;
  const sx = feel ? feel.shakeOffset[0] : 0;
  const sy = feel ? feel.shakeOffset[1] : 0;
  const fovDelta = feel ? feel.fovDeltaDeg : 0;
  app.camera?.setPose({
    position: [lastPose.position[0] + sx * 0.5, lastPose.position[1], lastPose.position[2] + sy * 0.5],
    target: [lastPose.target[0] + sx * 0.5, lastPose.target[1], lastPose.target[2] + sy * 0.5],
    fov: Math.max(28, Math.min(58, lastPose.fov + fovDelta * 0.5))
  });
  if (aspectChanged || (cropTick++ & 7) === 0) publishCrops(pp, aspect);
  app.output?.setOutputOverlay(
    st.mode === "dying" && !calmFlash ? { fade: [0.4, 0.02, 0.1, 0.35] }
    : st.fright > 0 && st.fright < 1.8 ? { vignette: [0.05, 0.05, 0.35, 0.4] }
    : {}
  );

  submit(DYNAMIC_POOLS);
}

/** Upload pools to their instanced nodes; false while the nodes are not mounted yet (boot race). */
function submit(keys: readonly ArcadePoolKey[]): boolean {
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

/** Clear colour and tone mapping (once): a near-black cabinet background on every board. */
function applyBoardLook(): boolean {
  if (!app?.nodes) return false;
  try { (app as unknown as { setClearColor?(c: string): void }).setClearColor?.(ARCADE.background); } catch { /* optional */ }
  if (!toneMapSet) {
    try {
      app?.output?.setOutput({
        toneMapping: ARCADE.toneMapping,
        neutralCurve: ARCADE.neutralCurve,
        exposure: ARCADE.exposure,
        dither: true
      });
      toneMapSet = true;
    } catch { /* output optional */ }
  }
  return true;
}
let toneMapSet = false;

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
