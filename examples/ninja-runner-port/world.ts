/**
 * Shadowstep Gauntlet world on the public `@aura3d/engine` surface. The ground is lit PBR (one mesh per biome and surface);
 * the village, rooftops, crossing, forest and valley are instanced scenery: procedural PBR layers plus generated Meshy
 * models (`scenery.ts`, `models.ts`). Lighting is the engine's neutral-room environment (the authored HDRI node does not
 * load, see `buildWorld`) with the hemisphere "sky fill" counted as ambient, a sun with two shadow cascades (`?shadow=0`
 * turns them off) and a cool rim light, with exponential fog, ambient
 * occlusion (high quality only), bloom, a colour grade, a vignette and FXAA. The sky, river, falls, spirit flames, spiral
 * orb, gale star, auras and particles keep their ported `material.custom` shaders. Characters come from four rigged GLBs
 * (hero, soldier, brute, sage; one `cloneSkinned` call each): the hero, three shadow clones, six soldiers, two brutes and
 * the sage stand-in have independent skeletons and animation, told apart by tint, scale and attached weapons.
 */
import { attachRootRenderSource, camera, cameras, effects, geometry, instances, material, primitives, scene, texture, type AuraApp, type TypedGLBActor } from "@aura3d/engine";
import { groundFrame, laneOffset, smooth, COURSE_LENGTH } from "./course";
import { auraSpec, ballSpec, fallsSpec, flameSpec, particleSpec, skySpec, slashSpec, solidSpec, sparksSpec, threatRingSpec, waterSpec } from "./materials";
import { buildRouteGroups, buildSheet, buildTownFloor, buildWater } from "./meshes";
import { hexLinear, type Rgb } from "./palette";
import { LAYERS, buildProceduralCourseAccents, buildScenery, cameraEye, type LayerSpec, type ModelSink, type ShapeId, type SurfaceKey } from "./scenery";
import { unitBox, unitCone, unitCrescentArc, unitCylinder, unitDisc, unitGable, unitHip, unitRock, unitSphere, type Shape } from "./shapes";
import { normalFromHeight, paintBark, paintCobble, paintDirt, paintGrass, paintLeaf, paintPlanks, paintPlaster, paintTiles, type Raster } from "./textures";
import type { CameraShake } from "@aura3d/engine/game";
import { Batch, CORRIDOR_BOUNDS } from "../shared/runner-kit";
import { createFlipbookAtlas } from "../../apps/showcase-port-shared/vfx-pack";
import type { ImpactRig } from "../../apps/showcase-port-shared/feel";
import { TIER_FEEDBACK, pieceScale, spawnPieces, stepPieces, type Piece } from "./impact";
import { TUNING, crosshairTarget, isEnemy, seededRandom, type RamTier, type Entity, type EnemyKind, type SimEvent, type SimState } from "./sim";
import { EVENING_SLOT_MODEL, MESHY07_ENEMY_CLIPS, SLOT_MODEL, type CharacterId } from "./models";
import { buildProceduralActorNodes, createProceduralActorAssets, syncProceduralActorSceneNodes } from "./art/proceduralActors";
import { eveningSetPieces, shrineCentre } from "./setpieces";
import {
  buildBarrierHazardNodes,
  buildKanaboWeaponNode,
  buildKatanaWeaponNode,
  buildPagodaSetpieceNode,
  buildPickupPropNode,
  buildProceduralDistrictBatches,
  buildShrineGateSetpieceNode,
  buildShurikenStarNode,
  buildSpikedBeamHazardNode,
  buildWaterWheelSetpieceGroup,
  shinobiActorMaterialOverrides
} from "./art/proceduralModels";
import { ENVIRONMENT_GAIN, EVENING_FILL, EVENING_FOG_FAR, EVENING_FOG_NEAR, KEY_GAIN, EVENING_SURFACES, LANTERN_GLOW, LANTERN_POOL, WOODBLOCK_POST, DISTRICT_LOOKS, lanternGlowAt, linearToHex, lookAtDistance, nearestLanterns, type DistrictId, type LanternGlow, type LookMode } from "./districtLook";
import { lanternPoolSize, lightRig, shadowTuneFromSearch } from "./lighting";
import { SCARF, registerNinjaVfx, type NinjaVfx, type NinjaVfxEvent } from "./vfx";
import { DASH_KICK_DEG, DASH_KICK_HALFLIFE, ROLL_HALFLIFE, blendIntro, cinematicsOn, gateConeLanterns, laneRoll, winPose, type ShotPose } from "./cinematics";
import { labCameraOptions, readLabFlags } from "../shared/lab-flags";

/** The rig faces +Z; characters are turned so +Z points along the route (or back at the runner). */
const MODEL_YAW_OFFSET = 0;
export const ACTOR_COUNT = 13;
const HERO = 0;
const CLONE_SLOTS = [1, 2, 3] as const;
const ENEMY_SLOTS = [4, 5, 6, 7, 8, 9, 10, 11] as const;
/** The sage model stands in for the hero in the Sage and Beast forms (slot 12); heavy enemies use the brute slots. */
const SAGE = 12;
const BRUTE_SLOTS = [10, 11] as const;
const SOLDIER_SLOTS = [4, 5, 6, 7, 8, 9] as const;
/** GU47 meshy07: evening-only robed-caster and scout slots (`EVENING_SLOT_MODEL`); the enemy window stays at eight. */
const CASTER_SLOTS = [13, 14, 15] as const;
const SCOUT_SLOTS = [16, 17, 18] as const;
const EVENING_ENEMY_SLOTS = [...ENEMY_SLOTS, ...CASTER_SLOTS, ...SCOUT_SLOTS] as const;
/** True when the actors were loaded with the meshy07 enemy slots (evening look). */
const hasMeshy07Slots = (count: number): boolean => count >= EVENING_SLOT_MODEL.length;
const BONES = { handR: "RightHand", foreR: "RightForeArm", handL: "LeftHand" } as const;
const PARTICLES = 480;
/** NR-17 cross-fade time between looping hero clips (s). */
const LOCOMOTION_FADE = 0.15;
const BARRIER_POOL = 8;
const BEAM_POOL = 8;
const PLANK_POOL = 32, STRAP_POOL = 12, BEAM_PIECE_POOL = 12;
const SHURIKEN_POOL = 3;
const THREAT_POOL = 1;
const SLASH_POOL = 6;
const FLIPBOOK_POOL = 4;
const PICKUP_PROP_POOL = 6;
const TOWN_FLOOR_Y = 3.2;

/** Canonical clip names: every character GLB is merged with these names (see tools/crayon-capture/ninja-runner-meshy-merge.mjs). */
const CLIPS = {
  run: "run", jump: "jump", idle: "idle", slide: "slide", punch: "punch", jab: "jab", sword: "sword",
  block: "block", hit: "hit", death: "death"
} as const;
const ENEMY_ATTACK_CLIP: Record<EnemyKind, string> = { scout: CLIPS.jab, swordsman: CLIPS.sword, caster: CLIPS.block, heavy: CLIPS.punch };

type Scene = ReturnType<typeof scene>;
type Vec3 = [number, number, number];
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function defineShape(s: Shape) {
  return geometry.define({ positions: f32(s.positions), normals: f32(s.normals), uvs: f32(s.uvs), indices: Uint32Array.from(s.indices) });
}
const SHAPES: Record<ShapeId, () => Shape> = {
  box: unitBox, gable: unitGable, hip: unitHip, cylinder: () => unitCylinder(10), cone: () => unitCone(9), sphere: () => unitSphere(12, 8), rock: () => unitRock(7), cliff: () => unitRock(11, 28, 18, true)
};
type TextureHandle = ReturnType<typeof texture.canvas>;
interface Surface { readonly albedo: TextureHandle; readonly normal?: TextureHandle }

const canvasOf = (rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return c;
};

/** Upload a painted raster as a repeating base-colour map and, with a strength, a normal map from its height field. */
function surface(r: Raster, normalStrength: number | null, repeat: readonly [number, number] = [1, 1]): Surface {
  const make = (rgba: Uint8ClampedArray, space: "srgb" | "linear"): TextureHandle => {
    const t = texture.canvas({ canvas: canvasOf(rgba, r.width, r.height), colorSpace: space });
    t.wrapS = "repeat"; t.wrapT = "repeat"; t.anisotropy = 8; t.repeat = repeat;
    return t;
  };
  return { albedo: make(r.rgba, "srgb"), ...(normalStrength !== null ? { normal: make(normalFromHeight(r, normalStrength), "linear") } : {}) };
}

const mapped = (s: Surface, color: string, roughness: number, extra: { metallic?: number } = {}) => material.pbr({
  color, roughness, ...(extra.metallic !== undefined ? { metallic: extra.metallic } : {}), texture: s.albedo as never, textureAnisotropy: 8,
  ...(s.normal ? { normal: s.normal, normalScale: 1 } : {})
});

type PathKind = "cobble" | "tiles" | "planks" | "dirt";
const PATH_SURFACE: Record<string, readonly [PathKind, string]> = {
  village: ["cobble", "#ffffff"], alley: ["cobble", "#d6cabb"], stairs: ["cobble", "#ffffff"], rooftops: ["tiles", "#ffffff"], descent: ["cobble", "#ffffff"],
  riverside: ["cobble", "#d6cabb"], bridge: ["planks", "#ffffff"], forest_entry: ["dirt", "#ffffff"], forest: ["dirt", "#ffffff"], forest_exit: ["dirt", "#ffffff"], water: ["cobble", "#ffffff"]
};
const VERGE_TINT: Record<string, string> = {
  village: "#ffffff", alley: "#ffffff", stairs: "#ffffff", rooftops: "#b0a298", descent: "#ffffff", riverside: "#ffffff", bridge: "#ffffff", forest_entry: "#8fb088", forest: "#8fb088", forest_exit: "#8fb088", water: "#ffffff"
};

/**
 * GU47 phase 4: the evening's rooftop run is laid in indigo glazed tiles (PRD 6.1 G20 palette, indigo #2b3550). The
 * 4.6.2 teal-green tile was a sibling tell against Serpentine Sky Run ("teal tile edges", judge g20p4 sibling, 0.593 same).
 */
const EVENING_ROOF_TILE = "#46598a";

function paintSurfaces(evening = false) {
  return {
    cobble: surface(paintCobble(512, 1), 2.4), dirt: surface(paintDirt(256, 2), 1.6), tiles: surface(paintTiles(256, 3, evening ? EVENING_ROOF_TILE : "#527c70"), 1.8, [0.5, 0.5]),
    planks: surface(paintPlanks(256, 4), 1.4), grass: surface(paintGrass(256, 5), 0.8)
  } as const;
}

const layerSurface = (key: SurfaceKey, repeat: readonly [number, number]): Surface => {
  switch (key) {
    case "plaster": return surface(paintPlaster(256, 6), 0.9, repeat);
    case "tiles": return surface(paintTiles(256, 9, "#e6e6e6"), 1.8, repeat);
    case "bark": return surface(paintBark(128, 7), 1.6, repeat);
    case "leaf": return surface(paintLeaf(256, 8), 2.2, repeat);
  }
};

/** A layer's material; the evening (GU47 NR-11 / WP-23) lacquers the roofs/trim and glazes the damp rocks. */
const layerMaterial = (l: LayerSpec, evening = false) => {
  if (l.emissive) return material.emissive({ color: "#fff1d6", emissive: l.emissive });
  const coat = evening ? EVENING_SURFACES[l.id] : undefined;
  const roughness = coat?.roughness ?? l.roughness;
  const surf = l.map ? layerSurface(l.map, l.repeat ?? [1, 1]) : null;
  const maps = surf ? { texture: surf.albedo as never, textureAnisotropy: 8, ...(surf.normal ? { normal: surf.normal, normalScale: 1 } : {}) } : {};
  if (coat) {
    const factory = l.id === "rocks" ? material.ceramic : material.lacquer;
    return factory({ color: "#ffffff", roughness, metallic: l.metalness, clearcoat: coat.clearcoat, clearcoatRoughness: coat.clearcoatRoughness, ...maps });
  }
  return surf ? mapped(surf, "#ffffff", roughness, { metallic: l.metalness }) : material.pbr({ color: "#ffffff", roughness, metallic: l.metalness });
};

