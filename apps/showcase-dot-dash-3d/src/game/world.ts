// Glint Courier — scene builder + per-frame visual sync.
// World units: 1 tile = 1 unit. Maze 19×21 centered at origin:
// worldX = tile.x - 9, worldZ = tile.y - 10.

import {
  game, lights, effects, scene, camera, instances, environments, defineAuraAssets,
  primitives, material, text3D, texture, type AuraApp, type AuraSceneNode
} from "@aura3d/engine";
import {
  BONUS_RELIC_KINDS,
  GEM_CACHE_SPECS,
  POOL_CAPS,
  buildArchitectDeskLampNode,
  buildBonusArcadeRelicNode,
  buildCourierCoreNode,
  buildCourierHoverPodNode,
  buildGemCacheNode,
  buildInstancedPoolNodes,
  buildWarpTunnelArchNode
} from "../art/proceduralModels.js";
import { boxReflectionProbe } from "./engineCompat.js";
import { idx, type ParsedMaze } from "./grid.js";
import type { MazeId } from "./mazes.js";
import {
  GHOST_TINT, st, normPos, normGhostPos, type GhostId
} from "./sim.js";
import type { FruitKind } from "./grid.js";
import { fitPlayRig, projectNdc, type CameraPose } from "./camera.js";
import { hexToRgb, pylonLayout } from "./palette.js";
import {
  BASE_FOCUS_DISTANCE, BENCH, BOARD_LOOKS, BOARD_PARTS, BOARD_PROBE, BOUNCE, COURIER_POD, FRAME_PULL_BACK, GROUNDING, LAMP, LAMP_SHADOW, LENS, ROOM, LOOK_HDRI, MACRO_DOF,
  LUT_INTENSITY, PEDESTALS, PRACTICALS, focusDistance, type BoardLookRow
} from "./look.js";
import { TraceField } from "./traces.js";
import { dustMotesOptions } from "./vfx.js";
import {
  CLEAR_LAMP_DIM, REDUCED_AMPLITUDE, cinematicsAllowed, clearOrbitShot, introShots, localPoseToEulerZYX, stepCourierPose, waveLevel, WAVE_SECONDS,
  type CourierPose, type ShotPlan
} from "./motion.js";
import { BOARD_BAKE, BOARD_BAKE_LOW, bakeBoardMaps, type BoardMaps } from "./boardMaterial.js";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";
import { createFlipbookAtlas, createGradingLut } from "../../../showcase-port-shared/vfx-pack";
import { dualCircuitBusSpec, dualEnergyFieldSpec, dualSparkFlipbookSpec } from "./shaders.js";

/** Procedural cyber-neon grading LUT (vfx-pack) alongside per-board `.cube` display LUTs. */
export const CYBER_NEON_LUT = createGradingLut("cyber-neon");
const SPARKS_ATLAS = createFlipbookAtlas("sparks", [255, 214, 118]);

/** The E-A catalogue HDRI (CC0, Poly Haven "vintage_measuring_lab", public/hdri/ATTRIBUTION.md): IBL fill only. */
const lookAssets = defineAuraAssets({
  workshopHdr: {
    type: "texture",
    format: "hdr",
    url: LOOK_HDRI.url,
    hash: "sha256-3a7dd0110ad011289abae4f4637aa0a0e58abcbd8a3fe1f5f3ba664276dbb351",
    metadata: { license: "CC0-1.0", sourcePath: "public/hdri/indoor-workshop_1k.hdr" }
  }
});

/**
 * Desk-lamp key (DD47-L1): one shadowed PCSS spot from the upper left. The engine drops local-light shadows on the Low
 * tier (quality.ts `localShadowLights: 0`), where the lamp still pools light but casts none.
 */
function lampLight(look: BoardLookRow) {
  return lights.spot({
    name: "desk lamp",
    position: [...LAMP.position],
    target: [...LAMP.target],
    angle: LAMP.angle,
    penumbra: LAMP.penumbra,
    distance: LAMP.distance,
    decay: LAMP.decay,
    intensity: look.lamp.intensity,
    color: look.lamp.color,
    shadow: { ...LAMP_SHADOW }
  }).runtime(game.runtimeNode("lamp"));
}

/** Phase 4 (4.7.2): SSR with the v2 fields (maxDistance, roughness, thickness), typed by effects.screenSpaceReflections since 5.0. */
function ssrNode(): AuraSceneNode {
  return effects.screenSpaceReflections({ name: "mask reflections", intensity: GROUNDING.ssr.intensity, maxDistance: GROUNDING.ssr.maxDistance, roughness: GROUNDING.ssr.roughness, thickness: GROUNDING.ssr.thickness }).toJSON();
}

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
// All 24 pool geometries in `proceduralModels.ts` are unit-normalized to `[-0.5..0.5]^3`.
// ---------------------------------------------------------------------------
const CAP = POOL_CAPS;

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
  const rgb = hexToRgb(color); // cached per colour string
  instRgb(k, x, y, z, sx, sy, sz, rgb[0], rgb[1], rgb[2], ry);
}

function instRgb(k: keyof typeof CAP, x: number, y: number, z: number, sx: number, sy: number, sz: number, r: number, g: number, b: number, ry = 0): void {
  const p = POOL[k];
  if (p.n >= CAP[k]) return;
  writeMat(p.mat, p.n, x, y, z, sx, sy, sz, ry);
  p.col[p.n * 3] = r;
  p.col[p.n * 3 + 1] = g;
  p.col[p.n * 3 + 2] = b;
  p.n++;
}

/** Pools that only change with the board: painted and submitted once per board, not every frame. */
const STATIC_POOLS = ["wall", "wallTrim", "rail", "trace", "dress", "cap", "glow", "trophy"] as const satisfies readonly (keyof typeof CAP)[];
const DYNAMIC_POOLS = (Object.keys(CAP) as (keyof typeof CAP)[]).filter((k) => !(STATIC_POOLS as readonly string[]).includes(k));

