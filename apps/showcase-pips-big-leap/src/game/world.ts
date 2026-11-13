// Pip's Big Leap — WorldSpec -> scene nodes + collision world.
//
// A world is lowered into (a) an `AuraSceneBuilder` that owns presentation and
// (b) a plain-data collision world the player controller simulates against.
// Both come from the same spec, so what you see is what you collide with.
//
// GU47 WP-16: the opt-in presentation (`?look=diorama`) is the felt-and-clay diorama (`diorama.ts`,
// per-world look table in `looks.ts`); `look: "original"` (`?look=original`) keeps the
// pre-GU47 scene exactly. The collision world is identical in both.

import {
  camera,
  effects,
  game,
  geometry,
  instances,
  looks,
  material,
  primitives,
  scene
} from "@aura3d/engine";
import { deriveWorldMotion, type WorldMotion } from "./motion.js";
import { legacySlabGeometry, type SlabTransform as SlabTransformSpec } from "./legacySlab.js";
import {
  GATE_RING_MATERIAL,
  SLAB_RADIUS,
  CONTACT_SHADOWS,
  SURFACES,
  ambientEmitterNode,
  auroraNode,
  dioramaBase,
  dioramaName,
  type BaseTile,
  floraLayers,
  floraNodes,
  hazardMaterial,
  hemisphereNode,
  heroCapeGeometry,
  heroCapeMaterial,
  instancedSurface,
  lensFlareNode,
  millpondNodes,
  miniatureDofNode,
  practicalNodes,
  skyNode,
  slabTransforms,
  ssrNode,
  sunShaftsNode,
  vignetteNode
} from "./diorama.js";
import {
  MINIATURE_LIFT,
  baseDepthFor,
  lookOverridesFor,
  presentationScale,
  worldLook,
  type PipLookMode,
  type PresentationScale,
  type WorldLook
} from "./looks.js";
import type {
  CheckpointSpec, DecorSpec, HazardBox, HazardSpec, PickupSpec,
  PlatformKind, PlatSpec, SolidBox, SpringSpec, WaterSpec, WorldId, WorldSpec
} from "./types.js";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";
import {
  buildBossThornSpikeNode,
  buildBounceSpringBaseNode,
  buildBounceSpringCapNode,
  buildBramblebackBossLimbNodes,
  buildBramblebackBossNode,
  buildCheckpointPennantNode,
  buildCheckpointStandNode,
  buildDioramaStaticDecorNodes,
  buildForestBeetleNode,
  buildGateLockStarNode,
  buildGoldenAcornNode,
  buildHazardFeatureNode,
  buildHeartBerryNode,
  buildHedgehogVillagerNode,
  buildPipHeroLimbNodes,
  buildPipHeroNode,
  buildSingleDecorPropNode,
  buildSunGateArchNode,
  buildSunGateRuneRingNode,
  buildSunseedNode,
  buildUpdraftFanNode,
  buildWoodlandBannerNode,
  type StaticDecorKind,
  type StaticDecorPlacement
} from "../art/proceduralModels.js";

type SceneBuilder = ReturnType<typeof scene>;
type SceneNodeArg = Parameters<SceneBuilder["add"]>[0];

/**
 * Procedural storybook island plinth dimensions per world (`surface` is the walkable top fraction).
 * Starfall Garden (w6), Basalt Cellar (w4), and Hollow Palace (w5) use terraced bluffs.
 */
export const BASE_TILES: Readonly<Partial<Record<WorldId, BaseTile>>> = {
  academy: { size: [1.898, 0.669, 1.618], surface: 0.45 },
  w1: { size: [1.722, 0.695, 1.903], surface: 0.39 },
  w2: { size: [1.89, 1.139, 1.902], surface: 0.3 },
  w3: { size: [1.884, 0.495, 1.897], surface: 0.58 }
};

/** The villager that stands in for each NPC runner in the diorama look: rounded 6-legged iridescent forest beetle + spiny hedgehog. */
export const VILLAGER_BY_WHO = {
  helper: { kind: "procedural-hedgehog", height: 1.25 },
  sidekick: { kind: "procedural-beetle", height: 0.52 }
} as const;

// ---------------------------------------------------------------- palettes

const KIND_STYLE: Record<PlatformKind, { readonly body: string; readonly top: string }> = {
  grass:     { body: "#6b4c35", top: "#3b7a3e" },
  earth:     { body: "#5c3f28", top: "#8c6342" },
  mushroom:  { body: "#d9ccb4", top: "#d14b38" },
  leaf:      { body: "#2f6333", top: "#4f9e52" },
  dock:      { body: "#6b4c35", top: "#9e7344" },
  wood:      { body: "#6b4c35", top: "#ad814c" },
  rope:      { body: "#7d6140", top: "#c49d62" },
  cloud:     { body: "#96adc8", top: "#dce9f7" },
  sky:       { body: "#5a82ab", top: "#9ec4e6" },
  stone:     { body: "#4a4541", top: "#736a61" },
  ember:     { body: "#3f271d", top: "#a8522c" },
  metal:     { body: "#343640", top: "#686e80" },
  marble:    { body: "#a89d8e", top: "#dfd4c0" },
  gold:      { body: "#7c5f26", top: "#dfb44b" },
  crystal:   { body: "#4f3f85", top: "#9787de" },
  starlight: { body: "#322c58", top: "#c7b6ff" }
};

