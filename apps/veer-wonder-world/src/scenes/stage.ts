// Wonder World stage (PRD 04 A10, B07, B09, D01-D13): the StageAdapter the
// app drives. One `createGame` (from `@aura3d/engine/game`) owns the canvas;
// each story gets its own scene, built from its world, cast and props and
// swapped in with `game.setScene` (the shipped Pip's Big Leap pattern), so only
// that story's models load. Before a swap the story's models are preloaded with
// a timeout; anything missing, slow or broken is drawn as its primitive
// stand-in, and a scene that still fails to mount is rebuilt from stand-ins
// only, so the stage never deadlocks or shows a black frame for a missing GLB.
//
// Child-safety rules this module enforces:
// - Fixed child camera: authored framings only, eased (no whip pans), cuts in
//   reduced motion. No orbit, no shake, no juice, no camera punch.
// - Calm looks with an HDRI environment, no vignette, runtime particle effects
//   off, `warmPrograms(app)` before a scene is shown (a soft veil covers swaps).
// - Highlights are slow breathing rings, never flashing; at most two rings.
// - Every motion is driven by `update(dt)` from the app clock (deterministic);
//   reduced motion drops secondary motion and keeps the semantic action.
// - "Talking" is a gentle squash/bob pulse while a line plays, never lip sync.

import {
  camera,
  material,
  model,
  primitives,
  raycastFirst,
  scene,
  type AuraApp,
  type AuraModelMaterialHandle,
  type AuraNodeBuilder,
  type AuraRuntimeNodeHandle,
  type AuraSceneBuilder,
  type AuraSceneNode,
  type SceneQueryTarget
} from "@aura3d/engine";
import { createGame, warmPrograms, type Prd09Game } from "@aura3d/engine/game";
import { modelRef, type ModelKey } from "../aura-assets.js";
import { CHARACTERS, type CharacterProfile } from "../characters/character-registry.js";
import { createAnimationDirector, propAnimationProfile, type AnimationDirector } from "../runtime/animation-director.js";
import { createAssetPreloader, storyModelKeys, type AssetPreloader, type ModelSummaryStatus } from "../runtime/asset-preloader.js";
import type {
  CameraPresetId,
  CharacterId,
  MoveStyle,
  ObjectAction,
  SpotId,
  StageAction,
  StageAdapter,
  StorySpec,
  WorldId
} from "../types.js";
import { lookAppOptions, worldLook, worldLookNodes } from "./looks.js";
import {
  DOOR_OPEN_ANGLE,
  INITIAL_OBJECT_STATE,
  NEUTRAL_POSE,
  TOPPLE_ANGLE,
  Tweened,
  addPose,
  approachAngle,
  breathe,
  clamp,
  composeRotation,
  distance3,
  ease,
  hingeSwingOffset,
  moveDurationSec,
  placePiece,
  planObjectAction,
  rollAngle,
  rotateYaw,
  runningPose,
  sampleMove,
  sampleTransient,
  tipEdgeOffset,
  wrapAngle,
  yawTowards,
  type ObjectState,
  type PoseOffset,
  type StagePose,
  type TransientKind,
  type Vec3
} from "./motion.js";
import {
  CAMERA_EASE_SEC,
  DEFAULT_CAMERA_PRESET,
  SPOTS,
  boxToCssRect,
  cssToNdc,
  defaultEntrySpot,
  frameCamera,
  isOffStage,
  lerpCameraPose,
  placeAtSpot,
  projectToNdc,
  resolveLayout,
  sameCameraPose,
  standingBox,
  type Box3,
  type CameraPose,
  type LayoutEntry,
  type Occupant
} from "./spots.js";
import { ASSET_TRAITS, buildStandIn, defaultHeightM, footprintM, standInPieceMaterial, type AssetTraits, type StageAssetKey } from "./stand-ins.js";
import { buildWorldNodes, worldDressingKeys, type BuiltWorld } from "./worlds.js";

// ---------------------------------------------------------------- public types

export interface StageOptions {
  /**
   * Element (or selector) the canvas mounts into; give it a definite size.
   * `null` mounts headless (no canvas, nothing drawn): node tests and tooling only.
   */
  readonly target: HTMLElement | string | null;
  readonly reducedMotion: boolean;
  /** Passed straight to `createGame({ sound })` (the audio mixer's `gameSoundOptions()`). */
  readonly sound?: unknown;
  /** Per-model preload timeout before a stand-in is used. Default 10000 ms. */
  readonly modelTimeoutMs?: number;
  /** Load admitted GLBs (the app's `?models=0` flag). Default: the engine's `models.enabled` (also `?models=0`). */
  readonly models?: boolean;
  /** Bound on each wait for a scene mount or a first drawn frame. Default 20000 ms. */
  readonly mountTimeoutMs?: number;
}

export interface StageDiagnostics {
  readonly drawCalls: number;
  readonly nodes: number;
  readonly renderPath?: string;
  readonly storyId: string | null;
  readonly world: WorldId | null;
  /** Story nodes drawn from their GLB / as primitive stand-ins. */
  readonly modelNodes: number;
  readonly standInNodes: number;
  /** Model results by status; `pending` counts downloads still running (a stand-in is drawn until the next mount). */
  readonly modelStatus: Readonly<Partial<Record<ModelSummaryStatus, number>>>;
  /** The last load's mount failed with models and was remounted with the failing (or all) models as stand-ins. */
  readonly recoveredFromMountFailure: boolean;
  readonly warmed: boolean;
  readonly warnings: readonly string[];
}

export interface TargetRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface StageNodeSnapshot {
  readonly id: string;
  readonly visible: boolean;
  /** Where it stands as drawn: under the middle of its body, at its bottom (metres). */
  readonly position: Vec3;
  readonly drawnAs: "model" | "stand-in";
  readonly gesture: string | null;
  readonly moving: boolean;
}

/** Plain data for QA hooks and tests. No child data. */
export interface StageSnapshot {
  readonly storyId: string | null;
  readonly world: WorldId | null;
  readonly camera: CameraPresetId;
  readonly reducedMotion: boolean;
  readonly targets: readonly string[];
  readonly talking: string | null;
  readonly nodes: readonly StageNodeSnapshot[];
}

export interface WonderStage extends StageAdapter {
  /** Resolves when the current scene (first mount or the last load) is warmed and shown. */
  ready(): Promise<void>;
  diagnostics(): StageDiagnostics;
  /** CSS-px rectangles (relative to the canvas) of the active, visible touch targets: the generous hit areas. */
  targetRects(): TargetRect[];
  /** The mounted `createGame` handle. */
  game(): Prd09Game<string, string>;
  snapshot(): StageSnapshot;
  /** Warms the next story's models in the background (current + next preload). */
  prefetch(story: StorySpec): void;
}

// ---------------------------------------------------------------- constants

/** Hit boxes are inflated this much around a target's bounds. */
const HIT_INFLATE = 1.4;
/** Smallest hit box edge in metres. */
const HIT_MIN_SIZE_M = 0.5;
/** Screen-space hit radius floor in CSS px (a tap this close to a target's centre picks it). */
const HIT_RADIUS_PX = 64;
const MAX_HIGHLIGHTS = 2;
const RING_IDS = ["__ring-0", "__ring-1"] as const;
const HALO_IDS = ["__halo-0", "__halo-1"] as const;
const TURN_RATE = 4.5;
const SHOW_SEC = 0.35;
const HIDE_SEC = 0.3;
const VEIL_MS = 320;
const MOUNT_TIMEOUT_MS = 20_000;
const WARM_OPTIONS = { environmentTimeoutMs: 8000, textureTimeoutMs: 8000, maxFrames: 16 } as const;
const PARTIAL_TURN_LIMIT = 1.15;
/** A highlight ring opens from 60% to full size over this long when its target is set. */
const RING_OPEN_SEC = 0.45;
/** A glow halo never drops faster than from full to nothing over this long, even when its glow is cut short. */
const HALO_FADE_SEC = 0.6;
/** A raised object that topples lands this many times its old height sideways, clear of the stack it fell from. */
const TUMBLE_SPREAD = 1.25;
const VEIL_COLOR = "#FBF6EC";

// ---------------------------------------------------------------- internal state

interface Piece {
  readonly id: string;
  /** Local centre relative to the node base (metres, unscaled). */
  readonly center: Vec3;
  readonly rotation: Vec3;
  /** Stand-in recipe index (0 for a model node). */
  readonly index: number;
  /** Re-coloured by a "tint" action. */
  readonly tinted: boolean;
}

