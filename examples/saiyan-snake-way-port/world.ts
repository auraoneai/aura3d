/**
 * Serpentine Sky Run on the public `@aura3d/engine` surface only: the road as one dynamic ribbon with
 * `material.custom`, a ray-marched cloud deck and starry sky dome, the rigged runner (a procedural figure as
 * fallback) with its aura shell, ki sparks and speed streaks, pooled multi-part props for the road's entities, the
 * chase camera and the post stack. The simulation (`sim.ts`) never imports this file.
 */
import { attachRootRenderSource, camera, cloneSkinned, effects, environments, geometry, instances, lights, material, primitives, scene, text3D, type AuraApp, type TypedGLBActor } from "@aura3d/engine";
import { createCameraClearance } from "@aura3d/engine/game";
import { createImpactRig } from "../../apps/showcase-port-shared/feel";
import { gapAhead } from "./hud";
import { HERO_PARTS, apply, mul, poseHero, rx, ry, rz, type HeroColor, type HeroPartSpec, type M3, type V3 as LV3 } from "./hero";
import {
  PALETTE, auraSpec, blobSpec, boostGateSpec, cloudBillowInstancedSpec, flagInstancedSpec, flatSpec, flipbookSpec, glowInstancedSpec, glowSpec, hexLinear, islandInstancedSpec, roadSpec, skySpec, solidSpec, type CustomSpec, type Rgb
} from "./materials";
import { PROFILE, buildRoadMesh, buildRoadSamples, frameAt, onRoad, type RoadFrame, type V3 } from "./road";
import { advanceRunPhase, stepChaseRig, withSample, type ChaseRig, type PresentSample } from "./presentation";
import { ROAD_LENGTH, STAGES, entityHeight, entityLateral, type Entity, type RunState } from "./sim";
import type { RunnerStyle } from "./styles";
import { ENTITY_MODELS, ISLAND_COUNT, ISLAND_VARIANTS, LANTERN_COUNT, runnerModelForLook } from "./models";
import {
  MAT_CHOCHIN_PAPER,
  MAT_INSTANCED_DORSAL_SPINE,
  MAT_INSTANCED_TORII_EBONY,
  MAT_INSTANCED_TORII_VERMILION,
  buildCoiledTailMonumentNode,
  buildColossalSerpentHeadNode,
  buildEntityModelNode,
  buildPalaceLanternNode,
  buildSanctuaryPlanetletNode,
  buildSerpentGatehouseNode,
  buildSkyIslandVariantNode,
  cumulusBillowSculptedSpec,
  dorsalSpineFinSpec,
  hangingVergeLanternSpec,
  orbSculptedSpec,
  powerCrystalSculptedSpec,
  powerHaloSculptedSpec,
  skyRunnerPartSculptedSpec,
  soulCoreSculptedSpec,
  soulTailSculptedSpec,
  toriiChochinLanternSpec,
  toriiEbonyTrimSpec,
  toriiVermilionGateSpec,
  type PooledEntityModelType,
  type SkyIslandVariantKey
} from "./art/proceduralModels";
import { STAGE_LOOK, lookAt, lookDistance, lookParams, type LookMode, type LookParams, type ResolvedLook } from "./art/colorScript";
import { createLookDriver, type LookAppLike, type LookNodeHandle } from "./art/lookRuntime";
import { SERPENT_RUNNER_TRAIL, registerSerpentVfx, serpentRainPreset } from "./art/vfx";
import { createAmbientFx } from "./art/ambientFx";
import { createVfxEventTracker } from "./art/vfxEvents";
import { createCinePostDriver, type CinePostState } from "./art/cinePost";
import { createShotDirector, type Shot } from "./art/shots";
import { BEND_PROBE, auraPulse, createRunnerAnimator, runnerLean, type MixerActorLike, type RunnerAnimator } from "./art/motion";
import { labCameraOptions, readLabFlags } from "../shared/lab-flags";

type Scene = ReturnType<typeof scene>;
const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

/** Entities kept alive per type (the road keeps roughly 900 m of entities alive). */
export const POOLS: Readonly<Record<string, number>> = { orb: 150, soul: 40, barrier: ENTITY_MODELS.barrier!.pool, arch: ENTITY_MODELS.arch!.pool, oni: ENTITY_MODELS.oni!.pool, sweeper: ENTITY_MODELS.sweeper!.pool, power: 10, feast: ENTITY_MODELS.feast!.pool };

const POWER_STYLE: Readonly<Record<string, { core: Rgb; shell: Rgb }>> = {
  surge: { core: hexLinear(PALETTE.auraCore), shell: hexLinear(PALETTE.aura) },
  vitalseed: { core: hexLinear(0xd8ffe8), shell: hexLinear(PALETTE.jade) },
  stamp: { core: hexLinear(0xfff0b0), shell: hexLinear(PALETTE.gold) },
  pole: { core: hexLinear(0xffd2c0), shell: hexLinear(PALETTE.lacquer) },
  puff: { core: hexLinear(PALETTE.kiCore), shell: hexLinear(PALETTE.ki) },
  weights: { core: hexLinear(0xcfc4e8), shell: hexLinear(PALETTE.lacquerDark) }
};

export const CHASE_CAMERA = {
  backBase: 5.75,
  backSpeedFactor: 0.009,
  backSpeedMax: 0.5,
  backFly: 7.4,
  rise: 3.3,
  riseFly: 4.15,
  ahead: 24,
  aim: 1.5
} as const;

const HERO_COLORS: Readonly<Record<HeroColor, { base: Rgb; glow?: Rgb; amount?: number }>> = {
  gi: { base: hexLinear(PALETTE.gi) },
  giDark: { base: hexLinear(PALETTE.giDark) },
  skin: { base: hexLinear(PALETTE.skin) },
  hair: { base: hexLinear(0x1d1620) },
  teal: { base: hexLinear(PALETTE.teal) },
  boot: { base: hexLinear(0x2c3470) },
  sash: { base: hexLinear(0x2fc8b4), glow: hexLinear(0x2fc8b4), amount: 0.14 },
  wrap: { base: hexLinear(0xf2eadc) },
  gold: { base: hexLinear(0xf0b84a), glow: hexLinear(0xf2b33d), amount: 0.1 },
  eye: { base: hexLinear(0x171321) }
};

type Shape = "capsule" | "sphere" | "cylinder" | "box" | "cone" | "octahedron" | "model";
interface PartSpec {
  readonly shape: Shape;
  readonly size?: number | readonly [number, number, number];
  readonly cone?: { readonly radius: number; readonly height: number };
  /** Shape "model": the Meshy asset key (see models.ts); `size` is unused. */
  readonly model?: string;
  readonly mat: string;
  /** Offset in the entity frame (x right, y up, z back along the road). */
  readonly at: LV3;
  /** Extra local rotation as ZYX Euler angles. */
  readonly rot?: LV3;
  /** Spin about the part's own up axis, radians per second. */
  readonly spin?: number;
}

const ENTITY_PARTS: Readonly<Record<string, readonly PartSpec[]>> = {
  orb: [{ shape: "sphere", size: 0.6, mat: "orb", at: [0, 0, 0] }],
  soul: [
    { shape: "sphere", size: 1.5, mat: "soul", at: [0, 0, 0] },
    { shape: "cone", cone: { radius: 0.55, height: 1.7 }, mat: "soul", at: [0, -0.05, 1.1], rot: [Math.PI / 2, 0, 0] }
  ],
  barrier: [{ shape: "model", model: "barrier", mat: "", at: [0, -ENTITY_MODELS.barrier!.baseY, 0], rot: [0, ENTITY_MODELS.barrier!.yaw, 0] }],
  arch: [{ shape: "model", model: "arch", mat: "", at: [0, -ENTITY_MODELS.arch!.baseY, 0], rot: [0, ENTITY_MODELS.arch!.yaw, 0] }],
  oni: [{ shape: "model", model: "oni", mat: "", at: [0, -ENTITY_MODELS.oni!.baseY, 0], rot: [0, ENTITY_MODELS.oni!.yaw, 0] }],
  sweeper: [{ shape: "model", model: "sweeper", mat: "", at: [0, -ENTITY_MODELS.sweeper!.baseY, 0], rot: [0, ENTITY_MODELS.sweeper!.yaw, 0] }],
  power: [
    { shape: "octahedron", size: 0.95, mat: "power", at: [0, 0, 0], spin: 2.4 },
    { shape: "sphere", size: 1.9, mat: "powerHalo", at: [0, 0, 0] }
  ],
  feast: [{ shape: "model", model: "feast", mat: "", at: [0, -ENTITY_MODELS.feast!.baseY, 0], rot: [0, ENTITY_MODELS.feast!.yaw, 0], spin: 0.6 }]
};

/** GU47 SSR-18: entity types drawn as one instanced node per part under the colour script (one draw each). */
export const INSTANCED_TYPES: ReadonlySet<string> = new Set(["orb", "soul", "power"]);

/** GU47 SSR-11: verge dressing spacing (m), how far ahead / behind it is kept, and flags per post span. */
export const VERGE_SPACING = 18;
const VERGE_AHEAD = 324;
const VERGE_BEHIND = 18;
const FLAGS_PER_SPAN = 4;
/**
 * GU47 phase 3 (rubric: the flags read as floating cards): each span also draws its lacquer post and the sagging cord the
 * flags hang from, as extra instances of the same flag draw (0 new draws): flags + 1 post + FLAGS_PER_SPAN cord segments.
 */
const VERGE_PIECES = FLAGS_PER_SPAN * 2 + 1;
const POST_TINT: V3 = [0.16, 0.025, 0.03];
const CORD_TINT: V3 = [0.09, 0.05, 0.06];
export const VERGE_POSTS = 2 * Math.ceil((VERGE_AHEAD + VERGE_BEHIND) / VERGE_SPACING);
/**
 * GU47 phase 4 (rubric: shadows): pilgrim gates (two lacquer posts, a gold tie beam and a lintel) span the road every
 * `GATE_EVERY` verge spans, drawn as extra instances of the flag draw (0 new draws). The flag draw casts the sun shadow, so
 * the gates lay shadow bands across the plates. They stand outside the road top (posts at +-GATE_HALF_SPAN m) and their beams
 * clear 7.6 m, above every grounded runner pose; presentation only (no collision). None within GATE_BOARD_CLEAR m of a board.
 */
export const GATE_EVERY = 3;
export const GATE_HALF_SPAN = 7.4;
/** Lacquer pillar width (m); the road shader's post trace uses half of it (shaders.ts ROAD_FRAGMENT). */
export const GATE_POST_WIDTH = 0.8;
const GATE_PIECES = 2;
const GATE_BOARD_CLEAR = 30;
export const GATE_SLOTS = Math.ceil(VERGE_POSTS / 2 / GATE_EVERY) + 1;
const GATE_RING_SLOTS = 6;
export const CLOUD_BILLOW_COUNT = 108;
const CLOUD_BILLOW_SPACING = 4.6;
export const DORSAL_SPINE_SPACING = 6;
export const DORSAL_SPINE_PAIRS = 58;
export const DORSAL_SPINE_SLOTS = DORSAL_SPINE_PAIRS * 2;
const VFX_PLASMA_SLOTS = 6;
const VFX_DUST_SLOTS = 4;
/** Vermilion shrine streamer silk tint hung beside each batched Japanese torii pillar. */
const TORII_STREAMER_TINT: V3 = [0.78, 0.08, 0.07];
/** Flag-draw capacity: verge pieces plus the torii silk streamer pieces. */
export const FLAG_DRAW_SLOTS = VERGE_POSTS * VERGE_PIECES + GATE_SLOTS * GATE_PIECES;
/**
 * GU47 phase 4 (WP-36 `serpSerpentHead`): the colossal serpent head rising out of the cloud sea beside the road, one model
 * recycled every SERPENT_HEAD.cycle m, alternating sides, entering from the fog far ahead.
 */
export const SERPENT_HEAD = { cycle: 1400, ahead: 1050, lateral: 150, height: 130, rise: -12, yawDeg: 45 } as const;
/**
 * GU47 SSR-11: island parallax bands beyond the six near Meshy islands. Each band is one instanced draw of inverted spire
 * cones recycled along the road: `count` islands every `spacing` m, `lateral` m out, `up` m above the road, `fog` the
 * minimum fog (far band reads as a silhouette layer).
 */
export const ISLAND_BANDS = [
  { id: "islands-mid", count: 12, spacing: 120, lateral: [70, 130], up: [8, 40], radius: [9, 16], height: [22, 40], fog: 0.25 },
  { id: "islands-far", count: 18, spacing: 110, lateral: [180, 320], up: [20, 90], radius: [18, 34], height: [45, 90], fog: 0.55 }
] as const;
/**
 * GU47 phase 2: the spire bands stay unbuilt. In the captures the 7-sided cones read as flat pink/violet placeholder
 * triangles hanging over the cloud sea (the 4.6.2 frame showed only the Meshy islands, which read better).
 */
export const SPIRE_BANDS_SHOWN = false;
/**
 * GU47 SSR-17: TRAFFIC's soul column, souls spiralling up from the cloud sea beside the road (one instanced glow draw),
 * shown while it is within `SOUL_COLUMN.show` m ahead.
 */
