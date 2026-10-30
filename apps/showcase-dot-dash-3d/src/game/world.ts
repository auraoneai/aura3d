// Glint Courier — scene builder + per-frame visual sync.
// World units: 1 tile = 1 unit. Maze 19×21 centered at origin:
// worldX = tile.x - 9, worldZ = tile.y - 10.

import {
  game, lights, effects, scene, camera, instances, environments, defineAuraAssets,
  primitives, material, text3D, texture, type AuraApp
} from "@aura3d/engine";
import { idx, type ParsedMaze } from "./grid.js";
import type { MazeId } from "./mazes.js";
import {
  GHOST_TINT, st, normPos, normGhostPos, type GhostId
} from "./sim.js";
import type { FruitKind } from "./grid.js";
import { fitDistanceScale, projectNdc, scalePose, type CameraPose } from "./camera.js";
import { hexToRgb, pylonLayout } from "./palette.js";
import {
  BASE_FOCUS_DISTANCE, BENCH, BOARD_LOOKS, BOARD_PARTS, BOARD_PROBE, BOUNCE, LAMP, LENS, LOOK_HDRI, MACRO_DOF,
  LUT_INTENSITY, PEDESTALS, PRACTICALS, focusDistance, type BoardLookRow
} from "./look.js";
import { TraceField } from "./traces.js";
import { dustMotesOptions } from "./vfx.js";
import {
  CLEAR_LAMP_DIM, cinematicsAllowed, clearOrbitShot, introShots, stepCourierPose, waveLevel, WAVE_SECONDS,
  type CourierPose, type ShotPlan
} from "./motion.js";
import { boxReflectionProbe } from "./engineCompat.js";
import { BOARD_BAKE, BOARD_BAKE_LOW, bakeBoardMaps, type BoardMaps } from "./boardMaterial.js";

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
    shadow: { filter: "pcss", mapSize: 2048, lightSize: 1.2, softness: 0.6, bias: 0.0004, normalBias: 0.02 }
  }).runtime(game.runtimeNode("lamp"));
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
  rail: 1700,     // silver gull-wing pins: two per corridor-facing chip side (DD47-M2)
  trace: 640,     // copper traces between corridor tile centres (signature, DD47-M1)
  traceLit: 640,  // the lit overlay over the traces the courier passed or a surge pulse crosses
  dot: 220,
  orb: 8,         // capacitor-can bodies (surge cells, DD47-M3)
  vent: 8,        // the glowing vent on top of each can
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
const STATIC_POOLS = ["wall", "rail", "trace", "dress", "glow"] as const satisfies readonly (keyof typeof CAP)[];
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
    roughness: look.maskRoughness, metalness: 0.04, clearcoat: 0.75, clearcoatRoughness: 0.14
  })
  : material.pbr({ color: look.mask, roughness: look.maskRoughness, metalness: 0.04, clearcoat: 0.75, clearcoatRoughness: 0.14 });
/** Copper traces between the corridor tiles: bare metal, no glow until the courier passes (traceLit). */
const traceMaterial = () => material.pbr({ color: "#ffffff", roughness: 0.34, metalness: 0.9 });

/** Instances that glow their own colour (E-D `instanceColorTarget: "both"`): LED lenses, vents, lit traces. */
const glowing = (emissiveIntensity: number, roughness = 0.3) =>
  material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity, roughness, metalness: 0.05, practical: true });