/** Column-major model matrix: uniform scale, yaw about +Y, translation. */
export function modelMatrix(x: number, y: number, z: number, yaw: number, scale: number): number[] {
  return modelMatrixInto(new Array<number>(16), x, y, z, yaw, scale);
}

/** `modelMatrix` written into `out` (no allocation; the actors reuse one matrix each per frame). */
export function modelMatrixInto(out: number[], x: number, y: number, z: number, yaw: number, scale: number): number[] {
  const c = Math.cos(yaw) * scale, s = Math.sin(yaw) * scale;
  out[0] = c; out[1] = 0; out[2] = -s; out[3] = 0;
  out[4] = 0; out[5] = scale; out[6] = 0; out[7] = 0;
  out[8] = s; out[9] = 0; out[10] = c; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

/** Flame sprite the original draws on a 128 x 128 canvas (`texture.canvas`, bound by R-26). */
export function drawFlame(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "#cfffffee"); g.addColorStop(0.42, "#51dfffbb"); g.addColorStop(1, "#19c4ff00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.save();
  ctx.shadowColor = "#83efff"; ctx.shadowBlur = 14; ctx.fillStyle = "#c7ffff";
  ctx.beginPath(); ctx.moveTo(72, 17); ctx.bezierCurveTo(45, 38, 28, 52, 36, 77); ctx.bezierCurveTo(45, 106, 89, 99, 92, 73); ctx.bezierCurveTo(95, 49, 65, 54, 72, 17); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#107694"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(49, 82); ctx.bezierCurveTo(34, 57, 73, 48, 78, 66); ctx.bezierCurveTo(82, 83, 59, 89, 56, 75); ctx.bezierCurveTo(53, 64, 68, 60, 68, 72); ctx.moveTo(48, 79); ctx.lineTo(40, 92); ctx.lineTo(58, 87); ctx.stroke();
}

export interface SpiritPickup { readonly id: number; readonly s: number; readonly position: readonly [number, number, number] }

export function spiritPickups(entities: readonly Entity[]): SpiritPickup[] {
  return entities.filter((e) => e.type === "spirit").map((e) => {
    const p = groundFrame(e.s, e.lane * laneOffset(e.s), 1.12);
    return { id: e.id, s: e.s, position: [p.x, p.y, p.z] as const };
  });
}

interface Tint { readonly base: readonly [number, number, number, number]; readonly emissive?: Rgb; readonly strength?: number; readonly roughness?: number; readonly metallic?: number }
const FORM_TINT: Record<string, Tint> = {
  base: { base: [1, 1, 1, 1], emissive: [0.03, 0.02, 0], strength: 0.1 },
  sage: { base: [1, 1, 1, 1], emissive: [1, 0.5, 0.12], strength: 0.16 },
  beast: { base: [1, 0.86, 0.5, 1], emissive: [1, 0.62, 0.1], strength: 0.4 }
};
const ENEMY_TINT: Record<EnemyKind, readonly [number, number, number, number]> = {
  scout: [1, 0.8, 0.72, 1], swordsman: [0.8, 0.86, 1, 1], caster: [0.92, 0.8, 1, 1], heavy: [1, 1, 1, 1]
};
/**
 * `TypedGLBActor.setTint` (legacy path) defaults the emissive colour to the tint's base colour at strength 0.28, and the surface to
 * roughness 0.38 / metallic 0.16. An enemy tinted with only a `base` (heavy was [1,1,1]) therefore glowed white over its whole
 * atlas, which is what bleached the Boar guardian (brute) and the casters to a flat pale grey. Enemies pass an explicit
 * no-glow tint with a rougher, less metallic surface so the authored atlas shows and the armour stops mirroring the sky probe.
 */
const enemyTint = (base: readonly [number, number, number, number]): Tint => ({ base, emissive: [0, 0, 0], strength: 0, roughness: 0.9, metallic: 0.2 });

/**
 * The two meshy07 enemy rigs (owl caster, fox scout) show their own authored texture colours: a plain white base multiply with no
 * glow. An earlier pass multiplied them by a violet and a russet tint, which painted each one a single flat colour and hid the
 * texture (the owner saw solid purple enemies). The bleaching those tints were meant to fix came from `TypedGLBActor.setTint`
 * defaulting to a white emissive glow, which `enemyTint` already switches off. The 4.6.2 soldier, brute and sage atlases keep the
 * mild `ENEMY_TINT`.
 */
const MESHY07_TINT: Partial<Record<CharacterId, readonly [number, number, number, number]>> = {
  caster: [1, 1, 1, 1],
  scout: [1, 1, 1, 1]
};
/** WP-23: Spectral sumi-indigo + spirit-cyan rim silhouette on shadow clones (prevents warm clothes washing out pink). */
const CLONE_TINT: Tint = { base: [0.10, 0.16, 0.30, 1], emissive: [0.14, 0.64, 0.96], strength: 0.72, roughness: 0.28, metallic: 0.32 };
const FLASH_TINT: Tint = { base: [1, 1, 1, 1], emissive: [1, 1, 1], strength: 1.4 };

export interface ActorAssets {
  readonly actors: readonly TypedGLBActor[];
  readonly clip: string;
  readonly clipDuration: number;
  /** Clip durations per actor slot (each character GLB has its own clip set). */
  readonly slotDurations: readonly Readonly<Record<string, number>>[];
  readonly slotClips: readonly (readonly string[])[];
  /** Character model per actor slot (`SLOT_MODEL`, or `EVENING_SLOT_MODEL` in the evening look). */
  readonly slotModels: readonly CharacterId[];
  readonly sharedTextureEntries: number;
  readonly sharedTextureRefs: number;
  readonly clips: readonly string[];
  dispose(): void;
}

/** Procedural multi-material Sengoku character rigs (`art/proceduralActors.ts`) for hero, clones, soldiers, brutes, sage, casters & scouts. */
export async function loadActors(_canvas: HTMLCanvasElement, onProgress?: (done: number, total: number, id: CharacterId) => void, mode: LookMode = "original"): Promise<ActorAssets> {
  return createProceduralActorAssets(onProgress, mode);
}

export interface WorldOptions {
  readonly canvas: HTMLCanvasElement; readonly actors: ActorAssets; readonly entities: readonly Entity[]; readonly quality?: "low" | "high";
  /** Camera shake the loop's impact feedback adds trauma to. */ readonly shake: CameraShake;
  /** GU47: `evening` (default) or `original` (`?look=original`, the pre-GU47 midday look). */ readonly mode?: LookMode;
  /** prefers-reduced-motion: VFX emission halves (PRD §6.3). */ readonly reducedMotion?: boolean;
  /** `?lanterns=0`: no pooled lantern lights (NR-03 comparison). */ readonly lanterns?: boolean;
  /** `?scarf=0`: no scarf ribbon (NR-15 comparison). */ readonly scarf?: boolean;
  /** `?godrays=1`: volumetric god rays (NR-07; off by default since GU47 phase 2, see main.ts). */ readonly godRays?: boolean;
  /** `?cones=0`: no gate light cones (NR-16 comparison). */ readonly cones?: boolean;
  /** `?vfx=0`: no runtime VFX pack, ambients or scarf (GU47 phase 2 frame-cost ablation). */ readonly vfx?: boolean;
  /** `?ink=0` / `?grain=0`: drop the evening ink line / film grain (GU47 phase 2 frame-cost ablation). */ readonly ink?: boolean;
  readonly grain?: boolean;
  /** WP-23 visual-only katana-deflect / dash impact rig (stepped on real dt in main.ts). */ readonly impactRig?: ImpactRig;
}

export interface WorldRuntime {
  update(state: SimState, dt: number, time: number, events: readonly SimEvent[]): void;
  resetCamera(): void;
  /** GU47 NR-18 intro: 0 on the title card, rising to 1 at the end of the countdown; null once the run is live. */
  setIntro(k: number | null): void;
  /** A new run starts: every spirit flame is back, debris and enemy slots clear. */
  resetRun(): void;
  /** World translation of `joint` on every actor after posing each at a staggered clip phase (independence probe). */
  probeBones(joint?: string): { joint: string; translations: [number, number, number][]; distinct: number };
  /** GU47: the active look, district, scarf ribbon and lantern pool (QA). */
  readonly look: () => { mode: LookMode; district: DistrictId | null; scarf: { length: number; points: number } | null; lights: { amber: number; cyan: number } };
  readonly stats: () => { visibleActors: number; actors: number; pickups: number; particles: number; debris: number; threat: { target: number; from: number; to: number } | null };
  dispose(): void;
}

/** The sun's cascaded shadow; `?shadow=0` restores the blob-only look. */
const SUN_SHADOW = !(typeof location !== "undefined" && new URLSearchParams(location.search).get("shadow") === "0");
/**
 * The 4.3.0 shadow fit (`__A3D_SHADOW_FIT__ = "current"`) stays on for this page. The default 4.2.0 fit widens every
 * cascade to the bounds of every caster, and this course's instanced houses, trees and rocks each span the full 2.6 km
 * route, so the 2048 texel maps cover kilometres: measured on remote SwiftShader (g20-after-vshadow, g20-after2-vrender)
 * the 4.2.0 fit darkens the whole frame by about 5.5 luma (118.5 to 112.9 mean) with no visible shadow shapes, while the
 * 4.3.0 fit matches the no-shadow frame within 0.4 and draws real shadows. The sky dome no longer casts either way.
 * The 4.3.0 fit has no real-GPU frame for this game; `?shadowfit=legacy` restores the 4.2.0 fit for that check.
 */
if (SUN_SHADOW) (globalThis as { __A3D_SHADOW_FIT__?: string }).__A3D_SHADOW_FIT__ = "current";
/** GU47 phase 4 A/B: `?fillx=` scales the evening's IBL and hemisphere fill, `?keyx=` the key (presentation only). */
const LOOK_AB = (() => {
  const p = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
  const n = (k: string) => { const v = Number(p.get(k)); return p.has(k) && Number.isFinite(v) && v >= 0 ? v : 1; };
  return { fill: n("fillx"), key: n("keyx") };
})();
/** `?ibl=hdri`: light with the authored HDRI (a real asset ref) instead of the neutral room. */
const IBL_HDRI = typeof location !== "undefined" && new URLSearchParams(location.search).get("ibl") === "hdri";

/** GU47 phase 4: the evening's worn path stones take a soft sheen of the sky (IBL) at grazing angles; 4.6.2 keeps 0.92. */
const EVENING_PATH_ROUGHNESS = 0.68;
/** GU47 phase 6: evening valley falls bend (m). */
const FALLS_BEND = 9;

/**
 * Rock behind the evening valley falls: rounded cliffB boulders (manifest size 1.778 x 1.393 x 1.896, centred origin),
 * the same family as the valley's other rocks, whose tops sit just under the sheet's crest (end frame y + 23) so the
 * water pours over them. The sheet stands 30 m right of and 30 m past the end frame (course distance 2550, heading -z);
 * each rock keeps clear of the path centre line, or sits past the course end (z < -100), so none stands on the run.
 */
export function fallsCliff(end: { x: number; y: number; z: number }): { position: Vec3; yaw: number; scale: Vec3; tint: string }[] {
  const rock = (x: number, z: number, height: number, yaw: number) => {
    const k = height / 1.393;
    return { position: [end.x + x, end.y + 22 - height / 2, end.z + z] as Vec3, yaw, scale: [k, k, k] as Vec3, tint: "#9c8a7a" };
  };
  return [rock(46, -70, 42, 0.5), rock(10, -140, 46, 2.6)];
}

export interface World { readonly scene: Scene; bind(app: AuraApp): WorldRuntime }

export function buildWorld(options: WorldOptions): World {
  const high = options.quality !== "low";
  const evening = (options.mode ?? "evening") === "evening";
  const village = DISTRICT_LOOKS[0]!;
  const flameMap = texture.canvas({ canvas: (() => { const c = document.createElement("canvas"); c.width = c.height = 128; drawFlame(c.getContext("2d")!); return c; })(), colorSpace: "srgb" });
  const builder: Scene = scene()
    .background("#8fb7c9")
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 6, 12], target: [0, 2, -20], fov: 57, near: 0.1, far: 3200 }))
    .background(evening ? village.sky.horizon : "#8fb7c9");
  // GU47 NR-01/NR-02: the evening rig (real HDRI, one shadowed key, pooled lantern points); `?look=original` keeps
  // the pre-GU47 rig (see lighting.ts). The sky dome and the glow effects opt out of casting.
  for (const node of lightRig({ mode: evening ? "evening" : "original", quality: high ? "high" : "low", shadow: SUN_SHADOW, originalHdri: IBL_HDRI, lanterns: options.lanterns !== false, shadowTune: typeof location === "undefined" ? undefined : shadowTuneFromSearch(location.search) })) builder.add(node);
  builder.add(effects.fog({
    name: "haze",
    mode: "linear",
    color: evening ? village.fog.color : "#b5c8c4",
    near: EVENING_FOG_NEAR,
    far: EVENING_FOG_FAR,
    maxOpacity: 0.28,
    density: evening ? village.fog.density : 0.0008,
    affectsBackground: false
  }));
  // WP-23: Screen-space AO + contact shadows + rain-wet roof SSR + AgX cinematicBloom + clean radial godRays on High.
  if (high) builder.add(effects.ambientOcclusion({ name: "ao", intensity: 0.68, radius: 0.78 }));
  if (evening) {
    const post = WOODBLOCK_POST;
    if (high) {
      builder.add(effects.contactShadows({ length: 0.28, thickness: 0.05, steps: 16, intensity: 0.72 }));
      builder.add(effects.screenSpaceReflections({ name: "ssr", intensity: 0.38, maxDistance: 18, roughness: 0.18, thickness: 0.25 }));
    }
    builder
      .add(effects.cinematicBloom({ name: "bloom", intensity: post.bloom.intensity, threshold: post.bloom.threshold, radius: post.bloom.radius, color: "#ffd8a8" }))
      .add(effects.colorGrade({ name: "grade", contrast: post.grade.contrast, saturation: post.grade.saturation }))
      .add(effects.vignette({ name: "vignette", intensity: post.vignette.intensity, smoothness: post.vignette.smoothness }));
    if (options.ink !== false) builder.add(effects.outline({ name: "ink", color: post.outline.color, width: post.outline.width, threshold: post.outline.threshold, intensity: village.ink }));
    // Low drops the grain (PRD §6.4); the ink line, palette, sky and scarf stay.
    if (high && options.grain !== false) builder.add(effects.filmGrain({ name: "grain", intensity: post.grain.intensity }));
    if (high && options.godRays !== false) builder.add(effects.godRays({ name: "god rays", source: "sun", intensity: 0.06, decay: 0.94, samples: 48, color: "#ffd8a8" }));
    builder.add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  } else {
    builder
      .add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.0, radius: 0.4 }))
      .add(effects.colorGrade({ name: "grade", contrast: 1.06, saturation: 1.08 }))
      .add(effects.vignette({ name: "vignette", intensity: 0.22, smoothness: 0.7 }))
      .add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  }

  const ground = paintSurfaces(evening);
  /* ground groups that share a surface and tint become one mesh (one draw call) */
  const merged = new Map<string, { surf: Surface; tint: string; rough: number; positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();
  for (const g of buildRouteGroups(2)) {
    const [kind, pathTint] = PATH_SURFACE[g.biome]!;
    const path = g.zone === "path";
    const surf = path ? ground[kind] : g.biome === "rooftops" ? ground.tiles : ground.grass;
    // GU47 phase 3: under the evening's warm key the pale cobbles read blown out (blind panel, g20p3r2); a sandstone tint
    // keeps their texture. The 4.6.2 look keeps the white tint.
    const tint = path ? (evening && kind === "cobble" && pathTint === "#ffffff" ? "#ddd2c2" : pathTint) : VERGE_TINT[g.biome]!;
    const key = `${path ? kind : g.biome === "rooftops" ? "tiles" : "grass"}|${tint}`;
    let m = merged.get(key);
    if (!m) merged.set(key, m = { surf, tint, rough: path ? (evening ? EVENING_PATH_ROUGHNESS : 0.92) : 1, positions: [], normals: [], uvs: [], indices: [] });
    const base = m.positions.length / 3;
    for (let i = 0; i < g.mesh.positions.length; i++) { m.positions.push(g.mesh.positions[i]!); m.normals.push(g.mesh.normals[i]!); }
    for (let i = 0; i < g.mesh.uvs.length; i++) m.uvs.push(g.mesh.uvs[i]!);
    for (const idx of g.mesh.indices) m.indices.push(idx + base);
  }
  for (const [key, m] of merged) {
    const spec = geometry.define({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });
    const groundMat = evening && key.startsWith("tiles|")
      ? material.ceramic({ color: m.tint, roughness: 0.24, clearcoat: 0.84, clearcoatRoughness: 0.08, texture: m.surf.albedo as never, textureAnisotropy: 8, ...(m.surf.normal ? { normal: m.surf.normal, normalScale: 1 } : {}) })
      : mapped(m.surf, m.tint, m.rough);
    builder.add(geometry.custom(spec, { name: `ground-${key}`, material: groundMat, castShadow: false, receiveShadow: true }));
  }
  const floor = buildTownFloor(520, 1030, 130, TOWN_FLOOR_Y);
  builder.add(geometry.custom(geometry.define({ positions: f32(floor.positions), normals: f32(floor.normals), uvs: f32(floor.uvs), indices: Uint32Array.from(floor.indices) }), {
    name: "town-floor", material: mapped(ground.cobble, "#a39b8a", 0.95), castShadow: false, receiveShadow: true
  }));

  const modelSink: ModelSink = {};
  const lanternSpots: Vec3[] = [];
  for (const layer of buildScenery(modelSink, { paintedTrees: evening })) {
    if (layer.id === "lanterns") for (const p of layer.placements) lanternSpots.push([p.matrix[12]!, p.matrix[13]!, p.matrix[14]!]);
    const spec = LAYERS.find((l) => l.id === layer.id)!;
    // NR-11: in the evening the lantern layer splits into its three glow groups (day / dusk / night, +2 draws).
    const groups: { material: ReturnType<typeof layerMaterial>; placements: typeof layer.placements }[] = [];
    if (evening && layer.id === "lanterns") {
      const glowOf = courseDistances(layer.placements.map((p) => [p.matrix[12]!, p.matrix[13]!, p.matrix[14]!] as Vec3)).map(lanternGlowAt);
      for (const glow of Object.keys(LANTERN_GLOW) as LanternGlow[]) {
        const placements = layer.placements.filter((_, i) => glowOf[i] === glow);
        const g = LANTERN_GLOW[glow];
        if (placements.length > 0) groups.push({ material: material.pbr({ color: "#fff1d6", emissive: g.emissive, emissiveIntensity: g.intensity, roughness: 0.42, sheen: 0.45, sheenColor: "#ffdca8" }), placements });
      }
    } else groups.push({ material: layerMaterial(spec, evening), placements: layer.placements });
    const layerShadow = SUN_SHADOW && spec.castShadow
      && (layer.id === "walls" || layer.id === "trunks" || layer.id === "cones" || layer.id === "crowns");
    for (const group of groups) {
      const mesh = instances.mesh(defineShape(SHAPES[layer.shape]()), group.material, group.placements.length);
      group.placements.forEach((p, i) => { mesh.setMatrixAt(i, p.matrix); mesh.setColorAt(i, [...hexLinear(p.color), 1]); });
      mesh.computeBoundingSphere();
      builder.add(layerShadow ? mesh : ({ ...mesh.toJSON(), castShadow: false } as ReturnType<typeof mesh.toJSON>));
    }
  }

  // GU47 phase 6: in the evening the valley falls pour from a rock cliff (two more cliffB instances in the existing
  // layer: +0 draws, +2 x 3276 triangles) instead of hanging in the sky ("no visible source", blind panel g20p6g).
  if (evening && modelSink.cliffB) modelSink.cliffB.push(...fallsCliff(groundFrame(COURSE_LENGTH - 90, 0, 0)));
  // GU47 wave 2 (NR-12): the evening's three set-pieces; the pines, bushes and rocks inside the shrine clearing step aside.
  const setPieces = evening ? eveningSetPieces() : null;
  const clearing = setPieces ? shrineCentre() : undefined;
  if (clearing) {
    for (const id of ["pine", "oak", "bush", "boulder"]) {
      if (modelSink[id]) modelSink[id] = modelSink[id]!.filter((p) => Math.hypot(p.position[0] - clearing.x, p.position[2] - clearing.z) > (id === "pine" || id === "oak" ? 10 : 8));
    }
  }
  const courseAccents = buildProceduralCourseAccents(clearing);
  for (const p of modelSink.lantern ?? []) lanternSpots.push([p.position[0], p.position[1] + p.scale[1] * 1.3, p.position[2]]);
  for (const p of courseAccents.rooftopToroLanterns) lanternSpots.push([p.position[0], p.position[1] + 1.26, p.position[2]]);
  for (const batchNode of buildProceduralDistrictBatches(modelSink, courseAccents, { castShadow: SUN_SHADOW })) {
    builder.add(batchNode);
  }

  if (setPieces) {
    for (const p of setPieces.shrineGate) builder.add(buildShrineGateSetpieceNode(p));
    for (const p of setPieces.waterWheel) builder.add(buildWaterWheelSetpieceGroup(p));
    for (const p of setPieces.pagoda) builder.add(buildPagodaSetpieceNode(p));
  }

  const water = buildWater();
  builder.add(geometry.custom(geometry.dynamic({ positions: f32(water.positions), normals: f32(water.normals), uvs: f32(water.uvs), indices: Uint32Array.from(water.indices) }), { name: "river", material: material.custom(waterSpec()), position: [0, -2.5, 0] }).runtime({ id: "river" }));
  // The 4000 m dome neither casts nor receives: as a caster it would stretch every cascade over the whole sky.
  builder.add(primitives.sphere({ name: "sky", size: 4000, material: material.custom(skySpec()), castShadow: false, receiveShadow: false }).runtime({ id: "sky" }));
  const endFrame = groundFrame(COURSE_LENGTH - 90, 0, 0);
  // GU47 phase 6: the evening falls curve into a horseshoe with soft edges, a crest lip and a mist foot (the judges
  // named the 4.6.2 card "a flat billboard"); same draw, same triangles.
  const sheet = buildSheet(56, 63, 24, 12, evening ? FALLS_BEND : 0);
  builder.add(geometry.custom(geometry.dynamic({ positions: f32(sheet.positions), normals: f32(sheet.normals), uvs: f32(sheet.uvs), indices: Uint32Array.from(sheet.indices) }), { name: "valley-falls", material: material.custom(fallsSpec(evening ? 1 : 0)), position: [endFrame.x + 30, endFrame.y - 40, endFrame.z - 30] }).runtime({ id: "valley-falls" }));

  const crate = evening ? material.lacquer({ color: "#5e3622", roughness: 0.38, clearcoat: 0.72, clearcoatRoughness: 0.12 }) : material.pbr({ color: "#8a5a35", roughness: 0.86 });
  const strap = evening ? material.brushedMetal({ color: "#3d4654", roughness: 0.26, metallic: 0.92 }) : material.pbr({ color: "#3a3028", roughness: 0.6, metallic: 0.3 });
  const beam = hexLinear(evening ? "#485468" : "#c2603a"), glowOrange = hexLinear("#ff8a3a");
  for (let i = 0; i < BARRIER_POOL; i++) {
    for (const barrierPart of buildBarrierHazardNodes(i)) builder.add(barrierPart);
  }
  for (let i = 0; i < BEAM_POOL; i++) builder.add(buildSpikedBeamHazardNode(i));

  for (let i = 0; i < PLANK_POOL; i++) builder.add(primitives.box({ name: `plank-${i}`, size: [1, 1, 1], material: crate, castShadow: false, visible: false }).runtime({ id: `plank-${i}` }));
  for (let i = 0; i < STRAP_POOL; i++) builder.add(primitives.box({ name: `strap-${i}`, size: [1, 1, 1], material: strap, castShadow: false, visible: false }).runtime({ id: `strap-${i}` }));
  for (let i = 0; i < BEAM_PIECE_POOL; i++) builder.add(primitives.box({ name: `beampiece-${i}`, size: [1, 1, 1], material: material.custom(solidSpec(beam, { glow: 0.82, glowColor: glowOrange })), castShadow: false, visible: false }).runtime({ id: `beampiece-${i}` }));

  const pickups = spiritPickups(options.entities);
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(pickups.flatMap((p) => [...p.position])),
    topology: "points",
    attributes: { aAlive: { itemSize: 1, data: f32(pickups.map(() => 1)) }, aDistance: { itemSize: 1, data: f32(pickups.map((p) => p.s)) } }
  }), { name: "spirit-flames", material: material.custom(flameSpec(flameMap)) }).runtime({ id: "spirit-flames" }));
  for (let i = 0; i < PICKUP_PROP_POOL; i++) builder.add(buildPickupPropNode(i, i % 3 === 0 ? "scroll" : "coin"));

  // The glow effects (orb, gale star, aura, caster orbs) are additive and transparent: they must not cast solid sun shadows.
  builder.add(primitives.sphere({ name: "spiralorb", size: 0.21, material: material.custom(ballSpec()), castShadow: false, receiveShadow: false }).runtime({ id: "spiralorb" }));
  const sparkSeeds = Array.from({ length: 90 * 3 }, (_, i) => (((i + 1) * (i % 3 === 0 ? 0.618034 : i % 3 === 1 ? 0.754878 : 0.56984)) % 1));
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(90 * 3).fill(0)),
    topology: "points",
    attributes: { seed: { itemSize: 3, data: f32(sparkSeeds) } }
  }), { name: "spiralorb-sparks", material: material.custom(sparksSpec()) }).runtime({ id: "spiralorb-sparks" }));
  for (let i = 0; i < SHURIKEN_POOL; i++) builder.add(primitives.sphere({ name: `shuriken-${i}`, size: 1, material: material.custom(ballSpec()), castShadow: false, receiveShadow: false }).runtime({ id: `shuriken-${i}` }));
  for (let i = 0; i < SHURIKEN_POOL; i++) builder.add(buildShurikenStarNode(i));
  builder.add(primitives.sphere({ name: "aura", size: 1, material: material.custom(auraSpec()), castShadow: false, receiveShadow: false }).runtime({ id: "aura" }));

  const enemySlotCount = hasMeshy07Slots(options.actors.actors.length) ? EVENING_ENEMY_SLOTS.length : ENEMY_SLOTS.length;
  for (let i = 0; i < enemySlotCount; i++) {
    builder.add(buildKatanaWeaponNode(`blade-${i}`));
    builder.add(buildKanaboWeaponNode(`club-${i}`));
    builder.add(primitives.sphere({ name: `orb-${i}`, size: 0.3, material: material.custom(ballSpec()), castShadow: false, receiveShadow: false }).runtime({ id: `orb-${i}` }));
  }
  builder.add(buildKatanaWeaponNode("hero-blade"));

  const blobShadow = solidSpec([0.02, 0.025, 0.02], { alpha: 0.4 });
  const disc = defineShape(unitDisc(20));
  // Threat marker: calligraphy vermilion + sumi-ink targeting ring under the next rival in the hero's lane (`crosshairTarget`).
  const threat = evening ? threatRingSpec() : solidSpec([0.9, 0.12, 0.06], { glow: 0.9, glowColor: [1, 0.2, 0.1] });
  for (let i = 0; i < THREAT_POOL; i++) builder.add(geometry.custom(disc, { name: `threat-${i}`, material: material.custom(threat), castShadow: false, receiveShadow: false }).runtime({ id: `threat-${i}` }));
  for (let i = 0; i < options.actors.actors.length; i++) {
    builder.add(geometry.custom(disc, { name: `blob-${i}`, material: material.custom(blobShadow), castShadow: false, receiveShadow: false }).runtime({ id: `blob-${i}` }));
    for (const partNode of buildProceduralActorNodes(i, options.actors.slotModels[i] ?? "soldier", SUN_SHADOW)) {
      builder.add(partNode);
    }
  }

  // WP-23: Batched katana crescent slash arcs in runner-corridor space (`CORRIDOR_BOUNDS`, paired GLSL+WGSL `slashSpec`).
  const slashBatch = new Batch(unitCrescentArc(20), SLASH_POOL, null, CORRIDOR_BOUNDS);
  builder.add(geometry.custom(slashBatch.geometry(), { name: "slash-arcs", material: material.custom(slashSpec()), castShadow: false, receiveShadow: false }).runtime({ id: "slash-arcs" }));

  // WP-23: Flipbook blade-deflect sparks (`createFlipbookAtlas("sparks")`) & smoke-step puffs (`createFlipbookAtlas("dust")`).
  if (evening) {
    const sparksAtlas = createFlipbookAtlas("sparks", [255, 212, 124]);
    const dustAtlas = createFlipbookAtlas("dust", [202, 216, 236]);
    for (let i = 0; i < FLIPBOOK_POOL; i++) {
      builder.add(effects.flipbook({
        name: `spark-burst-${i}`,
        texture: sparksAtlas.texture as never,
        spriteColumns: sparksAtlas.columns,
        spriteRows: sparksAtlas.rows,
        frameRate: 30,
        size: 1.45,
        blend: "additive",
        color: "#ffd89a",
        intensity: 1.35,
        loop: false,
        position: [0, -500, 0]
      }).runtime({ id: `spark-burst-${i}` }));
      builder.add(effects.flipbook({
        name: `smoke-step-${i}`,
        texture: dustAtlas.texture as never,
        spriteColumns: dustAtlas.columns,
        spriteRows: dustAtlas.rows,
        frameRate: 26,
        size: 1.65,
        color: "#dce6f5",
        intensity: 0.95,
        loop: false,
        position: [0, -500, 0]
      }).runtime({ id: `smoke-step-${i}` }));
    }
  }

  // GU47 NR-15: the scarf ribbon's anchor, moved to the hero's upper spine every frame (hidden: +0 draws).
  builder.add(primitives.sphere({ name: SCARF.anchor, size: 0.01, material: material.pbr({ color: "#1b2236", roughness: 1 }), castShadow: false, receiveShadow: false }).runtime({ id: SCARF.anchor }));
  builder.add(geometry.custom(geometry.dynamic({
    positions: f32(new Array(PARTICLES * 3).fill(0)),
    topology: "points",
    attributes: { tone: { itemSize: 3, data: f32(new Array(PARTICLES * 3).fill(1)) }, aSize: { itemSize: 1, data: f32(new Array(PARTICLES).fill(0)) }, aAlpha: { itemSize: 1, data: f32(new Array(PARTICLES).fill(0)) } }
  }), { name: "particles", material: material.custom(particleSpec()) }).runtime({ id: "particles" }));

  const lanternIndex = indexLanterns(lanternSpots);
  if (evening) {
    // NR-16: soft light cones under the four gate lanterns (+4 draws, additive, no depth write); `?cones=0` drops them.
    if (options.cones !== false) gateConeLanterns(lanternIndex).forEach((l, i) => builder.add(effects.lightCone({
      name: `gate-cone-${i}`, color: LANTERN_POOL.amberColor, intensity: 0.7, position: [l.position[0], l.position[1] - 0.15, l.position[2]], direction: [0, -1, 0], length: 3.2, coneAngle: 0.42, softness: 0.55
    })));
    // NR-16 win aurora: removed in GU47 phase 6. The beam pass ignores setVisible, so the ribbon showed in every gate
    // frame as a floating translucent rectangle over the falls (blind panel g20p3r4); -1 draw.
  }

  return { scene: builder, bind: (app) => bindRuntime(app, options, pickups, lanternIndex, slashBatch) };
}