export const SOUL_COLUMN = { s: 2150, lateral: -70, count: 36, height: 140, radius: 7, show: 900 } as const;

/** GU47 SSR-11: SDF stage boards hung high above the forward sightline at each stage boundary. */
export const BOARD_SHOW_AHEAD = 520;
export const BOARD_HEIGHT = 16.8;
/** Stage boards: every stage after the first, at its boundary (outbound distance). */
export const STAGE_BOARDS: readonly { readonly id: string; readonly s: number; readonly text: string }[] = STAGES.slice(1).map((stage, i) => ({ id: `stage-board-${i + 1}`, s: stage.from, text: stage.name }));
const FLAG_COLORS: readonly Rgb[] = [hexLinear(0xff7a6b), hexLinear(0xf2b33d), hexLinear(0x7fe0c4), hexLinear(0xf4eefa), hexLinear(0x6a5ad8)];

/** Column-major mat4 (T·R·S) from a column-major M3 basis, a position and a uniform scale, written at `out[o..o+15]`. */
function writeMatrix(out: Float32Array, o: number, m: M3, p: V3, k: number): void {
  out[o] = m[0] * k; out[o + 1] = m[1] * k; out[o + 2] = m[2] * k; out[o + 3] = 0;
  out[o + 4] = m[3] * k; out[o + 5] = m[4] * k; out[o + 6] = m[5] * k; out[o + 7] = 0;
  out[o + 8] = m[6] * k; out[o + 9] = m[7] * k; out[o + 10] = m[8] * k; out[o + 11] = 0;
  out[o + 12] = p[0]; out[o + 13] = p[1]; out[o + 14] = p[2]; out[o + 15] = 1;
}