const HAZARD_STYLE: Record<HazardSpec["type"], string> = {
  thorns: "#8a3c68",
  lava:   "#ff5a26",
  ember:  "#ff9435",
  frost:  "#6fd8ff"
};

// ---------------------------------------------------------------- names

export const nodeName = {
  platform: (id: string) => `plat:${id}`,
  platformTop: (id: string) => `plat-top:${id}`,
  seed: (id: string) => `seed:${id}`,
  acorn: (id: string) => `acorn:${id}`,
  heart: (id: string) => `heart:${id}`,
  spring: (id: string) => `spring:${id}`,
  checkpoint: (id: string) => `cp:${id}`,
  checkpointFlag: (id: string) => `cp-flag:${id}`,
  gate: "sun-gate",
  gateRing: "sun-gate-ring",
  gateLock: "sun-gate-lock",
  hero: "pip",
  heroCape: "pip:cape",
  boss: "brambleback",
  bossSpike: (i: number) => `bramble-spike:${i}`,
  npc: (id: string) => `npc:${id}`,
  water: (id: string) => `water:${id}`
} as const;

// ---------------------------------------------------------------- spec -> collision

export interface WaterZone {
  readonly spec: WaterSpec;
  readonly x: number; readonly z: number;
  readonly hx: number; readonly hz: number;
  readonly surfaceY: number;
  readonly floorY: number;
}

/**
 * Coarse cylinder used only by the follow camera to shorten its boom when a
 * trunk/boulder would sit between Pip and the lens. This is plain data built
 * once at world build time — never a per-frame raycast.
 */
export interface CameraObstacle {
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly radius: number;
  readonly height: number;
}

export interface BuiltWorld {
  readonly spec: WorldSpec;
  readonly motion: WorldMotion;
  readonly scene: SceneBuilder;
  readonly solids: readonly SolidBox[];
  readonly hazards: readonly HazardBox[];
  readonly waters: readonly WaterZone[];
  readonly seeds: readonly PickupSpec[];
  readonly acorns: readonly PickupSpec[];
  readonly hearts: readonly PickupSpec[];
  readonly springs: readonly SpringSpec[];
  readonly checkpoints: readonly CheckpointSpec[];
  readonly spinNodes: readonly string[];
  readonly movingSolids: readonly SolidBox[];
  readonly timedSolids: readonly SolidBox[];
  readonly cameraObstacles: readonly CameraObstacle[];
  readonly bossArenaZ: number | null;
  /** GU47 WP-16 presentation facts (never read by the sim). */
  readonly presentation: WorldPresentation;
}

const PLAT_H = 0.55;

function solidOf(p: PlatSpec): SolidBox {
  const h = p.h ?? PLAT_H;
  return {
    id: p.id,
    x: p.x,
    y: p.y - h / 2,
    z: p.z,
    hx: p.w / 2,
    hy: h / 2,
    hz: p.d / 2,
    plat: p,
    active: true,
    vx: 0, vy: 0, vz: 0
  };
}

// ---------------------------------------------------------------- decor

/**
 * Today's decor, one model node per prop (`?look=original`). The diorama look draws the
 * same props through `decorInstance` + `propInstanceNodes` (PBL-PF1), where the small
 * props (crates, barrels, banners, star cores) cast no shadow-map shadows.
 */
