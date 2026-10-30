// Pip's Big Leap — WorldSpec -> scene nodes + collision world.
//
// A world is lowered into (a) an `AuraSceneBuilder` that owns presentation and
// (b) a plain-data collision world the player controller simulates against.
// Both come from the same spec, so what you see is what you collide with.
//
// GU47 WP-16: the default presentation is the felt-and-clay diorama (`diorama.ts`,
// per-world look table in `looks.ts`); `look: "original"` (`?look=original`) keeps the
// pre-GU47 scene exactly. The collision world is identical in both.

import {
  camera,
  effects,
  game,
  instances,
  looks,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets, BOSS_CLIPS, PIP_CLIPS } from "../aura-assets.js";
import { deriveWorldMotion, type WorldMotion } from "./motion.js";
import {
  GATE_RING_MATERIAL,
  SLAB_RADIUS,
  SURFACES,
  ambientEmitterNode,
  dioramaBase,
  floraLayers,
  floraNodes,
  hazardMaterial,
  hemisphereNode,
  lensFlareNode,
  miniatureDofNode,
  practicalNodes,
  skyNode,
  slabTransforms,
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
  PlatformKind, PlatSpec, SolidBox, SpringSpec, WaterSpec, WorldSpec
} from "./types.js";

type SceneBuilder = ReturnType<typeof scene>;
type SceneNodeArg = Parameters<SceneBuilder["add"]>[0];

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
 * `tinyShadows: false` (diorama look, PBL-PF1) stops the small props (crates, barrels,
 * banners, star cores) from casting shadow-map shadows; contact shadows still ground them.
 */