const pad = (n: number) => Array.from({ length: n }, () => ({ position: [0, -999, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));

/**
 * The PCB itself (DD47-M1): glossy solder mask lit only by the lamp and the IBL (no emissive fill). With a DOM the
 * slab carries the baked board (boardMaterial.ts): albedo, normal and occlusion in three live canvas textures that
 * are repainted in place on a board change, so only the active board's maps are resident. The textured material is
 * built once at mount (its roughness and clearcoat stay the mount board's; only the maps follow the board). Without
 * a DOM, or if the bake fails, the slab falls back to the flat mask colour.
 */
interface BoardTextures {
  readonly maps: readonly { readonly canvas: HTMLCanvasElement; readonly handle: ReturnType<typeof texture.canvas> }[];
  readonly width: number;
  readonly height: number;
  bakedFor: MazeId | "";
}
let boardTextures: BoardTextures | null | undefined;

function bakeSize(): { readonly width: number; readonly height: number } {
  // Phones and coarse pointers bake at half size (a quarter of the texture memory); the engine tier is not known yet.
  const small = typeof window !== "undefined" && (window.innerWidth < 700 || window.matchMedia?.("(pointer: coarse)").matches === true);
  return small ? BOARD_BAKE_LOW : BOARD_BAKE;
}

/** Bakes the board into the live canvases (creating them on first use). Returns null without a DOM. */
function paintBoardTextures(m: ParsedMaze): BoardTextures | null {
  if (boardTextures === null) return null;
  const id = m.def.id as MazeId;
  try {
    if (!boardTextures) {
      if (typeof document === "undefined") { boardTextures = null; return null; }
      const { width, height } = bakeSize();
      const maps = (["srgb", "linear", "linear"] as const).map((colorSpace) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const handle = texture.canvas({ canvas, colorSpace });
        handle.anisotropy = 8;
        return { canvas, handle };
      });
      boardTextures = { maps, width, height, bakedFor: "" };
    }
    if (boardTextures.bakedFor === id) return boardTextures;
    const baked: BoardMaps = bakeBoardMaps({
      maze: m,
      look: BOARD_LOOKS[id],
      pads: pylonLayout(m.def.id, m.def.theme).map((p) => ({ x: p.x, z: p.z, w: p.w })),
      outlines: PEDESTALS.map(([x, z]) => ({ x, z, w: 1.25 })),
      width: boardTextures.width,
      height: boardTextures.height
    });
    [baked.albedo, baked.normal, baked.occlusion].forEach((pixels, i) => {
      const { canvas, handle } = boardTextures!.maps[i]!;
      canvas.getContext("2d")!.putImageData(new ImageData(pixels, baked.width, baked.height), 0, 0);
      handle.needsUpdate = true;
    });
    boardTextures.bakedFor = id;
    return boardTextures;
  } catch {
    boardTextures = null;
    return null;
  }
}

const boardMaterial = (look: BoardLookRow, baked: BoardTextures | null) => baked
  ? material.pbr({
    color: "#ffffff", texture: baked.maps[0]!.handle as never, normal: baked.maps[1]!.handle, normalScale: 1,
    occlusionMap: baked.maps[2]!.handle, occlusionStrength: 1, textureAnisotropy: 8,
    roughness: look.maskRoughness, metalness: 0.06, clearcoat: 0.92, clearcoatRoughness: 0.08
  })
  : material.pbr({ color: look.mask, roughness: look.maskRoughness, metalness: 0.06, clearcoat: 0.92, clearcoatRoughness: 0.08 });

// ---------------------------------------------------------------------------
// Scene definition — one static graph; instanced pools get re-filled per frame.
// ---------------------------------------------------------------------------
export function buildScene(): unknown {
  const look = BOARD_LOOKS[st.mazeId];
  builtLook = st.mazeId;
  const s = scene()
    // DD47-P2 lens stack: bloom only on what glows (threshold 0.92), a soft frame, a hair of fringing and grain; the
    // per-board grade (DD47-P3) rides on top. ACES is set explicitly on the output at boot (main.ts).
    .add(effects.cinematicBloom({ name: "lamp bloom", intensity: LENS.bloom.intensity, threshold: LENS.bloom.threshold, radius: LENS.bloom.radius }))
    .add(effects.vignette({ intensity: LENS.vignette.intensity, smoothness: LENS.vignette.smoothness }))
    .add(effects.chromaticAberration({ intensity: LENS.chromaticAberration }))
    .add(effects.filmGrain({ intensity: LENS.grain }))
    .add(effects.colorGrade(gradeOf(look)))
    // Phase 3 (4.7.1): FXAA over the thin traces and chip edges.
    .add(effects.antiAlias({ mode: "fxaa" }))
    // Phase 4 (4.7.2) grounding and reflection (GROUNDING): lamp contact shadows, short AO, SSR in the glossy mask.
    .add(effects.contactShadows({ ...GROUNDING.contact, lights: "shadowed" }))
    .add(effects.ambientOcclusion({ name: "chip grounding", ...GROUNDING.ao }))
    .add(ssrNode())
    // WP-12 crisp forward sightline: gameplay DoF disabled and deep dark arcade linear fog pushed far past the board (`near >= 140, maxOpacity <= 0.28`), zero milky haze.
    .add(effects.fog({ mode: "linear", color: look.fog.color, near: look.fog.near, far: look.fog.far, maxOpacity: look.fog.maxOpacity, density: look.fog.density, intensity: 0.14, affectsBackground: false }))
    // DD47-E1: the workshop HDRI fills and reflects at 0.38 and is never drawn (the bench is the surround); a box
    // probe over the board gives the glossy mask and the pins a parallax-correct reflection. No look preset: a look
    // always adds a shadowed directional key (a second caster next to the lamp).
    .add(environments.hdri({
      name: "workshop ibl",
      texture: lookAssets.workshopHdr,
      intensity: look.hdri.intensity,
      rotation: (look.hdri.rotationDeg * Math.PI) / 180,
      background: false
    }).runtime(game.runtimeNode("workshop-ibl")))
    .add(boxReflectionProbe({ name: "board probe", ...BOARD_PROBE }))
    // DD47-L1: the desk lamp is the only key and the only shadow caster; the old directional is a cool unshadowed
    // bounce from the far side of the room; no ambient or hemisphere light.
    .add(lampLight(look))
    .add(lights.directional({ name: "cool bounce", position: [...BOUNCE.position], target: [...BOUNCE.target], color: BOUNCE.color, intensity: BOUNCE.intensity, shadow: false }))
    // DD47-L2 moving practicals: the courier's cyan point and four pooled event points (parked dark until used).
    .add(lights.point({ name: "courier light", position: [wx(st.maze.spawn.x), PRACTICALS.courier.height, wz(st.maze.spawn.y)], color: PRACTICALS.courier.color, intensity: PRACTICALS.courier.intensity, distance: PRACTICALS.courier.distance, decay: PRACTICALS.courier.decay, shadow: false }).runtime(game.runtimeNode("courier-light")))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }));
  // DD47-V2: dust motes drifting in the lamp cone (60, 30 on reduced motion; additive dust-mote sprite)
  type ParticleOptions = Parameters<typeof effects.particles>[0];
  s.add(effects.particles(dustMotesOptions({ reducedMotion: calmMotion }) as unknown as ParticleOptions).runtime(game.runtimeNode("lamp-motes")));
  for (let i = 0; i < PRACTICALS.pooled; i++) {
    s.add(lights.point({ name: `event light ${i}`, position: [0, -40, 0], color: PRACTICALS.surge.color, intensity: 0, distance: PRACTICALS.surge.distance, decay: PRACTICALS.surge.decay, shadow: false }).runtime(game.runtimeNode(`event-light-${i}`)));
  }

  // IMPORTANT: In Aura3D's instanced shader, v_instanceColor multiplies u_baseColor (color); the emissive term only
  // takes the instance colour on pools with `instanceColorTarget: "both" | "emissive"` (E-D). Never set a white
  // emissive on a "base" pool, or every instance emits pure white regardless of its colour.
  const P = BOARD_PARTS;
  const portalMat = material.custom(dualEnergyFieldSpec({ coreColor: [0.14, 0.78, 1.0], edgeColor: [0.68, 0.98, 1.0], pulseSpeed: 3.2, scanScale: 12.0, opacity: 0.58 }));
  const doorMat = material.custom(dualEnergyFieldSpec({ coreColor: [1.0, 0.62, 0.18], edgeColor: [1.0, 0.92, 0.58], pulseSpeed: 3.4, scanScale: 15.0, opacity: 0.72 }));
  const beamMat = material.custom(dualEnergyFieldSpec({ coreColor: [1.0, 0.68, 0.22], edgeColor: [1.0, 0.94, 0.64], pulseSpeed: 4.0, scanScale: 10.0, opacity: 0.5 }));

  s.addMany([
    // DD47-E2: walnut bench top and the anti-static mat under the board reach past every camera edge.
    primitives.box({ name: "walnut bench", size: [...BENCH.wood.size], material: material.pbr({ color: P.walnut.color, roughness: P.walnut.roughness, metalness: 0 }), castShadow: false, receiveShadow: true })
      .position(0, BENCH.wood.y, 0),
    primitives.box({ name: "anti-static mat", size: [...BENCH.mat.size], material: material.pbr({ color: P.mat.color, roughness: P.mat.roughness, metalness: 0 }), castShadow: false, receiveShadow: true })
      .position(0, BENCH.mat.y, 0),
    // the PCB: glossy solder mask in the board's colour
    primitives.box({ name: "board", size: [...BENCH.board.size], material: boardMaterial(look, paintBoardTextures(st.maze)), receiveShadow: true })
      .position(0, BENCH.board.y, 0)
      .runtime(game.runtimeNode("board")),
    // WP-12: 24 sculpted unit-bounded (`[-0.5..0.5]^3`) instanced procedural pools
    ...buildInstancedPoolNodes(pad),

    // WP-12: sculpted Electric Gold & Electric Cyan Glint Courier glider + faceted star-core (+ wrap echoes)
    buildCourierCoreNode("byte", [wx(st.maze.spawn.x), COURIER_POD.coreHeight, wz(st.maze.spawn.y)]),
    buildCourierCoreNode("byte-echo", [0, -999, 0]),
    buildCourierHoverPodNode("courier-pod", [wx(st.maze.spawn.x), COURIER_POD.lift, wz(st.maze.spawn.y)]),
    buildCourierHoverPodNode("courier-pod-echo", [0, -999, 0]),

    // WP-12: all 8 vibrant colored faceted crystal gem caches framing the perimeter of the maze
    ...GEM_CACHE_SPECS.map((spec) => buildGemCacheNode(spec)),

    // WP-12: 6 sculpted multi-material bonus arcade relics (cherries, berry, key, bell, gyro chalice, Galaxian craft)
    ...BONUS_RELIC_KINDS.map((kind) => buildBonusArcadeRelicNode(kind)),

    // paired GLSL + WGSL custom shader nodes: sentry hub reactor pad, phase gate, telemetry beam, wrap-tunnel portals + voussoir archways, spark flipbooks
    primitives.plane({ name: "hub-pad", size: [2.8, 2.8], material: material.custom(dualCircuitBusSpec()), castShadow: false, receiveShadow: false })
      .position(0, -999, 0).rotate(-Math.PI / 2, 0, 0)
      .runtime(game.runtimeNode("hub-pad")),
    primitives.box({ name: "door", size: [1.02, 0.52, 0.1], material: doorMat, castShadow: false })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("door")),
    primitives.cylinder({ name: "school-beam", size: [0.34, 3.2, 0.34], material: beamMat, castShadow: false })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("school-beam")),
    ...Array.from({ length: 4 }, (_, i) =>
      primitives.box({ name: `wrap-portal-${i}`, size: [0.12, 0.72, 0.96], material: portalMat, castShadow: false })
        .position(0, -999, 0)
        .runtime(game.runtimeNode(`portal-${i}`))
    ),
    ...Array.from({ length: 4 }, (_, i) => buildWarpTunnelArchNode(`warp-arch-${i}`)),
    ...Array.from({ length: SPARK_POOL_SIZE }, (_, i) =>
      primitives.plane({ name: `spark-burst-${i}`, size: [1, 1], material: material.custom(dualSparkFlipbookSpec(SPARKS_ATLAS)), castShadow: false, receiveShadow: false })
        .position(0, -999, 0).rotate(-0.92, 0, 0)
        .runtime(game.runtimeNode(`spark-burst-${i}`))
    )
  ]);

  s.addMany(roomNodes());

  // DD47-W1 silkscreen and mounting holes (+3 draws)
  const silk = material.pbr({ color: look.silk, roughness: 0.7, metalness: 0 });
  const holes = BENCH.board.size[0] / 2 - 1, holesZ = BENCH.board.size[2] / 2 - 1;
  s.addMany([
    text3D("GLINT COURIER  REV 5.5", { name: "silk title", size: 0.42, depth: 0.004, letterSpacing: 0.08, backend: "sdf", material: silk })
      .position(2.4, 0.004, -11.6).rotate(-Math.PI / 2, 0, 0),
    text3D("U1  J2  C14  R7", { name: "silk refs", size: 0.3, depth: 0.004, letterSpacing: 0.1, backend: "sdf", material: silk })
      .position(-15.4, 0.004, -11.6).rotate(-Math.PI / 2, 0, 0),
    instances.torus({
      name: "mounting holes", size: [1, 1, 1],
      material: material.pbr({ color: "#d9b25a", roughness: 0.28, metalness: 1 }),
      transforms: [[-holes, -holesZ], [holes, -holesZ], [-holes, holesZ], [holes, holesZ]].map(([x, z]) => ({
        position: [x!, 0.01, z!] as [number, number, number], rotation: [Math.PI / 2, 0, 0] as [number, number, number], scale: [0.5, 0.5, 0.5] as [number, number, number]
      })),
      castShadow: false
    })
  ]);
  return s.toJSON();
}