function decorNodes(d: DecorSpec, tinyShadows = true): readonly SceneNodeArg[] {
  const s = d.s ?? 1;
  const yaw = d.yaw ?? 0;

  switch (d.kind) {
    case "tree":
      return [buildSingleDecorPropNode(`${d.id}:tree`, "tree", [d.x, d.y, d.z], yaw, s, true)];
    case "conifer":
      return [buildSingleDecorPropNode(`${d.id}:conifer`, "conifer", [d.x, d.y, d.z], yaw, s, true)];
    case "hawk":
      return [buildSingleDecorPropNode(`${d.id}:hawk`, "hawk", [d.x, d.y, d.z], yaw, s, true)];
    case "mushroom":
      return [buildSingleDecorPropNode(`${d.id}:mushroom`, "mushroom", [d.x, d.y, d.z], yaw, s, true)];
    case "flower":
      return [buildSingleDecorPropNode(`${d.id}:flower`, "flower", [d.x, d.y, d.z], yaw, s, false)];
    case "rock":
      return [buildSingleDecorPropNode(`${d.id}:rock`, "rock", [d.x, d.y, d.z], yaw, s, true)];
    case "windmill":
      return [buildSingleDecorPropNode(`${d.id}:windmill`, "windmill", [d.x, d.y, d.z], yaw, s, true)];
    case "sail":
      return [buildSingleDecorPropNode(`${d.id}:sail`, "sail", [d.x, d.y, d.z], yaw, s, true)];
    case "cloud":
      return [buildSingleDecorPropNode(`${d.id}:cloud`, "cloud", [d.x, d.y, d.z], yaw, s, false)];
    case "fan":
      return [buildUpdraftFanNode(`${d.id}:fan`, [d.x, d.y, d.z], yaw, s)];
    case "vent":
      return [buildSingleDecorPropNode(`${d.id}:vent`, "vent", [d.x, d.y, d.z], yaw, s, true)];
    case "pillar":
      return [buildSingleDecorPropNode(`${d.id}:pillar`, "pillar", [d.x, d.y, d.z], yaw, s, true)];
    case "arch":
      return [buildSingleDecorPropNode(`${d.id}:arch`, "arch", [d.x, d.y, d.z], yaw, s, true)];
    case "crystal":
      return [buildSingleDecorPropNode(`${d.id}:crystal`, "crystal", [d.x, d.y, d.z], yaw, s, true)];
    case "star":
      return [buildSingleDecorPropNode(`${d.id}:star`, "star", [d.x, d.y, d.z], yaw, s, tinyShadows)];
    case "lantern":
      return [buildSingleDecorPropNode(`${d.id}:lantern`, "lantern", [d.x, d.y, d.z], yaw, s, true)];
    case "crate":
      return [buildSingleDecorPropNode(`${d.id}:crate`, "crate", [d.x, d.y, d.z], yaw, s, tinyShadows)];
    case "barrel":
      return [buildSingleDecorPropNode(`${d.id}:barrel`, "barrel", [d.x, d.y, d.z], yaw, s, tinyShadows)];
    case "banner":
      return [buildWoodlandBannerNode(`${d.id}:banner`, [d.x, d.y, d.z], yaw, s)];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- world build

/**
 * Only trunks, boulders, and course-side architecture tall enough to intersect
 * the raised boom become camera obstacles. Radii are slightly wider than the
 * visible trunk so the lens never clips into the canopy skirt.
 */
function cameraObstacleFor(d: DecorSpec): CameraObstacle | null {
  const s = d.s ?? 1;
  switch (d.kind) {
    case "tree":
    case "conifer":
      return { x: d.x, z: d.z, baseY: d.y, radius: 1.25 * s, height: 3.4 * s };
    case "rock":
      return { x: d.x, z: d.z, baseY: d.y, radius: 0.7 * s, height: 1.05 * s };
    case "windmill":
      return { x: d.x, z: d.z, baseY: d.y, radius: 1.2 * s, height: 3.6 * s };
    case "sail":
      return { x: d.x, z: d.z, baseY: d.y, radius: 1.0 * s, height: 2.6 * s };
    case "pillar":
      return { x: d.x, z: d.z, baseY: d.y, radius: 0.75 * s, height: 3.4 * s };
    case "arch":
      return { x: d.x, z: d.z, baseY: d.y, radius: 1.35 * s, height: 3.4 * s };
    case "crystal":
      return { x: d.x, z: d.z, baseY: d.y, radius: 0.7 * s, height: 1.9 * s };
    default:
      return null;
  }
}

export interface BuildWorldOptions {
  /**
   * QA only (`?pbl-ao=0`): drop the look's ambient-occlusion node so a capture
   * can pair AO on and off at the same frame (LIGHT-06). Default true.
   */
  readonly ambientOcclusion?: boolean;
  /** GU47 WP-16: the felt-and-clay diorama (`?look=diorama`) or today's scene (default since the blind-panel pass). */
  readonly look?: PipLookMode;
  /** PRD 6.3: halve the ambient emission and cap flora sway at 30%. */
  readonly reducedMotion?: boolean;
}

/** Presentation facts the runtime and the evidence read (diorama look only). */
export interface WorldPresentation {
  readonly mode: PipLookMode;
  readonly look: WorldLook;
  /** Top of the diorama base (PBL-E1), null in the original look. */
  readonly baseTop: number | null;
  /** Practical light node names (PBL-L2 flicker), with their authored intensity and flicker depth. */
  readonly practicals: readonly { readonly name: string; readonly intensity: number; readonly flicker: number }[];
  /** Instanced flora tufts (PBL-W1). */
  readonly floraCount: number;
  /** Static platforms drawn through instanced slabs (PBL-PF1). */
  readonly instancedPlatforms: number;
  /** PBL-AN1: decor the presentation sways (banners) or spins (updraft fans), one runtime node each. */
  readonly animatedDecor: readonly AnimatedDecor[];
  /** PBL-AN1: instanced leaf-pad draws that bob a few centimetres (visual only; colliders stay). */
  readonly bobNodes: readonly string[];
}

/** PBL-AN1: one decor prop the presentation moves (visual only). */
export interface AnimatedDecor {
  readonly name: string;
  readonly kind: "banner" | "fan";
  readonly yaw: number;
  /** Seeded from the decor id so neighbours do not move in lockstep. */
  readonly phase: number;
}

/** Decor kinds the diorama animates instead of instancing (PBL-AN1). */
export const ANIMATED_DECOR_KINDS: ReadonlySet<DecorSpec["kind"]> = new Set(["banner", "fan"]);

/** Platform kinds whose static instanced draws bob (PBL-AN1 "bobbing leaf pads"). */
export const BOBBING_PLATFORM_KINDS: ReadonlySet<PlatformKind> = new Set(["leaf"]);

function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 6283) / 1000;
}