interface MoveRun {
  readonly style: MoveStyle;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly duration: number;
  readonly hideOnArrival: boolean;
  readonly rollStart: number;
  elapsed: number;
}

interface TransientRun {
  readonly kind: TransientKind;
  readonly duration: number;
  readonly hideAtEnd: boolean;
  readonly halo: boolean;
  elapsed: number;
}

interface AppearRun {
  readonly showing: boolean;
  readonly duration: number;
  elapsed: number;
}

interface StageNode {
  readonly id: string;
  readonly role: "actor" | "prop";
  readonly characterId: CharacterId | null;
  readonly asset: StageAssetKey;
  readonly modelKey: ModelKey | null;
  readonly heightM: number;
  /** Width, height, depth in metres (unscaled). */
  readonly size: Vec3;
  readonly traits: AssetTraits;
  readonly drawnAs: "model" | "stand-in";
  readonly pieces: readonly Piece[];
  /** Units of the height, in the node's own frame: where a carried item rides. */
  readonly carryOffset: Vec3;
  readonly defaultStyle: MoveStyle;
  /** The spot it was placed on or last sent to ("stack" builds on the blocks at this spot). */
  home: SpotId;
  base: Vec3;
  visible: boolean;
  /** Stage time of the last "show" (a block shown and stacked in one step drops onto the stack). */
  shownAt: number;
  /** Glow halo strength drawn last frame (it fades out softly even when its glow is cut short). */
  haloShown: number;
  yaw: number;
  faceYaw: number;
  faceTarget: string | null;
  heading: number;
  rollAngle: number;
  move: MoveRun | null;
  transient: TransientRun | null;
  appear: AppearRun | null;
  object: ObjectState;
  readonly lift: Tweened;
  readonly scaleMul: Tweened;
  readonly topple: Tweened;
  readonly open: Tweened;
  carriedBy: string | null;
  carrying: string | null;
  tint: string | null;
  /** The pose drawn last frame. */
  drawn: StagePose;
  /** Middle of its body as drawn last frame (a toppled block's too): rings, halos, picking and snapshots read it. */
  center: Vec3;
}

interface BuiltStory {
  readonly story: StorySpec;
  readonly builder: AuraSceneBuilder;
  readonly nodes: readonly StageNode[];
  readonly world: BuiltWorld;
  readonly modelKeys: readonly ModelKey[];
  readonly clipInitial: ReadonlyMap<string, string | null>;
}

interface WrittenTransform {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
  visible: boolean;
}

// ---------------------------------------------------------------- helpers

function isMaterialHandle(value: unknown): value is AuraModelMaterialHandle {
  return typeof value === "object" && value !== null && "setMaterialOverrides" in value && typeof value.setMaterialOverrides === "function";
}

function materialHandleOf(handle: AuraRuntimeNodeHandle): AuraModelMaterialHandle | null {
  if (!("materials" in handle)) return null;
  const candidate: unknown = handle.materials;
  return isMaterialHandle(candidate) ? candidate : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve("timeout"); }
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTarget(target: HTMLElement | string | null): HTMLElement | null {
  if (target === null || typeof document === "undefined") return null;
  if (typeof target !== "string") return target;
  const found = document.querySelector(target);
  return found instanceof HTMLElement ? found : null;
}

const MOUNT_FAILURE = /failed to mount|renderer-mount-failed|RENDERER_MOUNT_FAILED/i;

function mountFailed(app: AuraApp): boolean {
  return mountFailureMessage(app) !== null;
}

/** The engine's mount-failure message for the current scene, or null when it mounted. */
function mountFailureMessage(app: AuraApp): string | null {
  try {
    return app.diagnostics().errors.find((message) => MOUNT_FAILURE.test(message)) ?? null;
  } catch {
    return null;
  }
}

function idleProfileFor(traits: AssetTraits): ReturnType<typeof propAnimationProfile> {
  return propAnimationProfile(traits.idle);
}

// ---------------------------------------------------------------- scene building

interface NodeSeedInput {
  readonly id: string;
  readonly role: "actor" | "prop";
  readonly characterId: CharacterId | null;
  readonly asset: StageAssetKey;
  readonly modelKey: ModelKey | null;
  readonly at: SpotId;
  readonly hidden: boolean;
  readonly heightM: number;
  readonly tint: string | null;
  readonly carryOffset: Vec3;
  readonly defaultStyle: MoveStyle;
}

function layoutEntryFor(seed: NodeSeedInput): LayoutEntry {
  const traits = ASSET_TRAITS[seed.asset];
  const size = footprintM(seed.asset, seed.heightM);
  return {
    id: seed.id,
    spot: seed.at,
    role: seed.role === "actor" ? "actor" : traits.layout,
    width: size[0],
    depth: size[2],
    height: size[1],
    ...(traits.restAt !== undefined ? { restHeight: traits.restAt * seed.heightM } : {}),
    hidden: seed.hidden
  };
}

function nodeSeeds(story: StorySpec): NodeSeedInput[] {
  const seeds: NodeSeedInput[] = [];
  for (const member of story.cast) {
    const profile = CHARACTERS[member.id];
    seeds.push({
      id: member.id,
      role: "actor",
      characterId: member.id,
      asset: profile.modelKey,
      modelKey: profile.modelKey,
      at: member.at,
      hidden: member.hidden === true,
      heightM: profile.heightM,
      tint: null,
      carryOffset: profile.carryOffset,
      defaultStyle: profile.defaultStyle
    });
  }
  for (const prop of story.props) {
    const asset: StageAssetKey = prop.asset;
    const traits = ASSET_TRAITS[asset];
    const heightM = prop.size !== undefined && prop.size > 0 ? prop.size : defaultHeightM(asset);
    seeds.push({
      id: prop.id,
      role: "prop",
      characterId: null,
      asset,
      modelKey: asset === "bubble" ? null : asset,
      at: prop.at,
      hidden: prop.hidden === true,
      heightM,
      tint: prop.tint ?? null,
      carryOffset: [0, traits.restAt ?? 1, 0],
      defaultStyle: traits.defaultStyle
    });
  }
  return seeds;
}

function ringNode(id: string): AuraNodeBuilder<AuraSceneNode> {
  return primitives.torus({
    name: id,
    size: [1, 1, 0.05],
    position: [0, -10, 0],
    rotation: [Math.PI / 2, 0, 0],
    material: material.pbr({ color: "#FFE9A8", emissive: "#FFE2A0", emissiveIntensity: 0.3, roughness: 0.6, metallic: 0 }),
    castShadow: false,
    receiveShadow: false
  }).runtime({ id, tags: ["highlight"], mutable: true });
}

function haloNode(id: string): AuraNodeBuilder<AuraSceneNode> {
  return primitives.sphere({
    name: id,
    size: [1, 1, 1],
    position: [0, -10, 0],
    material: material.pbr({ color: "#FFF3C4", emissive: "#FFE7A0", emissiveIntensity: 0.35, roughness: 1, metallic: 0, opacity: 0.22 }),
    castShadow: false,
    receiveShadow: false
  }).runtime({ id, tags: ["halo"], mutable: true });
}

function newNode(seed: NodeSeedInput, base: Vec3, drawnAs: "model" | "stand-in", pieces: readonly Piece[]): StageNode {
  const traits = ASSET_TRAITS[seed.asset];
  const size = footprintM(seed.asset, seed.heightM);
  return {
    id: seed.id,
    role: seed.role,
    characterId: seed.characterId,
    asset: seed.asset,
    modelKey: seed.modelKey,
    heightM: seed.heightM,
    size,
    traits,
    drawnAs,
    pieces,
    carryOffset: seed.carryOffset,
    defaultStyle: seed.defaultStyle,
    home: seed.at,
    base,
    visible: !seed.hidden,
    shownAt: -1,
    haloShown: 0,
    yaw: 0,
    faceYaw: 0,
    faceTarget: null,
    heading: 0,
    rollAngle: 0,
    move: null,
    transient: null,
    appear: null,
    object: INITIAL_OBJECT_STATE,
    lift: new Tweened(0),
    scaleMul: new Tweened(1),
    topple: new Tweened(0),
    open: new Tweened(0),
    carriedBy: null,
    carrying: null,
    tint: seed.tint,
    drawn: { base, rotation: [0, 0, 0], scale: [1, 1, 1], pivot: "base", centerHeight: seed.heightM / 2 },
    center: [base[0], base[1] + seed.heightM / 2, base[2]]
  };
}