/** Phase 3 (4.7.1): the workshop wall, pegboard (one instanced hole draw) and shelf behind the bench. */
function roomNodes() {
  const w = ROOM.wall, pb = ROOM.pegboard, h = ROOM.holes, sh = ROOM.shelf, g = ROOM.matGrid;
  const matTop = BENCH.mat.y + BENCH.mat.size[1] / 2;
  const grid: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  const [mw, , md] = BENCH.mat.size;
  for (let x = -mw / 2 + g.pitch; x < mw / 2; x += g.pitch) grid.push({ position: [x, matTop + 0.004, 0], scale: [g.width, 0.006, md] });
  for (let z = -md / 2 + g.pitch; z < md / 2; z += g.pitch) grid.push({ position: [0, matTop + 0.004, z], scale: [mw, 0.006, g.width] });
  const benchTop = BENCH.wood.y + BENCH.wood.size[1] / 2;
  const faceZ = w.z + 0.5;
  const holes: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let r = 0; r < h.rows; r++) {
    for (let c = 0; c < h.cols; c++) {
      holes.push({
        position: [pb.x + (c - (h.cols - 1) / 2) * h.pitch, benchTop + pb.y + (r - (h.rows - 1) / 2) * h.pitch, faceZ + 0.22],
        rotation: [Math.PI / 2, 0, 0], scale: [0.16, 0.02, 0.16]
      });
    }
  }
  return [
    primitives.box({ name: "workshop wall", size: [180, w.height, 1], material: material.pbr({ color: w.color, roughness: w.roughness, metalness: 0 }), castShadow: false, receiveShadow: true })
      .position(0, benchTop + w.height / 2, w.z),
    primitives.box({ name: "pegboard", size: [pb.width, pb.height, 0.2], material: material.pbr({ color: pb.color, roughness: pb.roughness, metalness: 0 }), castShadow: false, receiveShadow: true })
      .position(pb.x, benchTop + pb.y, faceZ + 0.1),
    instances.cylinder({ name: "pegboard holes", size: [1, 1, 1], material: material.pbr({ color: h.color, roughness: 0.95, metalness: 0, clearcoat: 0, sheen: 0 }), transforms: holes, castShadow: false }),
    instances.box({ name: "mat grid", size: [1, 1, 1], material: material.pbr({ color: g.color, roughness: 0.7, metalness: 0, clearcoat: 0, sheen: 0 }), transforms: grid, castShadow: false, receiveShadow: true }),
    buildArchitectDeskLampNode(benchTop, LAMP.position, LAMP.target),
    primitives.box({ name: "wall shelf", size: [44, 0.35, sh.depth], material: material.pbr({ color: sh.color, roughness: sh.roughness, metalness: 0 }), castShadow: true, receiveShadow: true })
      .position(pb.x, benchTop + sh.y, faceZ + sh.depth / 2)
  ];
}