/**
 * PBL-AN1: a banner or updraft fan as its own runtime model node, at today's asset, place,
 * yaw and fitted size, so the presentation can sway or spin it. Banners stay out of the
 * shadow map like the other tiny props.
 */
function animatedDecorNode(d: DecorSpec): SceneNodeArg {
  const s = d.s ?? 1;
  const name = `${d.id}:${d.kind}`;
  const rt = game.runtimeNode(name, { tags: ["decor"] });
  if (d.kind === "banner") {
    return buildWoodlandBannerNode(name, [d.x, d.y, d.z], d.yaw ?? 0, s, rt);
  }
  return buildUpdraftFanNode(name, [d.x, d.y, d.z], d.yaw ?? 0, s, rt);
}

/** Today's atmosphere (`?look=original`), unchanged. */
function addOriginalAtmosphere(builder: SceneBuilder, spec: WorldSpec, options: BuildWorldOptions): void {
  const skyColor = spec.background ?? "#1e4d78";
  // Look preset — fog itself is authored below so its color tracks the sky
  // exactly instead of the preset's generic haze tint. No `background` override: since
  // GU47 E-A (9001eb1f8) a colour background hides the look's HDRI, and that HDRI is the
  // light sky 4.6.2 drew behind every world (the override turned it into a flat navy wall).
  const look = looks.preset(spec.look as Parameters<typeof looks.preset>[0], { fogDensityScale: 0 });
  if (options.ambientOcclusion === false) {
    const group = look.toJSON();
    builder.add({ ...group, children: group.children.filter((child) => (child as { readonly name?: string }).name !== "look ambient occlusion") });
  } else {
    builder.add(look);
  }
  // Subtle distant atmospheric depth (`near >= 130, maxOpacity <= 0.10`) so the sunlit meadow & course pop crisply.
  builder.add(effects.fog({ mode: "linear", color: skyColor, near: 130, far: 420, maxOpacity: 0.10 }));
  // Grounding for Pip, pickups, and the course props: since 4.5.0 a
  // screen-space mask that darkens the shadow-casting look key light.
  builder.add(effects.contactShadows({ intensity: 0.75, length: 0.3 }));
  if (spec.ambientFx === "embers" || spec.ambientFx === "stars") {
    builder.add(effects.bloom({ intensity: 0.28 }));
  }
  if (spec.ambientFx === "snow") builder.add(effects.snow({}));
}

/**
 * The diorama atmosphere: sun shafts first (so the look's height fog stays the active fog
 * node), the per-world look (E-A overrides: HDRI, PCSS key, rim, base height fog, grade,
 * post preset), hemisphere, practicals, lens flare, sky, contact shadows, the diorama base,
 * vignette, the miniature DOF and the ambient emitter. The authored extra bloom is gone
 * (PBL-P1): the look's bloom is the only one.
 */
function addDioramaAtmosphere(builder: SceneBuilder, spec: WorldSpec, look: WorldLook, depth: number, options: BuildWorldOptions, scale: PresentationScale): number {
  const shafts = sunShaftsNode(look);
  if (shafts) builder.add(shafts);
  const base = dioramaBase(spec, look, depth, BASE_TILES[spec.id]);
  const preset = looks.preset(look.baseLook, lookOverridesFor(look, base.top));
  if (options.ambientOcclusion === false) {
    const group = preset.toJSON();
    builder.add({ ...group, children: group.children.filter((child) => (child as { readonly name?: string }).name !== "look ambient occlusion") });
  } else {
    builder.add(preset);
  }
  builder.add(hemisphereNode(look));
  for (const node of practicalNodes(look)) builder.add(node);
  const flare = lensFlareNode(look);
  if (flare) builder.add(flare);
  const sky = skyNode(look);
  if (sky) builder.add(sky);
  const aurora = auroraNode(spec, look, scale);
  if (aurora) builder.add(aurora);
  const ssr = ssrNode(look);
  if (ssr) builder.add(ssr);
  for (const n of millpondNodes(spec, look, scale.motion)) builder.add(n);
  builder.add(effects.contactShadows(CONTACT_SHADOWS));
  for (const node of base.nodes) builder.add(node);
  builder.add(vignetteNode(look));
  if (look.lens !== "none") builder.add(miniatureDofNode());
  builder.add(ambientEmitterNode(look, scale, nodeName.hero, 4700 + spec.order));
  for (let slot = 0; slot < 3; slot += 1) {
    const dustBase = effects
      .flipbook({
        name: dioramaName.flipbookDust(slot),
        sprite: "smoke-a",
        spriteColumns: 4,
        spriteRows: 4,
        size: 0.72,
        opacity: 0.85,
        color: look.dust,
        blend: "alpha"
      })
      .position(0, -120, 0)
      .runtime(game.runtimeNode(dioramaName.flipbookDust(slot), { tags: ["vfx"] }));
    builder.add(
      new (dustBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof dustBase)({
        ...dustBase.toJSON(),
        visible: false
      })
    );
    const sparksBase = effects
      .flipbook({
        name: dioramaName.flipbookSparks(slot),
        sprite: "flare",
        spriteColumns: 4,
        spriteRows: 4,
        size: 0.68,
        opacity: 0.92,
        color: "#ffd96a",
        blend: "additive"
      })
      .position(0, -120, 0)
      .runtime(game.runtimeNode(dioramaName.flipbookSparks(slot), { tags: ["vfx"] }));
    builder.add(
      new (sparksBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof sparksBase)({
        ...sparksBase.toJSON(),
        visible: false
      })
    );
  }
  return base.top;
}