function buildStory(story: StorySpec, available: (key: ModelKey) => boolean, cameraPose: CameraPose): BuiltStory {
  const look = worldLook(story.world);
  const builder = scene().background(look.background);
  for (const node of worldLookNodes(story.world)) builder.add(node);
  const world = buildWorldNodes(story.world, available);
  builder.addMany(world.nodes);
  const seeds = nodeSeeds(story);
  const layout = resolveLayout(seeds.map(layoutEntryFor));
  const nodes: StageNode[] = [];
  const modelKeys: ModelKey[] = [];
  const clipInitial = new Map<string, string | null>();
  for (const key of storyModelKeys(story)) if (available(key) && modelRef(key)) modelKeys.push(key);
  const seen = new Set<string>();
  for (const seed of seeds) {
    if (seen.has(seed.id)) continue;
    seen.add(seed.id);
    const base = layout.get(seed.id) ?? SPOTS[seed.at];
    const ref = seed.modelKey ? modelRef(seed.modelKey) : undefined;
    const traits = ASSET_TRAITS[seed.asset];
    const tags = [seed.role, seed.asset];
    if (seed.modelKey && ref && available(seed.modelKey)) {
      const profile: CharacterProfile | null = seed.characterId ? CHARACTERS[seed.characterId] : null;
      const idleClip = profile && profile.rigged ? profile.idleClip() : null;
      let builderNode = model(ref, {
        name: seed.id,
        targetHeight: seed.heightM,
        scaleMode: "fit",
        castShadow: true,
        receiveShadow: true,
        visible: true,
        ...(seed.tint
          ? { materialOverrides: [{ color: seed.tint, colorMode: traits.tintMode, ...(traits.tintMode === "replace" ? { replaceTextures: true } : {}) }] }
          : {})
      })
        .position(base)
        .rotate(0, 0, 0);
      if (idleClip) builderNode = builderNode.animate({ clip: idleClip, loop: true });
      builder.add(builderNode.runtime({ id: seed.id, tags: [...tags, "model"], mutable: true }));
      clipInitial.set(seed.id, idleClip);
      nodes.push(newNode(seed, base, "model", [{ id: seed.id, center: [0, 0, 0], rotation: [0, 0, 0], index: 0, tinted: true }]));
    } else {
      const built = buildStandIn(seed.asset, {
        id: seed.id,
        heightM: seed.heightM,
        ...(seed.tint ? { tint: seed.tint } : {}),
        base,
        yaw: 0,
        movable: true,
        tags
      });
      builder.addMany(built.nodes);
      clipInitial.set(seed.id, null);
      nodes.push(newNode(seed, base, "stand-in", built.pieces));
    }
  }
  for (const id of RING_IDS) builder.add(ringNode(id));
  for (const id of HALO_IDS) builder.add(haloNode(id));
  builder.camera(camera.perspective({
    position: cameraPose.position,
    target: cameraPose.target,
    fov: cameraPose.fov,
    near: cameraPose.near,
    far: cameraPose.far
  }));
  return { story, builder, nodes, world, modelKeys, clipInitial };
}

/** Scene build of one story for QA and tests: the snapshot, plus which nodes draw as models or stand-ins. */
export interface StorySceneBuild {
  readonly builder: AuraSceneBuilder;
  /** Runtime ids of the story's actors and props, in build order. */
  readonly nodeIds: readonly string[];
  /** Every runtime id the stage moves (stand-in parts, highlight rings and halos included). */
  readonly runtimeIds: readonly string[];
  readonly drawnAs: ReadonlyMap<string, "model" | "stand-in">;
  /** Rest positions after shared-spot layout. */
  readonly positions: ReadonlyMap<string, Vec3>;
  readonly dressing: { readonly models: number; readonly standIns: number };
}

/** Builds a story's scene exactly as `load` does (no mount). `modelAvailable` defaults to "no models" (all stand-ins). */
export function buildStoryScene(story: StorySpec, options: { readonly modelAvailable?: (key: ModelKey) => boolean; readonly aspect?: number } = {}): StorySceneBuild {
  const built = buildStory(story, options.modelAvailable ?? (() => false), frameCamera(DEFAULT_CAMERA_PRESET, options.aspect ?? 16 / 9));
  return {
    builder: built.builder,
    nodeIds: built.nodes.map((n) => n.id),
    runtimeIds: [...built.nodes.flatMap((n) => n.pieces.map((p) => p.id)), ...RING_IDS, ...HALO_IDS],
    drawnAs: new Map(built.nodes.map((n) => [n.id, n.drawnAs])),
    positions: new Map(built.nodes.map((n) => [n.id, n.base])),
    dressing: { models: built.world.models, standIns: built.world.standIns }
  };
}

// ---------------------------------------------------------------- picking (pure)

/** A touch target as drawn this frame: its base point and size in metres. */
export interface PickCandidate {
  readonly id: string;
  readonly base: Vec3;
  readonly size: Vec3;
}

/** The generous hit box of a target: its bounds inflated 1.4x, at least 0.5 m on every edge. */
export function hitBox(candidate: PickCandidate): Box3 {
  return standingBox(candidate.base, candidate.size, HIT_INFLATE, HIT_MIN_SIZE_M);
}

/**
 * Which target a tap at CSS px (x, y) on a width x height canvas picks: a ray
 * through the tap (the engine's `raycastFirst`, nearest box wins) against every
 * hit box, else the target whose projected centre is nearest, when it lies
 * within 64 CSS px or 1.4x the target's own on-screen half-size.
 */
export function pickTargetAt(candidates: readonly PickCandidate[], camera: CameraPose, x: number, y: number, width: number, height: number): string | null {
  if (candidates.length === 0 || !(width > 0) || !(height > 0)) return null;
  const aspect = width / height;
  const targets: SceneQueryTarget[] = candidates.map((c) => {
    const box = hitBox(c);
    const size: Vec3 = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
    const center: Vec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
    return { nodeName: c.id, bounds: { min: box.min, max: box.max, center, size, floorY: box.min[1] } };
  });
  const hit = raycastFirst(
    { camera: { position: camera.position, target: camera.target, fov: camera.fov, aspect, near: camera.near, far: camera.far, up: [0, 1, 0] }, ndc: cssToNdc(x, y, width, height) },
    { targets }
  );
  if (hit?.nodeName) return hit.nodeName;
  // Screen-space fallback: a tap within 64 CSS px (or 1.4x the target's own half-size) of its centre counts.
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const box = standingBox(c.base, c.size, 1, 0);
    const center: Vec3 = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
    const projected = projectToNdc(center, camera, aspect);
    if (!projected) continue;
    const cx = ((projected[0] + 1) / 2) * width;
    const cy = ((1 - projected[1]) / 2) * height;
    const rect = boxToCssRect(box, camera, aspect, width, height);
    const radius = Math.max(HIT_RADIUS_PX, rect ? (Math.max(rect.w, rect.h) / 2) * HIT_INFLATE : 0);
    const distance = Math.hypot(x - cx, y - cy);
    if (distance <= radius && distance < bestDistance) {
      best = c.id;
      bestDistance = distance;
    }
  }
  return best;
}

/** The CSS-px rectangle of a target's hit area: its hit box on screen, at least 128 px square, kept inside the canvas. */
export function targetRectFor(candidate: PickCandidate, camera: CameraPose, width: number, height: number): TargetRect | null {
  if (!(width > 0) || !(height > 0)) return null;
  const rect = boxToCssRect(hitBox(candidate), camera, width / height, width, height);
  if (!rect) return null;
  const minSide = HIT_RADIUS_PX * 2;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = Math.min(Math.max(rect.w, minSide), width);
  const h = Math.min(Math.max(rect.h, minSide), height);
  return { id: candidate.id, x: clamp(cx - w / 2, 0, width - w), y: clamp(cy - h / 2, 0, height - h), w, h };
}

/** The calm scene shown before the first story loads: a world with no cast. */
function buildIdleScene(world: WorldId, available: (key: ModelKey) => boolean, cameraPose: CameraPose): AuraSceneBuilder {
  const look = worldLook(world);
  const builder = scene().background(look.background);
  for (const node of worldLookNodes(world)) builder.add(node);
  builder.addMany(buildWorldNodes(world, available).nodes);
  builder.camera(camera.perspective({ position: cameraPose.position, target: cameraPose.target, fov: cameraPose.fov, near: cameraPose.near, far: cameraPose.far }));
  return builder;
}

// ---------------------------------------------------------------- the stage