interface Particle { life: number; max: number; vx: number; vy: number; vz: number; gravity: number; size: number; r: number; g: number; b: number; x: number; y: number; z: number }
interface SlashArc { age: number; maxAge: number; x: number; y: number; z: number; yaw: number; scale: number }
interface FlipBurst { left: number; x: number; y: number; z: number }
interface Anim { clip: string; t?: number; rate?: number }
interface SceneNodeLike { transform: { worldMatrix: ArrayLike<number> } }

const normalize = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Lantern world positions with their course distance, sorted by distance (for the pooled lights, NR-03). */
interface LanternSpot { readonly s: number; readonly position: Vec3 }

/** Course distance of each point: the nearest route sample (every 2 m), in input order. */
export function courseDistances(points: readonly Vec3[]): number[] {
  const samples: { s: number; x: number; z: number }[] = [];
  for (let d = 0; d <= COURSE_LENGTH; d += 2) { const f = groundFrame(d, 0, 0); samples.push({ s: d, x: f.x, z: f.z }); }
  return points.map((p) => {
    let best = 0, bestD = Infinity;
    for (const q of samples) { const d = (q.x - p[0]) ** 2 + (q.z - p[2]) ** 2; if (d < bestD) { bestD = d; best = q.s; } }
    return best;
  });
}