/**
 * PBL-M1 + PBL-PF1: static platforms of one kind share two instanced rounded-slab draws
 * (clay body, felt top); movers and timed platforms keep their own runtime nodes so
 * `tickPlatforms` can move and hide them exactly as before.
 */
/**
 * Lane 521: the worlds whose 4.7.18 look depended on the 4.7.18 slab normals (see legacySlab.ts):
 * Whispering Forest (shaded lawn edges and nap bands) and Starfall Garden (the dark mirrored rim on
 * the crystal slabs). Their static slabs draw as one world-space mesh per kind with those normals;
 * every other world keeps the instanced slabs and today's look.
 */
export const LEGACY_SLAB_NORMAL_WORLDS: ReadonlySet<WorldId> = new Set<WorldId>(["w1", "w6"]);

function addDioramaPlatforms(builder: SceneBuilder, spec: WorldSpec, bobNodes: string[]): number {
  const groups = new Map<PlatformKind, { body: ReturnType<typeof slabTransforms>["body"][]; top: ReturnType<typeof slabTransforms>["top"][] }>();
  let instanced = 0;
  for (const p of spec.platforms) {
    const kind = p.kind ?? "grass";
    const surface = SURFACES[kind];
    const slab = slabTransforms(p, PLAT_H);
    if (p.mover || p.timed) {
      const h = p.h ?? PLAT_H;
      builder.add(
        primitives.roundedBox({ name: nodeName.platform(p.id), size: [p.w, h, p.d], position: [p.x, p.y - h / 2, p.z], params: { radius: SLAB_RADIUS }, material: surface.body, castShadow: true, receiveShadow: true })
          .runtime(game.runtimeNode(nodeName.platform(p.id), { tags: ["platform"] }))
      );
      builder.add(
        primitives.roundedBox({ name: nodeName.platformTop(p.id), size: [p.w * 0.98, 0.12, p.d * 0.98], position: [p.x, p.y - 0.05, p.z], params: { radius: 0.05 }, material: surface.top, receiveShadow: true })
          .runtime(game.runtimeNode(nodeName.platformTop(p.id), { tags: ["platform"] }))
      );
      continue;
    }
    let group = groups.get(kind);
    if (!group) groups.set(kind, (group = { body: [], top: [] }));
    group.body.push(slab.body);
    group.top.push(slab.top);
    instanced += 1;
  }
  for (const [kind, group] of groups) {
    const surface = SURFACES[kind];
    const legacy = LEGACY_SLAB_NORMAL_WORLDS.has(spec.id);
    const body = legacy
      ? geometry.custom(geometry.define(legacySlabGeometry(group.body as readonly SlabTransformSpec[], SLAB_RADIUS)), { name: `plats:${kind}`, material: surface.body, castShadow: true, receiveShadow: true })
      : instances.roundedBox({ name: `plats:${kind}`, transforms: group.body, params: { radius: SLAB_RADIUS }, material: instancedSurface(surface.body), castShadow: true, receiveShadow: true });
    const top = legacy
      ? geometry.custom(geometry.define(legacySlabGeometry(group.top as readonly SlabTransformSpec[], 0.3)), { name: `plat-tops:${kind}`, material: surface.top, castShadow: false, receiveShadow: true })
      : instances.roundedBox({ name: `plat-tops:${kind}`, transforms: group.top, params: { radius: 0.3 }, material: instancedSurface(surface.top), castShadow: false, receiveShadow: true });
    if (BOBBING_PLATFORM_KINDS.has(kind)) {
      // PBL-AN1: the leaf pads bob as one draw each; the instance transforms are world
      // space, so the node's own position is the bob offset.
      builder.add(body.runtime(game.runtimeNode(`plats:${kind}`, { tags: ["decor"] })));
      builder.add(top.runtime(game.runtimeNode(`plat-tops:${kind}`, { tags: ["decor"] })));
      bobNodes.push(`plats:${kind}`, `plat-tops:${kind}`);
    } else {
      builder.add(body);
      builder.add(top);
    }
  }
  return instanced;
}