/** Matrix columns (x, y, z axes) to the engine's ZYX Euler angles (R = Rz·Ry·Rx). */
function basisToEuler(x: V3, y: V3, z: V3): V3 {
  const m11 = x[0], m12 = y[0], m21 = x[1], m22 = y[1], m31 = x[2], m32 = y[2], m33 = z[2];
  const ey = Math.asin(-Math.max(-1, Math.min(1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
  return [0, ey, Math.atan2(-m12, m22)];
}
const matrixEuler = (m: M3): V3 => basisToEuler([m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]);

/** Orientation whose local Y is the road's up and whose local -Z points down the road (the original's `makeBasis(R, U, -F)`). */
function frameBasis(frame: RoadFrame, yawOffset = 0): M3 {
  let R = frame.R, F = frame.F;
  if (yawOffset) {
    const c = Math.cos(yawOffset), s = Math.sin(yawOffset);
    R = [frame.R[0] * c + frame.F[0] * s, frame.R[1] * c + frame.F[1] * s, frame.R[2] * c + frame.F[2] * s];
    F = [frame.F[0] * c - frame.R[0] * s, frame.F[1] * c - frame.R[1] * s, frame.F[2] * c - frame.R[2] * s];
  }
  return [R[0], R[1], R[2], frame.U[0], frame.U[1], frame.U[2], -F[0], -F[1], -F[2]];
}

/** Local ZYX Euler (R = Rz·Ry·Rx) as a matrix. */
const eulerMatrix = (e: LV3): M3 => mul(rz(e[2]), mul(ry(e[1]), rx(e[0])));

/** Meshy humanoid (see assets/ATTRIBUTION.md): faces +Z; clips are listed in `CLIP`. */
const RIG_SCALE = 1.8;
const CLIP = { run: "Run_Loop", air: "Jump_Loop", fly: "Flight_Loop", dive: "Dive_Loop", slide: "Slide_Loop", idle: "Idle_Loop", hit: "Hit_React" } as const;

export interface RunnerActor {
  readonly actor: TypedGLBActor;
  readonly clips: readonly string[];
  readonly durations: Readonly<Record<string, number>>;
  dispose(): void;
}

/** Resolves to null so the sculpted procedural martial-arts sky-runner renders with zero GLB fetches. */
export async function loadRunner(_canvas: HTMLCanvasElement, _mode: LookMode = "script"): Promise<RunnerActor | null> {
  return null;
}

export interface WorldOptions {
  readonly canvas?: HTMLCanvasElement;
  readonly runner?: RunnerActor | null;
  /** GU47 look mode and pinned stage (default: read from `location.search`, see art/colorScript.ts). */
  readonly look?: LookParams;
  /** GU47 SSR-19: the quality tier the app mounts at (default: the `renderer.quality: "auto"` rule, see `autoTier`). */
  readonly tier?: string;
}

/** The engine's `quality: "auto"` rule (compiler/shadows.ts): "medium" on coarse pointers, else "high". */
export function autoTier(coarse: boolean = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches): string {
  return coarse ? "medium" : "high";
}

/** GU47 SSR-19: sun cascades per tier (2 on High / Ultra, 1 on Medium / Low; PRD §6.4). */
export const sunCascades = (tier: string): 1 | 2 => (tier === "high" || tier === "ultra" ? 2 : 1);

/** GU47: the look the last frame drew (QA hook `meta().look`). */
export interface WorldLookState {
  readonly mode: LookParams["mode"];
  readonly id: string;
  readonly stageIndex: number;
  readonly godRays: boolean;
  readonly writes: number;
}

export interface WorldRuntime {
  /** `outro` is the render time in seconds since the run left the `run` phase (fall, leap or game over). */
  /** `blend` is the interpolated sample to draw instead of the simulated runner state; omit it to draw `state` as is. */
  update(state: RunState, dt: number, time: number, aspect: number, outro?: number, blend?: PresentSample): void;
  resetCamera(): void;
  setRunnerStyle(style: RunnerStyle): void;
  /** Reduced motion (C9): no camera shake and no speed FOV widening. */
  setReducedMotion(on: boolean): void;
  /** GU47 phase 2: title screen (no run started); the camera holds the chase framing instead of the intro's first pose. */
  setTitle?(on: boolean): void;
  /** `setVisible` calls the last `update` made (pooled slots only change when they change state). */
  readonly visibilityWrites: number;
  readonly nodeCount: number;
  readonly entityNodes: number;
  readonly look: WorldLookState;
  /** GU47 SSR-07: motion blur, aberration and DOF state (QA hook; null under `?look=original`). */
  readonly cinePost: CinePostState | null;
  /** GU47 SSR-15: the camera shot the last frame drew (null under `?look=original`). */
  readonly shot: Shot | null;
  /** GU47 SSR-13: lightning strikes so far (QA hook). */
  readonly strikes: number;
  /** GU47 SSR-12: runtime effect bursts fired so far (QA hook). */
  readonly vfxFired: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

/**
 * Neutral-room IBL for the PBR runner and the Meshy props (LIGHT-01). Since 4.5.0 a lights-only scene gets no implicit
 * environment, so without this node the runner and props lost the neutral-room probe they had on 4.3.7 (diffuse and
 * specular 1). The custom road, sky and figure materials are unlit and ignore it. Calibrated with the hemisphere on
 * (it contributes next to an environment, per normal, since lane E2's LIGHT-05/08) against v4.3.7 at the same game state:
 * runner crop 193.3 on v4.3.7, 168.1 on 4.5.0 without an environment, 191.5 at 0.8 and 195.1 at 1.0 (remote runs
 * g17v437a, g17before1, g17e2cal1; docs/audits/lanes/g17.md). `?env=<n>` overrides it for calibration captures only.
 */
export const ENV_INTENSITY = 0.9;
export function environmentIntensity(search: string | undefined = typeof location !== "undefined" ? location.search : undefined): number {
  const raw = search ? new URLSearchParams(search).get("env") : null;
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : ENV_INTENSITY;
}

/** GU47 SSR-06: warm sun glow plus three small ghosts in the serpent palette (gold, jade, coral). */
const SUN_FLARE_ELEMENTS = [
  { size: 420, distance: 0, color: "#ffe2b0" },
  { size: 48, distance: 0.55, color: "#f2b33d" },
  { size: 70, distance: 0.8, color: "#7fe0c4" },
  { size: 36, distance: 1, color: "#ff7a6b" }
] as const;

const STREAKS = 22;
const SPARKS = 18;
const BURSTS = 14;

/** True when the page asks for `?shadow=0` (calibration captures). */
const shadowOff = (): boolean => typeof location !== "undefined" && new URLSearchParams(location.search).get("shadow") === "0";
/** True when `?env=<n>` overrides the environment intensity (calibration captures). */
const envOverride = (): boolean => typeof location !== "undefined" && new URLSearchParams(location.search).has("env");

/** Rotates `v` about the unit axis `k` by `a` radians (Rodrigues). */
function rotateAbout(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a), d = (v[0] * k[0] + v[1] * k[1] + v[2] * k[2]) * (1 - c);
  return [v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d, v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d, v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d];
}

/**
 * GU47 SSR-15: the shot applied to the chase pose: leap orbit about the runner, the intro (from 40 m ahead and 14 m up,
 * looking back at the runner) blended into the chase, and the bank roll of the up vector about the view axis.
 */
export function applyShot(shot: Shot, eye: V3, look: V3, runner: V3, forward: V3, up: V3): [V3, V3, V3] {
  let e = eye, l = look;
  if (shot.orbit) {
    const off = rotateAbout([e[0] - runner[0], e[1] - runner[1], e[2] - runner[2]], up, shot.orbit);
    e = [runner[0] + off[0], runner[1] + off[1], runner[2] + off[2]];
  }
  if (shot.intro > 0) {
    const w = shot.intro;
    const introEye: V3 = [runner[0] + forward[0] * 40 + up[0] * 14, runner[1] + forward[1] * 40 + up[1] * 14, runner[2] + forward[2] * 40 + up[2] * 14];
    const introLook: V3 = [runner[0] + up[0] * 1.5, runner[1] + up[1] * 1.5, runner[2] + up[2] * 1.5];
    e = [e[0] + (introEye[0] - e[0]) * w, e[1] + (introEye[1] - e[1]) * w, e[2] + (introEye[2] - e[2]) * w];
    l = [l[0] + (introLook[0] - l[0]) * w, l[1] + (introLook[1] - l[1]) * w, l[2] + (introLook[2] - l[2]) * w];
  }
  let u = up;
  if (shot.roll) {
    const v: V3 = [l[0] - e[0], l[1] - e[1], l[2] - e[2]];
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    u = rotateAbout(up, [v[0] / n, v[1] / n, v[2] / n], shot.roll);
  }
  return [e, l, u];
}

export function buildWorld(options: WorldOptions = {}): World {
  const samples = buildRoadSamples();
  const lookConfig = options.look ?? lookParams();
  const script = lookConfig.mode === "script";
  const first = STAGE_LOOK[lookConfig.pinnedStage ?? 0]!;
  const builder: Scene = scene()
    .background(script ? first.sky.zenith : "#f2c6de")
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: script ? [0, CHASE_CAMERA.rise, 6.07] : [0, CHASE_CAMERA.rise, 6.1], target: script ? [0, CHASE_CAMERA.aim, -CHASE_CAMERA.ahead] : [0, CHASE_CAMERA.aim, -CHASE_CAMERA.ahead], fov: 62, near: 0.5, far: 6000 }))
    // the custom materials are unlit; these light the rigged runner (hemisphere colours are the look spec's).
    // GU47 SSR-02: under the colour script the hemisphere drops 1.1 -> 0.6 and the environment 0.9 -> ~0.6, and a violet
    // camera-side fill (0.6, unshadowed) keeps the backlit runner readable; `?look=original` keeps today's rig.
    .add(lights.hemisphere({ name: "sky fill", skyColor: script ? first.hemisphere.sky : "#f6d0e6", groundColor: script ? first.hemisphere.ground : "#b98a2e", intensity: script ? first.hemisphere.intensity : 1.1 }).runtime({ id: "sky fill" }))
    // GU47 phase 4 (rubric: ibl_reflections): under the colour script the runner and props reflect a sunset sky probe
    // (background off; the custom sky stays the visible sky) instead of the neutral room; `?look=original` keeps the room.
    .add(script && !envOverride()
      ? environments.preset("sunset", { name: "dusk sky probe", intensity: first.environmentIntensity, specularIntensity: 1.8, background: false })
      : environments.neutral({ intensity: script && !envOverride() ? first.environmentIntensity : environmentIntensity() }))
    // GU47 SSR-03 / SSR-19: two cascades over 140 m with PCSS under the colour script on High; the second cascade drops on
    // the Medium / Low tiers (an explicit cascade count is never capped by the tier, so it is chosen here).
    .add(lights.directional({ name: "sun", position: [-40, 60, -70], target: [0, 0, 0], intensity: script ? first.sun.intensity : 2.2, color: script ? first.sun.color : "#fff0dc", shadow: (shadowOff() ? false : script ? { cascades: sunCascades(options.tier ?? autoTier()), maxDistance: 140, filter: "pcss", lightSize: 2 } : { cascades: 1, maxDistance: 80 }) as never }).runtime({ id: "sun" }));
  if (script) {
    builder.add(lights.directional({ name: "fill", position: [0, 4, 20], target: [0, 1, 0], intensity: first.fill.intensity, color: first.fill.color, shadow: false }).runtime({ id: "fill" }));
    builder.add(lights.point({ name: "title-head-key", position: [0, -500, 0], color: "#ffd494", intensity: 280, distance: 260, decay: 1.5, shadow: false }).runtime({ id: "title-head-key" }));
    builder.add(lights.point({ name: "title-head-rim", position: [0, -500, 0], color: "#7fe0c4", intensity: 210, distance: 240, decay: 1.5, shadow: false }).runtime({ id: "title-head-rim" }));
    builder.add(effects.contactShadows({ length: 0.34, thickness: 0.06, intensity: 0.85, lights: "sun" }));
    // GU47 SSR-06: sun lens flare (positioned on the sun each frame; shown with the god rays: High / Ultra, low-sun stages)
    builder.add(lights.lensFlare({ name: "sun flare", position: [0, -500, 0], intensity: 0, edgeFade: 0.25, elements: SUN_FLARE_ELEMENTS }).runtime({ id: "sun-flare" }));
  }

  /* road + sky */
  const mesh = buildRoadMesh(samples);
  const ring = PROFILE.length;
  const crossProfile = new Float32Array((mesh.positions.length / 3) * 2);
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    const pt = PROFILE[v % ring] as readonly [number, number];
    crossProfile[v * 2] = pt[0];
    crossProfile[v * 2 + 1] = pt[1];
  }
  builder.add(
    geometry
      .custom(
        geometry.dynamic({
          positions: f32(mesh.positions), normals: f32(mesh.normals), uvs: f32(mesh.uvs), indices: Uint32Array.from(mesh.indices),
          attributes: { crossProfile: { itemSize: 2, data: crossProfile } }
        }),
        { name: "road", material: material.custom(roadSpec()) }
      )
      .runtime({ id: "road" })
  );
  builder.add(primitives.sphere({ name: "sky", size: 5200, material: material.custom(skySpec()) }).runtime({ id: "sky" }));

  /* materials shared by figures and props */
  const solid = (c: Rgb, glow: Rgb = [0, 0, 0], amount = 0): CustomSpec => solidSpec(c, glow, amount);
  const propMaterials: Readonly<Record<string, CustomSpec>> = {
    orb: glowSpec(hexLinear(PALETTE.kiCore), hexLinear(PALETTE.ki)),
    soul: glowSpec(hexLinear(PALETTE.spirit), hexLinear(PALETTE.bone), 0.95, 1),
    barrierBase: solid(hexLinear(0x2d3d52)),
    barrierPost: solid(hexLinear(PALETTE.teal), hexLinear(PALETTE.jade), 0.25),
    barrierField: glowSpec(hexLinear(0xd8fff0), hexLinear(PALETTE.jade)),
    lacquer: solid(hexLinear(PALETTE.lacquer), hexLinear(PALETTE.lacquerDark), 0.1),
    lacquerDark: solid(hexLinear(PALETTE.lacquerDark)),
    oni: solid(hexLinear(0xc4503c)),
    oniDark: solid(hexLinear(0x8f2f2a)),
    bone: solid(hexLinear(PALETTE.bone)),
    club: solid(hexLinear(0x5d4630)),
    cart: solid(hexLinear(0x6a5b48)),
    wheel: solid(hexLinear(0x3a3128)),
    lantern: glowSpec(hexLinear(0xfff0b0), hexLinear(PALETTE.gold)),
    power: glowSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.aura)),
    powerHalo: glowSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.aura)),
    feastPlate: solid(hexLinear(PALETTE.gold), hexLinear(PALETTE.gold), 0.25),
    feast: solid(hexLinear(0xe0a050), hexLinear(PALETTE.gold), 0.2)
  };

  const addPart = (id: string, spec: { shape: Shape; size?: number | readonly [number, number, number]; cone?: { radius: number; height: number } }, spec3: CustomSpec, hidden: boolean): void => {
    const size = spec.size ?? 1;
    const mat = material.custom(spec3);
    const sz = size as number | [number, number, number];
    let node;
    switch (spec.shape) {
      case "capsule": node = primitives.capsule({ name: id, size: sz as [number, number, number], material: mat }); break;
      case "cylinder": node = primitives.cylinder({ name: id, size: sz as [number, number, number], material: mat }); break;
      case "box": node = primitives.box({ name: id, size: sz, material: mat }); break;
      case "cone": node = primitives.cone({ name: id, params: { radius: spec.cone?.radius ?? 0.2, height: spec.cone?.height ?? 0.6, radialSegments: 8 }, material: mat }); break;
      case "octahedron": node = primitives.polyhedron({ name: id, params: { variant: "octahedron", detail: 0, radius: typeof size === "number" ? size : 0.9 }, material: mat }); break;
      default: node = primitives.sphere({ name: id, size: sz, material: mat });
    }
    builder.add((hidden ? node.position(0, -500, 0) : node).runtime({ id }));
  };

  /*
   * Sculpted multi-material roadside palace lanterns, floating sky islands, colossal dragon head, gatehouse, coiled tail
   * monument, and distant sanctuary planetlet (`art/proceduralModels.ts`). Under the colour script neither the lanterns nor
   * the sky islands cast sun shadows so cascade depth draws stay lean while retaining contact depth.
   */
  for (let i = 0; i < LANTERN_COUNT; i++) builder.add(buildPalaceLanternNode(`lantern-${i}`, `lantern-${i}`, !script));
  for (let i = 0; i < ISLAND_COUNT; i++) {
    const variant = script ? ISLAND_VARIANTS[i % ISLAND_VARIANTS.length]! : { key: "island" as const, targetHeight: 15 };
    builder.add(buildSkyIslandVariantNode(variant.key as SkyIslandVariantKey, variant.targetHeight, `island-${i}`, `island-${i}`, !script));
  }
  if (script) {
    builder.add(buildColossalSerpentHeadNode("serpent-head", "serpent-head"));
    builder.add(buildSerpentGatehouseNode("serpent-gatehouse", "serpent-gatehouse"));
    builder.add(buildCoiledTailMonumentNode("serpent-tail-monument", "serpent-tail-monument"));
    builder.add(buildSanctuaryPlanetletNode("sanctuary-planetlet", "sanctuary-planetlet"));
  }

  /* the sculpted martial-arts sky runner and the aura shell */
  const heroRoughness: Readonly<Record<HeroColor, number>> = {
    gi: 0.84,
    giDark: 0.84,
    teal: 0.84,
    boot: 0.84,
    sash: 0.84,
    wrap: 0.84,
    skin: 0.56,
    hair: 0.26,
    gold: 0.28,
    eye: 0.12
  };
  for (const part of HERO_PARTS as readonly HeroPartSpec[]) {
    const c = HERO_COLORS[part.color];
    const id = `r-${part.id}`;
    const mat = material.custom(
      solidSpec(c.base, c.glow ?? [0, 0, 0], c.amount ?? 0, {
        roughness: heroRoughness[part.color],
        toneFromUv: 1
      })
    );
    builder.add(
      geometry
        .custom(geometry.define(skyRunnerPartSculptedSpec(part.id)), {
          name: id,
          material: mat,
          ...(script ? { castShadow: true } : {})
        })
        .runtime({ id })
    );
  }
  builder.add(primitives.cylinder({ name: "aura-outer", size: [1.82, 2.95, 1.82], material: material.custom(auraSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.auraLit), hexLinear(PALETTE.aura), 0.8)) }).runtime({ id: "aura-outer" }));
  builder.add(primitives.cylinder({ name: "aura-inner", size: [1.36, 2.52, 1.36], material: material.custom(auraSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.auraLit), hexLinear(PALETTE.aura), 0.8)) }).runtime({ id: "aura-inner" }));
  // GU47 phase 6: the blob decal (2 cm thick) is not a sun caster under the colour script (2 depth draws)
  builder.add(primitives.cylinder({ name: "contact-shadow", size: [2.3, 0.02, 2.3], material: material.custom(blobSpec(1.05, 0.5)), ...(script ? { castShadow: false } : {}) }).runtime({ id: "contact-shadow" }));
  // GU47 SSR-12: under the colour script the engine's runtime effects (art/vfx.ts) replace the spark and burst pools
  if (!script) for (let i = 0; i < SPARKS; i++) builder.add(primitives.sphere({ name: `spark-${i}`, size: 0.3, material: material.custom(flatSpec(hexLinear(PALETTE.auraLit), 0.85)) }).position(0, -500, 0).runtime({ id: `spark-${i}` }));
  if (!script) for (let i = 0; i < BURSTS; i++) builder.add(primitives.sphere({ name: `burst-${i}`, size: 0.34, material: material.custom(flatSpec(hexLinear(0xfff0b0), 0.9)) }).position(0, -500, 0).runtime({ id: `burst-${i}` }));
  // GU47 SSR-13: under the colour script runtime cloud wisps (art/ambientFx.ts) replace the box streaks
  if (!script) for (let i = 0; i < STREAKS; i++) builder.add(primitives.box({ name: `streak-${i}`, size: [0.04, 0.04, 6], material: material.custom(flatSpec(hexLinear(0xfff0f6), 0.2)) }).position(0, -500, 0).runtime({ id: `streak-${i}` }));

  /* GU47 SSR-18/SSR-09 + WP-21: sculpted orbs, spirit wisps and power-ups as instanced glow nodes */
  const instancedMaterials: Readonly<Record<string, CustomSpec>> = {
    orb: glowInstancedSpec(hexLinear(0xf2fff8), hexLinear(0x7fe0c4)),
    soul: glowInstancedSpec(hexLinear(PALETTE.spirit), hexLinear(PALETTE.bone), 0.95, 1, 0, 1.4),
    power: glowInstancedSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.aura), 1, 0, 1, 2.4),
    powerHalo: glowInstancedSpec(hexLinear(PALETTE.auraCore), hexLinear(PALETTE.aura), 0.8, 1, 1, 1.6)
  };
  if (script) {
    const pickupSpec = (type: string, partIndex: number) =>
      type === "orb" ? orbSculptedSpec()
      : type === "soul" ? (partIndex === 0 ? soulCoreSculptedSpec() : soulTailSculptedSpec())
      : partIndex === 0 ? powerCrystalSculptedSpec() : powerHaloSculptedSpec();
    for (const type of INSTANCED_TYPES) {
      const count = POOLS[type] ?? 0;
      (ENTITY_PARTS[type] ?? []).forEach((part, j) => {
        const id = `inst-${type}-${j}`;
        const transforms = Array.from({ length: count }, () => ({ position: [0, -500, 0] as [number, number, number], scale: 1e-4 }));
        const colors = Array.from({ length: count }, () => "#ffffff");
        const mat = material.custom((type === "power" ? instancedMaterials[part.mat] : instancedMaterials[type]) as CustomSpec);
        builder.add(instances.custom(pickupSpec(type, j), { name: id, transforms, colors, material: mat }).runtime({ id }));
      });
    }
  }

  /* GU47 SSR-11 + WP-21: prayer-flag lines, batched Japanese torii gates, hanging lanterns, balustrade dorsal spines & cumulus billows */
  if (script) {
    const hidden = (n: number) => Array.from({ length: n }, () => ({ position: [0, -500, 0] as [number, number, number], scale: 1e-4 }));
    builder.add(instances.box({ name: "verge-flags", size: [1, 1, 1], transforms: hidden(FLAG_DRAW_SLOTS), colors: Array.from({ length: FLAG_DRAW_SLOTS }, () => "#ffffff"), material: material.custom(flagInstancedSpec()) }).runtime({ id: "verge-flags" }));
    builder.add(instances.custom(toriiVermilionGateSpec(GATE_HALF_SPAN), { name: "torii-vermilion", transforms: hidden(GATE_SLOTS), material: MAT_INSTANCED_TORII_VERMILION, castShadow: false, receiveShadow: true }).runtime({ id: "torii-vermilion" }));
    builder.add(instances.custom(toriiEbonyTrimSpec(GATE_HALF_SPAN), { name: "torii-ebony", transforms: hidden(GATE_SLOTS), material: MAT_INSTANCED_TORII_EBONY, castShadow: false, receiveShadow: true }).runtime({ id: "torii-ebony" }));
    builder.add(instances.custom(toriiChochinLanternSpec(GATE_HALF_SPAN), { name: "torii-chochin", transforms: hidden(GATE_SLOTS), material: MAT_CHOCHIN_PAPER, castShadow: false, receiveShadow: false }).runtime({ id: "torii-chochin" }));
    builder.add(instances.custom(dorsalSpineFinSpec(), { name: "viaduct-dorsal-spines", transforms: hidden(DORSAL_SPINE_SLOTS), material: MAT_INSTANCED_DORSAL_SPINE, castShadow: false, receiveShadow: true }).runtime({ id: "viaduct-dorsal-spines" }));
    // SDF stage boards: an indigo lacquer board with gold-rimmed gold lettering, facing the oncoming runner
    for (const board of STAGE_BOARDS) {
      const bf = frameAt(samples, Math.min(board.s, ROAD_LENGTH));
      const e = matrixEuler(frameBasis(bf));
      const at = onRoad(bf, 0, BOARD_HEIGHT);
      const width = Math.max(10, board.text.length * 1.05 + 3);
      const face = onRoad(bf, 0, BOARD_HEIGHT - 0.55);
      const faceAt: V3 = [face[0] - bf.F[0] * 0.2, face[1] - bf.F[1] * 0.2, face[2] - bf.F[2] * 0.2];
      builder.add(primitives.box({ name: board.id, size: [width, 3.2, 0.3], material: material.custom(solidSpec(hexLinear(0x1c1640), hexLinear(0xf2b33d), 0.08)) }).position(at[0], at[1], at[2]).rotate(e[0], e[1], e[2]).runtime({ id: board.id }));
      builder.add(text3D(board.text, { name: `${board.id}-text`, size: 1.5, depth: 0.05, letterSpacing: 0.06, backend: "sdf", material: material.emissive({ color: "#f2b33d", emissive: "#f2b33d", emissiveIntensity: 1.2 }) }).position(faceAt[0], faceAt[1], faceAt[2]).rotate(e[0], e[1], e[2]).runtime({ id: `${board.id}-text` }));
    }
    builder.add(instances.custom(soulCoreSculptedSpec(), { name: "soul-column", transforms: hidden(SOUL_COLUMN.count), colors: Array.from({ length: SOUL_COLUMN.count }, () => "#ffffff"), material: material.custom(glowInstancedSpec(hexLinear(PALETTE.spirit), hexLinear(PALETTE.bone), 0.85, 1, 0, 1.6)) }).runtime({ id: "soul-column" }));
    for (const band of SPIRE_BANDS_SHOWN ? ISLAND_BANDS : []) {
      builder.add(instances.cone({ name: band.id, params: { radius: 1, height: 1, radialSegments: 7 }, transforms: hidden(band.count), colors: Array.from({ length: band.count }, () => "#ffffff"), material: material.custom(islandInstancedSpec()) }).runtime({ id: band.id }));
    }
    builder.add(instances.custom(hangingVergeLanternSpec(), { name: "verge-lanterns", transforms: hidden(VERGE_POSTS), colors: Array.from({ length: VERGE_POSTS }, () => "#ffffff"), material: material.custom(glowInstancedSpec(hexLinear(0xfff0c8), hexLinear(0xf2b33d), 0.9, 0, 0, 1.8)) }).runtime({ id: "verge-lanterns" }));
    builder.add(instances.custom(cumulusBillowSculptedSpec(), { name: "cloud-billows", transforms: hidden(CLOUD_BILLOW_COUNT), colors: Array.from({ length: CLOUD_BILLOW_COUNT }, () => "#ffffff"), material: material.custom(cloudBillowInstancedSpec()), castShadow: false, receiveShadow: false }).runtime({ id: "cloud-billows" }));
    for (let i = 0; i < GATE_RING_SLOTS; i++) {
      builder.add(primitives.torus({ name: `gate-ring-${i}`, size: 9.6, params: { tube: 0.032, radialSegments: 12, tubularSegments: 36 }, material: material.custom(boostGateSpec()), castShadow: false, receiveShadow: false }).position(0, -500, 0).runtime({ id: `gate-ring-${i}` }));
    }
    for (let i = 0; i < VFX_PLASMA_SLOTS; i++) {
      builder.add(primitives.box({ name: `vfx-plasma-${i}`, size: [3.2, 3.2, 0.02], material: material.custom(flipbookSpec("plasma", [127, 224, 196], 0.3)), castShadow: false, receiveShadow: false }).position(0, -500, 0).runtime({ id: `vfx-plasma-${i}` }));
    }
    for (let i = 0; i < VFX_DUST_SLOTS; i++) {
      builder.add(primitives.box({ name: `vfx-dust-${i}`, size: [3.6, 3.6, 0.02], material: material.custom(flipbookSpec("dust", [255, 226, 192], 0.25)), castShadow: false, receiveShadow: false }).position(0, -500, 0).runtime({ id: `vfx-dust-${i}` }));
    }
    builder.add(effects.auroraRibbon({ name: "celestial-ribbon", color: "#7fe0c4", colorTop: "#ffd36e", intensity: 0.78, width: 210, height: 28, segments: 64, sway: 0.65, shimmer: 0.65 }).position(0, -500, 0).runtime({ id: "celestial-ribbon" }));
  }

  /* entity pools: sculpted multi-material assemblies for obstacles, guardians & hospitality feasts */
  for (const [type, count] of Object.entries(POOLS)) {
    if (script && INSTANCED_TYPES.has(type)) continue;
    (ENTITY_PARTS[type] ?? []).forEach((part, j) => {
      for (let i = 0; i < count; i++) {
        if (part.shape === "model") {
          const id = `ent-${type}-${i}-${j}`;
          builder.add(buildEntityModelNode(type as PooledEntityModelType, id, id));
        } else addPart(`ent-${type}-${i}-${j}`, part, propMaterials[part.mat] as CustomSpec, true);
      }
    });
  }

  /* post: the original look records no composer, so only a faint bloom for the glows and FXAA for the primitive edges */
  if (!script) {
    builder
      .add(effects.bloom({ name: "bloom", intensity: 0.12, threshold: 0.95, radius: 0.4 }))
      .add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  } else {
    // GU47 SSR-05/06 + WP-27 + WP-21: crisp linear distance fog (near >= 150, far >= 520), SSAO crevice grounding,
    // cinematic bloom, subtle golden sun shafts, per-stage grade, vignette 0.22, and FXAA (never depthOfField / motionBlur).
    builder
      .add(effects.fog({ name: "sky-haze", mode: "linear", color: first.fog.color, near: 220, far: 720, maxOpacity: 0.24, density: 0.0008, intensity: 0.08, affectsBackground: false }))
      .add(effects.ambientOcclusion({ name: "ao", intensity: 0.36, radius: 0.68, density: 0.56 }))
      .add(effects.cinematicBloom({ name: "bloom", intensity: first.bloom.intensity, threshold: first.bloom.threshold, color: "#fff0d8", radius: 0.48, softKnee: 0.55 }))
      .add(effects.godRays({ name: "sun-shafts", source: "sun", intensity: 0.06, decay: 0.94, density: 0.45, samples: 32, color: first.sun.color }))
      .add(effects.colorGrade({ name: "grade", temperature: first.grade.temperature, tint: first.grade.tint, saturation: first.grade.saturation, contrast: first.grade.contrast }))
      .add(effects.vignette({ name: "vignette", intensity: 0.22 }))
      .add(effects.volumetricFog({ name: "god rays", density: 0, intensity: 0, volumetricQuality: "off", color: first.sun.color, godRayDensity: 0 }))
      .add(effects.chromaticAberration({ name: "aberration", intensity: 0.003 }))
      .add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  }

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const cameraController = app.camera;
      if (!cameraController) throw new Error("serpentine-sky-run: the app exposes no camera controller");
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, h = app.nodes.require(id));
        return h;
      };
      const runner = options.runner ?? null;
      let actorMatrix: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1000, 0, 1];
      let actorVisible = false;
      let actorClock = 0;
      if (runner && options.canvas) {
        attachRootRenderSource(options.canvas, { source: { collectRenderItems: () => (actorVisible ? runner.actor.collectRenderItems({ modelMatrix: actorMatrix }) : []) } });
      }
      let rig: ChaseRig | null = null;
      let alive = 0;
      let phaseAcc = 0;
      let prevS: number | null = null;
      let prevPulse = 0;
      let burstT = 1;
      let reducedMotion = false;
      let title = false;
      /* GU47 SSR-01: the colour-script driver (script mode only; `?look=original` writes nothing) */
      const lookDriver = script ? createLookDriver(app, (id) => node(id) as unknown as LookNodeHandle) : null;
      let lookShown: ResolvedLook | null = null;
      let lastShot: Shot | null = null;
      /* GU47 SSR-07: speed and moment post (script mode only) */
      const cinePost = script ? createCinePostDriver(app) : null;
      /* GU47 SSR-14: the rigged runner on the E-H mixer (script mode; `?look=original` keeps playClip) */
      const mixerActor = runner?.actor as unknown as Partial<MixerActorLike> | undefined;
      /* GU47 SSR-15: camera shots layered on the chase camera (script mode) */
      const shots = script ? createShotDirector() : null;
      const animator: RunnerAnimator | null = script && runner && typeof mixerActor?.crossFadeTo === "function" && typeof mixerActor.advance === "function"
        ? createRunnerAnimator(mixerActor as MixerActorLike, CLIP.hit) : null;
      /* GU47 SSR-12: runtime effect events and the runner trail (script mode only) */
      const vfxEvents = script ? createVfxEventTracker() : null;
      const fx = script ? app.effects : undefined;
      const reducedFlash = typeof location !== "undefined" && new URLSearchParams(location.search).get("flash") === "0";
      const registerVfx = (): void => { try { registerSerpentVfx(fx, { reducedMotion, reducedFlash: reducedFlash || reducedMotion }); } catch (error) { console.warn("serpentine-sky-run: VFX presets unavailable", error); } };
      registerVfx();
      let trail: { stop(o?: { immediate?: boolean }): void } | null = null;
      /* GU47 SSR-13: wisps, petals, embers, rain and lightning (script mode only) */
      const ambient = script ? createAmbientFx() : null;
      let rainKey = "";
      let exposureBoost = 0;
      let lookSkipAt = Number.NaN;
      let vfxFired = 0;
      /* GU47 SSR-11: verge buffers + WP-27 cloud billows, boost-gate rings, flipbook bursts, camera clearance & impact rig */
      const flagBuf = script ? { data: new Float32Array(FLAG_DRAW_SLOTS * 16), rgba: new Float32Array(FLAG_DRAW_SLOTS * 4) } : null;
      const lampBuf = script ? new Float32Array(VERGE_POSTS * 16) : null;
      const toriiBuf = script ? new Float32Array(GATE_SLOTS * 16) : null;
      const spineBuf = script ? new Float32Array(DORSAL_SPINE_SLOTS * 16) : null;
      const soulBuf = script ? new Float32Array(SOUL_COLUMN.count * 16) : null;
      const cloudBuf = script ? { data: new Float32Array(CLOUD_BILLOW_COUNT * 16), rgba: new Float32Array(CLOUD_BILLOW_COUNT * 4) } : null;
      const islandBufs = script && SPIRE_BANDS_SHOWN ? ISLAND_BANDS.map((b) => ({ band: b, data: new Float32Array(b.count * 16), rgba: new Float32Array(b.count * 4) })) : [];
      const camClearance = script ? createCameraClearance({ pullRate: 18, releaseRate: 3.5 }) : null;
      const impactRig = script ? createImpactRig({ reducedMotion }) : null;
      interface FlipbookSlot { active: boolean; at: V3; age: number; life: number; scale: number; tint: Rgb }
      const plasmaBursts: FlipbookSlot[] = Array.from({ length: VFX_PLASMA_SLOTS }, () => ({ active: false, at: [0, -500, 0], age: 0, life: 0.55, scale: 1, tint: [1, 1, 1] }));
      const dustBursts: FlipbookSlot[] = Array.from({ length: VFX_DUST_SLOTS }, () => ({ active: false, at: [0, -500, 0], age: 0, life: 0.65, scale: 1, tint: [1, 1, 1] }));
      let plasmaCursor = 0;
      let dustCursor = 0;
      const spawnFlipbook = (pool: FlipbookSlot[], cursor: number, at: V3, scale: number, life: number, tint: Rgb): number => {
        if (reducedMotion) return cursor;
        const slot = pool[cursor % pool.length]!;
        slot.active = true;
        slot.at = at;
        slot.age = 0;
        slot.life = life;
        slot.scale = scale;
        slot.tint = tint;
        return (cursor + 1) % pool.length;
      };
      let prevImpact = { init: false, rung: 0, gateIdx: 0, stumble: 0, grounded: true, slide: 0, pulse: 0 };
      let smoothedLean = 0;
      /* GU47 SSR-18: per-frame instance buffers (allocated once; `count` instances written each frame) */
      const instBuffers = new Map<string, { data: Float32Array; rgba: Float32Array; count: number }>();
      if (script) for (const type of INSTANCED_TYPES) (ENTITY_PARTS[type] ?? []).forEach((_part, j) => {
        const cap = POOLS[type] ?? 0;
        instBuffers.set(`inst-${type}-${j}`, { data: new Float32Array(cap * 16), rgba: new Float32Array(cap * 4).fill(1), count: 0 });
      });
      /* C8: the visible state each pooled node was last given, so a frame only writes the slots that change */
      const shown = new Map<string, boolean>();
      let visibilityWrites = 0;
      const show = (id: string, visible: boolean): ReturnType<typeof node> => {
        const h = node(id);
        if (shown.get(id) !== visible) { h.setVisible(visible); shown.set(id, visible); visibilityWrites++; }
        return h;
      };
      /** Hides a pooled slot only when it was visible, without resolving its handle otherwise. */
      const hide = (id: string): void => { if (shown.get(id) !== false) show(id, false); };
      const mod = (x: number, m: number): number => ((x % m) + m) % m;

      const update = (simState: RunState, dt: number, time: number, aspect: number, outro = 0, blend?: PresentSample): void => {
        const S = blend ? withSample(simState, blend) : simState;
        visibilityWrites = 0;
        const frame = frameAt(samples, Math.min(S.s, ROAD_LENGTH));
        node("sky").setPosition(frame.p[0], frame.p[1], frame.p[2]);
        node("sky").setUniform?.("skyTime", time);

        /* C12: warm road edges before the next missing plate */
        const gap = gapAhead(S);
        node("road").setUniform?.("gapAt", gap === null ? -1e6 : S.s + gap);
        node("road").setUniform?.("gapWarn", gap === null ? 0 : 1);

        /* runner: articulated parts posed in the road frame; flight lifts the whole figure */
        let pose = onRoad(frame, S.laneX, S.y);
        const falling = S.phase === "fall";
        const leaping = S.phase === "leap";
        const tf = Math.max(0, outro);
        let airVy = S.vy;
        if (falling) {
          const drop = 0.5 * 58 * tf * tf;
          const fwd = (S.speed * 0.5 * (1 - Math.exp(-1.6 * tf))) / 1.6;
          pose = [pose[0] - frame.U[0] * drop + frame.F[0] * fwd, pose[1] - frame.U[1] * drop + frame.F[1] * fwd, pose[2] - frame.U[2] * drop + frame.F[2] * fwd];
        } else if (leaping) {
          const rise = 24 * tf - 16 * tf * tf;
          const fwd = 16 * tf;
          pose = [pose[0] + frame.U[0] * rise + frame.F[0] * fwd, pose[1] + frame.U[1] * rise + frame.F[1] * fwd, pose[2] + frame.U[2] * rise + frame.F[2] * fwd];
          airVy = 24 - 32 * tf;
        }
        const tumbleM: M3 | null = falling ? rx(-tf * 5) : null;
        const flying = S.puff > 0 || falling;
        const lean = Math.max(-0.35, Math.min(0.35, S.laneVel * 0.02));
        // GU47 SSR-14: lean into the bend and the lane change, capped at 12 deg (damped smoothly so high-speed coils never snap the horizon)
        let scriptLean = 0;
        if (script) {
          const probe = Math.max(BEND_PROBE, Math.min(44, S.speed * 0.2));
          const ahead = frameAt(samples, Math.min(S.s + probe, ROAD_LENGTH));
          const curvature = (ahead.F[0] * frame.R[0] + ahead.F[1] * frame.R[1] + ahead.F[2] * frame.R[2]) / probe;
          const rawLean = runnerLean(S.laneVel, curvature, S.speed, reducedMotion);
          const leanRate = S.surge !== "off" ? 5.5 : 11;
          smoothedLean = dt > 0 && dt < 0.5 ? smoothedLean + (rawLean - smoothedLean) * (1 - Math.exp(-dt * leanRate)) : rawLean;
          scriptLean = smoothedLean;
        }
        if (prevS === null) prevS = S.s;
        const ds = S.s - prevS;
        prevS = S.s;
        phaseAcc = advanceRunPhase(phaseAcc, ds, dt);
        const surge = Math.max(0, Math.min(1, S.auraVis === undefined ? 0 : S.auraVis));
        const B = frameBasis(frame, -lean);
        const parts = poseHero({
          phase: phaseAcc, time, grounded: S.grounded && !leaping, vy: airVy, sliding: S.sliding > 0, flying, diving: S.dive || falling,
          lean: (script ? scriptLean : Math.max(-0.3, Math.min(0.3, S.laneVel * 0.012))) + (falling ? 0.5 * Math.sin(time * 5) : 0),
          surge, stumble: Math.max(0, Math.min(1, S.stumble)), speed: S.speed
        });
        const TUMBLE_CENTRE: LV3 = [0, 1.0, 0];
        const toWorld = (p: LV3): V3 => {
          let local = p;
          if (tumbleM) {
            const r = apply(tumbleM, [p[0] - TUMBLE_CENTRE[0], p[1] - TUMBLE_CENTRE[1], p[2] - TUMBLE_CENTRE[2]]);
            local = [r[0] + TUMBLE_CENTRE[0], r[1] + TUMBLE_CENTRE[1], r[2] + TUMBLE_CENTRE[2]];
          }
          const w = apply(B, local);
          return [pose[0] + w[0], pose[1] + w[1], pose[2] + w[2]];
        };
        const worldRot = (m: M3): M3 => mul(B, tumbleM ? mul(tumbleM, m) : m);
        for (const [id, part] of Object.entries(parts)) {
          const p = toWorld(part.p);
          const e = matrixEuler(worldRot(part.m));
          show(`r-${id}`, !runner).setPosition(p[0], p[1], p[2]).setRotation(e[0], e[1], e[2]);
        }
        if (runner) {
          /* rigged runner: pick a clip from the sim state, then orient the model on the road frame */
          const moving = ds > 1e-5;
          const rate = Math.max(0.6, S.speed / 32);
          const base = S.sliding > 0 ? CLIP.slide : S.dive || falling ? CLIP.dive : flying || leaping ? CLIP.fly : !S.grounded ? CLIP.air : moving ? CLIP.run : CLIP.idle;
          if (animator) animator.step({ clip: base, rate: moving ? 1.5 * rate : 1, stumble: S.stumble, dt });
          else {
            const clip = S.stumble > 0.3 ? CLIP.hit : base;
            const length = runner.durations[clip] ?? 1;
            actorClock = (actorClock + dt * (moving ? 1.5 * rate : 1)) % length;
            const t = clip === CLIP.hit ? Math.min(length, Math.max(0, (0.75 - S.stumble) * 1.5)) : actorClock;
            runner.actor.playClip(clip, Math.max(0, Math.min(length, t)) % (length + 1e-6));
          }
          const pitch = flying ? (S.dive || falling ? 2.3 : 1.32) : 0;
          const lateralLean = (script ? scriptLean : Math.max(-0.3, Math.min(0.3, S.laneVel * 0.012))) + (falling ? 0.5 * Math.sin(time * 5) : 0);
          let body = mul(rz(-lateralLean), rx(-pitch));
          if (tumbleM) body = mul(tumbleM, body);
          const centre: LV3 = [0, 1.7, 0];
          const rc = apply(body, centre);
          const w = apply(B, [centre[0] - rc[0], centre[1] - rc[1], centre[2] - rc[2]]);
          const R = mul(B, mul(body, ry(Math.PI)));
          actorMatrix = [R[0] * RIG_SCALE, R[1] * RIG_SCALE, R[2] * RIG_SCALE, 0, R[3] * RIG_SCALE, R[4] * RIG_SCALE, R[5] * RIG_SCALE, 0, R[6] * RIG_SCALE, R[7] * RIG_SCALE, R[8] * RIG_SCALE, 0, pose[0] + w[0], pose[1] + w[1], pose[2] + w[2], 1];
          actorVisible = true;
        }

        /* aura shell around the torso, tilted with the body */
        const root = (parts.pelvis as { p: LV3; m: M3 }).m;
        const auraCentre = toWorld([(parts.pelvis as { p: LV3 }).p[0] + apply(root, [0, 0.54, 0])[0], (parts.pelvis as { p: LV3 }).p[1] + apply(root, [0, 0.54, 0])[1], (parts.pelvis as { p: LV3 }).p[2] + apply(root, [0, 0.54, 0])[2]]);
        const auraEuler = matrixEuler(worldRot(root));
        const growth = 1 + 0.12 * S.auraRung + (S.surge === "power" ? 0.16 : 0);
        for (const [id, scale, solidAmount] of [["aura-outer", growth, 0.5], ["aura-inner", growth * 0.92, 0.3]] as const) {
          const h = node(id);
          show(id, surge > 4e-3);
          h.setPosition(auraCentre[0], auraCentre[1], auraCentre[2]).setRotation(auraEuler[0], auraEuler[1], auraEuler[2]).setScale(scale);
          h.setUniform?.("auraTime", id === "aura-inner" ? 1.37 * time + 4 : time);
          h.setUniform?.("auraIntensity", surge * 0.7 * (script ? auraPulse(S.kiPulse, reducedMotion) : 1));
          h.setUniform?.("auraSolid", S.puff > 0 ? 0.24 : solidAmount);
        }

        /* contact shadow on the road under the runner */
        const ground = onRoad(frame, S.laneX, 0.05);
        const be = matrixEuler(frameBasis(frame));
        const shadow = node("contact-shadow");
        show("contact-shadow", !flying && !leaping && S.grounded);
        shadow.setPosition(ground[0], ground[1], ground[2]).setRotation(be[0], be[1], be[2]);
        if (lookDriver) {
          // GU47 phase 3: a cast shadow along the road away from the low sun (scaled for ~1.95 m heroic runner)
          const sd = lookDriver.sunDir, U = frame.U;
          const su = sd[0] * U[0] + sd[1] * U[1] + sd[2] * U[2];
          const g: V3 = [-(sd[0] - U[0] * su), -(sd[1] - U[1] * su), -(sd[2] - U[2] * su)];
          const gl = Math.hypot(g[0], g[1], g[2]) || 1;
          const cast = Math.min(4.6, Math.max(1.6, 1.0 / Math.tan(Math.max(0.05, Math.asin(Math.min(1, Math.max(-1, su)))))));
          shadow.setScale(cast / 2.2 + 0.85);
          shadow.setUniform?.("blobCast", cast);
          shadow.setUniform?.("blobDir", [g[0] / gl, g[1] / gl, g[2] / gl]);
          shadow.setUniform?.("blobShade", [0.04, 0.02, 0.08]);
          shadow.setUniform?.("blobAlpha", 0.6);
          // GU47 phase 4: the gates' analytic shadows on the road use the same sun, in road coordinates (along F, across R)
          const gn: V3 = [g[0] / gl, g[1] / gl, g[2] / gl];
          const te = Math.max(0.01, su) / Math.sqrt(Math.max(1e-4, 1 - su * su));
          const roadNode = node("road") as Partial<ReturnType<typeof node>>;
          roadNode.setUniform?.("gateSun", [gn[0] * frame.F[0] + gn[1] * frame.F[1] + gn[2] * frame.F[2], gn[0] * frame.R[0] + gn[1] * frame.R[1] + gn[2] * frame.R[2], te]);
          if (lookSkipAt !== Math.round(S.s / 100)) {
            lookSkipAt = Math.round(S.s / 100);
            const near = STAGE_BOARDS.map((b) => b.s).sort((x, y) => Math.abs(x - S.s) - Math.abs(y - S.s));
            roadNode.setUniform?.("gateSkip", [near[0] ?? -1e6, near[1] ?? -1e6]);
          }
        } else shadow.setUniform?.("blobAlpha", 0.5);

        /* ki sparks rising off the runner while the aura is up */
        for (let i = 0; i < (script ? 0 : SPARKS); i++) {
          if (surge < 0.12) { hide(`spark-${i}`); continue; }
          const ph = mod(time * 0.9 + i / SPARKS, 1);
          const sp = toWorld([Math.sin(i * 7.13) * 0.95, 0.5 + ph * 3.4, 0.2 + ph * (1.4 + 0.04 * S.speed)]);
          show(`spark-${i}`, true).setPosition(sp[0], sp[1], sp[2]).setScale(Math.max(0.05, (1 - ph) * (0.5 + 0.5 * surge)));
        }

        /* a ring of sparkles at each orb pickup */
        if (S.kiPulse > prevPulse + 0.3) burstT = 0;
        prevPulse = S.kiPulse;
        burstT += dt;
        for (let i = 0; i < (script ? 0 : BURSTS); i++) {
          if (burstT >= 0.5) { hide(`burst-${i}`); continue; }
          const h = show(`burst-${i}`, true);
          const a = (i / BURSTS) * Math.PI * 2;
          const r = burstT * 7;
          const bp = toWorld([Math.cos(a) * r * 0.8, 2.3 + Math.sin(a) * r * 0.8, 0.4 + (i % 3) * 0.3]);
          h.setPosition(bp[0], bp[1], bp[2]).setScale(Math.max(0.05, 1 - burstT / 0.5));
        }

        /* GU47 SSR-12: engine runtime effects for this frame's events, and the surge / flight trail */
        if (vfxEvents && fx) {
          for (const event of vfxEvents.step(S)) {
            let at: V3;
            if (event.entity) {
              const ent = event.entity;
              const es = ent.type === "sweeper" || ent.type === "soul" || ent.type === "oni" ? ent.s + ent.rel : ent.s;
              at = onRoad(frameAt(samples, Math.min(Math.max(es, 0), ROAD_LENGTH)), entityLateral(ent), entityHeight(ent) + 0.6);
            } else at = toWorld(event.kind === "serpent-cloud-puff" ? [0, 0.16, 0.25] : [0, 1.05, 0]);
            try { fx.burst(event.kind, at); vfxFired++; } catch { /* preset missing on this build: skip the cue */ }
          }
          if (vfxEvents.trailOn && !trail) { try { trail = fx.trail("aura-inner", SERPENT_RUNNER_TRAIL); } catch { trail = null; } }
          else if (!vfxEvents.trailOn && trail) { trail.stop(); trail = null; }
        }

        /* speed streaks fixed to the road so they sweep past the camera */
        const fast = surge > 0.3 || flying;
        if (ambient && fx) {
          const air = ambient.step({ S, look: lookShown ?? { stageIndex: 0, storm: 0 }, time, dt, fast, reducedMotion, reducedFlash });
          exposureBoost = air.exposureBoost;
          if (air.raining) {
            // rain falls along the road's down axis, slanted across the road by the sim's gust; re-registered on change
            const d: V3 = [-frame.U[0] + frame.R[0] * air.rainSlant, -frame.U[1] + frame.R[1] * air.rainSlant, -frame.U[2] + frame.R[2] * air.rainSlant];
            const dl = Math.hypot(d[0], d[1], d[2]) || 1;
            const q: [number, number, number] = [Math.round((d[0] / dl) * 10) / 10, Math.round((d[1] / dl) * 10) / 10, Math.round((d[2] / dl) * 10) / 10];
            const key = q.join(",");
            if (key !== rainKey) { try { fx.registerPreset("serpent-rain", serpentRainPreset(q, reducedMotion)); } catch { /* registry missing */ } rainKey = key; }
          }
          for (const spawn of air.spawns) {
            const sf = frameAt(samples, Math.min(Math.max(S.s + spawn.rel, -40), ROAD_LENGTH));
            const at = onRoad(sf, S.laneX * (spawn.kind === "serpent-rain" ? 1 : 0) + spawn.lateral, spawn.up);
            try { fx.burst(spawn.kind, at); vfxFired++; } catch { /* preset missing on this build: skip */ }
          }
        }
        for (let i = 0; i < (script ? 0 : STREAKS); i++) {
          if (!fast) { hide(`streak-${i}`); continue; }
          const h = show(`streak-${i}`, true);
          const rel = mod(i * 37.7 - S.s, 90) - 12;
          const sf = frameAt(samples, Math.min(Math.max(S.s + rel, -40), ROAD_LENGTH));
          const lateral = (i % 2 ? 1 : -1) * (4.5 + ((i * 5.3) % 9));
          const sp = onRoad(sf, lateral, 0.8 + ((i * 3.7) % 8) + (flying ? S.y * 0.3 : 0));
          const e = matrixEuler(frameBasis(sf));
          h.setPosition(sp[0], sp[1], sp[2]).setRotation(e[0], e[1], e[2]).setScale([1, 1, Math.max(0.6, S.speed / 45)]);
        }

        /* roadside lanterns (pairs along the verge) and floating islands drifting past on both sides */
        for (let i = 0; i < LANTERN_COUNT; i++) {
          const h = show(`lantern-${i}`, true);
          const side = i % 2 ? 1 : -1;
          const rel = mod(Math.floor(i / 2) * 58 - S.s, (LANTERN_COUNT / 2) * 58) - 26;
          const lf = frameAt(samples, Math.min(Math.max(S.s + rel, -40), ROAD_LENGTH));
          const lp = onRoad(lf, side * 10.4, 0.4);
          const le = matrixEuler(frameBasis(lf, side > 0 ? -Math.PI / 2 : Math.PI / 2));
          h.setPosition(lp[0], lp[1], lp[2]).setRotation(le[0], le[1], le[2]);
        }
        for (let i = 0; i < ISLAND_COUNT; i++) {
          const h = show(`island-${i}`, true);
          const side = i % 2 ? 1 : -1;
          const rel = mod(i * 140 - S.s, ISLAND_COUNT * 140) - 90;
          const sf = frameAt(samples, Math.min(Math.max(S.s + rel, -40), ROAD_LENGTH));
          const ip = onRoad(sf, side * (34 + ((i * 23) % 26)), 16 + ((i * 7) % 18) + Math.sin(time * 0.4 + i * 1.7) * 1.4);
          const ie = matrixEuler(frameBasis(sf, time * 0.05 + i));
          h.setPosition(ip[0], ip[1], ip[2]).setRotation(ie[0], ie[1], ie[2]).setScale(1 + (i % 3) * 0.35);
        }

        /* GU47 phase 4 + WP-21: colossal sculpted dragon head, check-in gatehouse, coiled tail, sanctuary planetlet & balustrade spines */
        if (script) {
          if (lookDriver) lookShown = lookAt(lookDistance(S.s, S.leg), lookConfig);
          const lap = Math.floor((S.s + SERPENT_HEAD.cycle - SERPENT_HEAD.ahead) / SERPENT_HEAD.cycle);
          const rel = title ? 210 : mod(SERPENT_HEAD.ahead - S.s, SERPENT_HEAD.cycle) - (SERPENT_HEAD.cycle - SERPENT_HEAD.ahead);
          const side = title ? -1 : lap % 2 ? -1 : 1;
          const lateral = title ? 54 : SERPENT_HEAD.lateral;
          const riseBase = title ? -26 : SERPENT_HEAD.rise;
          const hf = frameAt(samples, Math.min(Math.max(S.s + rel, -40), ROAD_LENGTH));
          const hp = onRoad(hf, side * lateral, riseBase + (reducedMotion ? 0 : Math.sin(time * 0.25) * 2));
          const he = matrixEuler(frameBasis(hf, (-side * (title ? 34 : SERPENT_HEAD.yawDeg) * Math.PI) / 180));
          show("serpent-head", true).setPosition(hp[0], hp[1], hp[2]).setRotation(he[0], he[1], he[2]).setScale(title ? 0.72 : 1);
          const showGatehouse = S.s < 460 || title;
          const ghHandle = show("serpent-gatehouse", showGatehouse);
          if (showGatehouse) {
            const gf0 = frameAt(samples, 28);
            const gp0 = onRoad(gf0, 0, -0.35);
            const ge0 = matrixEuler(frameBasis(gf0));
            ghHandle.setPosition(gp0[0], gp0[1], gp0[2]).setRotation(ge0[0], ge0[1], ge0[2]);
          }
          const showTail = S.s > ROAD_LENGTH - 720;
          const tailHandle = show("serpent-tail-monument", showTail);
          if (showTail) {
            const tf0 = frameAt(samples, ROAD_LENGTH + 18);
            const tp0 = onRoad(tf0, 0, -0.4);
            const te0 = matrixEuler(frameBasis(tf0));
            tailHandle.setPosition(tp0[0], tp0[1], tp0[2]).setRotation(te0[0], te0[1], te0[2]);
          }
          const showPlanet = S.s > ROAD_LENGTH - 980;
          const planetHandle = show("sanctuary-planetlet", showPlanet);
          if (showPlanet) {
            const pf0 = frameAt(samples, ROAD_LENGTH + 36);
            const pp0: V3 = [pf0.p[0] + pf0.F[0] * 92 + pf0.U[0] * 28, pf0.p[1] + pf0.F[1] * 92 + pf0.U[1] * 28, pf0.p[2] + pf0.F[2] * 92 + pf0.U[2] * 28];
            const pe0 = matrixEuler(frameBasis(pf0, reducedMotion ? 0 : time * 0.04));
            planetHandle.setPosition(pp0[0], pp0[1], pp0[2]).setRotation(pe0[0], pe0[1], pe0[2]);
          }
          if (spineBuf) {
            let si = 0;
            const sBase = Math.floor((S.s - 18) / DORSAL_SPINE_SPACING);
            for (let k = 0; k < DORSAL_SPINE_PAIRS; k++) {
              const ss = (sBase + k) * DORSAL_SPINE_SPACING;
              if (ss < -30 || ss > ROAD_LENGTH + 12) continue;
              const sf0 = frameAt(samples, ss);
              if (sf0.gap) continue;
              const sb = frameBasis(sf0);
              for (const bSide of [-1, 1] as const) {
                const spAt = onRoad(sf0, bSide * 4.55 * sf0.girth, 0.76 * sf0.girth);
                writeMatrix(spineBuf, si++ * 16, sb, spAt, sf0.girth);
              }
            }
            (node("viaduct-dorsal-spines") as Partial<ReturnType<typeof node>>).setInstanceMatrices?.(spineBuf, si);
          }
          if (title) {
            const keyAt = onRoad(hf, side * (lateral - 36), riseBase + 68);
            const rimAt = onRoad(hf, side * (lateral + 28), riseBase + 54);
            show("title-head-key", true).setPosition(keyAt[0], keyAt[1], keyAt[2]);
            show("title-head-rim", true).setPosition(rimAt[0], rimAt[1], rimAt[2]);
          } else {
            hide("title-head-key");
            hide("title-head-rim");
          }
          const farF = frameAt(samples, Math.min(Math.max(S.s + 420, 0), ROAD_LENGTH));
          const ribAt = onRoad(farF, 0, 92);
          const ribEuler = matrixEuler(frameBasis(farF));
          show("celestial-ribbon", true).setPosition(ribAt[0], ribAt[1], ribAt[2]).setRotation(ribEuler[0], ribEuler[1], ribEuler[2]);
        }

        /* GU47 SSR-11: flag lines strung between verge posts every 18 m, a lantern hanging at each post */
        if (flagBuf && lampBuf) {
          let fi = 0, li = 0, ringUsed = 0;
          const first = Math.floor((S.s - VERGE_BEHIND) / VERGE_SPACING);
          for (let k = 0; k < VERGE_POSTS / 2; k++) {
            const s0 = (first + k) * VERGE_SPACING;
            for (const side of [-1, 1]) {
              const lf = frameAt(samples, Math.min(Math.max(s0, 0), ROAD_LENGTH));
              const lampAt = onRoad(lf, side * 9.6, 3.2);
              writeMatrix(lampBuf, li++ * 16, frameBasis(lf), lampAt, 1);
              const pb = frameBasis(lf);
              writeMatrix(flagBuf.data, fi * 16, [pb[0] * 0.14, pb[1] * 0.14, pb[2] * 0.14, pb[3] * 4.9, pb[4] * 4.9, pb[5] * 4.9, pb[6] * 0.14, pb[7] * 0.14, pb[8] * 0.14], onRoad(lf, side * 9.6, 1.65), 1);
              flagBuf.rgba.set([...POST_TINT, 1], fi * 4); fi++;
              const cordAt = (f: number): V3 => onRoad(frameAt(samples, Math.min(Math.max(s0 + f * VERGE_SPACING, 0), ROAD_LENGTH)), side * 9.6, 3.95 - Math.sin(f * Math.PI) * 0.7);
              for (let q = 0; q < FLAGS_PER_SPAN; q++) {
                const a = cordAt(q / FLAGS_PER_SPAN), b = cordAt((q + 1) / FLAGS_PER_SPAN);
                const x: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                const U = lf.U;
                const z: V3 = [x[1] * U[2] - x[2] * U[1], x[2] * U[0] - x[0] * U[2], x[0] * U[1] - x[1] * U[0]];
                const zl = Math.hypot(z[0], z[1], z[2]) || 1;
                writeMatrix(flagBuf.data, fi * 16, [x[0], x[1], x[2], U[0] * 0.035, U[1] * 0.035, U[2] * 0.035, (z[0] / zl) * 0.035, (z[1] / zl) * 0.035, (z[2] / zl) * 0.035], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], 1);
                flagBuf.rgba.set([...CORD_TINT, 1], fi * 4); fi++;
              }
              for (let q = 0; q < FLAGS_PER_SPAN; q++) {
                const sq = s0 + ((q + 0.5) / FLAGS_PER_SPAN) * VERGE_SPACING;
                const ff = frameAt(samples, Math.min(Math.max(sq, 0), ROAD_LENGTH));
                const sag = Math.sin(((q + 0.5) / FLAGS_PER_SPAN) * Math.PI) * 0.7;
                const at = onRoad(ff, side * 9.6, 3.6 - sag);
                // cloth: 1.1 m long along the road, 0.7 m tall, 0.02 m thick; its local x runs along the road
                const B = frameBasis(ff, Math.PI / 2);
                const m: M3 = [B[0] * 1.1, B[1] * 1.1, B[2] * 1.1, B[3] * 0.7, B[4] * 0.7, B[5] * 0.7, B[6] * 0.02, B[7] * 0.02, B[8] * 0.02];
                writeMatrix(flagBuf.data, fi * 16, m, at, 1);
                const c = FLAG_COLORS[mod(first + k + q + (side > 0 ? 2 : 0), FLAG_COLORS.length)]!;
                flagBuf.rgba[fi * 4] = c[0]; flagBuf.rgba[fi * 4 + 1] = c[1]; flagBuf.rgba[fi * 4 + 2] = c[2]; flagBuf.rgba[fi * 4 + 3] = 1;
                fi++;
              }
            }
          }
          // WP-21: batched vermilion-red Japanese torii gates (elevated curved kasagi lintel + black nemaki shoes + glowing chochin lanterns)
          let gi = 0;
          const gateClock = reducedMotion ? time * 0.3 : time;
          for (let k = 0; k < VERGE_POSTS / 2; k++) {
            if (mod(first + k, GATE_EVERY) !== 0) continue;
            const s0 = (first + k) * VERGE_SPACING;
            if (s0 < 54 || s0 > ROAD_LENGTH || STAGE_BOARDS.some((b) => Math.abs(b.s - s0) < GATE_BOARD_CLEAR)) continue;
            const gf = frameAt(samples, s0);
            const gb = frameBasis(gf);
            if (toriiBuf && gi < GATE_SLOTS) {
              writeMatrix(toriiBuf, gi++ * 16, gb, onRoad(gf, 0, -0.15), 1);
            }
            const B = frameBasis(gf, Math.PI / 2);
            const sm: M3 = [B[0] * 0.48, B[1] * 0.48, B[2] * 0.48, B[3] * 2.9, B[4] * 2.9, B[5] * 2.9, B[6] * 0.02, B[7] * 0.02, B[8] * 0.02];
            for (const sSide of [-1, 1] as const) {
              writeMatrix(flagBuf.data, fi * 16, sm, onRoad(gf, sSide * (GATE_HALF_SPAN + 0.55), 9.6), 1);
              flagBuf.rgba.set([...TORII_STREAMER_TINT, 1], fi * 4);
              fi++;
            }
            if (ringUsed < GATE_RING_SLOTS && s0 >= S.s - 8 && s0 <= S.s + 260) {
              const rh = show(`gate-ring-${ringUsed}`, true);
              const rp = onRoad(gf, 0, 14.25);
              const re = matrixEuler(gb);
              const prox = Math.exp(-Math.pow((s0 - S.s) / 22, 2));
              rh.setPosition(rp[0], rp[1], rp[2]).setRotation(re[0], re[1], re[2]).setScale([0.16, 0.16, 1]);
              rh.setUniform?.("gateTime", gateClock + ringUsed * 0.9);
              rh.setUniform?.("gatePulse", 0.22 + 0.78 * prox + 0.25 * surge);
              ringUsed++;
            }
          }
          if (toriiBuf) {
            (node("torii-vermilion") as Partial<ReturnType<typeof node>>).setInstanceMatrices?.(toriiBuf, gi);
            (node("torii-ebony") as Partial<ReturnType<typeof node>>).setInstanceMatrices?.(toriiBuf, gi);
            (node("torii-chochin") as Partial<ReturnType<typeof node>>).setInstanceMatrices?.(toriiBuf, gi);
          }
          for (let i = ringUsed; i < GATE_RING_SLOTS; i++) hide(`gate-ring-${i}`);
          const flags = node("verge-flags") as Partial<ReturnType<typeof node>>;
          flags.setInstanceMatrices?.(flagBuf.data, fi, flagBuf.rgba);
          flags.setUniform?.("flagTime", reducedMotion ? time * 0.3 : time);
          if (lookDriver) {
            flags.setUniform?.("flagSunDir", [...lookDriver.sunDir]);
            if (lookShown) { flags.setUniform?.("flagSunColor", [...lookShown.sunColor]); flags.setUniform?.("flagFogColor", [...lookShown.fogColor]); }
          }
          (node("verge-lanterns") as Partial<ReturnType<typeof node>>).setInstanceMatrices?.(lampBuf, li);
        }

        /* WP-27: 192 GPU-instanced 3D subsurface-lit cumulus cloud billows flanking both sides of the viaduct coils */
        if (cloudBuf) {
          const span = CLOUD_BILLOW_COUNT * CLOUD_BILLOW_SPACING;
          const drift = reducedMotion ? time * 0.2 : time;
          for (let i = 0; i < CLOUD_BILLOW_COUNT; i++) {
            const hash = (k: number): number => { const x = Math.sin((i + 1) * 19.19 + k * 73.17) * 43758.5453; return x - Math.floor(x); };
            const rel = mod(i * CLOUD_BILLOW_SPACING - S.s, span) - 55;
            const sf = frameAt(samples, Math.min(Math.max(S.s + rel, -40), ROAD_LENGTH));
            const side = i % 2 ? 1 : -1;
            const tier = i % 3;
            const lat = (tier === 0 ? 22 : tier === 1 ? 56 : 104) + hash(1) * (tier === 2 ? 54 : 28);
            const up = -(tier === 0 ? 8.5 : tier === 1 ? 15 : 23) - hash(2) * 8.5 + (reducedMotion ? 0 : Math.sin(drift * 0.32 + i * 0.9) * 1.1);
            const sx = (tier === 0 ? 13 : tier === 1 ? 22 : 34) + hash(3) * 12;
            const sy = sx * (0.44 + hash(4) * 0.18);
            const sz = sx * (0.86 + hash(5) * 0.32);
            const cb = frameBasis(sf, hash(6) * Math.PI * 2);
            const m: M3 = [cb[0] * sx, cb[1] * sx, cb[2] * sx, cb[3] * sy, cb[4] * sy, cb[5] * sy, cb[6] * sz, cb[7] * sz, cb[8] * sz];
            writeMatrix(cloudBuf.data, i * 16, m, onRoad(sf, side * lat, up), 1);
            const fogFloor = tier === 2 ? 0.36 : tier === 1 ? 0.16 : 0.04;
            cloudBuf.rgba[i * 4] = fogFloor; cloudBuf.rgba[i * 4 + 1] = 1; cloudBuf.rgba[i * 4 + 2] = 1; cloudBuf.rgba[i * 4 + 3] = 1;
          }
          const clouds = node("cloud-billows") as Partial<ReturnType<typeof node>>;
          clouds.setInstanceMatrices?.(cloudBuf.data, CLOUD_BILLOW_COUNT, cloudBuf.rgba);
          clouds.setUniform?.("cloudTime", drift);
          if (lookDriver) {
            clouds.setUniform?.("islandSunDir", [...lookDriver.sunDir]);
            if (lookShown) {
              clouds.setUniform?.("islandSunColor", [...lookShown.sunColor]);
              clouds.setUniform?.("islandFogColor", [...lookShown.fogColor]);
              clouds.setUniform?.("islandLit", [...lookShown.cloudLit]);
              clouds.setUniform?.("cloudMid", [...lookShown.cloudMid]);
              clouds.setUniform?.("islandDark", [...lookShown.cloudDark]);
            }
          }
        }

        /* GU47 SSR-11: stage boards only while within BOARD_SHOW_AHEAD m ahead (and 20 m behind) */
        if (script) {
          const sOut = lookDistance(S.s, S.leg);
          for (const board of STAGE_BOARDS) {
            const near = sOut > board.s - BOARD_SHOW_AHEAD && sOut < board.s + 20 && S.leg === "out";
            show(board.id, near);
            show(`${board.id}-text`, near);
          }
        }

        /* GU47 SSR-17: the soul column (souls rise and spiral; slowed on reduced motion) */
        if (soulBuf) {
          const sOut = lookDistance(S.s, S.leg);
          const near = S.leg === "out" && sOut > SOUL_COLUMN.s - SOUL_COLUMN.show && sOut < SOUL_COLUMN.s + 60;
          const h = show("soul-column", near) as Partial<ReturnType<typeof node>>;
          if (near) {
            const cf = frameAt(samples, SOUL_COLUMN.s);
            const clock = reducedMotion ? time * 0.3 : time;
            for (let i = 0; i < SOUL_COLUMN.count; i++) {
              const ph = mod(i / SOUL_COLUMN.count + clock * 0.03, 1);
              const a = i * 2.39996 + clock * 0.4;
              const r = SOUL_COLUMN.radius * (0.6 + 0.4 * Math.sin(i * 1.7));
              const p = onRoad(cf, SOUL_COLUMN.lateral + Math.cos(a) * r, -30 + ph * SOUL_COLUMN.height);
              const q: V3 = [p[0] + cf.F[0] * Math.sin(a) * r, p[1] + cf.F[1] * Math.sin(a) * r, p[2] + cf.F[2] * Math.sin(a) * r];
              writeMatrix(soulBuf, i * 16, frameBasis(cf), q, 0.6 + 0.8 * Math.sin(Math.PI * ph));
            }
            h.setInstanceMatrices?.(soulBuf, SOUL_COLUMN.count);
          }
        }

        /* GU47 SSR-11: mid and far island bands (inverted spires, slow bob), recycled ahead along the road */
        for (const { band, data, rgba } of islandBufs) {
          const span = band.count * band.spacing;
          for (let i = 0; i < band.count; i++) {
            const h = (k: number): number => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233 + band.spacing) * 43758.5453; return x - Math.floor(x); };
            const rel = mod(i * band.spacing - S.s, span) - 160;
            const sf = frameAt(samples, Math.min(Math.max(S.s + rel, -40), ROAD_LENGTH));
            const side = i % 2 ? 1 : -1;
            const bob = reducedMotion ? 0 : Math.sin(time * 0.25 + i * 1.3) * 1.5;
            const at = onRoad(sf, side * (band.lateral[0] + (band.lateral[1] - band.lateral[0]) * h(1)), band.up[0] + (band.up[1] - band.up[0]) * h(2) + bob);
            const r = band.radius[0] + (band.radius[1] - band.radius[0]) * h(3);
            const ht = band.height[0] + (band.height[1] - band.height[0]) * h(4);
            const B = mul(frameBasis(sf, h(5) * Math.PI * 2), rx(Math.PI));
            const m: M3 = [B[0] * r, B[1] * r, B[2] * r, B[3] * ht, B[4] * ht, B[5] * ht, B[6] * r, B[7] * r, B[8] * r];
            writeMatrix(data, i * 16, m, at, 1);
            rgba[i * 4] = band.fog; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 0; rgba[i * 4 + 3] = 1;
          }
          const n = node(band.id) as Partial<ReturnType<typeof node>>;
          n.setInstanceMatrices?.(data, band.count, rgba);
          if (lookDriver) {
            n.setUniform?.("islandSunDir", [...lookDriver.sunDir]);
            if (lookShown) {
              n.setUniform?.("islandSunColor", [...lookShown.sunColor]);
              n.setUniform?.("islandFogColor", [...lookShown.fogColor]);
              n.setUniform?.("islandLit", [...lookShown.cloudLit]);
              n.setUniform?.("islandDark", [...lookShown.belly]);
            }
          }
        }

        /* entities: assign the nearest alive ones to the pooled slots, hide the rest */
        const used: Record<string, number> = {};
        alive = 0;
        for (const buf of instBuffers.values()) buf.count = 0;
        for (const ent of S.ents as readonly Entity[]) {
          if (ent.dead) continue;
          const s = ent.type === "sweeper" || ent.type === "soul" || ent.type === "oni" ? ent.s + ent.rel : ent.s;
          if (s < S.s - 12 || s > S.s + 420) continue;
          const pool = POOLS[ent.type];
          const parts3 = ENTITY_PARTS[ent.type];
          if (!pool || !parts3) continue;
          const idx = used[ent.type] ?? 0;
          if (idx >= pool) continue;
          used[ent.type] = idx + 1;
          alive++;
          const f = frameAt(samples, Math.min(s, ROAD_LENGTH));
          const lateral = entityLateral(ent);
          const h = ent.type === "arch" ? 2.2 : ent.type === "oni" ? 1.5 : ent.type === "barrier" ? 1.1 : ent.type === "sweeper" ? 0.9 : entityHeight(ent);
          const base = onRoad(f, lateral, h);
          const EB = frameBasis(f);
          const pulse = ent.type === "orb" ? 1 + 0.08 * Math.sin(time * 6 + ent.spin) : 1;
          const tumble = ent.punt ? eulerMatrix([ent.punt.t * 9, ent.punt.t * 5, 0]) : null;
          const style = ent.type === "power" ? POWER_STYLE[ent.kind ?? "surge"] : undefined;
          const instanced = script && INSTANCED_TYPES.has(ent.type);
          parts3.forEach((part, j) => {
            if (instanced) {
              let local: M3 = part.rot ? eulerMatrix(part.rot) : eulerMatrix([0, 0, 0]);
              if (part.spin) local = mul(ry(time * part.spin + ent.spin), local);
              const off = apply(EB, part.at);
              const buf = instBuffers.get(`inst-${ent.type}-${j}`)!;
              const i = buf.count++;
              writeMatrix(buf.data, i * 16, mul(EB, local), [base[0] + off[0], base[1] + off[1], base[2] + off[2]], pulse);
              const shell = style?.shell ?? [1, 1, 1];
              buf.rgba[i * 4] = shell[0]; buf.rgba[i * 4 + 1] = shell[1]; buf.rgba[i * 4 + 2] = shell[2]; buf.rgba[i * 4 + 3] = 1;
              return;
            }
            const handle = show(`ent-${ent.type}-${idx}-${j}`, true);
            let local: M3 = part.rot ? eulerMatrix(part.rot) : eulerMatrix([0, 0, 0]);
            if (part.spin) local = mul(ry(time * part.spin + ent.spin), local);
            let off: LV3 = part.at;
            let m = mul(EB, local);
            if (tumble) { m = mul(EB, mul(tumble, local)); off = apply(tumble, off); }
            const wo = apply(EB, off);
            const e = matrixEuler(m);
            handle.setPosition(base[0] + wo[0], base[1] + wo[1], base[2] + wo[2]).setRotation(e[0], e[1], e[2]).setScale(pulse);
            if (style && (part.mat === "power" || part.mat === "powerHalo")) {
              handle.setUniform?.("glowCore", [...style.core]);
              handle.setUniform?.("glowShell", [...style.shell]);
            }
          });
        }
        for (const [id, buf] of instBuffers) (node(id) as Partial<ReturnType<typeof node>>).setInstanceMatrices?.(buf.data, buf.count, buf.rgba);
        for (const [type, count] of Object.entries(POOLS)) {
          if (script && INSTANCED_TYPES.has(type)) continue;
          const partCount = (ENTITY_PARTS[type] ?? []).length;
          for (let i = used[type] ?? 0; i < count; i++) for (let j = 0; j < partCount; j++) hide(`ent-${type}-${i}-${j}`);
        }

        /* WP-27: visual-only impact rig, flipbook spirit/cloud bursts & camera clearance (stepped strictly on REAL dt; rock-steady in Surge) */
        const surging = S.surge !== "off" || S.auraRung > 0;
        let impactShake: readonly [number, number, number] = [0, 0, 0];
        let impactRoll = 0;
        let impactFov = 0;
        if (script && impactRig) {
          const gateSpan = VERGE_SPACING * GATE_EVERY;
          const gateIdx = Math.floor(S.s / gateSpan);
          if (!prevImpact.init) {
            prevImpact = { init: true, rung: S.auraRung, gateIdx, stumble: S.stumble, grounded: S.grounded, slide: S.sliding, pulse: S.kiPulse };
          } else {
            if (S.auraRung > prevImpact.rung) {
              plasmaCursor = spawnFlipbook(plasmaBursts, plasmaCursor, toWorld([0, 1.15, 0]), 1.1, 0.52, [1.15, 1.02, 0.72]);
            }
            if (gateIdx > prevImpact.gateIdx && S.s > 12 && ds > 0 && ds < 25) {
              const gs = gateIdx * gateSpan;
              if (!STAGE_BOARDS.some((b) => Math.abs(b.s - gs) < GATE_BOARD_CLEAR)) {
                plasmaCursor = spawnFlipbook(plasmaBursts, plasmaCursor, onRoad(frameAt(samples, Math.min(gs, ROAD_LENGTH)), S.laneX * 0.5, 2.2), 1.3, 0.48, [0.85, 1.15, 1.02]);
              }
            }
            if (S.kiPulse > prevImpact.pulse + 0.3 && S.kiChain > 0 && S.kiChain % 4 === 0) {
              plasmaCursor = spawnFlipbook(plasmaBursts, plasmaCursor, toWorld([0, 1.05, -0.25]), 0.82, 0.42, [0.82, 1.18, 1.05]);
            }
            if (S.stumble > prevImpact.stumble + 0.25) {
              if (!surging) impactRig.trigger({ trauma: 0.22, fovKickDeg: -1.2 });
              dustCursor = spawnFlipbook(dustBursts, dustCursor, toWorld([0, 0.85, -0.3]), 1.05, 0.62, [1.08, 0.88, 0.76]);
            }
            if (!prevImpact.grounded && S.grounded && S.phase === "run") {
              dustCursor = spawnFlipbook(dustBursts, dustCursor, onRoad(frame, S.laneX, 0.45), 0.92, 0.56, [1.0, 0.94, 0.88]);
            }
            if (S.sliding > prevImpact.slide + 0.1) {
              dustCursor = spawnFlipbook(dustBursts, dustCursor, onRoad(frame, S.laneX, 0.38), 0.85, 0.5, [1.0, 0.94, 0.88]);
            }
            prevImpact = { init: true, rung: S.auraRung, gateIdx, stumble: S.stumble, grounded: S.grounded, slide: S.sliding, pulse: S.kiPulse };
          }
          if (surging) {
            impactRig.reset();
          } else if (!reducedMotion && dt > 0) {
            const stepped = impactRig.step(dt);
            impactShake = stepped.shakeOffset;
            impactRoll = stepped.shakeRoll;
            impactFov = stepped.fovDeltaDeg;
          }
          const faceEuler = matrixEuler(frameBasis(frame));
          const stepPool = (prefix: string, pool: FlipbookSlot[], peakAlpha: number): void => {
            for (let i = 0; i < pool.length; i++) {
              const slot = pool[i]!;
              if (!slot.active) { hide(`${prefix}-${i}`); continue; }
              slot.age += dt;
              if (slot.age >= slot.life) { slot.active = false; hide(`${prefix}-${i}`); continue; }
              const t01 = Math.max(0, Math.min(1, slot.age / slot.life));
              const h = show(`${prefix}-${i}`, true);
              const grow = slot.scale * (0.72 + 0.62 * t01);
              h.setPosition(slot.at[0], slot.at[1], slot.at[2]).setRotation(faceEuler[0], faceEuler[1], faceEuler[2]).setScale([grow, grow, 1]);
              h.setUniform?.("flipFrame", Math.min(31, Math.floor(t01 * 32)));
              h.setUniform?.("flipAlpha", peakAlpha * (1 - t01 * t01));
              h.setUniform?.("flipTint", [...slot.tint]);
            }
          };
          stepPool("vfx-plasma", plasmaBursts, 0.92);
          stepPool("vfx-dust", dustBursts, 0.72);
        }

        /* chase camera: elevated & pulled back so the ~1.95 m sky-runner occupies ~22-28% in the lower third with open forward sightlines */
        rig = stepChaseRig(rig, frame.F, frame.U, dt, S.speed);
        const shotLean = surging ? scriptLean * 0.35 : scriptLean;
        const shot = shots?.step({ S, dt, lean: shotLean, outro: tf, reducedMotion, title }) ?? null;
        const back = (flying ? CHASE_CAMERA.backFly : CHASE_CAMERA.backBase + Math.min(CHASE_CAMERA.backSpeedMax, S.speed * CHASE_CAMERA.backSpeedFactor)) * (shot?.back ?? 1);
        const rise = flying ? CHASE_CAMERA.riseFly : CHASE_CAMERA.rise;
        const shake = reducedMotion || surging || S.stumble <= 0 ? 0 : Math.min(1, Math.max(0, S.shake ?? 0)) * Math.min(1, S.stumble * 1.4) * 0.08;
        const jx = surging ? 0 : shake * Math.sin(time * 16) + impactShake[0];
        const jy = surging ? 0 : shake * Math.sin(time * 12 + 1.1) + impactShake[1];
        const lift = falling ? Math.min(tf, 2.2) * 2.2 : leaping ? Math.min(tf, 2) * 1.2 : 0;
        let eye: V3 = [pose[0] - rig.f[0] * back + rig.u[0] * (rise + lift) + frame.R[0] * jx, pose[1] - rig.f[1] * back + rig.u[1] * (rise + lift) + frame.R[1] * jx + jy, pose[2] - rig.f[2] * back + rig.u[2] * (rise + lift) + frame.R[2] * jx];
        const ahead = falling || leaping ? 3 : CHASE_CAMERA.ahead;
        const aim = falling ? -1.4 : CHASE_CAMERA.aim;
        let look: V3 = [pose[0] + rig.f[0] * ahead + rig.u[0] * aim, pose[1] + rig.f[1] * ahead + rig.u[1] * aim, pose[2] + rig.f[2] * ahead + rig.u[2] * aim];
        if (script && !falling) {
          const side = 0.16, aimSide = -0.04;
          eye = [eye[0] + frame.R[0] * side, eye[1] + frame.R[1] * side, eye[2] + frame.R[2] * side];
          look = [look[0] + frame.R[0] * aimSide, look[1] + frame.R[1] * aimSide, look[2] + frame.R[2] * aimSide];
          if (camClearance && !surging && (!shot || shot.intro <= 0)) {
            const eyeFrame = frameAt(samples, Math.max(0, Math.min(ROAD_LENGTH, S.s - back)));
            const focus: V3 = [pose[0] + rig.u[0] * 1.15, pose[1] + rig.u[1] * 1.15, pose[2] + rig.u[2] * 1.15];
            eye = camClearance.update(dt, {
              focus,
              eye,
              minDistance: 4.2,
              samples: 12,
              blocked: (x, y, z) => {
                const dx = x - eyeFrame.p[0], dy = y - eyeFrame.p[1], dz = z - eyeFrame.p[2];
                const uDot = dx * eyeFrame.U[0] + dy * eyeFrame.U[1] + dz * eyeFrame.U[2];
                const rDot = dx * eyeFrame.R[0] + dy * eyeFrame.R[1] + dz * eyeFrame.R[2];
                return Math.abs(rDot) < 4.5 && uDot < 0.22;
              }
            });
          } else if (camClearance && surging) {
            camClearance.reset();
          }
        }
        let up: V3 = rig.u;
        if (shot) [eye, look, up] = applyShot(shot, eye, look, pose, rig.f, rig.u);
        if (!surging && impactRoll !== 0) {
          const v: V3 = [look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]];
          const vn = Math.hypot(v[0], v[1], v[2]) || 1;
          up = rotateAbout(up, [v[0] / vn, v[1] / vn, v[2] / vn], impactRoll);
        }
        const fov = (aspect < 0.85 ? 74 : 62) + (reducedMotion ? 0 : Math.min(10, Math.max(0, S.speed - 60) * 0.06)) + (shot?.fovAdd ?? 0) + (surging ? 0 : impactFov);
        cameraController.setPose({ position: eye, target: look, up, fov }, { cut: false });
        lastShot = shot;

        /* GU47 SSR-01: stage colour script, read-only from the run's distance */
        if (lookDriver) {
          if (!lookShown) lookShown = lookAt(lookDistance(S.s, S.leg), lookConfig);
          lookDriver.apply(exposureBoost ? { ...lookShown, exposure: lookShown.exposure + exposureBoost } : lookShown, { forward: rig.f, time, eye, reducedMotion });
          const flare = show("sun-flare", false);
          void flare;
        }
        cinePost?.step({ S, dt, reducedMotion, reducedFlash });
      };

      return {
        update,
        resetCamera() { rig = null; prevS = null; smoothedLean = 0; camClearance?.reset(); impactRig?.reset(); prevImpact.init = false; },
        setTitle(on: boolean) { title = on; },
        setReducedMotion(on: boolean) { const changed = reducedMotion !== on; reducedMotion = on; if (changed && fx) { registerVfx(); rainKey = ""; } },
        get visibilityWrites() { return visibilityWrites; },
        setRunnerStyle(style: RunnerStyle) {
          const wrapHex = style.id === "verdant" ? 0xf5eedc : 0xf2eadc;
          const goldHex = style.id === "tide" ? 0xeac058 : style.id === "verdant" ? 0xf2c45a : 0xf0b84a;
          const colorOf: Record<HeroColor, number> = {
            gi: style.gi,
            giDark: style.giDark,
            skin: style.skin,
            hair: style.hair,
            teal: style.belt,
            boot: style.boot,
            sash: style.sash,
            wrap: wrapHex,
            gold: goldHex,
            eye: 0x171321
          };
          for (const part of HERO_PARTS as readonly HeroPartSpec[]) {
            const h = node(`r-${part.id}`);
            h.setUniform?.("baseColor", [...hexLinear(colorOf[part.color])]);
            if (part.color === "sash") h.setUniform?.("glowColor", [...hexLinear(style.sash)]);
            else if (part.color === "gold") h.setUniform?.("glowColor", [...hexLinear(goldHex)]);
          }
          for (const id of ["aura-outer", "aura-inner"]) {
            const h = node(id);
            h.setUniform?.("auraHot", [...hexLinear(style.auraCore)]);
            h.setUniform?.("auraMid", [...hexLinear(style.auraLit)]);
            h.setUniform?.("auraEdge", [...hexLinear(style.aura)]);
          }
          if (!script) for (let i = 0; i < SPARKS; i++) node(`spark-${i}`).setUniform?.("flatColor", [...hexLinear(style.auraLit)]);
          if (script && typeof runner?.actor.setMaterialOverrides === "function") {
            const sheen = hexLinear(style.gi);
            runner.actor.setMaterialOverrides([
              {
                baseColorMultiply: [style.tint[0], style.tint[1], style.tint[2], 1],
                emissiveColor: [style.wash[0], style.wash[1], style.wash[2]],
                emissiveStrength: 0.12,
                roughness: 0.84,
                sheenColor: [sheen[0] * 0.45, sheen[1] * 0.45, sheen[2] * 0.45],
                sheenRoughness: 0.36,
                rim: { color: [1.0, 0.82, 0.56], power: 3.2, intensity: 0.28 }
              }
            ]);
          } else {
            runner?.actor.setTint({ baseColor: [style.tint[0], style.tint[1], style.tint[2], 1], emissiveColor: [style.wash[0], style.wash[1], style.wash[2]], emissiveStrength: 0.12 });
          }
        },
        get nodeCount() { return handles.size; },
        get entityNodes() { return alive; },
        get vfxFired() { return vfxFired; },
        get strikes() { return ambient?.strikes ?? 0; },
        get cinePost() { return cinePost?.state ?? null; },
        get shot() { return lastShot; },
        get look(): WorldLookState {
          return { mode: lookConfig.mode, id: lookShown?.id ?? "original", stageIndex: lookShown?.stageIndex ?? 0, godRays: lookDriver?.godRaysOn ?? false, writes: lookDriver?.writes ?? 0 };
        }
      };
    }
  };
}