// ---------------------------------------------------------------------------
// Scene definition — one static graph; instanced pools get re-filled per frame.
// ---------------------------------------------------------------------------
export function buildScene(): unknown {
  const look = BOARD_LOOKS[st.mazeId];
  builtLook = st.mazeId;
  const s = scene()
    // DD47-P2 lens stack: bloom only on what glows (threshold 0.92), a soft frame, a hair of fringing and grain; the
    // per-board grade (DD47-P3) rides on top. ACES is set explicitly on the output at boot (main.ts).
    .add(effects.bloom({ name: "lamp bloom", intensity: LENS.bloom.intensity, threshold: LENS.bloom.threshold, radius: LENS.bloom.radius }))
    .add(effects.vignette({ intensity: LENS.vignette.intensity, smoothness: LENS.vignette.smoothness }))
    .add(effects.chromaticAberration({ intensity: LENS.chromaticAberration }))
    .add(effects.filmGrain({ intensity: LENS.grain }))
    .add(effects.colorGrade(gradeOf(look)))
    // DD47-P1 signature macro DOF: metric lens focused on the board centre; the post tiers run it on High and Ultra
    // only (PostQualityTiers dof), so Medium and Low stay sharp. The focus follows the aspect pull-back (syncFocus).
    .add(effects.depthOfField({ name: "macro dof", focusDistance: BASE_FOCUS_DISTANCE, fStop: MACRO_DOF.fStop, focalLength: MACRO_DOF.focalLength, maxBlur: MACRO_DOF.maxBlur }))
    // DD47-E2: the dark room past the bench, warm and thin.
    .add(effects.fog({ color: look.fog.color, density: look.fog.density }))
    // DD47-E1: the workshop HDRI fills and reflects at 0.35 and is never drawn (the bench is the surround); a box
    // probe over the board gives the glossy mask and the pins a parallax-correct reflection. No look preset: a look
    // always adds a shadowed directional key (a second caster next to the lamp). GU47(E-A): looks.preset
    // ("workbench-night") once E-A ships that look.
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
    .camera(camera.perspective({ position: CAMERA_RIG.position, target: CAMERA_RIG.target, fov: CAMERA_RIG.fov }));
  // DD47-V2: dust motes drifting in the lamp cone (60, 30 on reduced motion; additive dust-mote sprite)
  // GU47(E-F): effects.particles intersects AuraEffectNode (speed: number), which rejects the emitter's range fields;
  // the cast passes the documented AuraParticleEmitterOptions through unchanged.
  type ParticleOptions = Parameters<typeof effects.particles>[0];
  s.add(effects.particles(dustMotesOptions({ reducedMotion: calmMotion }) as unknown as ParticleOptions).runtime(game.runtimeNode("lamp-motes")));
  for (let i = 0; i < PRACTICALS.pooled; i++) {
    s.add(lights.point({ name: `event light ${i}`, position: [0, -40, 0], color: PRACTICALS.surge.color, intensity: 0, distance: PRACTICALS.surge.distance, decay: PRACTICALS.surge.decay, shadow: false }).runtime(game.runtimeNode(`event-light-${i}`)));
  }

  // IMPORTANT: In Aura3D's instanced shader, v_instanceColor multiplies u_baseColor (color); the emissive term only
  // takes the instance colour on pools with `instanceColorTarget: "both" | "emissive"` (E-D). Never set a white
  // emissive on a "base" pool, or every instance emits pure white regardless of its colour.
  const P = BOARD_PARTS;
  // DD47-M2: black epoxy chip bodies (rounded) and silver gull-wing pins; lit by the lamp, no emissive fill.
  const wallMat = material.pbr({ color: "#ffffff", roughness: P.epoxy.roughness, metalness: 0.05, clearcoat: P.epoxy.clearcoat, clearcoatRoughness: 0.3 });
  const pinMat = material.pbr({ color: "#ffffff", roughness: P.pin.roughness, metalness: P.pin.metalness });
  // DD47-M3: SMD LED shards (a glowing lens in the board's LED colour) and capacitor cans with glowing vents.
  const dotMat = glowing(1.35, 0.2);
  const canMat = material.pbr({ color: P.can.color, roughness: P.can.roughness, metalness: P.can.metalness });
  const ventMat = glowing(1.6, 0.4);
  const markerMat = material.pbr({ color: "#ffffff", roughness: 0.4, metalness: 0.05 });
  const eyesMat = material.pbr({ color: "#ffffff", roughness: 0.25, metalness: 0.05 });
  const dressMat = material.pbr({ color: "#ffffff", roughness: 0.46, metalness: 0.2 });
  const glowMat = glowing(1.1, 0.35);
  const traceLitMat = glowing(1.8, 0.3);

  // Courier: a bright cyan-white core inside a faceted glass shell and a spinning copper-lit ring.
  const coreMat = material.emissive({ color: "#bffcff", emissive: "#6ff2ff", emissiveIntensity: 1.6 });
  const shellMat = material.pbr({ color: "#ffffff", emissive: "#2fb8c8", emissiveIntensity: 0.1, roughness: 0.12, metalness: 0.2, clearcoat: 1, opacity: 0.72 });
  const haloMat = material.pbr({ color: "#ffffff", emissive: "#ffb23e", emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.3, practical: true });
  // Sentries: one distinct silhouette each; per-instance colour carries identity and the surge state; a cool rim keeps
  // them readable in the lamp's shadow side without glowing.
  const sentryMat = material.pbr({ color: "#ffffff", roughness: 0.32, metalness: 0.35, rim: { color: "#cfe3ff", power: 2.6, intensity: 0.7 } });
  const gemMat = glowing(0.45, 0.15);

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
    // instanced pools
    instances.roundedBox({ name: "walls", params: { radius: 0.12, widthSegments: 2 }, size: [1, 1, 1], material: wallMat, transforms: pad(CAP.wall), castShadow: true, receiveShadow: true }).runtime(game.runtimeNode("pool-wall")),
    instances.box({ name: "pins", size: [1, 1, 1], material: pinMat, transforms: pad(CAP.rail), castShadow: false }).runtime(game.runtimeNode("pool-rail")),
    instances.box({ name: "traces", size: [1, 1, 1], material: traceMaterial(), transforms: pad(CAP.trace), castShadow: false, receiveShadow: true }).runtime(game.runtimeNode("pool-trace")),
    instances.box({ name: "traces lit", size: [1, 1, 1], material: traceLitMat, instanceColorTarget: "emissive", transforms: pad(CAP.traceLit), castShadow: false }).runtime(game.runtimeNode("pool-traceLit")),
    instances.box({ name: "shards", size: [1, 1, 1], material: dotMat, instanceColorTarget: "both", transforms: pad(CAP.dot), castShadow: false }).runtime(game.runtimeNode("pool-dot")),
    instances.cylinder({ name: "cells", size: [1, 1, 1], material: canMat, transforms: pad(CAP.orb), castShadow: true }).runtime(game.runtimeNode("pool-orb")),
    instances.cylinder({ name: "cell vents", size: [1, 1, 1], material: ventMat, instanceColorTarget: "both", transforms: pad(CAP.vent), castShadow: false }).runtime(game.runtimeNode("pool-vent")),
    instances.box({ name: "markers", size: [1, 1, 1], material: markerMat, transforms: pad(CAP.marker), castShadow: false }).runtime(game.runtimeNode("pool-marker")),
    instances.sphere({ name: "eyes", size: [1, 1, 1], material: eyesMat, transforms: pad(CAP.eyes), castShadow: false }).runtime(game.runtimeNode("pool-eyes")),
    instances.box({ name: "dress", size: [1, 1, 1], material: dressMat, transforms: pad(CAP.dress), castShadow: true }).runtime(game.runtimeNode("pool-dress")),
    instances.box({ name: "glow", size: [1, 1, 1], material: glowMat, instanceColorTarget: "both", transforms: pad(CAP.glow), castShadow: false }).runtime(game.runtimeNode("pool-glow")),
    instances.polyhedron({ name: "courier-shell", params: { variant: "octahedron" }, size: [1, 1, 1], material: shellMat, transforms: pad(CAP.hero), castShadow: true }).runtime(game.runtimeNode("pool-hero")),
    instances.torus({ name: "courier-halo", size: [1, 1, 1], material: haloMat, transforms: pad(CAP.halo), castShadow: false }).runtime(game.runtimeNode("pool-halo")),
    instances.cone({ name: "sentry-hunter", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shC), castShadow: true }).runtime(game.runtimeNode("pool-shC")),
    instances.box({ name: "sentry-ambusher", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shB), castShadow: true }).runtime(game.runtimeNode("pool-shB")),
    instances.torus({ name: "sentry-drifter", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shT), castShadow: true }).runtime(game.runtimeNode("pool-shT")),
    instances.cylinder({ name: "sentry-skittish", size: [1, 1, 1], material: sentryMat, transforms: pad(CAP.shY), castShadow: true }).runtime(game.runtimeNode("pool-shY")),
    instances.polyhedron({ name: "gems", params: { variant: "icosahedron" }, size: [1, 1, 1], material: gemMat, instanceColorTarget: "both", transforms: pad(CAP.trophy), castShadow: true }).runtime(game.runtimeNode("pool-trophy")),

    // courier core: a small bright sphere (also the trail anchor); shell, halo, sentries and gems are instanced pools above
    primitives.sphere({ name: "byte", size: [0.34, 0.34, 0.34], material: coreMat, castShadow: false })
      .position(wx(st.maze.spawn.x), 0.36, wz(st.maze.spawn.y))
      .runtime(game.runtimeNode("byte")),
    primitives.sphere({ name: "byte-echo", size: [0.34, 0.34, 0.34], material: coreMat, castShadow: false })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("byte-echo")),

    // ghost house door slab + school beacon (both are light sources in the fiction: a gate LED bar and a beam)
    primitives.box({ name: "door", size: [1.02, 0.5, 0.12], material: material.pbr({ color: "#ffd9a0", emissive: "#ffb23e", emissiveIntensity: 0.65, roughness: 0.4, opacity: 0.78, practical: true }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("door")),
    primitives.cylinder({ name: "school-beam", size: [0.35, 3.2, 0.35], material: material.pbr({ color: "#ffb23e", emissive: "#ffb23e", emissiveIntensity: 0.65, roughness: 0.4, opacity: 0.45, practical: true }) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("school-beam"))
  ]);

  // DD47-W1 silkscreen and mounting holes (+3 draws): two SDF labels laid flat on the mask in the board's silk ink and
  // four gold plated mounting rings in one instanced draw, inside the board margin clear of the maze and the kit.
  const silk = material.pbr({ color: look.silk, roughness: 0.7, metalness: 0 });
  const holes = BENCH.board.size[0] / 2 - 1, holesZ = BENCH.board.size[2] / 2 - 1;
  s.addMany([
    text3D("GLINT COURIER  REV 4.7", { name: "silk title", size: 0.42, depth: 0.004, letterSpacing: 0.08, backend: "sdf", material: silk })
      .position(-4.6, 0.004, 11.7).rotate(-Math.PI / 2, 0, 0),
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

function paintMaze(m: ParsedMaze): void {
  const look = BOARD_LOOKS[m.def.id as MazeId];
  const epoxy = BOARD_PARTS.epoxy.color;
  const pin = BOARD_PARTS.pin.color;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      const X = wx(x), Z = wz(y);
      if (!m.wall[i]) continue;
      inst("wall", X, 0.3, Z, 0.9, 0.6, 0.9, epoxy);
      for (const [dx, dy] of PIN_SIDES) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height || m.wall[idx(m.width, nx, ny)]) continue;
        for (const t of [-0.22, 0.22]) {
          // a pin leaves the body at its foot and bends down to the pad: one flat box per pin
          const px = X + (dx !== 0 ? dx * 0.5 : t), pz = Z + (dy !== 0 ? dy * 0.5 : t);
          inst("rail", px, 0.05, pz, dx !== 0 ? 0.16 : 0.09, 0.05, dy !== 0 ? 0.16 : 0.09, pin);
        }
      }
    }
  }
  // copper traces between corridor tile centres (the lit overlay follows them, syncTraces)
  traces = new TraceField(m);
  for (const e of traces.edges) {
    inst("trace", wx(e.x), 0.004, wz(e.y), e.horizontal ? 1.02 : 0.12, 0.012, e.horizontal ? 0.12 : 1.02, look.copper);
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


/** Perimeter components per board theme: epoxy pedestals under spinning gems with LED caps, plus component stubs. */
function paintDressing(m: ParsedMaze): void {
  const look = BOARD_LOOKS[m.def.id as MazeId];
  const body = BOARD_PARTS.epoxy.color;
  PEDESTALS.forEach(([px, pz]) => {
    inst("dress", px, 0.22, pz, 1.25, 0.44, 1.25, body);
    inst("glow", px, 0.45, pz, 1.05, 0.06, 1.05, look.led);
  });
  // component stubs: layout seeded from the board id, height and count from its theme
  for (const py of pylonLayout(m.def.id, m.def.theme)) {
    inst("dress", py.x, py.h * 0.5, py.z, py.w, py.h, py.w, body);
    if (py.cap) inst("glow", py.x, py.h + 0.06, py.z, py.w * 0.76, 0.1, py.w * 0.76, look.led);
  }
}

/** Spinning trophy gems on the pedestals (dynamic: they bob and turn; steady on reduced motion). */
function paintTrophies(): void {
  PEDESTALS.forEach(([px, pz], i) => {
    const bob = calmMotion ? 0 : Math.sin(st.time * 2 + i) * 0.06;
    inst("trophy", px, 1.05 + bob, pz, 0.78, 0.78, 0.78, TROPHY_COLORS[i % TROPHY_COLORS.length]!, st.time * (calmMotion ? 0.3 : 1.1) + i);
  });
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
  try { app?.post?.setEffect("depthOfField", { focusDistance: d }); } catch { /* post optional */ }
}

// ---------------------------------------------------------------------------
// Per-frame visual sync
// ---------------------------------------------------------------------------
export function syncVisuals(dt: number): void {
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

  // dots & power orbs: SMD LED shards in the board's LED colour; surge cells are capacitor cans whose vents breathe
  const pulse = 0.5 + 0.5 * Math.sin(st.time * (calmFlash ? 2 : 6));
  const look = BOARD_LOOKS[m.def.id as MazeId];
  const ventCol = mixHex(BOARD_PARTS.vent, "#fff1c9", pulse * 0.6);
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = idx(m.width, x, y);
      if (st.dots[i]) inst("dot", wx(x), 0.12, wz(y), 0.28, 0.08, 0.18, look.led, calmMotion ? (x + y) * 0.4 : st.time * 1.6 + x * 0.7 + y * 0.3);
      if (st.orbs[i]) {
        inst("orb", wx(x), 0.3, wz(y), 0.44, 0.6, 0.44, BOARD_PARTS.can.color);
        inst("vent", wx(x), 0.61, wz(y), 0.32, 0.03, 0.32, ventCol);
      }
    }
  }
  syncTraces();
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
    // DD47-AN1: the drawn yaw eases toward the travel direction (90 ms) and the courier banks into the turn
    courierPose = stepCourierPose(courierPose, yawOf(st.player.dir) + Math.PI, dt, calmMotion);
    byte.setRotation(dead ? 0 : pitch, courierPose.yaw, dead && !calmMotion ? Math.sin(st.time * 20) * 0.5 : courierPose.roll);
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
      echo.setRotation(dead ? 0 : pitch, courierPose.yaw, courierPose.roll);
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
  maybePlayCinematic(rig);
  // DD47-C1 dash fovKick +3 deg while dashing (layer eases it back)
  const dashing = st.player.dashT > 0 && !calmMotion;
  if (dashing !== fovKicked) {
    fovKicked = dashing;
    try { app.camera?.fovKick?.set("dash", dashing ? 3 : 0, 0.08); } catch { /* camera layer optional */ }
  }
  if (!cinematic) app.camera?.setPose({ position: lastPose.position, target: lastPose.target, fov: lastPose.fov });
  syncFocus(lastPose);
  syncPracticals(pp2);
  publishCrops(pp2, aspect);
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
    try { app?.output?.setOutput({ toneMapping: LENS.toneMapping }); toneMapSet = true; } catch { /* output optional */ }
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