export function buildWorld(spec: WorldSpec, options: BuildWorldOptions = {}): BuiltWorld {
  const motion = deriveWorldMotion(spec);
  const mode: PipLookMode = options.look ?? "diorama";
  const diorama = mode === "diorama";
  const look = worldLook(spec.id);
  const scale = presentationScale(options.reducedMotion === true);
  const builder = scene().background(diorama && !look.hdriSky ? look.background : (spec.background ?? "#1e4d78"));
  const baseTop = diorama ? addDioramaAtmosphere(builder, spec, look, baseDepthFor(spec), options, scale) : null;
  if (!diorama) addOriginalAtmosphere(builder, spec, options);

  // NOTE: the Kenney "world" backdrop GLBs ship with kit-space bounds that
  // scale into enormous near-field slabs (the floating moss patch in the
  // previous build). The fog + tree line now own the horizon, so those
  // backdrops are intentionally not mounted.

  // Platforms (presentation per look; the collision list is the same spec walk for both).
  const solids: SolidBox[] = [];
  const moving: SolidBox[] = [];
  const timed: SolidBox[] = [];
  const bobNodes: string[] = [];
  const animatedDecor: AnimatedDecor[] = [];
  const instancedPlatforms = diorama ? addDioramaPlatforms(builder, spec, bobNodes) : 0;
  for (const p of spec.platforms) {
    if (!diorama) {
      const style = KIND_STYLE[p.kind ?? "grass"];
      const h = p.h ?? PLAT_H;
      const plat = primitives.box({
        name: nodeName.platform(p.id),
        size: [p.w, h, p.d],
        position: [p.x, p.y - h / 2, p.z],
        material: material.pbr({ color: style.body, roughness: 0.75 }),
        castShadow: true,
        receiveShadow: true
      });
      const top = primitives.box({
        name: nodeName.platformTop(p.id),
        size: [p.w * 0.98, 0.12, p.d * 0.98],
        position: [p.x, p.y - 0.05, p.z],
        material: material.pbr({ color: style.top, roughness: 0.75 }),
        receiveShadow: true
      });
      if (p.mover || p.timed) {
        const spec2 = game.runtimeNode(nodeName.platform(p.id), { tags: ["platform"] });
        plat.runtime(spec2);
        top.runtime(game.runtimeNode(nodeName.platformTop(p.id), { tags: ["platform"] }));
      }
      builder.add(plat).add(top);
    }
    if (!p.ghost) {
      const s = solidOf(p);
      solids.push(s);
      if (p.mover) moving.push(s);
      if (p.timed) timed.push(s);
    }
  }

  // WP-06 (diorama): procedural multi-material woodland assemblies replace all 26 static Meshy
  // & borrowed sci-fi/FPS props; `?look=original` keeps its original model nodes unchanged.
  const staticDecorPlacements: StaticDecorPlacement[] = [];

  // Hazards — hurt volumes + sculpted thorny bramble / frost crystal / basalt ember vents.
  const hazards: HazardBox[] = spec.hazards.map((hz) => {
    const h = hz.h ?? 0.5;
    builder.add(
      primitives.box({
        name: `hazard:${hz.id}`,
        size: [hz.w, Math.min(h, 0.24), hz.d],
        position: [hz.x, hz.y - Math.min(h, 0.24) / 2, hz.z],
        material: diorama
          ? hazardMaterial(hz.type, scale.motion)
          : material.emissive({ color: HAZARD_STYLE[hz.type], emissive: HAZARD_STYLE[hz.type], emissiveIntensity: 0.85, roughness: 0.5 })
      })
    );
    builder.add(buildHazardFeatureNode(`hazard:${hz.id}:mesh`, [hz.x, hz.y - Math.min(h, 0.24), hz.z], hz.w, hz.d, hz.type));
    return { spec: hz, x: hz.x, y: hz.y - h / 2, z: hz.z, hx: hz.w / 2, hy: h / 2, hz: hz.d / 2 };
  });

  // Water pockets — glass volumes the swimmer sinks into.
  const waters: WaterZone[] = spec.waters.map((w) => {
    const depth = w.depth ?? 2.2;
    builder.add(
      primitives.box({
        name: nodeName.water(w.id),
        size: [w.w, depth, w.d],
        position: [w.x, w.y - depth / 2, w.z],
        material: material.glass({ color: "#5fbfe8", opacity: 0.38 }),
        castShadow: false,
        receiveShadow: false
      }).runtime(game.runtimeNode(nodeName.water(w.id), { tags: ["water"] }))
    );
    return { spec: w, x: w.x, z: w.z, hx: w.w / 2, hz: w.d / 2, surfaceY: w.y, floorY: w.y - depth };
  });

  // Pickups — ribbed golden sunseeds, oak-cupule golden acorns, and glossy crimson heart-berries.
  const spinNodes: string[] = [];
  for (const s of spec.seeds) {
    const rt = game.runtimeNode(nodeName.seed(s.id), { tags: ["pickup", "seed"] });
    builder.add(buildSunseedNode(nodeName.seed(s.id), [s.x, s.y + 0.16, s.z], rt));
    spinNodes.push(nodeName.seed(s.id));
  }
  for (const a of spec.acorns) {
    const rt = game.runtimeNode(nodeName.acorn(a.id), { tags: ["pickup", "acorn"] });
    builder.add(buildGoldenAcornNode(nodeName.acorn(a.id), [a.x, a.y + 0.12, a.z], rt));
    spinNodes.push(nodeName.acorn(a.id));
  }
  for (const hpt of spec.hearts) {
    const rt = game.runtimeNode(nodeName.heart(hpt.id), { tags: ["pickup", "heart"] });
    builder.add(buildHeartBerryNode(nodeName.heart(hpt.id), [hpt.x, hpt.y + 0.1, hpt.z], rt));
    spinNodes.push(nodeName.heart(hpt.id));
  }

  // Springs — coiled copper-and-toadstool procedural bounce springs in both diorama and original looks (zero GLBs).
  for (const spr of spec.springs) {
    const base = [spr.x, spr.y, spr.z] as const;
    const rt = game.runtimeNode(nodeName.spring(spr.id), { tags: ["spring"] });
    builder.add(buildBounceSpringBaseNode(`${nodeName.spring(spr.id)}:base`, base));
    builder.add(buildBounceSpringCapNode(nodeName.spring(spr.id), base, rt));
  }

  // Checkpoints — carved timber post + stone pad + fluttering swallowtail pennant (zero GLBs).
  for (const cp of spec.checkpoints) {
    const rt = game.runtimeNode(nodeName.checkpointFlag(cp.id), { tags: ["checkpoint"] });
    builder.add(buildCheckpointStandNode(`${nodeName.checkpoint(cp.id)}:pad`, [cp.x, cp.y, cp.z], cp.yaw ?? 0));
    builder.add(buildCheckpointPennantNode(nodeName.checkpointFlag(cp.id), [cp.x, cp.y, cp.z], cp.yaw ?? 0, rt, !diorama));
  }

  // Sun-Gate — rune-carved arch + sculpted solar rune ring + bevelled star lock.
  const g = spec.gate;
  const gateRt = game.runtimeNode(nodeName.gate, { tags: ["gate"] });
  const ringRt = game.runtimeNode(nodeName.gateRing, { tags: ["gate"] });
  const lockRt = game.runtimeNode(nodeName.gateLock, { tags: ["gate"] });
  builder.add(buildSunGateArchNode(nodeName.gate, [g.x, g.y, g.z], 0, gateRt));
  if (diorama) {
    builder.add(buildSunGateRuneRingNode(nodeName.gateRing, [g.x, g.y + 1.5, g.z], GATE_RING_MATERIAL, ringRt));
  } else {
    builder.add(
      primitives.torus({ name: nodeName.gateRing, size: [1.9, 1.9, 0.4], position: [g.x, g.y + 1.5, g.z], material: material.emissive({ color: "#ffcf3d", emissive: "#ffc52e", emissiveIntensity: 0.9 }), castShadow: false })
        .runtime(ringRt)
    );
  }
  builder.add(buildGateLockStarNode(nodeName.gateLock, [g.x, g.y + 1.5, g.z], lockRt));

  // Decor + NPCs.
  const cameraObstacles: CameraObstacle[] = [];
  for (const d of spec.decor) {
    const obstacle = cameraObstacleFor(d);
    if (obstacle) cameraObstacles.push(obstacle);
    if (diorama && ANIMATED_DECOR_KINDS.has(d.kind)) {
      builder.add(animatedDecorNode(d));
      animatedDecor.push({ name: `${d.id}:${d.kind}`, kind: d.kind as AnimatedDecor["kind"], yaw: d.yaw ?? 0, phase: phaseOf(d.id) });
    } else if (diorama) {
      staticDecorPlacements.push({ kind: d.kind as StaticDecorKind, x: d.x, y: d.y, z: d.z, yaw: d.yaw, s: d.s });
    } else {
      for (const node of decorNodes(d)) builder.add(node);
    }
  }
  if (diorama) {
    for (const node of buildDioramaStaticDecorNodes(staticDecorPlacements)) builder.add(node);
  }
  for (const n of spec.npcs) {
    cameraObstacles.push({ x: n.x, z: n.z, baseY: n.y, radius: 0.45, height: 1.35 });
    const npcName = diorama ? `pbl-villager:${n.id}` : nodeName.npc(n.id);
    if (n.who === "sidekick") {
      builder.add(buildForestBeetleNode(npcName, [n.x, n.y, n.z], -0.45));
    } else {
      builder.add(buildHedgehogVillagerNode(npcName, [n.x, n.y, n.z], -0.45));
    }
  }

  // Hero — articulated @aura3d/engine procedural Pip rig (zero GLBs); camera rigs onto it.
  const heroSpawnYaw = spec.spawnYaw ?? Math.PI;
  builder.add(
    buildPipHeroNode(
      nodeName.hero,
      [spec.spawn[0], spec.spawn[1], spec.spawn[2]],
      heroSpawnYaw,
      game.runtimeNode(nodeName.hero, { tags: ["player"] })
    )
  );
  for (const limb of buildPipHeroLimbNodes(nodeName.hero, [spec.spawn[0], spec.spawn[1], spec.spawn[2]], heroSpawnYaw)) {
    builder.add(limb);
  }
  // Player Studio cape: hidden by default (`visible: false`); if enabled in Studio, drapes cleanly behind Pip's back (-Z).
  const capeBase = (
    diorama
      ? geometry
          .custom(geometry.define(heroCapeGeometry()), {
            name: nodeName.heroCape,
            material: heroCapeMaterial("#3f8cff", scale.motion),
            castShadow: false,
            receiveShadow: false
          })
          .position(spec.spawn[0], spec.spawn[1] + 0.71, spec.spawn[2] + 0.12)
          .rotate(0, spec.spawnYaw ?? Math.PI, 0)
      : primitives.box({
          name: nodeName.heroCape,
          size: [0.3, 0.03, 0.32],
          position: [spec.spawn[0], spec.spawn[1] + 0.52, spec.spawn[2] + 0.2],
          rotation: [0, spec.spawnYaw ?? Math.PI, 0],
          material: material.pbr({ color: "#3f8cff", roughness: 0.6 }),
          castShadow: false
        })
  ).runtime(game.runtimeNode(nodeName.heroCape, { tags: ["player", "studio"] }));
  const capeHidden = new (capeBase.constructor as new (n: AuraSceneNode & { readonly visible?: boolean }) => typeof capeBase)({
    ...capeBase.toJSON(),
    visible: false
  });
  builder.add(capeHidden);

  // Boss (W5) — articulated @aura3d/engine procedural Brambleback rig + 6 orbiting thorny crystal spikes.
  if (spec.boss) {
    builder.add(
      buildBramblebackBossNode(
        nodeName.boss,
        [0, 2.6, -69],
        game.runtimeNode(nodeName.boss, { tags: ["boss"] })
      )
    );
    for (const limb of buildBramblebackBossLimbNodes(nodeName.boss, [0, 2.6, -69])) {
      builder.add(limb);
    }
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const spikeRt = game.runtimeNode(nodeName.bossSpike(i), { tags: ["boss"] });
      builder.add(buildBossThornSpikeNode(nodeName.bossSpike(i), [Math.cos(a) * 1.05, 4.4, -69 + Math.sin(a) * 1.05], spikeRt));
    }
  }

  // PBL-W1: seeded felt-and-clay flora tufts on the static platform rims (diorama only).
  let floraCount = 0;
  if (diorama) {
    const layers = floraLayers(spec, look, 9100 + spec.order * 31);
    for (const node of floraNodes(layers, scale.motion)) builder.add(node);
    floraCount = layers.reduce((sum, layer) => sum + layer.transforms.length, 0);
  }

  builder.camera(
    camera.perspective({
      ...labCameraOptions(readLabFlags(), "reversed"),
      ...(diorama
        ? {
            // PBL-C2 miniature framing (lens 1.7 m above Pip's feet, fov 46).
            position: [spec.spawn[0], spec.spawn[1] + MINIATURE_LIFT, spec.spawn[2] + 4.5] as [number, number, number],
            target: [spec.spawn[0], spec.spawn[1] + 0.55, spec.spawn[2] - 3.2] as [number, number, number],
            fov: 46
          }
        : {
            position: [spec.spawn[0], spec.spawn[1] + 1.95, spec.spawn[2] + 4.2] as [number, number, number],
            target: [spec.spawn[0], spec.spawn[1] + 0.95, spec.spawn[2] - 2.4] as [number, number, number],
            fov: 52
          })
    })
  );

  return {
    spec, motion, scene: builder, solids, hazards, waters,
    seeds: spec.seeds, acorns: spec.acorns, hearts: spec.hearts,
    springs: spec.springs, checkpoints: spec.checkpoints,
    spinNodes, movingSolids: moving, timedSolids: timed,
    cameraObstacles,
    bossArenaZ: spec.boss ? -69 : null,
    presentation: {
      mode,
      look,
      baseTop,
      practicals: diorama ? look.practicals.map((p) => ({ name: p.name, intensity: p.intensity, flicker: p.flicker })) : [],
      floraCount,
      instancedPlatforms,
      animatedDecor,
      bobNodes
    }
  };
}