/** Per-board grade over the lens stack (DD47-P3); the LUT joins once the six .cube files are admitted. */
function gradeOf(look: BoardLookRow) {
  return { name: "board grade", contrast: look.grade.contrast, saturation: look.grade.saturation, temperature: look.grade.temperature, tint: look.grade.tint, lut: look.grade.lut, lutIntensity: LUT_INTENSITY };
}

// ---------------------------------------------------------------------------
// Maze → instanced walls/pins/traces/floor dressing (refreshed on maze change)
// ---------------------------------------------------------------------------
let builtFor: MazeId | "" = "";
let traces: TraceField | null = null;

/** Gull-wing pin rows: two pins per chip side that faces a corridor, at the foot of the epoxy body. */
const PIN_SIDES = [
  [0, -1], [0, 1], [-1, 0], [1, 0]
] as const;

const SPARK_POOL_SIZE = 6;
interface SparkBurstSlot {
  active: boolean;
  x: number;
  z: number;
  y: number;
  age: number;
  duration: number;
  scale: number;
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
  slot.y = 0.36;
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
    if (!slot.active) {
      h.setVisible(false);
      continue;
    }
    slot.age += Math.max(0, dt);
    const t = slot.age / Math.max(0.05, slot.duration);
    if (t >= 1) {
      slot.active = false;
      h.setVisible(false);
      h.setPosition(0, -999, 0);
      continue;
    }
    h.setVisible(true);
    h.setPosition(slot.x, slot.y + t * 0.14, slot.z);
    const s = slot.scale * (0.72 + 0.52 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5));
    h.setScale([s, s, s]);
    try {
      h.setUniform?.("frame", Math.min(31, Math.floor(t * 32)));
      h.setUniform?.("tint", [...slot.tint]);
      h.setUniform?.("opacity", calmFlash ? (1 - t) * 0.55 : 1 - t * t);
    } catch { /* custom uniform optional */ }
  }
}