export async function createStage(options: StageOptions): Promise<WonderStage> {
  let reducedMotion = options.reducedMotion;
  const director: AnimationDirector = createAnimationDirector({ reducedMotion });
  const preloader: AssetPreloader = createAssetPreloader({
    ...(options.modelTimeoutMs !== undefined ? { timeoutMs: options.modelTimeoutMs } : {}),
    ...(options.models !== undefined ? { enabled: options.models } : {})
  });
  const mountTimeoutMs = options.mountTimeoutMs !== undefined && options.mountTimeoutMs > 0 ? options.mountTimeoutMs : MOUNT_TIMEOUT_MS;
  const host = resolveTarget(options.target);
  const warnings: string[] = [];
  const warn = (message: string): void => {
    if (!warnings.includes(message)) {
      warnings.push(message);
      if (warnings.length > 40) warnings.shift();
    }
  };

  // ---- soft veil over scene swaps (a calm fade, never a flash)
  let veil: HTMLDivElement | null = null;
  if (host && typeof document !== "undefined") {
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    veil = document.createElement("div");
    veil.className = "ww-stage-veil";
    veil.setAttribute("aria-hidden", "true");
    veil.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:2;background:${VEIL_COLOR};opacity:1;`;
    host.appendChild(veil);
  }
  const setVeil = async (opacity: number): Promise<void> => {
    if (!veil) return;
    const instant = reducedMotion;
    veil.style.transition = instant ? "none" : `opacity ${VEIL_MS}ms ease-in-out`;
    veil.style.opacity = String(opacity);
    if (!instant) await sleep(VEIL_MS + 20);
  };

  // ---- first mount: a calm world with no cast
  let gameHandle: Prd09Game<string, string> | null = null;
  const aspectNow = (): number => {
    const canvas = gameHandle?.app.canvas;
    const w = canvas?.clientWidth || host?.clientWidth || 16;
    const h = canvas?.clientHeight || host?.clientHeight || 9;
    return w > 0 && h > 0 ? w / h : 16 / 9;
  };
  const initialWorld: WorldId = "meadow";
  const initialPre = await preloader.preload(worldDressingKeys(initialWorld));
  const initialScene = buildIdleScene(initialWorld, (key) => initialPre.available.has(key), frameCamera(DEFAULT_CAMERA_PRESET, aspectNow()));

  const gameOptions = {
    id: "wonder-world",
    target: options.target,
    scene: () => initialScene,
    autoStart: true,
    qualityRebuild: { flags: ["game"] },
    ...lookAppOptions(initialWorld),
    ...(options.sound !== undefined ? { sound: options.sound } : {})
  };
  const created = createGame<string, string>(gameOptions);
  gameHandle = created;
  const app = created.app;
  created.start();

  // ---- live state
  let disposed = false;
  let mounted = false;
  let warming = false;
  let warmed = false;
  let recovered = false;
  let loadSeq = 0;
  let story: StorySpec | null = null;
  let worldId: WorldId | null = null;
  let nodes = new Map<string, StageNode>();
  let order: StageNode[] = [];
  let activeTargets: string[] = [];
  let time = 0;
  let cameraPreset: CameraPresetId = DEFAULT_CAMERA_PRESET;
  let cameraFrom: CameraPose | null = null;
  let cameraElapsed = 0;
  let cameraDuration = 0;
  let cameraApplied: CameraPose | null = null;
  const written = new Map<string, WrittenTransform>();
  /** Which target each highlight ring circles, and since when (stage time), for the soft opening. */
  const ringOwner: (string | null)[] = RING_IDS.map(() => null);
  const ringSince: number[] = RING_IDS.map(() => 0);
  let modelNodeCount = 0;
  let standInNodeCount = 0;

  const handle = (id: string): AuraRuntimeNodeHandle | undefined => {
    try {
      return app.nodes.get(id);
    } catch {
      return undefined;
    }
  };

  const cameraPoseNow = (): CameraPose => {
    const to = frameCamera(cameraPreset, aspectNow());
    if (cameraFrom && cameraElapsed < cameraDuration) {
      return lerpCameraPose(cameraFrom, to, ease("inOutSine", cameraElapsed / cameraDuration));
    }
    return to;
  };

  const applyCamera = (pose: CameraPose, cut: boolean): void => {
    if (!cut && cameraApplied && sameCameraPose(pose, cameraApplied)) return;
    try {
      app.camera?.setPose({ position: pose.position, target: pose.target, fov: pose.fov, near: pose.near, far: pose.far, up: [0, 1, 0] }, cut ? { cut: true } : undefined);
      cameraApplied = pose;
    } catch (error) {
      warn(`camera: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** Model keys whose URL the engine names in its mount errors (the GLB that broke the mount), when it does. */
  const modelsNamedInErrors = (keys: readonly ModelKey[]): ModelKey[] => {
    let text = "";
    try {
      text = app.diagnostics().errors.join("\n");
    } catch {
      return [];
    }
    return keys.filter((key) => {
      const url = modelRef(key)?.url;
      return typeof url === "string" && url.length > 0 && text.includes(url);
    });
  };

  // ---- first frame: mount settled (a dressing model that breaks it is swapped for
  // its stand-in), a drawn frame (bounded), runtime effects off, warm programs
  const settleFirstMount = async (): Promise<void> => {
    await withTimeout(app.ready(), mountTimeoutMs);
    const dressingModels = worldDressingKeys(initialWorld).filter((key) => initialPre.available.has(key));
    let dropped: ModelKey[] = [];
    for (let attempt = 0; attempt < 2 && mountFailed(app) && !disposed; attempt += 1) {
      const remaining = dressingModels.filter((key) => !dropped.includes(key));
      if (remaining.length === 0) break;
      const named = attempt === 0 ? modelsNamedInErrors(remaining) : [];
      const drop = named.length > 0 && named.length < remaining.length ? named : remaining;
      dropped = [...dropped, ...drop];
      preloader.markFailed(drop);
      warn(`first mount failed; ${drop.join(", ")} drawn as stand-ins`);
      try {
        await created.setScene(buildIdleScene(initialWorld, (key) => initialPre.available.has(key) && !dropped.includes(key), frameCamera(DEFAULT_CAMERA_PRESET, aspectNow())).toJSON());
        await withTimeout(app.ready(), mountTimeoutMs);
      } catch (error) {
        warn(`setScene: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
    // No WebGL2, or a GPU that compiles nothing: the renderer still fails to mount
    // with every dressing model already a stand-in, so nothing will ever draw. The
    // stage fails (createStage rejects) and the app says so on the menu, instead of
    // playing a story on a canvas that stays blank. Headless stages have no canvas.
    const failure = host !== null && !disposed ? mountFailureMessage(app) : null;
    if (failure !== null && dressingModels.every((key) => dropped.includes(key))) {
      throw new Error(`The 3D renderer could not start: ${failure.slice(0, 200)}`);
    }
    const presented = await withTimeout(created.ready(), mountTimeoutMs);
    if (presented === "timeout") warn(`first frame: no drawn frame within ${mountTimeoutMs} ms; continuing`);
    if (app.effects) app.effects.runtime = "off";
    applyCamera(frameCamera(DEFAULT_CAMERA_PRESET, aspectNow()), true);
    try {
      await warmPrograms(app, WARM_OPTIONS);
    } catch (error) {
      warn(`warmPrograms: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!disposed) await setVeil(0);
  };
  let readyPromise: Promise<void> = settleFirstMount();
  try {
    await readyPromise;
  } catch (error) {
    // The renderer could not start: free the game and its canvas; the opaque veil stays as a calm backdrop.
    disposed = true;
    preloader.dispose();
    void created.dispose().catch(() => undefined);
    throw error;
  }

  // ---- node lookup and placement
  const occupantsFor = (mover: StageNode): Occupant[] => {
    const out: Occupant[] = [];
    for (const other of order) {
      if (other.id === mover.id || !other.visible || other.carriedBy) continue;
      // Popped, eaten or fading out: it no longer holds its place.
      if (other.object.gone || (other.appear !== null && !other.appear.showing)) continue;
      out.push({
        id: other.id,
        position: other.move ? other.move.to : other.base,
        role: other.role === "actor" ? "actor" : other.traits.layout,
        width: other.size[0],
        height: other.size[1],
        ...(other.traits.restAt !== undefined ? { restHeight: other.traits.restAt * other.heightM } : {})
      });
    }
    return out;
  };

  /** Drawn and touchable: visible, not popped or eaten, and not riding a hidden carrier. */
  const isShown = (n: StageNode): boolean => {
    if (!n.visible || n.object.gone) return false;
    if (!n.carriedBy) return true;
    const carrier = nodes.get(n.carriedBy);
    return carrier === undefined || carrier.visible;
  };

  const currentPosition = (n: StageNode): Vec3 => {
    if (n.move) {
      const t = n.move.duration > 0 ? n.move.elapsed / n.move.duration : 1;
      return sampleMove(n.move.style, n.move.from, n.move.to, t, n.move.elapsed, reducedMotion).position;
    }
    return n.base;
  };

  const detach = (item: StageNode): void => {
    if (!item.carriedBy) return;
    const carrier = nodes.get(item.carriedBy);
    item.base = item.drawn.base;
    item.carriedBy = null;
    if (carrier && carrier.carrying === item.id) carrier.carrying = null;
  };

  const startMove = (n: StageNode, spot: SpotId, style: MoveStyle | undefined, hideOnArrival: boolean): void => {
    detach(n);
    n.home = spot;
    const from = currentPosition(n);
    const to = placeAtSpot(spot, { id: n.id, role: n.role === "actor" ? "actor" : n.traits.layout, width: n.size[0], height: n.size[1], from }, occupantsFor(n));
    const moveStyle = style ?? n.defaultStyle;
    const distance = distance3(from, to);
    n.base = from;
    if (distance < 0.01) {
      n.move = null;
      n.base = to;
      director.setLocomotion(n.id, null);
      if (hideOnArrival) hide(n);
      return;
    }
    n.move = { style: moveStyle, from, to, duration: moveDurationSec(moveStyle, distance), hideOnArrival, rollStart: n.rollAngle, elapsed: 0 };
    director.setLocomotion(n.id, moveStyle);
  };

  const show = (n: StageNode): void => {
    const wasHidden = !n.visible || n.object.gone || (n.appear !== null && !n.appear.showing);
    n.visible = true;
    if (wasHidden) n.shownAt = time;
    if (n.object.gone) {
      n.object = { ...n.object, gone: false };
      n.scaleMul.jump(Math.max(n.scaleMul.target, 0.35));
    }
    n.transient = n.transient?.hideAtEnd ? null : n.transient;
    if (wasHidden) n.appear = reducedMotion ? null : { showing: true, duration: SHOW_SEC, elapsed: 0 };
  };

  const hide = (n: StageNode): void => {
    // Already fading out: let that fade finish (restarting it would pop it back to full size).
    if (!n.visible || (n.appear !== null && !n.appear.showing)) return;
    if (reducedMotion) {
      n.visible = false;
      n.appear = null;
      return;
    }
    n.appear = { showing: false, duration: HIDE_SEC, elapsed: 0 };
  };

  const applyTint = (n: StageNode, tint: string): void => {
    n.tint = tint;
    try {
      if (n.drawnAs === "model") {
        const main = handle(n.id);
        if (!main) return;
        const materials = materialHandleOf(main);
        if (materials) {
          materials.setMaterialOverrides([{ color: tint, colorMode: n.traits.tintMode, ...(n.traits.tintMode === "replace" ? { replaceTextures: true } : {}) }]);
        } else {
          main.setMaterial(material.pbr({ color: tint }));
        }
        return;
      }
      // Stand-in: every piece the recipe tints, with the material it was built with.
      for (const piece of n.pieces) {
        if (!piece.tinted) continue;
        handle(piece.id)?.setMaterial(standInPieceMaterial(n.asset, piece.index, tint));
      }
    } catch (error) {
      warn(`tint ${n.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /**
   * "stack": stand a block on the blocks already standing at its own spot (the
   * first one stands on the floor). A block that is only now appearing pops in
   * on top and drops softly onto the stack; one already on show never jumps up:
   * it stands up where it is, or hops over onto the stack.
   */
  const stackOnSpot = (n: StageNode, appearing: boolean): void => {
    detach(n);
    const here = currentPosition(n);
    const to = placeAtSpot(n.home, { id: n.id, role: "stackable", width: n.size[0], height: n.size[1], from: here }, occupantsFor(n));
    const distance = distance3(here, to);
    if (appearing) {
      if (distance > 0.01) {
        n.move = null;
        n.base = to;
      }
      return;
    }
    n.transient = null;
    if (distance > 0.01) {
      n.move = { style: "hop", from: here, to, duration: moveDurationSec("hop", distance), hideOnArrival: false, rollStart: n.rollAngle, elapsed: 0 };
      n.base = here;
    }
  };

  const objectAction = (n: StageNode, action: ObjectAction, tint: string | undefined): void => {
    const position = currentPosition(n);
    // Read before anything below changes it: shown in this same step (or still hidden).
    const appearing = !isShown(n) || n.shownAt === time || n.appear?.showing === true;
    const plan = planObjectAction(action, n.object, { door: n.traits.door === true, container: n.traits.container === true, x: position[0] });
    const settle = reducedMotion ? Math.min(plan.settleSec, 0.4) : plan.settleSec;
    const previous = n.object;
    n.object = plan.next;
    if (plan.next.lift !== previous.lift) n.lift.set(plan.next.lift, settle, plan.next.lift < previous.lift ? "inOutSine" : "outCubic");
    if (plan.next.scaleMul !== previous.scaleMul) n.scaleMul.set(plan.next.scaleMul, settle, "inOutSine");
    if (plan.next.toppled !== previous.toppled) n.topple.set(plan.next.toppled * TOPPLE_ANGLE, settle, "outCubic");
    if (n.traits.door && plan.next.open !== previous.open) n.open.set(plan.next.open ? DOOR_OPEN_ANGLE : 0, settle, "inOutSine");
    if (action === "stack") n.topple.set(0, 0.3, "inOutSine");
    if (plan.transient) {
      n.transient = { kind: plan.transient, duration: plan.durationSec, hideAtEnd: plan.hideAtEnd, halo: plan.halo, elapsed: 0 };
    }
    if (plan.stopMove && n.move) {
      n.base = currentPosition(n);
      n.move = null;
      director.setLocomotion(n.id, null);
    }
    // "roll" on something already travelling (a `move ... style: "roll"` in the
    // same step) just rolls along that path; on a resting object it rolls a metre
    // toward the middle. A carried object stays in the carrier's hands.
    if (plan.rollBy !== 0 && !n.move && !n.carriedBy) {
      const to: Vec3 = [clamp(position[0] + plan.rollBy, -2.6, 2.6), position[1], position[2]];
      n.move = { style: "roll", from: position, to, duration: moveDurationSec("roll", Math.abs(to[0] - position[0])), hideOnArrival: false, rollStart: n.rollAngle, elapsed: 0 };
      n.base = position;
    }
    // A raised object that tips over (a block on a tower, a toy on a table)
    // tumbles down to the floor while it tips, landing clear of where it stood
    // on the side it falls toward ("Uh-oh! Down!"), never left lying in mid-air.
    if (plan.next.toppled !== 0 && previous.toppled === 0 && !n.carriedBy && n.traits.floats !== true && position[1] > 0.01) {
      const to: Vec3 = [clamp(position[0] - plan.next.toppled * position[1] * TUMBLE_SPREAD, -2.6, 2.6), 0, position[2]];
      n.move = { style: "slide", from: position, to, duration: Math.max(0.3, settle), hideOnArrival: false, rollStart: n.rollAngle, elapsed: 0 };
      n.base = position;
    }
    if (action === "stack") stackOnSpot(n, appearing);
    if (action === "tint" && tint) applyTint(n, tint);
    if (action === "stack" && !n.visible) show(n);
  };

  const carry = (carrierId: string, itemId: string | null): void => {
    const carrier = nodes.get(carrierId);
    if (!carrier) {
      warn(`carry: no node "${carrierId}"`);
      return;
    }
    if (itemId === null) {
      const item = carrier.carrying ? nodes.get(carrier.carrying) : undefined;
      carrier.carrying = null;
      if (!item) return;
      item.carriedBy = null;
      // Set down just in front of the carrier (clear of its body), lowered from
      // the height it was carried at with a soft settle: no jump up first.
      const ahead = Math.max(carrier.carryOffset[2] * carrier.heightM, carrier.size[2] / 2 + item.size[2] / 2 + 0.05);
      const front = rotateYaw(carrier.yaw, [carrier.carryOffset[0] * carrier.heightM, 0, ahead]);
      const at = currentPosition(carrier);
      const heldAt = Math.max(0, item.drawn.base[1]);
      item.base = [clamp(at[0] + front[0], -2.6, 2.6), 0, clamp(at[2] + front[2], -1.9, 1.5)];
      item.lift.jump(Math.max(item.object.lift, heldAt));
      item.lift.set(item.object.lift, reducedMotion ? 0.35 : 0.7, reducedMotion ? "inOutSine" : "outBounceSoft");
      return;
    }
    const item = nodes.get(itemId);
    if (!item) {
      warn(`carry: no node "${itemId}"`);
      return;
    }
    // Hands full: set the old item down in front first (it never jumps back to where it was picked up).
    if (carrier.carrying && carrier.carrying !== itemId) carry(carrierId, null);
    detach(item);
    item.move = null;
    item.carriedBy = carrier.id;
    carrier.carrying = item.id;
    if (!item.visible) show(item);
  };

  const setCameraPreset = (preset: CameraPresetId): void => {
    if (preset === cameraPreset && cameraElapsed >= cameraDuration) return;
    cameraFrom = cameraPoseNow();
    cameraPreset = preset;
    cameraElapsed = 0;
    cameraDuration = reducedMotion ? 0 : CAMERA_EASE_SEC;
  };

  const applyOne = (action: StageAction): void => {
    switch (action.do) {
      case "sfx":
      case "song":
      case "music":
        return;
      case "camera":
        setCameraPreset(action.preset);
        return;
      case "carry":
        carry(action.actor, action.item);
        return;
      case "object": {
        const n = nodes.get(action.target);
        if (!n) return warn(`object: no node "${action.target}"`);
        objectAction(n, action.action, action.tint);
        return;
      }
      default:
        break;
    }
    const n = nodes.get(action.actor);
    if (!n) return warn(`${action.do}: no node "${action.actor}"`);
    switch (action.do) {
      case "enter": {
        const from = action.from ?? defaultEntrySpot(action.at, n.traits.floats === true);
        const wasHidden = !n.visible || n.object.gone;
        detach(n);
        n.move = null;
        n.base = SPOTS[from];
        n.visible = true;
        // Entering from an on-stage spot fades in with a soft pop instead of appearing at once.
        n.appear = wasHidden && !reducedMotion && !isOffStage(from) ? { showing: true, duration: SHOW_SEC, elapsed: 0 } : null;
        if (n.object.gone) {
          n.object = { ...n.object, gone: false };
          n.scaleMul.jump(1);
        }
        n.yaw = 0;
        startMove(n, action.at, action.style, false);
        return;
      }
      case "exit":
        startMove(n, action.to, action.style, true);
        return;
      case "move":
        startMove(n, action.to, action.style, false);
        return;
      case "gesture":
        director.gesture(n.id, action.gesture, action.loop === true);
        return;
      case "face":
        if (action.toward !== "viewer" && !nodes.has(action.toward)) warn(`face: no node "${action.toward}"`);
        n.faceTarget = action.toward;
        return;
      case "show":
        show(n);
        return;
      case "hide":
        hide(n);
        return;
    }
  };

  // ---- per-frame
  const targetYawFor = (n: StageNode, position: Vec3): number => {
    if (n.traits.round) return n.heading;
    if (n.move && n.traits.turns !== "none") {
      const heading = n.heading;
      if (n.traits.turns === "full") return heading;
      return clamp(wrapAngle(heading), -PARTIAL_TURN_LIMIT, PARTIAL_TURN_LIMIT);
    }
    if (n.faceTarget === "viewer") return 0;
    if (n.faceTarget) {
      const target = nodes.get(n.faceTarget);
      if (target) return yawTowards(position, currentPosition(target));
    }
    return n.faceYaw;
  };

  const step = (n: StageNode, dt: number): void => {
    n.lift.step(dt);
    n.scaleMul.step(dt);
    n.topple.step(dt);
    n.open.step(dt);
    if (n.transient) {
      n.transient.elapsed += dt;
      if (n.transient.elapsed >= n.transient.duration) {
        if (n.transient.hideAtEnd) {
          n.visible = false;
          n.scaleMul.jump(n.object.scaleMul);
        }
        n.transient = null;
      }
    }
    if (n.appear) {
      n.appear.elapsed += dt;
      if (n.appear.elapsed >= n.appear.duration) {
        if (!n.appear.showing) n.visible = false;
        n.appear = null;
      }
    }
    if (n.move) {
      n.move.elapsed += dt;
      const run = n.move;
      const t = run.duration > 0 ? run.elapsed / run.duration : 1;
      const sample = sampleMove(run.style, run.from, run.to, t, run.elapsed, reducedMotion);
      if (sample.heading !== null) n.heading = sample.heading;
      if (n.traits.round) n.rollAngle = run.rollStart + rollAngle(sample.travelled, n.heightM / 2);
      if (t >= 1) {
        n.base = run.to;
        n.move = null;
        director.setLocomotion(n.id, null);
        if (n.traits.turns === "full" && n.role === "actor") n.faceYaw = n.heading;
        // Off stage this is unseen; on stage (an exit to "back") it is a soft shrink, never a blink.
        if (run.hideOnArrival) hide(n);
      }
    }
  };

  const poseOf = (n: StageNode): { pose: StagePose; visible: boolean } => {
    let position: Vec3;
    let moveOffset: PoseOffset = NEUTRAL_POSE;
    if (n.move) {
      const t = n.move.duration > 0 ? n.move.elapsed / n.move.duration : 1;
      const sample = sampleMove(n.move.style, n.move.from, n.move.to, t, n.move.elapsed, reducedMotion);
      position = sample.position;
      moveOffset = sample.pose;
    } else {
      position = n.base;
    }
    let carrierYaw: number | null = null;
    let carrierVisible = true;
    if (n.carriedBy) {
      const carrier = nodes.get(n.carriedBy);
      if (carrier) {
        const cb = carrier.drawn.base;
        const offset = rotateYaw(carrier.yaw, [carrier.carryOffset[0] * carrier.heightM, carrier.carryOffset[1] * carrier.heightM, carrier.carryOffset[2] * carrier.heightM]);
        position = [cb[0] + offset[0], cb[1] + offset[1] - n.heightM * 0.5, cb[2] + offset[2]];
        carrierYaw = carrier.yaw;
        // A carried item goes where its carrier goes, hidden with it too.
        carrierVisible = carrier.visible;
      }
    }
    const gesture = director.pose(n.id);
    const transient = n.transient ? sampleTransient(n.transient.kind, n.transient.elapsed, n.transient.duration, reducedMotion) : NEUTRAL_POSE;
    const running = n.object.running ? runningPose(time, reducedMotion) : NEUTRAL_POSE;
    const highlighted = activeTargets.slice(0, MAX_HIGHLIGHTS).includes(n.id);
    const breathing = highlighted && !reducedMotion ? breathe(time, 0.045) : 1;
    let appearScale = 1;
    if (n.appear) {
      const u = n.appear.elapsed / Math.max(0.01, n.appear.duration);
      appearScale = n.appear.showing ? 0.6 + 0.4 * ease("outBackSoft", u) : 1 - 0.4 * ease("inOutSine", u);
    }
    const p = addPose(gesture, transient, moveOffset, running);
    const yaw = carrierYaw ?? n.yaw;
    const mul = n.scaleMul.value * breathing * appearScale;
    let base: Vec3 = [position[0] + p.dx, position[1] + n.lift.value + p.dy, position[2] + p.dz];
    let openYaw = 0;
    if (n.traits.door) {
      openYaw = n.open.value;
      const hinge = rotateYaw(yaw, hingeSwingOffset(n.size[0] * mul, openYaw));
      base = [base[0] + hinge[0], base[1], base[2] + hinge[2]];
    }
    // A toppled object tips over its bottom edge, so it lies on the floor instead of sinking into it.
    const tilt = n.topple.value;
    if (tilt !== 0 && !n.traits.round) {
      const facing = yaw + p.ry + openYaw;
      const halfX = ((Math.abs(Math.cos(facing)) * n.size[0] + Math.abs(Math.sin(facing)) * n.size[2]) / 2) * mul;
      const tip = tipEdgeOffset(halfX, tilt);
      base = [base[0] + tip[0], base[1] + tip[1], base[2] + tip[2]];
    }
    const roll = n.traits.round ? n.rollAngle : 0;
    const pose: StagePose = {
      base,
      rotation: [p.rx + roll, yaw + p.ry + openYaw, p.rz + n.topple.value],
      scale: [p.sx * mul, p.sy * mul, p.sz * mul],
      pivot: n.traits.round ? "center" : "base",
      centerHeight: n.heightM / 2
    };
    return { pose, visible: n.visible && carrierVisible };
  };

  const write = (id: string, position: Vec3, rotation: Vec3, scale: Vec3, visible: boolean): void => {
    const h = handle(id);
    if (!h) return;
    const last = written.get(id);
    const eps = 1e-5;
    if (last && last.visible === visible && !visible) return;
    try {
      if (!last || last.visible !== visible) h.setVisible(visible);
      if (!visible) {
        written.set(id, { ...(last ?? { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 }), visible });
        return;
      }
      if (!last || Math.abs(last.px - position[0]) > eps || Math.abs(last.py - position[1]) > eps || Math.abs(last.pz - position[2]) > eps) {
        h.setPosition(position[0], position[1], position[2]);
      }
      if (!last || Math.abs(last.rx - rotation[0]) > eps || Math.abs(last.ry - rotation[1]) > eps || Math.abs(last.rz - rotation[2]) > eps) {
        h.setRotation(rotation[0], rotation[1], rotation[2]);
      }
      if (!last || Math.abs(last.sx - scale[0]) > eps || Math.abs(last.sy - scale[1]) > eps || Math.abs(last.sz - scale[2]) > eps) {
        h.setScale([scale[0], scale[1], scale[2]]);
      }
      written.set(id, { px: position[0], py: position[1], pz: position[2], rx: rotation[0], ry: rotation[1], rz: rotation[2], sx: scale[0], sy: scale[1], sz: scale[2], visible });
    } catch (error) {
      warn(`write ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const render = (n: StageNode, pose: StagePose, visible: boolean): void => {
    n.drawn = pose;
    n.center = placePiece(pose, [0, n.heightM / 2, 0]);
    for (const piece of n.pieces) {
      const position = placePiece(pose, piece.center);
      const rotation = composeRotation(pose.rotation, piece.rotation);
      write(piece.id, position, rotation, pose.scale, visible);
    }
  };

  /** Height of the bottom of a node's body as drawn last frame. */
  const floorOf = (n: StageNode): number => n.center[1] - (n.size[1] * Math.abs(n.drawn.scale[1])) / 2;

  /** A target as drawn last frame (the point under its middle and its scaled size) for picking and rectangles. */
  const candidateOf = (n: StageNode): PickCandidate => {
    const s = n.drawn.scale;
    return { id: n.id, base: [n.center[0], floorOf(n), n.center[2]], size: [n.size[0] * Math.abs(s[0]), n.size[1] * Math.abs(s[1]), n.size[2] * Math.abs(s[2])] };
  };

  const renderHighlights = (dt: number): void => {
    const highlighted = activeTargets.slice(0, MAX_HIGHLIGHTS).map((id) => nodes.get(id)).filter((n): n is StageNode => n !== undefined && isShown(n));
    RING_IDS.forEach((ringId, index) => {
      const n = highlighted[index];
      if (!n) {
        ringOwner[index] = null;
        write(ringId, [0, -10, 0], [Math.PI / 2, 0, 0], [1, 1, 1], false);
        return;
      }
      if (ringOwner[index] !== n.id) {
        ringOwner[index] = n.id;
        ringSince[index] = time;
      }
      const c = n.center;
      const floor = floorOf(n);
      // A new ring opens out softly over RING_OPEN_SEC, then breathes slowly.
      const open = reducedMotion ? 1 : 0.6 + 0.4 * ease("outCubic", (time - (ringSince[index] ?? time)) / RING_OPEN_SEC);
      const breath = (reducedMotion ? 1 : breathe(time, 0.07, 2.6)) * open;
      const floating = floor > 0.3 || n.traits.floats === true;
      if (floating) {
        const d = (Math.max(n.size[0], n.size[1]) * 1.3 + 0.3) * breath;
        write(ringId, [c[0], c[1], c[2]], [0, 0, 0], [d, d, 1], true);
      } else {
        const d = (Math.max(n.size[0], n.size[2]) * 1.25 + 0.35) * breath;
        write(ringId, [c[0], Math.max(0.02, floor + 0.02), c[2]], [Math.PI / 2, 0, 0], [d, d, 1], true);
      }
    });
    const glowing: Array<{ n: StageNode; strength: number }> = [];
    for (const n of order) {
      if (!isShown(n)) {
        n.haloShown = 0;
        continue;
      }
      let strength = director.halo(n.id);
      if (n.transient?.halo) {
        const { elapsed, duration } = n.transient;
        const u = elapsed / Math.max(0.01, duration);
        // Reduced motion: steady, with the same soft 0.6 s fades in and out.
        const steady = 0.8 * Math.min(clamp(elapsed / 0.6, 0, 1), clamp((duration - elapsed) / 0.6, 0, 1));
        strength = Math.max(strength, reducedMotion ? steady : Math.sin(Math.PI * clamp(u, 0, 1)));
      }
      // A glow cut short (a new gesture or object action) still fades out over HALO_FADE_SEC.
      strength = Math.max(strength, n.haloShown - dt / HALO_FADE_SEC);
      n.haloShown = strength;
      if (strength > 0.02) glowing.push({ n, strength });
    }
    HALO_IDS.forEach((haloId, index) => {
      const entry = glowing[index];
      if (!entry) {
        write(haloId, [0, -10, 0], [0, 0, 0], [1, 1, 1], false);
        return;
      }
      const { n, strength } = entry;
      // The halo grows out of the object as the glow rises (and sinks back into
      // it), so the soft light never appears or vanishes at once.
      const d = Math.max(n.size[0], n.size[1]) * (0.55 + 0.85 * strength);
      write(haloId, [n.center[0], n.center[1], n.center[2]], [0, 0, 0], [d, d, d], true);
    });
  };

  const drainClips = (): void => {
    for (const command of director.drainClipCommands()) {
      const h = handle(command.actor);
      if (!h) continue;
      try {
        h.play(command.clip, { loop: command.loop, crossFade: 0.25 });
      } catch (error) {
        warn(`clip ${command.actor}/${command.clip}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const frame = (dt: number): void => {
    time += dt;
    director.update(dt);
    // Carriers first so carried items follow this frame's pose.
    const carriers = order.filter((n) => !n.carriedBy);
    const carried = order.filter((n) => n.carriedBy);
    for (const n of order) step(n, dt);
    for (const group of [carriers, carried]) {
      for (const n of group) {
        const position = currentPosition(n);
        const target = targetYawFor(n, position);
        n.yaw = reducedMotion ? target : approachAngle(n.yaw, target, TURN_RATE * dt);
        const { pose, visible } = poseOf(n);
        render(n, pose, visible);
      }
    }
    renderHighlights(dt);
    if (cameraElapsed < cameraDuration) cameraElapsed = Math.min(cameraDuration, cameraElapsed + dt);
    applyCamera(cameraPoseNow(), false);
    drainClips();
  };

  // ---- warming: everything visible and in frame behind the veil, so hidden and off-stage nodes compile too
  const renderWarmPose = (): void => {
    for (const n of order) {
      const b = n.base;
      const inFrame: Vec3 = [clamp(b[0], -2.4, 2.4), clamp(b[1], 0, 1.9), clamp(b[2], -1.6, 1.2)];
      const pose: StagePose = { base: inFrame, rotation: [0, 0, 0], scale: [1, 1, 1], pivot: "base", centerHeight: n.heightM / 2 };
      n.drawn = pose;
      n.center = placePiece(pose, [0, n.heightM / 2, 0]);
      for (const piece of n.pieces) write(piece.id, placePiece(pose, piece.center), piece.rotation, [1, 1, 1], true);
    }
    RING_IDS.forEach((id, index) => write(id, [index === 0 ? -0.6 : 0.6, 0.02, 0.4], [Math.PI / 2, 0, 0], [1, 1, 1], true));
    HALO_IDS.forEach((id, index) => write(id, [index === 0 ? -0.6 : 0.6, 0.8, -0.5], [0, 0, 0], [0.8, 0.8, 0.8], true));
  };

  const adopt = (built: BuiltStory): void => {
    director.clear();
    written.clear();
    ringOwner.fill(null);
    nodes = new Map(built.nodes.map((n) => [n.id, n]));
    order = [...built.nodes];
    activeTargets = [];
    modelNodeCount = built.nodes.filter((n) => n.drawnAs === "model").length;
    standInNodeCount = built.nodes.length - modelNodeCount;
    for (const n of built.nodes) {
      const profile = n.characterId ? CHARACTERS[n.characterId] : null;
      director.register({
        id: n.id,
        profile: profile ?? idleProfileFor(n.traits),
        canPlayClips: n.drawnAs === "model" && profile !== null && profile.rigged,
        initialClip: built.clipInitial.get(n.id) ?? null
      });
    }
    director.drainClipCommands();
    cameraPreset = DEFAULT_CAMERA_PRESET;
    cameraFrom = null;
    cameraElapsed = 0;
    cameraDuration = 0;
    cameraApplied = null;
    time = 0;
  };

  const mountScene = async (built: BuiltStory, seq: number): Promise<"ok" | "failed" | "stale"> => {
    mounted = false;
    try {
      await created.setScene(built.builder.toJSON());
    } catch (error) {
      warn(`setScene: ${error instanceof Error ? error.message : String(error)}`);
      return "failed";
    }
    if (seq !== loadSeq || disposed) return "stale";
    const settled = await withTimeout(app.ready(), mountTimeoutMs);
    if (seq !== loadSeq || disposed) return "stale";
    if (settled === "timeout") warn(`mount of ${built.story.id}: renderer not settled within ${mountTimeoutMs} ms`);
    return mountFailed(app) ? "failed" : "ok";
  };

  /** One story load. Loads run one at a time (see `stage.load`); a newer request makes an older one stop at its next check. */
  const load = async (next: StorySpec, seq: number): Promise<void> => {
    if (seq !== loadSeq || disposed) return;
    mounted = false;
    await setVeil(1);
    if (seq !== loadSeq || disposed) return;
    const keys = storyModelKeys(next);
    const pre = await preloader.preload(keys);
    if (seq !== loadSeq || disposed) return;
    const aspectPose = frameCamera(DEFAULT_CAMERA_PRESET, aspectNow());
    let built = buildStory(next, (key) => pre.available.has(key), aspectPose);
    recovered = false;
    let result = await mountScene(built, seq);
    if (result === "stale") return;
    // A model broke the mount after preload (for example a GLB that fetched and
    // hashed fine but does not decode). When the engine names the GLB only that one
    // becomes a stand-in; otherwise, or if the mount still fails, every model does.
    // Dropped models stay dropped for the session.
    let dropped: ModelKey[] = [];
    for (let attempt = 0; attempt < 2 && result === "failed" && built.modelKeys.length > 0; attempt += 1) {
      const named = attempt === 0 ? modelsNamedInErrors(built.modelKeys) : [];
      const drop = named.length > 0 && named.length < built.modelKeys.length ? named : [...built.modelKeys];
      dropped = [...dropped, ...drop];
      preloader.markFailed(drop);
      warn(`mount of ${next.id} failed; ${drop.join(", ")} drawn as stand-ins`);
      built = buildStory(next, (key) => pre.available.has(key) && !dropped.includes(key), aspectPose);
      recovered = true;
      result = await mountScene(built, seq);
      if (result === "stale") return;
    }
    if (result === "failed") warn(`mount of ${next.id} reported a renderer error`);
    adopt(built);
    story = next;
    worldId = next.world;
    if (app.effects) app.effects.runtime = "off";
    applyCamera(frameCamera(cameraPreset, aspectNow()), true);
    warming = true;
    mounted = true;
    renderWarmPose();
    try {
      await warmPrograms(app, WARM_OPTIONS);
      warmed = true;
    } catch (error) {
      warn(`warmPrograms: ${error instanceof Error ? error.message : String(error)}`);
    }
    warming = false;
    if (seq !== loadSeq || disposed) return;
    written.clear();
    frame(0);
    await setVeil(0);
  };

  // ---- picking and target rectangles
  const canvasCssSize = (): { width: number; height: number } => {
    const canvas = app.canvas;
    if (!canvas) return { width: 0, height: 0 };
    const width = canvas.clientWidth || canvas.getBoundingClientRect().width;
    const height = canvas.clientHeight || canvas.getBoundingClientRect().height;
    return { width, height };
  };

  const pickableTargets = (): StageNode[] =>
    activeTargets.map((id) => nodes.get(id)).filter((n): n is StageNode => n !== undefined && isShown(n));

  // Loads are chained so two `setScene` calls never overlap (a quick second
  // story choice waits for the first load to finish or step aside).
  let loadChain: Promise<void> = readyPromise;

  const stage: WonderStage = {
    load(next) {
      if (disposed) return Promise.resolve();
      const seq = ++loadSeq;
      const run = loadChain
        .then(() => load(next, seq))
        .catch((error: unknown) => {
          warn(`load ${next.id}: ${error instanceof Error ? error.message : String(error)}`);
          if (seq === loadSeq && !disposed) void setVeil(0);
        });
      loadChain = run;
      readyPromise = run;
      return run;
    },
    apply(actions) {
      if (disposed) return;
      for (const action of actions) {
        try {
          applyOne(action);
        } catch (error) {
          warn(`apply ${action.do}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    },
    setTalking(actor) {
      director.setTalking(actor !== null && nodes.has(actor) ? actor : null);
    },
    setTargets(targets) {
      const unique = targets ? [...new Set(targets)] : [];
      // Child-safety rule: at most two touch targets at a time (the content schema enforces it too).
      if (unique.length > MAX_HIGHLIGHTS) warn(`setTargets: ${unique.length} targets; only the first ${MAX_HIGHLIGHTS} are active`);
      activeTargets = unique.slice(0, MAX_HIGHLIGHTS);
      for (const id of activeTargets) if (!nodes.has(id)) warn(`setTargets: no node "${id}"`);
    },
    pick(x, y) {
      if (disposed || !mounted) return null;
      const candidates = pickableTargets();
      if (candidates.length === 0) return null;
      const { width, height } = canvasCssSize();
      return pickTargetAt(candidates.map(candidateOf), cameraPoseNow(), x, y, width, height);
    },
    update(dtSeconds) {
      if (disposed || !mounted || warming) return;
      const dt = Number.isFinite(dtSeconds) ? clamp(dtSeconds, 0, 0.1) : 0;
      frame(dt);
    },
    setReducedMotion(on) {
      reducedMotion = on;
      director.setReducedMotion(on);
      if (on) {
        cameraElapsed = cameraDuration;
        // Soft pops end at once; a node that was fading out still ends hidden.
        for (const n of order) {
          if (n.appear !== null && !n.appear.showing) n.visible = false;
          n.appear = null;
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loadSeq += 1;
      mounted = false;
      director.clear();
      preloader.dispose();
      nodes.clear();
      order = [];
      activeTargets = [];
      written.clear();
      veil?.remove();
      veil = null;
      const canvas = app.canvas;
      void created.dispose().catch(() => undefined).then(() => {
        if (canvas && canvas.dataset.aura3dCanvas === "true") canvas.remove();
      });
    },
    ready() {
      return readyPromise;
    },
    diagnostics() {
      let drawCalls = 0;
      let renderPath: string | undefined;
      try {
        const d = app.diagnostics();
        drawCalls = d.drawCalls;
        renderPath = d.renderPath?.path;
      } catch {
        // diagnostics are best effort
      }
      let nodeCount = 0;
      try {
        nodeCount = app.nodes.ids().length;
      } catch {
        nodeCount = 0;
      }
      return {
        drawCalls,
        nodes: nodeCount,
        ...(renderPath !== undefined ? { renderPath } : {}),
        storyId: story?.id ?? null,
        world: worldId,
        modelNodes: modelNodeCount,
        standInNodes: standInNodeCount,
        modelStatus: preloader.summary(),
        recoveredFromMountFailure: recovered,
        warmed,
        warnings: [...warnings]
      };
    },
    targetRects() {
      if (disposed || !mounted) return [];
      const { width, height } = canvasCssSize();
      if (width <= 0 || height <= 0) return [];
      const pose = cameraPoseNow();
      const out: TargetRect[] = [];
      for (const n of pickableTargets()) {
        const rect = targetRectFor(candidateOf(n), pose, width, height);
        if (rect) out.push(rect);
      }
      return out;
    },
    game() {
      return created;
    },
    snapshot() {
      const round = (v: number): number => Math.round(v * 1000) / 1000;
      return {
        storyId: story?.id ?? null,
        world: worldId,
        camera: cameraPreset,
        reducedMotion,
        targets: [...activeTargets],
        talking: director.talking(),
        nodes: order.map((n) => {
          const anim = director.snapshot(n.id);
          return {
            id: n.id,
            visible: n.visible,
            // The point under the middle of its body, at the bottom of it (a toppled block reports the floor).
            position: [round(n.center[0]), round(floorOf(n)), round(n.center[2])] as const,
            drawnAs: n.drawnAs,
            gesture: anim?.gesture ?? null,
            moving: n.move !== null
          };
        })
      };
    },
    prefetch(next) {
      if (disposed) return;
      preloader.prefetch(storyModelKeys(next));
    }
  };

  return stage;
}