function decorNodes(d: DecorSpec, tinyShadows = true): readonly SceneNodeArg[] {
  const s = d.s ?? 1;
  const yaw = d.yaw ?? 0;

  switch (d.kind) {
    case "tree":
      // One coherent low-poly tree family: the old photoreal `pineTree` GLB
      // read as a different art style (and its wide fir canopy filled the
      // third-person lens). "tree" keeps its id/height but shares the flat
      // conifer silhouette used by every other trunk in the course.
      return [
        model(assets.props.conifer, { name: `${d.id}:tree`, castShadow: true, receiveShadow: true, targetHeight: 3.2 * s, scaleMode: "fit" })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "conifer":
      return [
        model(assets.props.conifer, { name: `${d.id}:conifer`, castShadow: true, receiveShadow: true, targetHeight: 3.4 * s, scaleMode: "fit" })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "hawk":
      return [
        model(assets.hawk, { name: `${d.id}:hawk`, castShadow: true, receiveShadow: true, targetMaxDimension: 1.5 * s, scaleMode: "fit" })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "mushroom":
      return [
        model(assets.props.crystalShard, { name: `${d.id}:mushroom`, castShadow: true, receiveShadow: true, targetHeight: 1.05 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "flower":
      return [
        model(assets.sunseed, { name: `${d.id}:flower`, castShadow: false, targetHeight: 0.72 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "rock":
      return [
        model(assets.props.boulder, { name: `${d.id}:rock`, castShadow: true, receiveShadow: true, targetMaxDimension: 1.15 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "windmill":
      return [
        model(assets.props.windmill, { name: `${d.id}:windmill`, castShadow: true, receiveShadow: true, targetHeight: 3.6 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "sail":
      return [
        model(assets.props.watchtower, { name: `${d.id}:sail`, castShadow: true, receiveShadow: true, targetHeight: 2.6 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "cloud":
      return [
        model(assets.props.rockB, { name: `${d.id}:cloud`, castShadow: false, receiveShadow: false, targetMaxDimension: 1.9 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "fan":
      return [
        model(assets.props.turbine, { name: `${d.id}:fan`, castShadow: true, receiveShadow: true, targetHeight: 2.2 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "vent":
      return [
        model(assets.props.brazier, { name: `${d.id}:vent`, castShadow: true, receiveShadow: true, targetHeight: 1.35 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "pillar":
      return [
        model(assets.props.pylon, { name: `${d.id}:pillar`, castShadow: true, receiveShadow: true, targetHeight: 3.4 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "arch": {
      const archRef = d.id.includes("vista") ? assets.sungate : assets.props.arch;
      return [
        model(archRef, { name: `${d.id}:arch`, castShadow: true, receiveShadow: true, targetHeight: 3.4 * s, scaleMode: "fit" })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    }
    case "crystal":
      return [
        model(assets.props.crystalShard, { name: `${d.id}:crystal`, castShadow: true, receiveShadow: true, targetHeight: 1.9 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "star":
      return [
        model(assets.props.energyCore, { name: `${d.id}:star`, castShadow: tinyShadows, targetMaxDimension: 0.9 * s })
          .position(d.x, d.y + 0.55 * s, d.z)
          .rotate(0, yaw, 0)
      ];
    case "lantern":
      return [
        model(assets.props.streetLamp, { name: `${d.id}:lantern`, castShadow: true, receiveShadow: true, targetHeight: 2.3 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "crate":
      return [
        model(assets.props.crate, { name: `${d.id}:crate`, castShadow: tinyShadows, receiveShadow: true, targetMaxDimension: 0.95 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "barrel":
      return [
        model(assets.props.barrel, { name: `${d.id}:barrel`, castShadow: tinyShadows, receiveShadow: true, targetHeight: 0.98 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
    case "banner":
      return [
        model(assets.checkpointFlag, { name: `${d.id}:banner`, castShadow: tinyShadows, receiveShadow: true, targetHeight: 2.2 * s })
          .position(d.x, d.y, d.z)
          .rotate(0, yaw, 0)
      ];
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
  /** GU47 WP-16: the felt-and-clay diorama (default) or today's scene (`?look=original`). */
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
}

/** Today's atmosphere (`?look=original`), unchanged. */
function addOriginalAtmosphere(builder: SceneBuilder, spec: WorldSpec, options: BuildWorldOptions): void {
  const skyColor = spec.background ?? "#1e4d78";
  // Look preset — fog itself is authored below so its color tracks the sky
  // exactly instead of the preset's generic haze tint.
  const look = looks.preset(spec.look as Parameters<typeof looks.preset>[0], {
    fogDensityScale: 0,
    background: skyColor
  });
  if (options.ambientOcclusion === false) {
    const group = look.toJSON();
    builder.add({ ...group, children: group.children.filter((child) => (child as { readonly name?: string }).name !== "look ambient occlusion") });
  } else {
    builder.add(look);
  }
  // Light depth haze: dissolves the course edge into the sky and gives the
  // conifer line aerial perspective without graying the foreground.
  builder.add(effects.fog({ color: skyColor, density: 0.0075 }));
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
  const base = dioramaBase(spec, look, depth);
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
  builder.add(effects.contactShadows({ intensity: 0.75, length: 0.3 }));
  for (const node of base.nodes) builder.add(node);
  builder.add(vignetteNode(look));
  builder.add(miniatureDofNode());
  builder.add(ambientEmitterNode(look, scale, nodeName.hero, 4700 + spec.order));
  return base.top;
}

/**
 * PBL-M1 + PBL-PF1: static platforms of one kind share two instanced rounded-slab draws
 * (clay body, felt top); movers and timed platforms keep their own runtime nodes so
 * `tickPlatforms` can move and hide them exactly as before.
 */
function addDioramaPlatforms(builder: SceneBuilder, spec: WorldSpec): number {
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
    builder.add(instances.roundedBox({ name: `plats:${kind}`, transforms: group.body, params: { radius: SLAB_RADIUS }, material: surface.body, castShadow: true, receiveShadow: true }));
    builder.add(instances.roundedBox({ name: `plat-tops:${kind}`, transforms: group.top, params: { radius: 0.3 }, material: surface.top, castShadow: false, receiveShadow: true }));
  }
  return instanced;
}

export function buildWorld(spec: WorldSpec, options: BuildWorldOptions = {}): BuiltWorld {
  const motion = deriveWorldMotion(spec);
  const mode: PipLookMode = options.look ?? "diorama";
  const diorama = mode === "diorama";
  const look = worldLook(spec.id);
  const scale = presentationScale(options.reducedMotion === true);
  const builder = scene().background(diorama ? look.background : (spec.background ?? "#1e4d78"));
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
  const instancedPlatforms = diorama ? addDioramaPlatforms(builder, spec) : 0;
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

  // Hazards — hurt volumes + 3D GLB crystal/brazier hazard clusters (diorama: plum
  // bramble mat, glowing practical lava and embers, clearcoat frost; PBL-M2 interim).
  const hazards: HazardBox[] = spec.hazards.map((hz) => {
    const h = hz.h ?? 0.5;
    builder.add(
      primitives.box({
        name: `hazard:${hz.id}`,
        size: [hz.w, Math.min(h, 0.24), hz.d],
        position: [hz.x, hz.y - Math.min(h, 0.24) / 2, hz.z],
        material: diorama
          ? hazardMaterial(hz.type)
          : material.emissive({ color: HAZARD_STYLE[hz.type], emissive: HAZARD_STYLE[hz.type], emissiveIntensity: 0.85, roughness: 0.5 })
      })
    );
    const hazardRef = hz.type === "lava" ? assets.props.brazier : assets.props.crystalShard;
    builder.add(
      model(hazardRef, {
        name: `hazard:${hz.id}:mesh`,
        castShadow: true,
        receiveShadow: true,
        targetHeight: Math.max(0.55, Math.min(1.1, h * 1.4))
      }).position(hz.x, hz.y - Math.min(h, 0.24), hz.z)
    );
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

  // Pickups — bespoke Meshy sun-seed / golden-acorn / energy-core models driven per frame.
  // C11: small spinning pickups do not cast shadow-map shadows (each caster is
  // a depth draw per cascade); the screen-space contact shadows still ground them.
  const spinNodes: string[] = [];
  for (const s of spec.seeds) {
    builder.add(
      model(assets.sunseed, { name: nodeName.seed(s.id), castShadow: false, targetMaxDimension: 0.68, scaleMode: "fit" })
        .position(s.x, s.y - 0.1, s.z)
        .runtime(game.runtimeNode(nodeName.seed(s.id), { tags: ["pickup", "seed"] }))
    );
    spinNodes.push(nodeName.seed(s.id));
  }
  for (const a of spec.acorns) {
    builder.add(
      model(assets.goldenAcorn, { name: nodeName.acorn(a.id), castShadow: false, targetMaxDimension: 0.65, scaleMode: "fit" })
        .position(a.x, a.y - 0.2, a.z)
        .runtime(game.runtimeNode(nodeName.acorn(a.id), { tags: ["pickup", "acorn"] }))
    );
    spinNodes.push(nodeName.acorn(a.id));
  }
  for (const hpt of spec.hearts) {
    builder.add(
      model(assets.props.energyCore, { name: nodeName.heart(hpt.id), castShadow: false, targetMaxDimension: 0.55, scaleMode: "fit" })
        .position(hpt.x, hpt.y - 0.18, hpt.z)
        .runtime(game.runtimeNode(nodeName.heart(hpt.id), { tags: ["pickup", "heart"] }))
    );
    spinNodes.push(nodeName.heart(hpt.id));
  }

  // Springs — 3D Meshy boost pad + pedestal base (diorama: tiny props cast no
  // shadow-map shadows, PBL-PF1; contact shadows still ground them).
  for (const spr of spec.springs) {
    const base = [spr.x, spr.y, spr.z] as const;
    builder.add(
      model(assets.props.pedestal, { name: `${nodeName.spring(spr.id)}:base`, castShadow: !diorama, receiveShadow: true, targetMaxDimension: 0.92 })
        .position(base[0], base[1], base[2])
    );
    builder.add(
      model(assets.props.boostPad, { name: nodeName.spring(spr.id), castShadow: !diorama, receiveShadow: true, targetMaxDimension: 0.82 })
        .position(base[0], base[1] + 0.14, base[2])
        .runtime(game.runtimeNode(nodeName.spring(spr.id), { tags: ["spring"] }))
    );
  }

  // Checkpoints — bespoke Meshy leaf-banner flag + 3D pedestal base.
  for (const cp of spec.checkpoints) {
    builder.add(
      model(assets.checkpointFlag, { name: nodeName.checkpointFlag(cp.id), castShadow: true, targetHeight: 1.9, scaleMode: "fit" })
        .position(cp.x, cp.y, cp.z)
        .runtime(game.runtimeNode(nodeName.checkpointFlag(cp.id), { tags: ["checkpoint"] }))
    );
    builder.add(
      model(assets.props.pedestal, { name: `${nodeName.checkpoint(cp.id)}:pad`, castShadow: !diorama, receiveShadow: true, targetMaxDimension: 0.78 })
        .position(cp.x, cp.y, cp.z)
    );
  }

  // Sun-Gate — bespoke Meshy seed-arch portal + retained emissive ring + 3D energy core lock.
  // Diorama: the ring is sun-seed gold and marked practical (a light source, not fill).
  const g = spec.gate;
  builder.add(
    model(assets.sungate, { name: nodeName.gate, castShadow: true, targetHeight: 3.4, scaleMode: "fit" })
      .position(g.x, g.y, g.z)
      .runtime(game.runtimeNode(nodeName.gate, { tags: ["gate"] }))
  );
  builder.add(
    primitives.torus({ name: nodeName.gateRing, size: [1.9, 1.9, 0.4], position: [g.x, g.y + 1.5, g.z], material: diorama ? GATE_RING_MATERIAL : material.emissive({ color: "#ffcf3d", emissive: "#ffc52e", emissiveIntensity: 0.9 }), castShadow: false })
      .runtime(game.runtimeNode(nodeName.gateRing, { tags: ["gate"] }))
  );
  builder.add(
    model(assets.props.energyCore, { name: nodeName.gateLock, castShadow: false, targetMaxDimension: 0.65 })
      .position(g.x, g.y + 1.25, g.z)
      .runtime(game.runtimeNode(nodeName.gateLock, { tags: ["gate"] }))
  );

  // Decor + NPCs.
  const cameraObstacles: CameraObstacle[] = [];
  for (const d of spec.decor) {
    const obstacle = cameraObstacleFor(d);
    if (obstacle) cameraObstacles.push(obstacle);
    for (const node of decorNodes(d, !diorama)) builder.add(node);
  }
  for (const n of spec.npcs) {
    // C19: NPCs are camera obstacles too, so the boom shortens instead of
    // letting a 1.35 m runner fill the foreground.
    cameraObstacles.push({ x: n.x, z: n.z, baseY: n.y, radius: 0.45, height: 1.35 });
    const ref = n.who === "sidekick" ? assets.sidekick : assets.helper;
    const clip = n.clip ?? "idle";
    builder.add(
      model(ref, { name: nodeName.npc(n.id), castShadow: true, targetHeight: 1.35, scaleMode: "fit" })
        .position(n.x, n.y, n.z)
        .rotate(0, Math.PI, 0)
        .animate({ clip, loop: true })
    );
  }

  // Hero — always a runtime node; the camera rigs onto it. `targetHeight: 1.25`
  // with `scaleMode: "fit"` sizes Pip's bespoke GLB prominently in frame with
  // his feet grounded on the platform top surface.
  builder.add(
    model(assets.pip, { name: nodeName.hero, castShadow: true, targetHeight: 1.25, scaleMode: "fit" })
      .position(spec.spawn[0], spec.spawn[1], spec.spawn[2])
      .rotate(0, spec.spawnYaw ?? Math.PI, 0)
      .animate({ clip: PIP_CLIPS.idle, loop: true })
      .runtime(game.runtimeNode(nodeName.hero, { tags: ["player"] }))
  );
  // Player Studio cape: a thin panel on Pip's back (the Studio tints it). The
  // old acorn-cap accessory is gone: Pip's GLB bakes one material, so there
  // was no cap mesh to tint and the stand-in was always hidden.
  builder.add(
    primitives.box({ name: nodeName.heroCape, size: [0.3, 0.03, 0.32], position: [spec.spawn[0], spec.spawn[1] + 0.52, spec.spawn[2] + 0.16], material: material.pbr({ color: "#3f8cff", roughness: 0.6 }), castShadow: false })
      .runtime(game.runtimeNode(nodeName.heroCape, { tags: ["player", "studio"] }))
  );

  // Boss (W5) — bespoke Meshy Brambleback; body is runtime-driven and the
  // 3D crystal-shard satellites remain the phase telegraph (out = invulnerable).
  if (spec.boss) {
    builder.add(
      model(assets.boss, { name: nodeName.boss, castShadow: true, targetHeight: 2.4, scaleMode: "fit" })
        .position(0, 2.6, -69)
        .animate({ clip: BOSS_CLIPS.idle, loop: true })
        .runtime(game.runtimeNode(nodeName.boss, { tags: ["boss"] }))
    );
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      builder.add(
        model(assets.props.crystalShard, { name: nodeName.bossSpike(i), castShadow: true, targetHeight: 0.9 })
          .position(Math.cos(a) * 1.05, 4.4, -69 + Math.sin(a) * 1.05)
          .rotate(0, 0, Math.cos(a) * 0.5)
          .runtime(game.runtimeNode(nodeName.bossSpike(i), { tags: ["boss"] }))
      );
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
    camera.perspective(
      diorama
        ? {
            // PBL-C2 miniature framing (lens 1.7 m above Pip's feet, fov 46).
            position: [spec.spawn[0], spec.spawn[1] + MINIATURE_LIFT, spec.spawn[2] + 4.5],
            target: [spec.spawn[0], spec.spawn[1] + 0.55, spec.spawn[2] - 3.2],
            fov: 46
          }
        : {
            position: [spec.spawn[0], spec.spawn[1] + 1.95, spec.spawn[2] + 4.2],
            target: [spec.spawn[0], spec.spawn[1] + 0.95, spec.spawn[2] - 2.4],
            fov: 52
          }
    )
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
      instancedPlatforms
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