/** Course distance of each lantern, sorted along the route. */
export function indexLanterns(spots: readonly Vec3[]): LanternSpot[] {
  const s = courseDistances(spots);
  return spots.map((position, i) => ({ s: s[i]!, position })).sort((a, b) => a.s - b.s);
}

/** NR-07: god rays from the low sun over Rooftop Run (from 470 m; the PRD's 1100 m start is the rooftops' far end) through the forest entry (to 1700 m), off at the river. */
export function godRaysAt(s: number): boolean {
  return (s >= 470 && s < 1120) || (s >= 1510 && s < 1700);
}

/** Upper-spine joint the scarf anchors to (Meshy rigs name it Spine02). */
const SCARF_BONES = ["Spine02", "Spine01", "Spine"] as const;

function bindRuntime(app: AuraApp, options: WorldOptions, pickups: readonly SpiritPickup[], lanternSpots: readonly LanternSpot[], slashBatch: Batch): WorldRuntime {
  const cameraController = app.camera;
  if (!cameraController) throw new Error("ninja-runner-port: the app exposes no camera controller");
  const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
  const node = (id: string) => { let h = handles.get(id); if (!h) handles.set(id, h = app.nodes.require(id)); return h; };
  const { actors, slotDurations, slotClips, slotModels } = options.actors;
  const meshy07 = hasMeshy07Slots(actors.length);
  const enemySlots: readonly number[] = meshy07 ? EVENING_ENEMY_SLOTS : ENEMY_SLOTS;
  const clipLength = (clip: string, slot: number = HERO): number => slotDurations[slot]?.[clip] ?? options.actors.clipDuration;
  const has = (clip: string, slot: number = HERO): string => {
    const list = slotClips[slot]!;
    return list.includes(clip) ? clip : list.includes(CLIPS.idle) ? CLIPS.idle : list[0]!;
  };
  let activeHero = HERO;
  const loopClock = actors.map((_, i) => i * 0.137);
  const visible = new Array<boolean>(actors.length).fill(false);
  const tints = new Array<string>(actors.length).fill("");
  const slotEntity = new Map<number, number>();
  const rng = seededRandom(4242);
  const pool: Particle[] = Array.from({ length: PARTICLES }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, gravity: 0, size: 0, r: 1, g: 1, b: 1, x: 0, y: 0, z: 0 }));
  let head = 0;
  const pPos = new Float32Array(PARTICLES * 3), pTone = new Float32Array(PARTICLES * 3), pSize = new Float32Array(PARTICLES), pAlpha = new Float32Array(PARTICLES);
  const aliveFlags = new Float32Array(pickups.length).fill(1);
  const pickupIndex = new Map(pickups.map((p, i) => [p.id, i]));
  let flamesDirty = false;
  const chase = cameras.chase({ lag: { eye: 7 } });
  let lastDamage = -10, lostAt = -1, lastFormShift = -10, dustClock = 0, auraClock = 0;
  let pieces: Piece[] = [];
  let threatShown: { target: number; from: number; to: number } | null = null;
  const cinematic = cinematicsOn((options.mode ?? "evening") === "evening", options.reducedMotion === true);
  /** NR-17: the evening hero blends its looping clips (the original look keeps today's clip scrubbing). */
  const blendHero = (options.mode ?? "evening") === "evening";
  const mixerClip = new Array<string>(actors.length).fill("");
  let introBlend: number | null = null, wonAt = -1, lastX = 0, lastRoll = 0, barsShown = false, kicking = false;
  const shake = options.shake;
  const POOL_CAP: Record<Piece["kind"], number> = { plank: PLANK_POOL, strap: STRAP_POOL, beam: BEAM_PIECE_POOL };
  const addPieces = (list: Piece[]): void => { pieces = pieces.concat(list); for (const k of ["plank", "strap", "beam"] as const) { let over = pieces.filter((q) => q.kind === k).length - POOL_CAP[k]; if (over > 0) pieces = pieces.filter((q) => (q.kind === k && over > 0 ? (over--, false) : true)); } };
  /** Enemies in the render window this frame, by id, taken from the state passed to `update` (never the boot state). */
  const inWindow = new Map<number, Entity>();
  const windowList: Entity[] = [];

  /* GU47 evening look state */
  const evening = (options.mode ?? "evening") === "evening";
  const quality = options.quality === "low" ? "low" : "high";
  const vfx: NinjaVfx | null = evening && options.vfx !== false ? registerNinjaVfx(app.effects, { reducedMotion: options.reducedMotion === true, quality }) : null;
  const lightPool = lanternPoolSize({ mode: evening ? "evening" : "original", quality, shadow: true, lanterns: options.lanterns !== false });
  const pickupOrder = pickups.map((p, i) => ({ s: p.s, i })).sort((a, b) => a.s - b.s);
  const poolShown = new Array<string>(lightPool.amber + lightPool.cyan).fill("");
  const moonDir = (() => { const g = DISTRICT_LOOKS[DISTRICT_LOOKS.length - 1]!.key; const e = (g.elevationDeg * Math.PI) / 180, a = (g.azimuthDeg * Math.PI) / 180; return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]; })();
  let lastLookS = -1e9, ambientClock = 0;
  let district: DistrictId | null = null;
  if (vfx) node(SCARF.anchor).setVisible(false);
  /* WP-23: pooled katana slash arcs & flipbook blade-spark / smoke-step bursts */
  const slashes: SlashArc[] = Array.from({ length: SLASH_POOL }, () => ({ age: 99, maxAge: 0.28, x: 0, y: -500, z: 0, yaw: 0, scale: 1 }));
  let slashHead = 0;
  const spawnSlash = (wx: number, wy: number, wz: number, yaw: number, scale = 1.45, maxAge = 0.28): void => {
    const sl = slashes[slashHead]!;
    slashHead = (slashHead + 1) % SLASH_POOL;
    sl.age = 0; sl.maxAge = maxAge; sl.x = wx; sl.y = wy; sl.z = wz; sl.yaw = yaw; sl.scale = scale;
  };
  const sparkBursts: FlipBurst[] = Array.from({ length: FLIPBOOK_POOL }, () => ({ left: 0, x: 0, y: -500, z: 0 }));
  const smokeBursts: FlipBurst[] = Array.from({ length: FLIPBOOK_POOL }, () => ({ left: 0, x: 0, y: -500, z: 0 }));
  let sparkHead = 0, smokeHead = 0;
  const fireSparkFlipbook = (wx: number, wy: number, wz: number): void => {
    if (!evening) return;
    const slotIdx = sparkHead; sparkHead = (sparkHead + 1) % FLIPBOOK_POOL;
    const b = sparkBursts[slotIdx]!;
    b.left = 0.44; b.x = wx; b.y = wy; b.z = wz;
    const h = node(`spark-burst-${slotIdx}`);
    h.setVisible(true);
    h.setPosition(wx, wy, wz);
  };
  const fireSmokeFlipbook = (wx: number, wy: number, wz: number): void => {
    if (!evening) return;
    const slotIdx = smokeHead; smokeHead = (smokeHead + 1) % FLIPBOOK_POOL;
    const b = smokeBursts[slotIdx]!;
    b.left = 0.52; b.x = wx; b.y = wy; b.z = wz;
    const h = node(`smoke-step-${slotIdx}`);
    h.setVisible(true);
    h.setPosition(wx, wy, wz);
  };
  if (evening) {
    for (let i = 0; i < FLIPBOOK_POOL; i++) {
      node(`spark-burst-${i}`).setVisible(false);
      node(`smoke-step-${i}`).setVisible(false);
    }
  }
  /** Moves the pooled point `id` to `p` at `intensity`; patches only on change (no per-frame light churn). */
  const placePoolLight = (slot: number, id: string, p: Vec3 | null, intensity: number): void => {
    const key = p ? `${p[0].toFixed(1)},${p[1].toFixed(1)},${p[2].toFixed(1)}|${intensity.toFixed(2)}` : "off";
    if (poolShown[slot] === key) return;
    poolShown[slot] = key;
    const h = node(id);
    if (!p || intensity <= 0.01) { h.setLight?.({ intensity: 0 }); return; }
    h.setPosition(p[0], p[1], p[2]);
    h.setLight?.({ intensity });
  };
  const applyLook = (s: number, x: number, y: number, dt: number, form: string): void => {
    const look = lookAtDistance(s);
    district = look.district;
    const sky = node("sky");
    sky.setUniform?.("skyZenith", [...look.skyZenith]);
    sky.setUniform?.("skyHorizon", [...look.skyHorizon]);
    sky.setUniform?.("skyGlow", [...look.skyGlow]);
    sky.setUniform?.("skyCloud", [...look.skyCloud]);
    sky.setUniform?.("skyGlowWide", 0.6 * (1 - look.stars));
    sky.setUniform?.("skyStars", look.stars);
    sky.setUniform?.("skyMoon", look.moon);
    sky.setUniform?.("sunDirection", [...look.toKey]);
    sky.setUniform?.("moonDirection", moonDir);
    const river = node("river");
    river.setUniform?.("waterSky", 1);
    // GU47 phase 6: past the forest the valley lake turns deep teal with ripple glints (judges: "flat pink ground",
    // then "flat grey plane" at a 0.4 sky share).
    river.setUniform?.("waterLake", smooth(2200, 2300, s));
    river.setUniform?.("waterZenith", [...look.skyZenith]);
    river.setUniform?.("waterHorizon", [...look.skyHorizon]);
    river.setUniform?.("waterKey", [...look.toKey]);
    // Key, environment and fog: re-applied every 3 m with a short blend, with sun position tracking the runner so shadow cascades stay razor-sharp across all 2,640 m.
    if (Math.abs(s - lastLookS) >= 3) {
      lastLookS = s;
      const sunAnchor = groundFrame(s, x, 0);
      node("sun").setLight?.({
        color: linearToHex(look.keyColor),
        intensity: look.keyIntensity * KEY_GAIN * LOOK_AB.key,
        position: [sunAnchor.x + look.toKey[0] * 60, sunAnchor.y + look.toKey[1] * 60, sunAnchor.z + look.toKey[2] * 60],
        direction: [-look.toKey[0], -look.toKey[1], -look.toKey[2]]
      }, { transitionSeconds: 0.3 });
      app.lighting?.setEnvironmentIntensity(look.environmentIntensity * ENVIRONMENT_GAIN * LOOK_AB.fill);
      node("evening fill").setLight?.({ intensity: EVENING_FILL.intensity * look.environmentIntensity * LOOK_AB.fill });
      app.atmosphere?.setFog({
        mode: "linear",
        color: linearToHex(look.fogColor),
        near: EVENING_FOG_NEAR,
        far: EVENING_FOG_FAR,
        maxOpacity: 0.28,
        affectsBackground: false,
        density: look.fogDensity
      }, { transitionSeconds: 0.5 });
    }
    // NR-03 pooled lantern points (amber, on from the river) and spirit points (cyan, on the nearest live flames).
    const lanterns = nearestLanterns(lanternSpots, s, lightPool.amber);
    for (let i = 0; i < lightPool.amber; i++) {
      const j = lanterns[i];
      placePoolLight(i, `lantern-light-${i}`, j === undefined ? null : lanternSpots[j]!.position, LANTERN_POOL.amberIntensity * look.lanterns);
    }
    if (lightPool.cyan > 0) {
      const near = nearestLanterns(pickupOrder, s, lightPool.cyan * 4).map((k) => pickupOrder[k]!.i).filter((i) => aliveFlags[i] === 1);
      for (let i = 0; i < lightPool.cyan; i++) {
        const j = near[i];
        placePoolLight(lightPool.amber + i, `spirit-light-${i}`, j === undefined ? null : pickups[j]!.position as Vec3, LANTERN_POOL.cyanIntensity * Math.max(0.35, look.lanterns));
      }
    }
    // NR-14 district ambients (petals, embers, fireflies, falls spray), one puff every 0.45 s ahead of the runner.
    if (vfx?.ambientOn) {
      ambientClock += dt;
      if (ambientClock >= 0.45) {
        ambientClock = 0;
        const f = groundFrame(s + 10 + rng() * 14, x + (rng() - 0.5) * 8, 1.6 + rng() * 2.2);
        vfx.ambient(look.district, [f.x, f.y, f.z]);
      }
    }
    // NR-15 scarf: the anchor follows the hero's upper spine; the ribbon turns cyan for the spirit forms.
    if (vfx && options.scarf !== false) {
      refresh(activeHero);
      let at: Vec3 | null = null;
      for (const b of SCARF_BONES) { at = boneWorld(activeHero, b); if (at) break; }
      if (!at) { const f = groundFrame(s, x, y + 1.35); at = [f.x, f.y, f.z]; }
      node(SCARF.anchor).setPosition(at[0], at[1], at[2]);
      scarfTrail = vfx.scarf(form === "base" ? "base" : form === "beast" ? "beast" : "sage");
    }
  };
  let scarfTrail: ReturnType<NinjaVfx["scarf"]> = null;
  const VFX_EVENT: Partial<Record<string, NinjaVfxEvent>> = { pickup: "pickup", land: "land", damage: "damage", ram: "crate-break", break: "crate-break", windImpact: "wind-impact", cloneStrike: "wind-impact", dash: "dash", form: "form", unlock: "form" };
  const mm = actors.map(() => modelMatrix(0, -1000, 0, 0, 1));
  const graphs = actors.map((a) => a.pipeline.resources.scene);
  const boneCache = actors.map(() => new Map<string, SceneNodeLike | undefined>());
  const bone = (slot: number, name: string): SceneNodeLike | undefined => {
    const cache = boneCache[slot]!;
    if (!cache.has(name)) cache.set(name, graphs[slot]!.findByName(name)[0] as SceneNodeLike | undefined);
    return cache.get(name);
  };
  /** World position of a joint after the slot's current pose (call `refresh` first). */
  const boneWorld = (slot: number, name: string): Vec3 | null => {
    const m = bone(slot, name)?.transform.worldMatrix;
    if (!m) return null;
    const x = m[12]!, y = m[13]!, z = m[14]!, t = mm[slot]!;
    return [t[0]! * x + t[4]! * y + t[8]! * z + t[12]!, t[1]! * x + t[5]! * y + t[9]! * z + t[13]!, t[2]! * x + t[6]! * y + t[10]! * z + t[14]!];
  };
  const refresh = (slot: number): void => graphs[slot]!.updateWorldTransforms();

  const emit = (x: number, y: number, z: number, count: number, color: Rgb, speed: number, size: number, life: number, gravity: number): void => {
    for (let k = 0; k < count; k++) {
      const p = pool[head]!;
      head = (head + 1) % PARTICLES;
      const a = rng() * Math.PI * 2, e = rng() * 1.1 - 0.15, v = speed * (0.35 + rng() * 0.65);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * Math.cos(e) * v; p.vy = Math.sin(e) * v + speed * 0.25; p.vz = Math.sin(a) * Math.cos(e) * v;
      p.life = life * (0.6 + rng() * 0.4); p.max = p.life; p.gravity = gravity; p.size = size * (0.6 + rng() * 0.8);
      p.r = color[0]; p.g = color[1]; p.b = color[2];
    }
  };

  const setTint = (slot: number, key: string, tint: Tint): void => {
    if (tints[slot] === key) return;
    tints[slot] = key;
    const actor = actors[slot]!;
    if (typeof actor.setMaterialOverrides === "function") {
      actor.setMaterialOverrides(shinobiActorMaterialOverrides(slotModels[slot]!, key, tint, evening));
    } else {
      actor.setTint({ baseColor: tint.base, ...(tint.emissive ? { emissiveColor: tint.emissive } : {}), ...(tint.strength !== undefined ? { emissiveStrength: tint.strength } : {}), ...(tint.roughness !== undefined ? { roughness: tint.roughness } : {}), ...(tint.metallic !== undefined ? { metallic: tint.metallic } : {}) });
    }
  };

  const place = (slot: number, entity: { s: number; x: number; y: number }, yawExtra: number, scale: number, anim: Anim, dt: number, show: boolean): void => {
    const actor = actors[slot]!;
    visible[slot] = show;
    node(`blob-${slot}`).setVisible(show);
    if (!show) {
      syncProceduralActorSceneNodes(node, slot, actor, false);
      return;
    }
    const f = groundFrame(entity.s, entity.x, entity.y);
    const clip = has(anim.clip, slot);
    const length = clipLength(clip, slot);
    let t = anim.t;
    if (blendHero && (slot === HERO || slot === SAGE) && t === undefined) {
      // NR-17: looping hero clips (run, jump, slide, idle) cross-fade through the actor's mixer (inertialized) instead of
      // snapping; scrubbed clips (attacks, hit, death) keep sampling the sim's time below.
      if (mixerClip[slot] !== clip) { mixerClip[slot] = clip; actor.crossFadeTo(clip, LOCOMOTION_FADE, { speed: anim.rate ?? 1, transition: "inertialize" }); }
      actor.advance(dt);
    } else {
      mixerClip[slot] = "";
      if (t === undefined) { loopClock[slot] = (loopClock[slot]! + dt * (anim.rate ?? 1)) % length; t = loopClock[slot]!; }
      actor.playClip(clip, Math.max(0, Math.min(length, t)) % (length + 1e-6));
    }
    const yaw = Math.atan2(f.dx, f.dz) + MODEL_YAW_OFFSET + yawExtra;
    modelMatrixInto(mm[slot]!, f.x, f.y, f.z, yaw, scale);
    syncProceduralActorSceneNodes(node, slot, actor, true, f.x, f.y, f.z, yaw, scale);
    (actor as TypedGLBActor & { __mm?: number[] }).__mm = mm[slot];
    const g = groundFrame(entity.s, entity.x, 0.1);
    const lift = Math.max(0, entity.y);
    const blob = node(`blob-${slot}`);
    blob.setPosition(g.x, g.y, g.z);
    blob.setScale([0.62 * scale * (1 - Math.min(0.5, lift * 0.1)), 1, 0.62 * scale * (1 - Math.min(0.5, lift * 0.1))]);
    blob.setUniform?.("solidAlpha", (SUN_SHADOW ? 0.2 : 0.42) * (1 - Math.min(0.7, lift * 0.14)));
  };

  const renderItems: ReturnType<TypedGLBActor["collectRenderItems"]>[number][] = [];
  const detach = attachRootRenderSource(options.canvas, {
    source: {
      collectRenderItems: () => {
        renderItems.length = 0;
        for (let i = 0; i < actors.length; i++) {
          if (!visible[i]) continue;
          for (const item of actors[i]!.collectRenderItems({ modelMatrix: mm[i]! })) renderItems.push(item.castShadow === SUN_SHADOW ? item : { ...item, castShadow: SUN_SHADOW });
        }
        return renderItems;
      }
    }
  });

  const aim = (id: string, from: Vec3, to: Vec3, length: number, grip = 0.12): void => {
    const d = normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
    const h = node(id);
    h.setVisible(true);
    h.setPosition(to[0] + d[0] * (length / 2 - grip), to[1] + d[1] * (length / 2 - grip), to[2] + d[2] * (length / 2 - grip));
    h.setRotation(-Math.asin(Math.max(-1, Math.min(1, d[1]))), Math.atan2(d[0], d[2]), 0);
    h.setScale([1, 1, length]);
  };
  const hideWeapons = (i: number): void => { for (const k of ["blade", "club", "orb"]) node(`${k}-${i}`).setVisible(false); };

  return {
    update(state, dt, time, events) {
      const s = state.s;
      const rigFrame = options.impactRig ? options.impactRig.step(dt) : { simDt: dt, frozen: false, shakeOffset: [0, 0, 0] as const, shakeRoll: 0, fovDeltaDeg: 0 };
      const animDt = rigFrame.simDt;
      const heroHeadingFrame = groundFrame(s, state.x, Math.max(0, state.y));
      const heroYaw = Math.atan2(heroHeadingFrame.dx, heroHeadingFrame.dz) + Math.PI;
      /* sky, fog and animated uniforms */
      const sky = groundFrame(s, 0, 0);
      node("sky").setPosition(sky.x, 0, sky.z);
      node("river").setUniform?.("waterTime", time);
      node("valley-falls").setUniform?.("fallsTime", time);
      if (evening) node("setpiece-waterWheel").setRotation(time * 0.9, 0, 0);
      const flames = node("spirit-flames");
      flames.setUniform?.("flameTime", time);
      flames.setUniform?.("runnerS", s);

      /* events -> particles, pickups, flipbook blade sparks, smoke-step dust & katana slash arcs */
      for (const ev of events) {
        const at = (es: number, lane: number, y = 0.9): [number, number, number] => { const p = groundFrame(es, lane * laneOffset(es), y); return [p.x, p.y, p.z]; };
        if (vfx) {
          const kind: NinjaVfxEvent | undefined = ev.type === "kill" ? (ev.heavy ? "kill-heavy" : "kill") : VFX_EVENT[ev.type];
          if (kind) {
            const where = typeof ev.s === "number" && typeof ev.lane === "number" ? at(ev.s, ev.lane, 1) : (() => { const p = groundFrame(s, state.x, 1); return [p.x, p.y, p.z] as [number, number, number]; })();
            vfx.fire(kind, where);
          }
        }
        if (ev.type === "pickup") {
          const i = pickupIndex.get(ev.entity as number);
          if (i !== undefined) { aliveFlags[i] = 0; flamesDirty = true; const p = pickups[i]!.position; emit(p[0], p[1], p[2], 12, [0.3, 0.85, 1], 3, 0.18, 0.55, -2); }
        } else if (ev.type === "kill") {
          const p = at(ev.s as number, ev.lane as number, 1);
          emit(p[0], p[1], p[2], ev.heavy ? 40 : 28, ev.heavy ? [1, 0.55, 0.2] : [1, 0.85, 0.5], 6, 0.32, 0.75, 4);
          fireSparkFlipbook(p[0], p[1] + 0.15, p[2]);
          spawnSlash(p[0], p[1] + 0.1, p[2], heroYaw + (rng() - 0.5) * 0.5, ev.heavy ? 2.1 : 1.65, 0.3);
        }
        else if (ev.type === "deflect" || ev.type === "interrupt" || ev.type === "armorBreak") {
          const p = typeof ev.s === "number" && typeof ev.lane === "number" ? at(ev.s, ev.lane, 1.15) : [heroHeadingFrame.x + heroHeadingFrame.dx * 1.1, heroHeadingFrame.y + 1.15, heroHeadingFrame.z + heroHeadingFrame.dz * 1.1] as [number, number, number];
          emit(p[0], p[1], p[2], 20, [1, 0.86, 0.48], 6, 0.26, 0.5, 1);
          fireSparkFlipbook(p[0], p[1], p[2]);
          spawnSlash(p[0], p[1], p[2], heroYaw + 0.35, 1.55, 0.26);
        }
        else if (ev.type === "land") {
          const p = groundFrame(s, state.x, 0.1);
          emit(p.x, p.y, p.z, 10, [0.8, 0.75, 0.6], 2.4, 0.3, 0.55, 1);
          fireSmokeFlipbook(p.x, p.y + 0.35, p.z);
        }
        else if (ev.type === "damage") { lastDamage = time; shake.add(0.3); const p = groundFrame(s, state.x, 1.2); emit(p.x, p.y, p.z, 22, [1, 0.25, 0.2], 5, 0.28, 0.65, 3); }
        else if (ev.type === "ram") {
          const tier = ev.tier as RamTier, fb = TIER_FEEDBACK[tier];
          addPieces(spawnPieces(ev.kind === "beam" ? "beam" : "barrier", tier, ev.entity as number, ev.s as number, ev.lane as number));
          const p = at(ev.s as number, ev.lane as number, 0.7);
          emit(p[0], p[1], p[2], fb.dust, [0.82, 0.66, 0.45], tier === "crash" ? 6.5 : 3.5, 0.34, 0.8, 3);
          fireSparkFlipbook(p[0], p[1] + 0.2, p[2]);
        }
        else if (ev.type === "windImpact" || ev.type === "cloneStrike") {
          const p = at(ev.s as number, ev.lane as number, 1.1);
          emit(p[0], p[1], p[2], 24, [0.6, 0.95, 1], 6.5, 0.3, 0.65, 0);
          fireSparkFlipbook(p[0], p[1], p[2]);
          spawnSlash(p[0], p[1], p[2], heroYaw - 0.3, 1.75, 0.3);
        }
        else if (ev.type === "break") { addPieces(spawnPieces("barrier", "smash", Math.round((ev.s as number) * 10), ev.s as number, ev.lane as number)); const p = at(ev.s as number, ev.lane as number, 0.8); emit(p[0], p[1], p[2], 26, [0.85, 0.6, 0.35], 5, 0.32, 0.7, 5); fireSparkFlipbook(p[0], p[1], p[2]); }
        else if (ev.type === "dash") {
          const p = groundFrame(s, state.x, 1);
          emit(p.x, p.y, p.z, 24, [0.5, 0.9, 1], 4, 0.26, 0.55, 0);
          fireSmokeFlipbook(p.x, p.y - 0.35, p.z);
          spawnSlash(p.x + p.dx * 1.35, p.y + 0.15, p.z + p.dz * 1.35, heroYaw, 1.85, 0.32);
        }
        else if (ev.type === "clones") {
          const p = groundFrame(s, state.x, 0.85);
          fireSmokeFlipbook(p.x - 1.2, p.y, p.z);
          fireSmokeFlipbook(p.x + 1.2, p.y, p.z);
        }
        else if (ev.type === "spiralorb") {
          const p = groundFrame(s + 0.8, state.x, 1.2);
          emit(p.x, p.y, p.z, 12, [0.4, 0.8, 1], 3, 0.2, 0.4, 0);
          spawnSlash(p.x + p.dx * 0.6, p.y - 0.05, p.z + p.dz * 0.6, heroYaw, 1.5, 0.26);
        }
        else if (ev.type === "form" || ev.type === "unlock") {
          lastFormShift = time;
          const p = groundFrame(s, state.x, 0.9);
          emit(p.x, p.y, p.z, 46, ev.form === "beast" ? [1, 0.7, 0.18] : [1, 0.62, 0.22], 7, 0.34, 0.9, -1.5);
          fireSmokeFlipbook(p.x, p.y, p.z);
        } else if (ev.type === "enemyAttack") { const p = at(ev.s as number, ev.lane as number, 1.2); emit(p[0], p[1], p[2], 8, [1, 0.5, 0.3], 3, 0.2, 0.35, 0); }
      }
      if (flamesDirty) { flames.updateAttribute?.("aAlive", { array: aliveFlags, offset: 0 }); flamesDirty = false; }

      /* hero: pick a clip from the sim state */
      if (state.phase === "lost" && lostAt < 0) lostAt = time;
      if (state.phase !== "lost") lostAt = -1;
      const grounded = state.y < 0.06 && !state.falling;
      const hitAge = time - lastDamage;
      let anim: Anim;
      if (state.phase === "lost") anim = { clip: CLIPS.death, t: Math.min(clipLength(CLIPS.death) * 0.98, Math.max(0, time - lostAt) * 0.9) };
      else if (state.phase === "intro" || state.phase === "paused") anim = { clip: CLIPS.idle, rate: 0.8 };
      else if (hitAge < 0.32 && state.phase === "running") anim = { clip: CLIPS.hit, t: hitAge };
      else if (state.shurikenCast > 0) anim = { clip: CLIPS.sword, t: Math.min(1, (state.time - state.shurikenStartedAt) / TUNING.shurikenWindup) * clipLength(CLIPS.sword) * 0.55 };
      else if (state.attack > 0) anim = { clip: CLIPS.punch, t: Math.min(1, (state.time - state.attackStartedAt) / TUNING.attackDuration) * clipLength(CLIPS.punch) * 0.9 };
      else if (!grounded) anim = { clip: CLIPS.jump, rate: 0.9 };
      else if (state.slide > 0) anim = { clip: CLIPS.slide, rate: 1 };
      else anim = { clip: CLIPS.run, rate: (state.dash > 0 ? 1.7 : 1) * (1.15 + (state.speed - 18) * 0.05) };
      const heroScale = state.form === "beast" ? 1.12 : 1;
      const flash = state.invulnerable > 0 && Math.floor(state.time * 14) % 2 === 0;
      const heroTint = flash ? FLASH_TINT : FORM_TINT[state.form]!;
      const heroSlot = state.form === "base" ? HERO : SAGE;
      activeHero = heroSlot;
      setTint(heroSlot, flash ? "flash" : state.form, heroTint);
      place(heroSlot, { s, x: state.x, y: Math.max(state.y, state.falling ? state.y : 0) }, MODEL_YAW_OFFSET, heroScale * (state.slide > 0 ? 0.9 : 1), anim, animDt, true);
      place(heroSlot === HERO ? SAGE : HERO, { s, x: state.x, y: 0 }, 0, 1, anim, animDt, false);
      /* hero katana drawn in right hand during attacks, gale-star cast or surge dash */
      {
        const drawBlade = state.phase === "running" && (state.attack > 0 || state.dash > 0 || state.shurikenCast > 0);
        if (drawBlade) {
          refresh(heroSlot);
          const hand = boneWorld(heroSlot, BONES.handR), fore = boneWorld(heroSlot, BONES.foreR);
          if (hand && fore) aim("hero-blade", fore, hand, 1.12, 0.12);
          else node("hero-blade").setVisible(false);
        } else node("hero-blade").setVisible(false);
      }
      if (evening) applyLook(s, state.x, state.y, dt, state.form);

      /* shadow clones */
      CLONE_SLOTS.forEach((slot, k) => {
        const show = state.clones > 0;
        const lateral = [-1.5, 1.5, 0][k]!;
        const behind = [0.6, 0.6, 2.4][k]!;
        setTint(slot, "clone", CLONE_TINT);
        place(slot, { s: s - behind, x: state.x + lateral, y: state.y }, 0, 0.96, state.attack > 0 ? anim : { clip: grounded ? CLIPS.run : CLIPS.jump, rate: 1.15 * (1 + k * 0.07) }, animDt, show);
      });

      /* enemies: stable slot per entity while in window */
      windowList.length = 0;
      inWindow.clear();
      for (const e of state.entities) {
        if (!isEnemy(e)) continue;
        const d = e.s - s;
        if (d > 72 || d < -6) continue;
        if (!e.alive && state.time - e.defeatedAt > 0.45) continue;
        windowList.push(e);
      }
      windowList.sort((a, b) => a.s - b.s);
      if (windowList.length > ENEMY_SLOTS.length) windowList.length = ENEMY_SLOTS.length;
      for (const e of windowList) inWindow.set(e.id, e);
      for (const [slot, id] of slotEntity) if (!inWindow.has(id)) slotEntity.delete(slot);
      const assigned = new Set(slotEntity.values());
      for (const e of windowList) {
        if (assigned.has(e.id)) continue;
        // GU47 meshy07 (evening): owl casters and fox scouts take their own rig when one is free, else a soldier slot.
        const own: readonly number[] = !meshy07 ? [] : e.type === "caster" ? CASTER_SLOTS : e.type === "scout" ? SCOUT_SLOTS : [];
        const free = own.find((sl) => !slotEntity.has(sl)) ?? (e.type === "heavy" ? BRUTE_SLOTS : SOLDIER_SLOTS).find((sl) => !slotEntity.has(sl));
        if (free !== undefined) { slotEntity.set(free, e.id); assigned.add(e.id); tints[free] = ""; }
      }
      enemySlots.forEach((slot, w) => {
        const id = slotEntity.get(slot);
        const e = id === undefined ? undefined : inWindow.get(id);
        if (!e) { visible[slot] = false; node(`blob-${slot}`).setVisible(false); syncProceduralActorSceneNodes(node, slot, actors[slot]!, false); hideWeapons(w); return; }
        const kind = e.type as EnemyKind;
        const dead = !e.alive;
        const pop = dead ? Math.max(0, 1 - (state.time - e.defeatedAt) / 0.45) : 1;
        let ea: Anim;
        // GU47 meshy07: the caster and scout rigs carry their own cast/throw and death clips.
        const rigClips = MESHY07_ENEMY_CLIPS[slotModels[slot]!];
        const attackClip = rigClips?.attack ?? ENEMY_ATTACK_CLIP[kind];
        if (dead && rigClips) ea = { clip: rigClips.death, t: Math.min(clipLength(rigClips.death, slot) * 0.98, ((state.time - e.defeatedAt) / 0.45) * clipLength(rigClips.death, slot) * 0.7) };
        else if (dead) ea = { clip: CLIPS.hit, t: Math.min(clipLength(CLIPS.hit, slot), (state.time - e.defeatedAt) * 0.75) };
        else if (e.intent) {
          const i = e.intent;
          const stageP = 1 - i.timer / Math.max(1e-3, i.duration);
          const p = i.stage === "windup" ? stageP * 0.5 : i.stage === "release" ? 0.5 + stageP * 0.25 : 0.75 + stageP * 0.25;
          ea = { clip: attackClip, t: Math.max(0, Math.min(0.98, p)) * clipLength(has(attackClip, slot), slot) };
        } else if (e.stagger > 0) ea = { clip: CLIPS.hit, t: 0.1 };
        else ea = e.approachSpeed > 0 ? { clip: CLIPS.run, rate: 1.25 } : { clip: CLIPS.idle, rate: 0.9 };
        const rigTint = MESHY07_TINT[slotModels[slot]!];
        setTint(slot, rigTint ? `${kind}-rig` : kind, enemyTint(rigTint ?? ENEMY_TINT[kind]));
        place(slot, { s: e.s, x: e.lane * laneOffset(e.s), y: e.y + (dead ? (1 - pop) * 1.6 : 0) }, Math.PI, (kind === "heavy" ? 1.3 : 1) * (0.4 + 0.6 * pop), ea, dt, pop > 0.02);
        hideWeapons(w);
        if (pop > 0.5) {
          refresh(slot);
          const hand = boneWorld(slot, BONES.handR), fore = boneWorld(slot, BONES.foreR);
          if (hand && fore) {
            if (kind === "swordsman") aim(`blade-${w}`, fore, hand, 1.15);
            else if (kind === "scout") aim(`blade-${w}`, fore, hand, 0.5, 0.05);
            else if (kind === "heavy") aim(`club-${w}`, fore, hand, 1.2 * 1.3, 0.25);
          }
          if (kind === "caster") {
            const lh = boneWorld(slot, BONES.handL);
            if (lh) { const o = node(`orb-${w}`); o.setVisible(true); o.setPosition(lh[0], lh[1] + 0.12, lh[2]); o.setScale(0.8 + 0.5 * (e.intent?.stage === "windup" ? 1 - e.intent.timer / Math.max(1e-3, e.intent.duration) : 0)); o.setUniform?.("ballTime", time + w); o.setUniform?.("ballOpacity", 0.95); }
          }
        }
      });

      /* threat marker: a calligraphy seal ring under the next rival in the hero's lane (the crosshair target), brighter as it closes in */
      const target = state.phase === "running" ? crosshairTarget(state) : null;
      threatShown = null;
      const marker = node("threat-0");
      const show = !!target && target.s - s > 3;
      marker.setVisible(show);
      if (target && show) {
        const f = groundFrame(target.s, target.lane * laneOffset(target.s), 0.06);
        marker.setPosition(f.x, f.y, f.z);
        marker.setScale([1.05, 1, 1.05]);
        threatShown = { target: target.id, from: +s.toFixed(2), to: +target.s.toFixed(2) };
        marker.setUniform?.("glow", 0.5 + 1.2 * (1 - Math.min(1, (target.s - s) / 26)));
        marker.setUniform?.("ringTime", time);
      }

      /* batched katana slash arcs in runner-corridor space (`CORRIDOR_BOUNDS`) & flipbook burst lifetimes */
      {
        const slashNode = node("slash-arcs");
        slashNode.setPosition(heroHeadingFrame.x, heroHeadingFrame.y, heroHeadingFrame.z);
        let activeProgress = 0, anySlash = false;
        for (let i = 0; i < SLASH_POOL; i++) {
          const sl = slashes[i]!;
          if (sl.age < sl.maxAge) {
            sl.age += animDt;
            if (sl.age < sl.maxAge) {
              const prog = sl.age / sl.maxAge;
              if (!anySlash || prog < activeProgress) activeProgress = prog;
              anySlash = true;
              slashBatch.place(i, sl.x - heroHeadingFrame.x, sl.y - heroHeadingFrame.y, sl.z - heroHeadingFrame.z, sl.yaw, sl.scale, 1, sl.scale);
            } else slashBatch.collapse(i);
          }
        }
        slashBatch.flush(slashNode, false);
        slashNode.setVisible(anySlash);
        if (anySlash) {
          slashNode.setUniform?.("slashTime", time);
          slashNode.setUniform?.("slashProgress", activeProgress);
          slashNode.setUniform?.("slashInk", state.form === "base" ? [0.16, 0.34, 0.68] : [0.18, 0.72, 0.96]);
        }
      }
      if (evening) {
        for (let i = 0; i < FLIPBOOK_POOL; i++) {
          const sb = sparkBursts[i]!;
          if (sb.left > 0) { sb.left -= dt; if (sb.left <= 0) { const h = node(`spark-burst-${i}`); h.setVisible(false); h.setPosition(0, -500, 0); } }
          const db = smokeBursts[i]!;
          if (db.left > 0) { db.left -= dt; if (db.left <= 0) { const h = node(`smoke-step-${i}`); h.setVisible(false); h.setPosition(0, -500, 0); } }
        }
      }

      /* barriers and beams */
      const barriers = state.entities.filter((e) => e.type === "barrier" && e.alive && e.s - s > -6 && e.s - s < 90);
      const beams = state.entities.filter((e) => e.type === "beam" && e.alive && e.s - s > -6 && e.s - s < 90);
      for (let i = 0; i < BARRIER_POOL; i++) {
        const e = barriers[i];
        for (const [id, lift] of [[`barrier-${i}`, 0.75], [`barrier-band-${i}`, 0.45], [`barrier-top-${i}`, 1.52]] as const) {
          const h = node(id);
          h.setVisible(!!e);
          if (e) { const f = groundFrame(e.s, e.lane * laneOffset(e.s), lift); h.setPosition(f.x, f.y, f.z); h.setRotation(0, Math.atan2(f.dx, f.dz), 0); }
        }
      }
      for (let i = 0; i < BEAM_POOL; i++) {
        const e = beams[i];
        const h = node(`beam-${i}`);
        h.setVisible(!!e);
        if (e) { const f = groundFrame(e.s, e.lane * laneOffset(e.s), 1.1); h.setPosition(f.x, f.y, f.z); h.setRotation(0, Math.atan2(f.dx, f.dz), 0); }
      }

      /* debris from broken crates and beams */
      pieces = stepPieces(pieces, dt);
      const slot: Record<Piece["kind"], number> = { plank: 0, strap: 0, beam: 0 };
      const poolName: Record<Piece["kind"], string> = { plank: "plank", strap: "strap", beam: "beampiece" };
      for (const piece of pieces) {
        const h = node(`${poolName[piece.kind]}-${slot[piece.kind]++}`);
        const f = groundFrame(piece.s + piece.ds, piece.lane * laneOffset(piece.s) + piece.lx, piece.h);
        const k = pieceScale(piece);
        h.setVisible(k > 0);
        h.setPosition(f.x, f.y, f.z);
        h.setRotation(piece.pitch, Math.atan2(f.dx, f.dz) + piece.yaw, piece.roll);
        h.setScale([piece.size[0] * k, piece.size[1] * k, piece.size[2] * k]);
      }
      for (const kind of ["plank", "strap", "beam"] as const) for (let i = slot[kind]; i < POOL_CAP[kind]; i++) node(`${poolName[kind]}-${i}`).setVisible(false);

      /* Spiralorb orb in the hero's hand + sparks, wind shuriken */
      const ball = node("spiralorb");
      const casting = state.attack > 0 || state.shurikenCast > 0;
      ball.setVisible(casting);
      const sparks = node("spiralorb-sparks");
      sparks.setVisible(casting);
      if (casting) {
        refresh(activeHero);
        const hand = boneWorld(activeHero, BONES.handR), fore = boneWorld(activeHero, BONES.foreR);
        const fallback = groundFrame(s + 0.7, state.x + 0.25, state.y + 1.15);
        const reach = hand && fore ? normalize([hand[0] - fore[0], hand[1] - fore[1], hand[2] - fore[2]]) : ([0, 0, 0] as Vec3);
        const pos: Vec3 = hand ? [hand[0] + reach[0] * 0.28, hand[1] + reach[1] * 0.28, hand[2] + reach[2] * 0.28] : [fallback.x, fallback.y, fallback.z];
        const k = state.shurikenCast > 0 ? 3.2 : 1;
        ball.setPosition(pos[0], pos[1], pos[2]);
        ball.setScale(k);
        ball.setUniform?.("ballTime", time);
        ball.setUniform?.("ballOpacity", 1);
        sparks.setPosition(pos[0], pos[1], pos[2]);
        sparks.setUniform?.("sparkTime", time);
        sparks.setUniform?.("sparkStrength", 1);
      }
      for (let i = 0; i < SHURIKEN_POOL; i++) {
        const sh = state.shurikens[i];
        const h = node(`shuriken-${i}`);
        const star = node(`shuriken-star-${i}`);
        h.setVisible(!!sh);
        star.setVisible(!!sh);
        if (sh) {
          const f = groundFrame(sh.s, sh.x, 1.1);
          h.setPosition(f.x, f.y, f.z);
          h.setScale([2.4, 0.22, 2.4]);
          h.setRotation(0, time * 18, 0);
          h.setUniform?.("ballTime", time);
          h.setUniform?.("ballOpacity", 0.9);
          star.setPosition(f.x, f.y, f.z);
          star.setScale([2.1, 2.1, 2.1]);
          star.setRotation(0, time * 24, 0);
        }
      }

      /* spinning multi-material shinobi scrolls & imperial koban coins inside the nearest live spirit pickups */
      {
        let propSlot = 0;
        for (let k = 0; k < pickupOrder.length && propSlot < PICKUP_PROP_POOL; k += 1) {
          const entry = pickupOrder[k]!;
          const d = entry.s - s;
          if (d < -3) continue;
          if (d > 44) break;
          if (aliveFlags[entry.i] !== 1) continue;
          const p = pickups[entry.i]!;
          const ph = node(`pickup-prop-${propSlot++}`);
          ph.setVisible(true);
          ph.setPosition(p.position[0], p.position[1] + Math.sin(time * 3.4 + entry.i) * 0.08, p.position[2]);
          ph.setRotation(0, time * 2.6 + entry.i * 0.7, 0);
        }
        for (let j = propSlot; j < PICKUP_PROP_POOL; j += 1) node(`pickup-prop-${j}`).setVisible(false);
      }

      /* form aura: shell around the runner plus rising embers, dust at the feet */
      const aura = node("aura");
      const auraOn = state.phase !== "intro" && state.form !== "base";
      aura.setVisible(auraOn);
      if (auraOn) {
        const c = groundFrame(s, state.x, state.y + 0.95 * heroScale);
        const pulse = 1 + Math.sin(time * 6) * 0.05;
        const kur = state.form === "beast";
        aura.setPosition(c.x, c.y, c.z);
        aura.setScale([(kur ? 1.0 : 0.78) * pulse, (kur ? 1.35 : 1.15) * pulse, (kur ? 1.0 : 0.78) * pulse]);
        aura.setUniform?.("auraTime", time);
        aura.setUniform?.("auraStrength", (kur ? 1.1 : 0.7) + Math.max(0, 1 - (time - lastFormShift) / 1.2) * 0.8);
        aura.setUniform?.("auraColor", kur ? [1, 0.78, 0.22] : [1, 0.5, 0.14]);
        auraClock += dt * (kur ? 70 : 28);
        while (auraClock >= 1) {
          auraClock -= 1;
          const hip = groundFrame(s - rng() * 0.8, state.x + (rng() - 0.5) * 0.9, state.y + 0.2 + rng() * 1.6);
          emit(hip.x, hip.y, hip.z, 1, kur ? [1, 0.72 + rng() * 0.2, 0.2] : [1, 0.55, 0.2], kur ? 2.4 : 1.4, kur ? 0.3 : 0.22, kur ? 0.8 : 0.6, -2.4);
        }
      }
      if (state.phase === "running" && grounded) {
        dustClock += dt * (state.speed / 18) * 9;
        while (dustClock >= 1) {
          dustClock -= 1;
          const f = groundFrame(s, state.x + (rng() - 0.5) * 0.5, 0.08);
          const tone = hexLinear(state.s > 1500 && state.s < 2260 ? "#7a6a3a" : "#c9b693");
          emit(f.x, f.y, f.z, 1, [Math.min(1, tone[0] * 1.5), Math.min(1, tone[1] * 1.5), Math.min(1, tone[2] * 1.5)], 1.1, 0.34, 0.5, -0.3);
        }
      }

      /* particles */
      for (let i = 0; i < PARTICLES; i++) {
        const p = pool[i]!;
        if (p.life > 0) {
          p.life -= dt;
          p.vy -= p.gravity * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        }
        const alive = p.life > 0;
        const t = alive ? p.life / p.max : 0;
        pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
        pTone[i * 3] = p.r; pTone[i * 3 + 1] = p.g; pTone[i * 3 + 2] = p.b;
        pSize[i] = alive ? p.size : 0;
        pAlpha[i] = alive ? t * 0.9 : 0;
      }
      const particles = node("particles");
      particles.updateAttribute?.("position", { array: pPos, offset: 0 });
      particles.updateAttribute?.("tone", { array: pTone, offset: 0 });
      particles.updateAttribute?.("aSize", { array: pSize, offset: 0 });
      particles.updateAttribute?.("aAlpha", { array: pAlpha, offset: 0 });

      /* chase camera: the original's offsets, eased with 1 - exp(-7 dt), with a short shake on damage */
      const widen = smooth(2220, 2410, s);
      const eyeF = cameraEye(s, state.x, state.y);
      const lookF = groundFrame(s + 12 + widen * 6, state.x * 0.38, 1.6 + widen * 0.35 + state.y * 0.15);
      const jolt = shake.update(dt);
      const pose = chase.step({
        wantEye: [eyeF.x, eyeF.y, eyeF.z],
        wantLook: [lookF.x, lookF.y, lookF.z],
        fovTarget: 57 + (state.dash > 0 && !cinematic ? 5 : 0) + rigFrame.fovDeltaDeg,
        shakeOffset: [jolt.x + rigFrame.shakeOffset[0], jolt.y + rigFrame.shakeOffset[1], jolt.x * 0.4 + rigFrame.shakeOffset[2]]
      }, dt);
      // NR-18: title shot over the roofs blending into the chase through the 3-2-1, three win shots at the gate, and a
      // lane-change roll (<= 3 deg). Reduced motion and ?look=original keep today's chase with no roll.
      let shot: ShotPose = { eye: pose.eye as Vec3, look: pose.look as Vec3, fov: pose.fov };
      let roll = 0;
      if (cinematic) {
        if (state.phase === "won") { if (wonAt < 0) wonAt = time; shot = winPose(s, state.x, time - wonAt); }
        else {
          wonAt = -1;
          if (introBlend !== null) shot = blendIntro(shot, s, time, introBlend);
          else if (state.phase === "running" && dt > 0) roll = laneRoll((state.x - lastX) / dt);
        }
      }
      lastX = state.x;
      // Bars frame the countdown blend and the win shots; the title card itself stays full frame (GU47 phase 3).
      const bars = state.phase === "won" || (introBlend !== null && introBlend > 0 && introBlend < 1);
      if (cinematic && bars !== barsShown) { barsShown = bars; document.documentElement.classList.toggle("shot-bars", bars); }
      cameraController.setPose({ position: shot.eye, target: shot.look, fov: shot.fov }, { cut: false });
      if (cinematic && roll !== lastRoll) { lastRoll = roll; cameraController.setRoll(roll, { halflife: ROLL_HALFLIFE }); }
      // NR-10: the dash kicks the FOV through the controller's fovKick layer (only while dashing; never with reduced motion).
      const kick = cinematic && state.phase === "running" && state.dash > 0;
      if (kick !== kicking) { kicking = kick; cameraController.fovKick.set("dash", kick ? DASH_KICK_DEG : 0, DASH_KICK_HALFLIFE); }
    },
    setIntro(k) { introBlend = k === null ? null : Math.max(0, Math.min(1, k)); },
    resetCamera() { chase.reset(); },
    resetRun() {
      aliveFlags.fill(1);
      flamesDirty = true;
      pieces = [];
      slotEntity.clear();
      for (const p of pool) p.life = 0;
      scarfTrail?.clear();
      mixerClip.fill("");
      lastLookS = -1e9;
      for (let i = 0; i < SLASH_POOL; i++) { slashes[i]!.age = 99; slashBatch.collapse(i); }
      slashBatch.flush(node("slash-arcs"), false);
      node("slash-arcs").setVisible(false);
      if (evening) {
        for (let i = 0; i < FLIPBOOK_POOL; i++) {
          sparkBursts[i]!.left = 0; node(`spark-burst-${i}`).setVisible(false);
          smokeBursts[i]!.left = 0; node(`smoke-step-${i}`).setVisible(false);
        }
      }
      options.impactRig?.reset();
    },
    probeBones(joint) {
      const names = actors[0]!.animation.skeletonJointNames();
      const name = joint && names.includes(joint) ? joint : names.includes("LeftForeArm") ? "LeftForeArm" : names[0]!;
      const clip = options.actors.clip;
      const length = clipLength(clip);
      const translations: [number, number, number][] = actors.map((actor, i) => {
        actor.playClip(clip, (i * 0.0713) % length);
        const graph = actor.pipeline.resources.scene;
        graph.updateWorldTransforms();
        const n = graph.findByName(name)[0];
        const m = n?.transform.worldMatrix;
        return m ? [m[12]!, m[13]!, m[14]!] : [0, 0, 0];
      });
      return { joint: name, translations, distinct: new Set(translations.map((t) => t.map((v) => v.toFixed(4)).join(","))).size };
    },
    look: () => ({ mode: evening ? "evening" : "original", district, scarf: scarfTrail ? { length: scarfTrail.length, points: scarfTrail.pointCount } : null, lights: { amber: lightPool.amber, cyan: lightPool.cyan } }),
    stats: () => ({ visibleActors: visible.filter(Boolean).length, actors: actors.length, pickups: pickups.length, particles: pool.filter((p) => p.life > 0).length, debris: pieces.length, threat: threatShown }),
    dispose() { detach(); }
  };
}