/** Advance moving/timed platform solids + mirror into runtime node handles. */
export function tickPlatforms(
  built: BuiltWorld,
  t: number,
  node: (name: string) => { setPosition(x: number, y: number, z: number): unknown; setVisible(v: boolean): unknown } | null
): void {
  for (const s of built.movingSolids) {
    const m = s.plat.mover;
    if (!m) continue;
    const h = s.plat.h ?? PLAT_H;
    const phase = (t / m.period) * Math.PI * 2 + (m.phase ?? 0);
    const off = Math.sin(phase) * m.amplitude;
    const vel = Math.cos(phase) * m.amplitude * (Math.PI * 2 / m.period);
    s.vx = 0; s.vy = 0; s.vz = 0;
    s.x = s.plat.x; s.z = s.plat.z; s.y = s.plat.y - h / 2;
    if (m.axis === "x") { s.x += off; s.vx = vel; }
    else if (m.axis === "z") { s.z += off; s.vz = vel; }
    else { s.y += off; s.vy = vel; }
    node(nodeName.platform(s.id))?.setPosition(s.x, s.y, s.z);
    node(nodeName.platformTop(s.id))?.setPosition(s.x, s.y + h / 2 - 0.05, s.z);
  }
  for (const s of built.timedSolids) {
    const tm = s.plat.timed;
    if (!tm) continue;
    const f = ((((t + (tm.phase ?? 0)) % tm.period) + tm.period) % tm.period) / tm.period;
    s.active = f < tm.onFrac;
    node(nodeName.platform(s.id))?.setVisible(s.active);
    node(nodeName.platformTop(s.id))?.setVisible(s.active);
  }
}