function paintMaze(m: ParsedMaze): void {
  const look = BOARD_LOOKS[m.def.id as MazeId];
  const epoxy = BOARD_PARTS.epoxy.color;
  const trimCol = mixHex(look.copper, look.led, 0.42);
  const pin = BOARD_PARTS.pin.color;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      const X = wx(x), Z = wz(y);
      if (!m.wall[i]) continue;
      inst("wall", X, 0.31, Z, 0.9, 0.62, 0.9, epoxy);
      inst("wallTrim", X, 0.625, Z, 0.78, 0.026, 0.78, trimCol);
      for (const [dx, dy] of PIN_SIDES) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height || m.wall[idx(m.width, nx, ny)]) continue;
        for (const t of [-0.22, 0.22]) {
          const px = X + (dx !== 0 ? dx * 0.5 : t), pz = Z + (dy !== 0 ? dy * 0.5 : t);
          inst("rail", px, 0.05, pz, dx !== 0 ? 0.16 : 0.09, 0.05, dy !== 0 ? 0.16 : 0.09, pin);
        }
      }
    }
  }
  // brushed copper traces between corridor tile centres (the lit overlay follows them, syncTraces)
  traces = new TraceField(m);
  for (const e of traces.edges) {
    inst("trace", wx(e.x), 0.004, wz(e.y), e.horizontal ? 1.02 : 0.12, 0.012, e.horizontal ? 0.12 : 1.02, look.copper);
  }
  // sentry-hub floor tiles + dual-backend reactor bus pad + energy phase door + wrap-tunnel portals
  const d = m.door;
  let hxSum = 0, hySum = 0, hCount = 0;
  for (const i of m.houseTiles) {
    const hx = i % m.width, hy = (i / m.width) | 0;
    hxSum += hx; hySum += hy; hCount++;
    inst("dress", wx(hx), 0.002, wz(hy), 0.96, 0.018, 0.96, "#1c2226");
  }
  try {
    app?.nodes?.require("door").setPosition(wx(d.x), 0.28, wz(d.y) + 0.46);
    const hub = app?.nodes?.get("hub-pad");
    if (hub && hCount > 0) hub.setPosition(wx(hxSum / hCount), 0.016, wz(hySum / hCount));
    const portals: { pos: [number, number, number]; rotY: number }[] = [];
    if (m.def.wrapX) {
      for (let y = 0; y < m.height && portals.length < 4; y++) {
        if (!m.wall[idx(m.width, 0, y)] && !m.wall[idx(m.width, m.width - 1, y)]) {
          portals.push({ pos: [wx(-0.46), 0.36, wz(y)], rotY: 0 });
          portals.push({ pos: [wx(m.width - 0.54), 0.36, wz(y)], rotY: 0 });
        }
      }
    }
    if (m.def.wrapY) {
      for (let x = 0; x < m.width && portals.length < 4; x++) {
        if (!m.wall[idx(m.width, x, 0)] && !m.wall[idx(m.width, x, m.height - 1)]) {
          portals.push({ pos: [wx(x), 0.36, wz(-0.46)], rotY: Math.PI / 2 });
          portals.push({ pos: [wx(x), 0.36, wz(m.height - 0.54)], rotY: Math.PI / 2 });
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      const pNode = app?.nodes?.get(`portal-${i}`);
      const aNode = app?.nodes?.get(`warp-arch-${i}`);
      const spec = portals[i];
      if (spec) {
        if (pNode) {
          pNode.setVisible(true);
          pNode.setPosition(...spec.pos);
          pNode.setRotation(0, spec.rotY, 0);
        }
        if (aNode) {
          aNode.setVisible(true);
          aNode.setPosition(spec.pos[0], 0, spec.pos[2]);
          aNode.setRotation(0, spec.rotY, 0);
        }
      } else {
        if (pNode) {
          pNode.setVisible(false);
          pNode.setPosition(0, -999, 0);
        }
        if (aNode) {
          aNode.setVisible(false);
          aNode.setPosition(0, -999, 0);
        }
      }
    }
  } catch { /* boot race */ }
}


const GEM_BY_PEDESTAL = new Map(GEM_CACHE_SPECS.map((spec) => [spec.pedestalIndex, spec] as const));

/** Perimeter gem-cache pedestals (8 crystal gem caches + 2 equator Nixie relay tubes) + brushed capacitors & heatsinks. */
function paintDressing(m: ParsedMaze): void {
  const look = BOARD_LOOKS[m.def.id as MazeId];
  const socketCol = "#181d26";
  const canSilver = "#b9c2cc";
  PEDESTALS.forEach(([px, pz], idxPed) => {
    const gemSpec = GEM_BY_PEDESTAL.get(idxPed);
    inst("dress", px, 0.16, pz, 1.14, 0.32, 1.14, socketCol);
    if (gemSpec) {
      // Golden jeweler's collet + vivid gem-colored LED collar under each of the 8 crystal gem caches
      inst("cap", px, 0.34, pz, 0.88, 0.08, 0.88, "#ffaa18");
      inst("glow", px, 0.39, pz, 0.72, 0.055, 0.72, gemSpec.hex);
    } else {
      // Equator Nixie relay tubes on pedestals 4 & 5
      inst("cap", px, 0.34, pz, 0.84, 0.08, 0.84, look.copper);
      inst("glow", px, 0.86, pz, 0.2, 0.76, 0.2, idxPed % 2 === 0 ? "#ff9d3b" : look.led);
      inst("trophy", px, 0.9, pz, 0.62, 1.02, 0.62, "#b6f0ff");
    }
  });
  let stubIdx = 0;
  for (const py of pylonLayout(m.def.id, m.def.theme)) {
    if (stubIdx % 2 === 0) {
      inst("cap", py.x, py.h * 0.5, py.z, py.w * 0.88, py.h, py.w * 0.88, canSilver);
      if (py.cap) inst("glow", py.x, py.h + 0.03, py.z, py.w * 0.52, 0.05, py.w * 0.52, look.copper);
    } else {
      inst("dress", py.x, py.h * 0.26, py.z, py.w, py.h * 0.52, py.w, socketCol);
      for (const f of [-0.28, 0, 0.28]) {
        inst("dress", py.x + f * py.w, py.h * 0.68, py.z, py.w * 0.16, py.h * 0.64, py.w * 0.94, "#303844");
      }
      if (py.cap) inst("glow", py.x, py.h + 0.04, py.z, py.w * 0.46, 0.05, py.w * 0.46, look.led);
    }
    stubIdx++;
  }
}

/** Lit trace overlay (signature): the edges the courier passed or a surge pulse crosses, glowing the board's trace colour. */
function syncTraces(): void {
  const field = traces;
  if (!field) return;
  const m = st.maze;
  const look = BOARD_LOOKS[m.def.id as MazeId];
  if (st.mode === "play") {
    const pp = normPos(m);
    field.visit(pp.x, pp.y, st.time);
  }
  if (st.events.orb) {
    const pp = normPos(m);
    field.pulse(pp.x, pp.y, st.time);
  }
  field.prune(st.time);
  const [r, g, b] = hexToRgb(look.traceGlow);
  const prefs = { reducedMotion: calmMotion, reducedFlash: calmFlash };
  const board = boardWave();
  for (const e of field.edges) {
    const wave = board ? board.level(Math.hypot(e.x - board.x, e.y - board.y)) : 0;
    const k = Math.max(field.edgeGlow(e, st.time, prefs), wave);
    if (k < 0.02) continue;
    instRgb("traceLit", wx(e.x), 0.0115, wz(e.y), e.horizontal ? 1.02 : 0.13, 0.012, e.horizontal ? 0.13 : 1.02, r * k, g * k, b * k);
  }
}

/**
 * DD47-AN2: the board powers up from the spawn at READY (a front across the traces, held, then let go) and sweeps
 * from the courier at CLEAR while the lamp dims to 40%. Reduced motion: a uniform fade instead of a moving front.
 */
let waveMode: "" | "ready" | "cleared" = "";
let waveStart = 0;
let waveOrigin = { x: 0, y: 0 };
let lampDimmed = false;
const WAVE_HOLD = 0.8, WAVE_RELEASE = 0.8;
function boardWave(): { x: number; y: number; level(d: number): number } | null {
  const m = st.maze;
  const mode = st.mode === "ready" || st.mode === "cleared" ? st.mode : "";
  if (mode && mode !== waveMode) {
    waveStart = st.time;
    waveOrigin = mode === "ready" ? { x: m.spawn.x, y: m.spawn.y } : normPos(m);
  }
  if (mode) waveMode = mode;
  setLampDim(st.mode === "cleared");
  if (!waveMode) return null;
  const t = st.time - waveStart;
  if (waveMode === "ready" && !mode && t > WAVE_SECONDS + WAVE_HOLD + WAVE_RELEASE) { waveMode = ""; return null; }
  if (waveMode === "cleared" && !mode) { waveMode = ""; return null; }
  const reach = Math.hypot(m.width, m.height);
  const release = waveMode === "ready" ? Math.max(0, Math.min(1, (t - WAVE_SECONDS - WAVE_HOLD) / WAVE_RELEASE)) : 0;
  const scale = (calmFlash ? 0.6 : 1) * (1 - release);
  return { ...waveOrigin, level: (d) => waveLevel(d, t, reach, calmMotion) * scale };
}
function setLampDim(dim: boolean): void {
  if (dim === lampDimmed) return;
  const lamp = app?.nodes?.get("lamp");
  if (!lamp?.setLight) return;
  const look = BOARD_LOOKS[st.maze.def.id as MazeId];
  lamp.setLight({ intensity: look.lamp.intensity * (dim ? CLEAR_LAMP_DIM : 1) }, { transitionSeconds: 0.5 });
  lampDimmed = dim;
}
let courierPose: CourierPose = { yaw: Math.PI, roll: 0 };

/** DD47-L2: the courier's point follows it; the pooled points sit on live surge cells, or on sentries during a surge. */
function syncPracticals(pp: { x: number; y: number }): void {
  const nodes = app?.nodes;
  if (!nodes) return;
  const courier = nodes.get("courier-light");
  courier?.setPosition(wx(pp.x), PRACTICALS.courier.height, wz(pp.y));
  const spots: { x: number; y: number; surge: boolean }[] = [];
  if (st.fright > 0) {
    for (const g of st.ghosts) {
      if (g.state !== "active") continue;
      const gp = normGhostPos(g);
      spots.push({ x: gp.x, y: gp.y, surge: false });
    }
  } else {
    const m = st.maze;
    for (const i of m.orbs) if (st.orbs[i]) spots.push({ x: i % m.width, y: (i / m.width) | 0, surge: true });
  }
  for (let i = 0; i < PRACTICALS.pooled; i++) {
    const h = nodes.get(`event-light-${i}`);
    if (!h) continue;
    const at = spots[i];
    if (!at) {
      if (litPool[i]) { h.setLight?.({ intensity: 0 }); litPool[i] = ""; }
      continue;
    }
    const spec = at.surge ? PRACTICALS.surge : PRACTICALS.sentry;
    h.setPosition(wx(at.x), spec.height, wz(at.y));
    const key = at.surge ? "surge" : "sentry";
    if (litPool[i] !== key) {
      h.setLight?.({ color: spec.color, intensity: spec.intensity, distance: spec.distance }, { transitionSeconds: calmFlash ? 0.4 : 0.15 });
      litPool[i] = key;
    }
  }
}
const litPool: string[] = Array.from({ length: PRACTICALS.pooled }, () => "");

/**
 * DD47-C1: a two-shot macro intro at the first READY of a run and a 2 s orbit at CLEAR, through `app.camera.play`.
 * The game's per-frame setPose pauses while one runs; skipped on reduced motion and captures.
 */
let cinematic = false;
let cinematicMode = "";
let fovKicked = false;
function maybePlayCinematic(rig: CameraPose): void {
  const mode = st.mode;
  if (mode === cinematicMode) return;
  cinematicMode = mode;
  const cam = app?.camera;
  if (!cam || typeof cam.play !== "function" || cinematic) return;
  const allowed = typeof window !== "undefined" && cinematicsAllowed(calmMotion, window.location.search, typeof navigator !== "undefined" && navigator.webdriver === true);
  if (!allowed) return;
  let plans: readonly ShotPlan[] | null = null;
  // only the run's first READY (respawns after a catch also pass through READY: no intro there)
  if (mode === "ready" && st.boardsCleared === 0 && st.score === 0 && st.dotsEaten === 0) {
    plans = introShots([wx(st.maze.spawn.x), 0, wz(st.maze.spawn.y)], rig);
  } else if (mode === "cleared") {
    plans = [clearOrbitShot(rig)];
  }
  if (!plans) return;
  try {
    const shots = plans.map((p) => ({ rig: camera.rigs.rail({ points: p.points.map((v) => [...v] as [number, number, number]), lookAt: [...p.lookAt] as [number, number, number], duration: p.duration, ease: "inOutSine" }), duration: p.duration, blendIn: 0.15 }));
    const playback = cam.play({ id: `dot-dash-${mode}`, shots, onEnd: "return" });
    cinematic = true;
    void playback.done.finally(() => { cinematic = false; });
  } catch { cinematic = false; }
}

/** Normalised 0..1 screen box around a world point, `half` world units each side (for E-I's crop capture). */
function cropAround(x: number, z: number, half: number, aspect: number): { x: number; y: number; w: number; h: number } | null {
  const a = projectNdc(lastPose, aspect, [x - half, 0.3, z - half]);
  const b = projectNdc(lastPose, aspect, [x + half, 0.3, z + half]);
  if (!a || !b) return null;
  const x0 = Math.max(0, Math.min(a[0], b[0]) * 0.5 + 0.5), x1 = Math.min(1, Math.max(a[0], b[0]) * 0.5 + 0.5);
  const y0 = Math.max(0, 0.5 - Math.max(a[1], b[1]) * 0.5), y1 = Math.min(1, 0.5 - Math.min(a[1], b[1]) * 0.5);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/**
 * QA crops (window.__AURA_QA__.crops, normalised, refreshed as the camera moves): the courier's 3x3 tiles and an empty
 * corridor (DD47-L2), the board centre and a bench corner (DD47-P1), the lamp and far thirds (DD47-L1).
 */
function publishCrops(pp: { x: number; y: number }, aspect: number): void {
  if (typeof window === "undefined") return;
  const crops: { name: string; x: number; y: number; w: number; h: number }[] = [];
  const add = (name: string, c: { x: number; y: number; w: number; h: number } | null): void => { if (c) crops.push({ name, ...c }); };
  add("courier", cropAround(wx(pp.x), wz(pp.y), 1.5, aspect));
  const m = st.maze;
  // the walkable tile farthest from the courier stands in for an empty corridor
  let best = -1, bx = 0, by = 0;
  for (let i = 0; i < m.walkable.length; i++) {
    if (!m.walkable[i] || st.dots[i] || st.orbs[i]) continue;
    const tx = i % m.width, ty = (i / m.width) | 0;
    const d = Math.hypot(tx - pp.x, ty - pp.y);
    if (d > best) { best = d; bx = tx; by = ty; }
  }
  if (best >= 0) add("corridor", cropAround(wx(bx), wz(by), 0.5, aspect));
  add("board-centre", cropAround(0, 0, 2, aspect));
  crops.push({ name: "bench-corner", x: 0, y: 0, w: 0.12, h: 0.12 });
  crops.push({ name: "lamp-third", x: 0, y: 0, w: 1 / 3, h: 1 }, { name: "far-third", x: 2 / 3, y: 0, w: 1 / 3, h: 1 });
  const w = window as unknown as { __AURA_QA__?: Record<string, unknown> };
  w.__AURA_QA__ = { ...(w.__AURA_QA__ ?? {}), crops };
}

/** DD47-P1: macro focus on the point the camera looks at (follows the aspect pull-back and the follow camera). */
let focusSent = BASE_FOCUS_DISTANCE;
function syncFocus(pose: CameraPose): void {
  const d = focusDistance(pose.position, pose.target);
  if (Math.abs(d - focusSent) < 0.05) return;
  focusSent = d;
  try { app?.post?.setEffect("depthOfField", { enabled: false, maxBlur: 0, focusDistance: d }); } catch { /* post optional */ }
}

export interface ActorPoseSample {
  readonly x: number;
  readonly y: number;
}
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

function lerpActor(a: ActorPoseSample | undefined, b: ActorPoseSample, t: number): ActorPoseSample {
  if (!a || Math.hypot(b.x - a.x, b.y - a.y) > 2.4) return b;
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

let fittedRig: CameraPose = { position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov };
let cropTick = 0;
const VENT_BASE_RGB = hexToRgb(BOARD_PARTS.vent);
const CAN_BASE_RGB = hexToRgb(BOARD_PARTS.can.color);
const PRISM_BASE_RGB = hexToRgb("#ffe0b2");

// ---------------------------------------------------------------------------
// Per-frame visual sync
// ---------------------------------------------------------------------------
export function syncVisuals(dt: number, blend?: ActorBlendState, feel?: FrameFeel): void {
  if (!app) return;
  const nodes = app.nodes;
  const m = st.maze;
  if (builtFor !== m.def.id) {
    for (const k of STATIC_POOLS) POOL[k].n = 0;
    paintMaze(m);
    paintDressing(m);
    if (submit(STATIC_POOLS) && applyBoardLook(m.def.id as MazeId)) builtFor = m.def.id as MazeId;
  }
  for (const k of DYNAMIC_POOLS) POOL[k].n = 0;
  syncSparkBursts(dt);

  // Zero-allocation batched glint pellets + power prisms (iterates active index lists only for >=60 FPS on iPhone)
  const pulse = 0.5 + 0.5 * Math.sin(st.time * (calmFlash ? 2 : 6));
  const look = BOARD_LOOKS[m.def.id as MazeId];
  const [ledR, ledG, ledB] = hexToRgb(look.led);
  const mw = m.width;
  for (let d = 0; d < m.dots.length; d++) {
    const i = m.dots[d]!;
    if (!st.dots[i]) continue;
    const x = i % mw, y = (i / mw) | 0;
    const spin = calmMotion ? (x + y) * 0.4 : st.time * 1.8 + x * 0.7 + y * 0.3;
    instRgb("dot", wx(x), 0.14, wz(y), 0.22, 0.16, 0.22, ledR, ledG, ledB, spin);
  }
  const vt = pulse * 0.65;
  const ventR = VENT_BASE_RGB[0] + (1 - VENT_BASE_RGB[0]) * vt;
  const ventG = VENT_BASE_RGB[1] + (0.957 - VENT_BASE_RGB[1]) * vt;
  const ventB = VENT_BASE_RGB[2] + (0.839 - VENT_BASE_RGB[2]) * vt;
  for (let o = 0; o < m.orbs.length; o++) {
    const i = m.orbs[o]!;
    if (!st.orbs[i]) continue;
    const x = i % mw, y = (i / mw) | 0;
    const orbSpin = calmMotion ? 0.4 : st.time * 1.4 + x;
    const coreScale = 0.22 + pulse * 0.05;
    instRgb("orb", wx(x), 0.08, wz(y), 0.48, 0.16, 0.48, CAN_BASE_RGB[0], CAN_BASE_RGB[1], CAN_BASE_RGB[2]);
    instRgb("prism", wx(x), 0.38, wz(y), 0.48, 0.56, 0.48, PRISM_BASE_RGB[0], PRISM_BASE_RGB[1], PRISM_BASE_RGB[2], orbSpin);
    instRgb("vent", wx(x), 0.38, wz(y), coreScale, coreScale, coreScale, ventR, ventG, ventB, -orbSpin * 1.5);
  }
  syncTraces();
  if (st.school) {
    for (const g of st.ghosts) {
      inst("marker", wx(g.target.x), 0.035, wz(g.target.y), 0.92, 0.03, 0.92, GHOST_TINT[g.id]);
    }
  }
  for (const g of st.ghosts) {
    if (g.state !== "eyes") continue;
    const gp = blend?.mazeId === st.mazeId && blend.ghosts[g.id] ? blend.ghosts[g.id] : normGhostPos(g);
    const bob = 0.45 + Math.sin(st.time * 9 + g.px) * 0.05 * (calmMotion ? REDUCED_AMPLITUDE : 1);
    inst("eyes", wx(gp.x) - 0.08, bob, wz(gp.y), 0.14, 0.14, 0.14, CORE_COLOR);
    inst("eyes", wx(gp.x) + 0.08, bob, wz(gp.y), 0.14, 0.14, 0.14, CORE_COLOR);
  }

  const pp = blend?.mazeId === st.mazeId ? blend.courier : normPos(m);
  try {
    const moving = st.autopilot || st.hasMoved;
    const motionAmplitude = calmMotion ? REDUCED_AMPLITUDE : 1;
    const chomp = moving ? Math.abs(Math.sin(st.time * 14)) : Math.sin(st.time * 4) * 0.25;
    const bob = (moving ? chomp * 0.075 : Math.sin(st.time * 4) * 0.025) * motionAmplitude;
    const pitch = moving ? Math.sin(st.time * 14) * 0.14 * motionAmplitude : 0;
    const dead = st.mode === "dying";
    const byte = nodes.require("byte");
    const pod = nodes.get("courier-pod");
    const podEcho = nodes.get("courier-pod-echo");
    const coreY = COURIER_POD.coreHeight;
    byte.setPosition(wx(pp.x), coreY + (dead ? 0 : bob), wz(pp.y));
    courierPose = stepCourierPose(courierPose, yawOf(st.player.dir) + Math.PI, dt, calmMotion);
    const activeRoll = dead && !calmMotion ? Math.sin(st.time * 20) * 0.5 : courierPose.roll;
    const [brx, bry, brz] = localPoseToEulerZYX(dead ? 0 : -pitch, courierPose.yaw, -activeRoll);
    byte.setRotation(brx, bry, brz);
    let podK = 1;
    if (dead) {
      byte.setScale(Math.max(0.05, (st.deathT / 1.6) * 0.72));
      podK = Math.max(0.05, st.deathT / 1.6);
    } else if (st.player.dashT > 0) {
      const ds = 0.8 + Math.sin(st.time * 40) * 0.05 * motionAmplitude;
      byte.setScale([ds * 1.08, ds * 0.92, ds * 1.08]);
    } else if (moving) {
      byte.setScale([0.72 * (1 + chomp * 0.08 * motionAmplitude), 0.72 * (1 - chomp * 0.06 * motionAmplitude), 0.72 * (1 + chomp * 0.08 * motionAmplitude)]);
    } else {
      byte.setScale(0.72);
    }
    const flickerOn = !dead || calmMotion || calmFlash || Math.sin(st.time * 24) > -0.2;
    byte.setVisible(flickerOn);
    const podS = COURIER_POD.scale * podK;
    const podLean = dead ? 0 : pitch * 0.35;
    const travelYaw = courierPose.yaw - Math.PI;
    const [prx, pry, prz] = localPoseToEulerZYX(podLean, travelYaw, activeRoll);
    if (pod) {
      pod.setVisible(flickerOn);
      pod.setPosition(wx(pp.x), COURIER_POD.lift - (1 - podK) * COURIER_POD.lift + (dead ? 0 : bob * 0.5), wz(pp.y));
      pod.setRotation(prx, pry, prz);
      pod.setScale(podS);
    }
    const ex = echoOffset(m, pp.x, pp.y);
    const echo = nodes.require("byte-echo");
    if (ex) {
      const [ebrx, ebry, ebrz] = localPoseToEulerZYX(dead ? 0 : -pitch, courierPose.yaw, -courierPose.roll);
      echo.setVisible(!dead);
      echo.setPosition(wx(ex.x), coreY + bob, wz(ex.y));
      echo.setRotation(ebrx, ebry, ebrz);
      echo.setScale(0.72);
    } else echo.setVisible(false);
    if (podEcho) {
      if (ex && !dead) {
        const [eprx, epry, eprz] = localPoseToEulerZYX(podLean, travelYaw, courierPose.roll);
        podEcho.setVisible(true);
        podEcho.setPosition(wx(ex.x), COURIER_POD.lift + bob * 0.5, wz(ex.y));
        podEcho.setRotation(eprx, epry, eprz);
        podEcho.setScale(COURIER_POD.scale);
      } else {
        podEcho.setVisible(false);
        podEcho.setPosition(0, -999, 0);
      }
    }

    // Courier winged star forehead crest jewel + electric-gold hover-boot repulsor wake halo
    if (flickerOn) {
      const fx = Math.sin(travelYaw), fz = Math.cos(travelYaw);
      const vScale = dead ? Math.max(0.05, (st.deathT / 1.6) * COURIER_POD.shell) : st.player.dashT > 0 ? COURIER_POD.shell * 1.25 : COURIER_POD.shell;
      const hk = dead ? Math.max(0.05, st.deathT / 1.6) : 1;
      const visorHex = st.profile.orbColor || "#18f0ff";
      inst("hero", wx(pp.x) + fx * 0.21, 0.8 + (dead ? 0 : bob * 0.5), wz(pp.y) + fz * 0.21, vScale, 0.095, 0.075, visorHex, travelYaw);
      inst("halo", wx(pp.x), COURIER_POD.haloHeight + (dead ? 0 : bob * 0.5), wz(pp.y), COURIER_POD.halo * hk, COURIER_POD.halo * hk, COURIER_POD.halo * hk, "#ffc422", travelYaw + st.time * 3.2);
      if (ex && !dead) {
        inst("hero", wx(ex.x) + fx * 0.21, 0.8 + bob * 0.5, wz(ex.y) + fz * 0.21, vScale, 0.095, 0.075, visorHex, travelYaw);
        inst("halo", wx(ex.x), COURIER_POD.haloHeight + bob * 0.5, wz(ex.y), COURIER_POD.halo, COURIER_POD.halo, COURIER_POD.halo, "#ffc422", travelYaw + st.time * 3.2);
      }
    }

    // 4 Maze Phantoms: sculpted scalloped ghostly robes + distinct crown/horn/tiara/antenna silhouettes + glowing cartoon eyes & brows
    for (const g of st.ghosts) {
      const gp = blend?.mazeId === st.mazeId && blend.ghosts[g.id] ? blend.ghosts[g.id] : normGhostPos(g);
      const wob = Math.sin(st.time * 7 + g.px) * 0.04 * (calmMotion ? REDUCED_AMPLITUDE : 1);
      const frightened = st.fright > 0 && g.state === "active";
      const ending = frightened && st.fright < 1.8;
      const flash = ending && !calmFlash && Math.sin(st.time * 18) > 0;
      const col = !frightened ? GHOST_TINT[g.id] : flash ? OVERLOAD_FLASH : ending && calmFlash ? mixHex(OVERLOAD_COLOR, OVERLOAD_FLASH, 0.5 + 0.5 * Math.sin(st.time * Math.PI * 2)) : OVERLOAD_COLOR;
      const visorCol = frightened ? (flash ? "#ff4d5e" : "#7ee8ff") : "#ffffff";
      const hidden = g.state === "eyes" || g.state === "entering";
      if (hidden) continue;
      const k = frightened ? 0.82 + (calmMotion ? 0 : Math.sin(st.time * 14) * 0.05) : g.state === "house" ? 0.86 : 0.96;
      const yaw = yawOf(g.dir);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const turn = (speed: number): number => calmMotion ? yaw + Math.sin(st.time * speed) * REDUCED_AMPLITUDE * 0.5 : yaw + Math.sin(st.time * speed) * 0.14;
      const place = (x: number, z: number): void => {
        const y = 0.44 + wob;
        let faceYaw = yaw;
        switch (g.id) {
          case "blitz": faceYaw = yaw; inst("shC", x, y + 0.03, z, 0.72 * k, 0.88 * k, 0.72 * k, col, faceYaw); break;
          case "sly": faceYaw = turn(3.2); inst("shB", x, y + 0.02, z, 0.72 * k, 0.82 * k, 0.72 * k, col, faceYaw); break;
          case "flick": faceYaw = turn(4.1); inst("shT", x, y + 0.03, z, 0.7 * k, 0.86 * k, 0.7 * k, col, faceYaw); break;
          case "dim": faceYaw = turn(2.4); inst("shY", x, y + 0.04, z, 0.76 * k, 0.88 * k, 0.76 * k, col, faceYaw); break;
        }
        const fxFace = Math.sin(faceYaw), fzFace = Math.cos(faceYaw);
        inst("visor", x + fxFace * 0.24 * k, y + 0.11 * k, z + fzFace * 0.24 * k, 0.36 * k, 0.22 * k, 0.13 * k, visorCol, faceYaw);
        if (!frightened && g.state === "active") {
          inst("scan", x + fx * 0.72, 0.12, z + fz * 0.72, 0.42, 0.04, 0.68, GHOST_TINT[g.id], yaw);
        }
      };
      place(wx(gp.x), wz(gp.y));
      const gx = echoOffset(m, gp.x, gp.y);
      if (gx) place(wx(gx.x), wz(gx.y));
    }

    // All 8 vibrant colored faceted crystal gem caches sparkling around the perimeter pedestals
    for (let gi = 0; gi < GEM_CACHE_SPECS.length; gi++) {
      const spec = GEM_CACHE_SPECS[gi]!;
      const ped = PEDESTALS[spec.pedestalIndex];
      if (!ped) continue;
      const [px, pz] = ped;
      const gemBob = calmMotion ? 0 : Math.sin(st.time * 2.2 + spec.spinPhase) * 0.055;
      const gemSpin = st.time * (calmMotion ? 0.25 : 1.05) + spec.spinPhase;
      inst("gem", px, 0.48 + gemBob * 0.35, pz, 0.64, 0.22, 0.64, spec.hex, -gemSpin * 0.75);
      const gemNode = nodes.get(`gem-cache-${spec.id}`);
      if (gemNode) {
        gemNode.setVisible(true);
        gemNode.setPosition(px, 0.98 + gemBob, pz);
        gemNode.setRotation(calmMotion ? 0 : Math.sin(st.time * 1.7 + spec.spinPhase) * 0.07, gemSpin, 0);
        gemNode.setScale(1.04);
      }
    }

    // Bonus arcade relic — sculpted multi-material relic perched atop a spinning crown-cut crystal plinth
    const activeFruit = st.fruitActive ? m.def.fruit : null;
    if (activeFruit) {
      const bobRelic = Math.sin(st.time * 4) * (calmMotion ? 0.02 : 0.055);
      inst("gem", wx(m.fruitTile.x), 0.2 + bobRelic * 0.6, wz(m.fruitTile.y), 0.44, 0.24, 0.44, GEM_COLOR[activeFruit], st.time * 1.6);
    }
    for (const kind of BONUS_RELIC_KINDS) {
      const relicNode = nodes.get(`bonus-relic-${kind}`);
      if (!relicNode) continue;
      if (activeFruit === kind) {
        const bobRelic = Math.sin(st.time * 4) * (calmMotion ? 0.02 : 0.055);
        relicNode.setVisible(true);
        relicNode.setPosition(wx(m.fruitTile.x), 0.56 + bobRelic, wz(m.fruitTile.y));
        relicNode.setRotation(calmMotion ? 0 : Math.sin(st.time * 2.4) * 0.08, calmMotion ? 0.4 : st.time * 1.6, 0);
        relicNode.setScale(0.95);
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

  // Portrait-aware camera framing (`fitPlayRig` enlarges 390x844 mobile board footprint without clipping)
  const aspect = viewAspect();
  const aspectChanged = Math.abs(aspect - fitAspect) > 1e-3;
  if (aspectChanged) {
    fitAspect = aspect;
    const fitted = fitPlayRig({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }, aspect, FRAME_PULL_BACK);
    fittedRig = fitted.pose;
    fitK = fitted.pullBack;
  }
  const rig = fittedRig;
  if (st.camera === "overhead") {
    lastPose = rig;
  } else {
    const followScale = aspect < 0.82 ? 0.55 : 1;
    const bx = wx(pp.x) * CAMERA_RIG.followX * followScale, bz = wz(pp.y) * CAMERA_RIG.followZ * followScale;
    lastPose = {
      position: [rig.position[0] + bx, rig.position[1], rig.position[2] + bz],
      target: [rig.target[0] + bx * 0.75, rig.target[1], rig.target[2] + bz * 0.65],
      fov: rig.fov
    };
  }
  maybePlayCinematic(rig);
  const dashing = st.player.dashT > 0 && !calmMotion;
  if (dashing !== fovKicked) {
    fovKicked = dashing;
    try { app.camera?.fovKick?.set("dash", dashing ? 3 : 0, 0.08); } catch { /* camera layer optional */ }
  }
  if (!cinematic) {
    const sx = feel ? feel.shakeOffset[0] : 0;
    const sy = feel ? feel.shakeOffset[1] : 0;
    const fovDelta = feel ? feel.fovDeltaDeg : 0;
    app.camera?.setPose({
      position: [lastPose.position[0] + sx, lastPose.position[1] + sy * 0.5, lastPose.position[2] + sy],
      target: [lastPose.target[0] + sx * 0.35, lastPose.target[1], lastPose.target[2] + sy * 0.35],
      fov: Math.max(38, Math.min(58, lastPose.fov + fovDelta))
    });
  }
  syncFocus(lastPose);
  syncPracticals(pp);
  if (aspectChanged || (cropTick++ & 7) === 0) publishCrops(pp, aspect);
  app.output?.setOutputOverlay(
    st.mode === "dying" && !calmFlash ? { fade: [0.4, 0.02, 0.1, 0.45] }
    : st.fright > 0 && st.fright < 1.8 ? { vignette: [0.05, 0.05, 0.35, 0.5] }
    : {}
  );

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

/**
 * Per-board look (one row of BOARD_LOOKS): solder mask, lamp colour and intensity, grade and the clear colour. The
 * scene is authored for the board it was built on (builtLook); every other board patches the live nodes.
 */
function applyBoardLook(id: MazeId): boolean {
  const nodes = app?.nodes;
  if (!nodes) return false;
  const look = BOARD_LOOKS[id];
  // The aspect-fit camera sees past the bench on tall phones; clear to the room colour so the margin reads as the room.
  try { (app as unknown as { setClearColor?(c: string): void }).setClearColor?.(look.background); } catch { /* optional */ }
  if (!toneMapSet) {
    try { app?.output?.setOutput({ toneMapping: LENS.toneMapping, exposure: LENS.exposure, dither: true }); toneMapSet = true; } catch { /* output optional */ }
  }
  if (id === builtLook) return true;
  try {
    nodes.require("board").setMaterial(boardMaterial(look, paintBoardTextures(st.maze)));
    nodes.get("lamp")?.setLight?.({ color: look.lamp.color, intensity: look.lamp.intensity }, { transitionSeconds: 0.4 });
  } catch { return false; }
  try { app?.post?.setEffect("colorGrade", { contrast: look.grade.contrast, saturation: look.grade.saturation, temperature: look.grade.temperature, tint: look.grade.tint, lut: look.grade.lut, lutIntensity: LUT_INTENSITY }); } catch { /* post optional */ }
  builtLook = id;
  return true;
}
let builtLook: MazeId = "classic";
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
