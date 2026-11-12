/**
 * Thermal Drift scene: the per-circuit cyber-thermal rig, instanced road, brushed-metal barrier walls & heatsink
 * cooling-fin pylons, plasma thruster plumes, rotor-blur discs, flipbook VFX burst quads, and batched GLB setpieces.
 *
 * WP-07 10/10 Visual Overhaul:
 * - Night-industrial/cyber sky dome (`sky.gradient`) paired with prefiltered HDRI specular IBL (`background: false`,
 *   killing the daytime meadow skybox) and zero `lights.ambient`.
 * - Tightened 2-cascade PCSS directional key (`mapSize: 2048, maxDistance: 65`), zero live `everyNFrames: 6` cubemap
 *   reflection probes, and wet-asphalt `screenSpaceReflections` + `cinematicBloom` + `contactShadows` + `ambientOcclusion`.
 * - GPU `instances.model` batching for repeated trackside arches, tunnel frames, iron towers, and holo billboards
 *   (strictly positive uniform scales so `ForwardPass` draws 1 instanced call per batch), plus instanced anodized
 *   `material.brushedMetal` heatsink cooling-fin pylons and heat-reactive thermal vents.
 * - Multi-lobe `material.carPaint` drone chassis liveries + instanced Mach-cone plasma plumes & quadcopter rotor discs.
 */
import {
  camera,
  effects,
  environments,
  game,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraLutAssetRef,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  buildBatchedSceneryNode,
  buildCombatDroneNode,
  buildHeatsinkFinSpec,
  buildLaserBoltSpec,
  buildProximityMineNode,
  buildSeekerMissileNode,
  buildShockwaveRingNode,
  buildSingleSceneryNode,
  buildThrusterPlumeSpec,
  buildTrackWallSpec,
  MAT_INSTANCED_FIN_ARRAY,
  MAT_INSTANCED_WALL_ARMOR,
  MAT_LASER_BOLT
} from "./art/proceduralModels";
import { ASPHALT_ROUGHNESS_MEAN, HDRI_BY_ID, luts, textures } from "./aura-assets";
import { DRONE_ORDER, DRONE_SPECS, SCENERY_ANCHORS, type CircuitSpec, type SceneryAnchor } from "./data";
import { CIRCUIT_LOOKS, rimPosition, sunPosition, type CircuitLook } from "./look";
import {
  chevronHeatMaterial,
  contactShadowMaterial,
  flipbookBurstMaterial,
  moltenMaterial,
  rotorBlurMaterial,
  thrusterPlumeMaterial
} from "./shaders";
import { LASER_BOLTS } from "./sim";
import { skylineNodes } from "./skyline";
import { getPlasmaFlipbookAtlas, getSparksFlipbookAtlas } from "./vfx";
import { labCameraOptions, readLabFlags } from "../../showcase-port-shared/lab-flags";

export const ROAD_TILE_COUNT = 16;
export const ROAD_TILE_SPACING = 12;
/** Tiles overlap so the outer edge of a bend never opens a gap between rotated tiles. */
export const ROAD_TILE_LENGTH = ROAD_TILE_SPACING + 1.1;
export const WALL_SEGMENT_COUNT = 14;
export const WALL_SPACING = 13.5;

/** Runtime ids of the rig nodes E-B drives at runtime (sector cross-fades, HS-16). */
export const RIG_IDS = {
  key: "td-key-light",
  rim: "td-rim-light",
  upFill: "td-vent-up-fill",
  sky: "td-sky",
  skyDome: "td-sky-dome"
} as const;

export interface LocalLightSpec {
  readonly id: string;
  readonly kind: "sodium" | "strip";
  readonly anchorId: string;
  readonly offset: readonly [number, number];
}
const SODIUM_PAIR: readonly LocalLightSpec[] = [
  { id: "td-sodium-gantry-l", kind: "sodium", anchorId: "prop-gantry-start", offset: [-8, 7.5] },
  { id: "td-sodium-gantry-r", kind: "sodium", anchorId: "prop-gantry-start", offset: [8, 7.5] }
];
const SODIUM_CENTRE: readonly LocalLightSpec[] = [
  { id: "td-sodium-gantry", kind: "sodium", anchorId: "prop-gantry-start", offset: [0, 7.5] }
];
const TUNNEL_STRIPS: readonly LocalLightSpec[] = [
  { id: "td-strip-tunnel-a", kind: "strip", anchorId: "prop-tunnel-a", offset: [0, 13] },
  { id: "td-strip-tunnel-b", kind: "strip", anchorId: "prop-tunnel-b", offset: [0, 13] }
];
/** The anchored local lights of a circuit (scene.ts mounts them, main.ts moves them). */
export function localLightSpecs(look: CircuitLook): readonly LocalLightSpec[] {
  return [...(look.upFill ? SODIUM_CENTRE : SODIUM_PAIR), ...TUNNEL_STRIPS];
}
export const HEADLIGHT_ID = "td-drone-headlight";
/** Headlight: offset from the player drone (metres, view space; the drone always faces -Z) and its aim point. */
export const HEADLIGHT = { offset: [0, 0.35, -1.4] as [number, number, number], target: [0, 0, -34] as [number, number, number], angle: 0.42, distance: 46 } as const;
/** Sodium lamp reach and the tunnel strip size (metres). */
export const SODIUM_DISTANCE = 22;
export const STRIP_SIZE = { width: 2.2, height: 14 } as const;
/** Unit headlight direction (offset towards the aim point); set once per mount so the moving spot never re-aims. */
export const HEADLIGHT_DIRECTION: readonly [number, number, number] = (() => {
  const v = [HEADLIGHT.target[0] - HEADLIGHT.offset[0], HEADLIGHT.target[1] - HEADLIGHT.offset[1], HEADLIGHT.target[2] - HEADLIGHT.offset[2]] as const;
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();
/** Where the key light aims: the road about 20 m ahead of the drone (the drone stays near the origin). */
export const KEY_TARGET: [number, number, number] = [0, 0, -20];
/** WP-07: tightened 2-cascade PCSS directional key (`mapSize: 2048, maxDistance: 65`) for crisp near-field drone & barrier shadows. */
export const KEY_SHADOW = { filter: "pcss", cascades: 2, mapSize: 2048, maxDistance: 65, lightSize: 0.3 } as const;
/** Screen-space contact shadows from the key (wall feet, props, drone undersides). */
export const CONTACT_SHADOWS = { intensity: 0.78, length: 0.34, steps: 12 } as const;

export const IDS = {
  deckEven: "road-deck-even",
  deckOdd: "road-deck-odd",
  spineA: "road-spine-a",
  spineB: "road-spine-b",
  lanes: "road-lanes",
  walls: "track-walls",
  fins: "track-heatsink-fins",
  vents: "track-thermal-vents",
  chevA: "wall-chevrons-a",
  chevB: "wall-chevrons-b",
  gutters: "slag-gutters",
  bolts: "laser-bolts",
  thrusters: "drone-thruster-plumes",
  rotors: "drone-rotor-discs",
  floor: "megacity-abyss-floor",
  ring: "player-shockwave-ring",
  missile: "homing-missile-active",
  incoming: "incoming-missile",
  mine: "weapon-mine-active",
  shadows: "drone-contact-shadows",
  plasmaBurst: "vfx-plasma-flipbook",
  sparksBurst: "vfx-sparks-flipbook"
} as const;

/** HS-20: anchors drawn without a shadow caster (far side towers, emissive holo, checkpoint ring and lava curtain). */
export const UNSHADOWED_ANCHOR_ASSETS: ReadonlySet<string> = new Set([
  "heatsink_thermalTowerLIron",
  "heatsink_thermalTowerTIron",
  "heatsinkTowerX",
  "heatsink_thermalCoolingTower",
  "heatsink_thermalSmokestacks",
  "heatsink_thermalWaterTower",
  "heatsink_thermalReactorRing",
  "heatsinkHoloBillboard",
  "heatsinkCheckpointRing",
  "heatsinkLavaFall"
]);

/** Repeated `SCENERY_ANCHORS` consolidated into GPU `instances.model` pools (1 draw call per repeated GLB, positive scales only). */
export interface SceneryBatchSpec {
  readonly id: string;
  readonly assetKey: string;
  readonly baseMaxDim: number;
  readonly castShadow: boolean;
  readonly anchors: readonly SceneryAnchor[];
}

const BATCHED_ASSET_KEYS = [
  "heatsink_thermalArchIron",
  "heatsinkTunnelFrame",
  "heatsink_thermalTowerLIron",
  "heatsinkHoloBillboard"
] as const;

const BATCHED_ASSET_SET: ReadonlySet<string> = new Set(BATCHED_ASSET_KEYS);

export const SCENERY_BATCHES: readonly SceneryBatchSpec[] = BATCHED_ASSET_KEYS.map((assetKey) => {
  const anchors = SCENERY_ANCHORS.filter((a) => a.assetKey === assetKey);
  return {
    id: `batch-${assetKey}`,
    assetKey,
    baseMaxDim: anchors[0]!.maxDim,
    castShadow: !UNSHADOWED_ANCHOR_ASSETS.has(assetKey),
    anchors
  };
});

export const SINGLE_SCENERY_ANCHORS: readonly SceneryAnchor[] = SCENERY_ANCHORS.filter(
  (a) => !BATCHED_ASSET_SET.has(a.assetKey)
);

/** Instance counts per instanced node (primitives + batched `instances.model` scenery pools). */
export const INSTANCE_COUNTS = {
  deckEven: ROAD_TILE_COUNT / 2,
  deckOdd: ROAD_TILE_COUNT / 2,
  spineA: Math.ceil(ROAD_TILE_COUNT / 3),
  spineB: ROAD_TILE_COUNT - Math.floor(ROAD_TILE_COUNT / 3),
  lanes: ROAD_TILE_COUNT * 2,
  walls: WALL_SEGMENT_COUNT * 2,
  fins: WALL_SEGMENT_COUNT * 2,
  vents: WALL_SEGMENT_COUNT * 2,
  chevA: WALL_SEGMENT_COUNT,
  chevB: WALL_SEGMENT_COUNT,
  gutters: WALL_SEGMENT_COUNT * 2 + 1,
  bolts: LASER_BOLTS,
  shadows: DRONE_ORDER.length,
  thrusters: DRONE_ORDER.length * 2,
  rotors: DRONE_ORDER.length * 4,
  archBatch: 2,
  tunnelBatch: 2,
  towerLBatch: 2,
  billboardBatch: 2
} as const;

/** Soft contact shadow under each drone: a soft disc on the deck (metres; height above the deck). */
export const CONTACT_SHADOW = { y: 0.035, size: 3.4, opacity: 0.62 } as const;

/** Anodized brushed-metal heatsink cooling-fin pylons & emissive thermal vent cores flanking the barrier walls. */
export const HEATSINK_FIN = { lateral: 12.05, y: 1.45, size: [0.58, 2.75, 2.2] as [number, number, number] } as const;
export const THERMAL_VENT = { lateral: 11.72, y: 1.52, size: [0.16, 1.65, 1.35] as [number, number, number] } as const;

/** Dual plasma Mach-diamond plumes & 4 quadcopter rotor-blur discs per drone. */
export const THRUSTER_PLUME = { lateral: 0.44, y: -0.04, back: 1.32, radius: 0.108, length: 0.68 } as const;
export const ROTOR_DISC = { lateral: 1.05, foreAft: 0.88, y: 0.22, size: 1.18 } as const;

/** HS-15 slag gutter: a molten strip on the deck along the foot of each wall (inside the drone's lateral limit + body). */
export const GUTTER = { lateral: 10.25, y: 0.02, size: [0.9, 0.06, 12.4] as [number, number, number] } as const;
/** HS-15 lava pool under the lava curtain (metres; drawn as the last gutter instance, scaled). */
export const LAVA_POOL = { y: 0.05, size: [10, 0.3, 7] as [number, number, number] } as const;
/** Per-axis scale of the gutter box that draws the lava pool. */
export const LAVA_POOL_SCALE: readonly [number, number, number] = [
  LAVA_POOL.size[0] / GUTTER.size[0],
  LAVA_POOL.size[1] / GUTTER.size[1],
  LAVA_POOL.size[2] / GUTTER.size[2]
];
/** Wall chevron emissive intensity, before the HS-15 heat gain. */
export const CHEVRON_INTENSITY = 1.65;

/** Initial transforms spread along the road, so every instanced node starts with honest bounds. */
const along = (count: number, x: number, y: number, spacing: number) =>
  Array.from({ length: count }, (_, i) => ({ position: [x, y, 8 - i * spacing] as [number, number, number] }));

export const emissive = (color: string, intensity: number) =>
  material.emissive({ color, emissive: color, emissiveIntensity: intensity, practical: true });
export const spineMaterial = (color: string) => emissive(color, 1.45);

export interface SceneOptions {
  readonly circuit: CircuitSpec;
  /** QA: exposure override for calibration (`?qaEv=`). */
  readonly exposureEv?: number;
  /** QA: drop the explicit ambient-occlusion pass (`?qaAo=off`) for the LIGHT-06 on/off pair. */
  readonly ambientOcclusion?: boolean;
  /** `prefers-reduced-motion`: no weather system (HS-06), molten flow at 30% and no chevron scan (HS-15). */
  readonly reducedMotion?: boolean;
}

const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const add3 = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** HS-01 lighting rig: one shadowed key, the unshadowed counter-rim, the VESPER up-fill. Fill is the HDRI (zero ambient). */
export function circuitLights(look: CircuitLook): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [
    lights.directional({
      name: "td key light",
      position: add3(KEY_TARGET, sunPosition(look.key.elevationDeg, look.key.azimuthDeg)),
      target: KEY_TARGET,
      color: look.key.color,
      intensity: look.key.intensity,
      shadow: KEY_SHADOW
    }).runtime(game.runtimeNode(RIG_IDS.key)),
    lights.directional({
      name: "td coolant rim",
      position: add3(KEY_TARGET, rimPosition(look)),
      target: KEY_TARGET,
      color: look.rim.color,
      intensity: look.rim.intensity,
      shadow: false
    }).runtime(game.runtimeNode(RIG_IDS.rim))
  ];
  if (look.upFill) {
    out.push(lights.directional({ name: "td vent up-fill", position: [0, -40, -12], target: KEY_TARGET, color: look.upFill.color, intensity: look.upFill.intensity, shadow: false })
      .runtime(game.runtimeNode(RIG_IDS.upFill)));
  }
  return out;
}

/** HS-02 local lights for a circuit (positions are rewritten every frame by main.ts). */
export function circuitLocalLights(look: CircuitLook): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [
    lights.spot({ name: "td drone headlight", position: HEADLIGHT.offset, target: HEADLIGHT.target, angle: HEADLIGHT.angle, penumbra: 0.55, distance: HEADLIGHT.distance, color: look.local.headlight.color, intensity: look.local.headlight.intensity, shadow: false })
      .runtime(game.runtimeNode(HEADLIGHT_ID))
  ];
  for (const l of localLightSpecs(look)) {
    const base: [number, number, number] = [l.offset[0], l.offset[1], -60];
    out.push(l.kind === "sodium"
      ? lights.point({ name: l.id, position: base, distance: SODIUM_DISTANCE, color: look.local.sodium.color, intensity: look.local.sodium.intensity, shadow: false }).runtime(game.runtimeNode(l.id))
      : lights.rect({ name: l.id, position: base, target: [base[0], 0, base[2]], width: STRIP_SIZE.width, height: STRIP_SIZE.height, color: look.local.strip.color, intensity: look.local.strip.intensity }).runtime(game.runtimeNode(l.id)));
  }
  return out;
}

/** WP-07 IBL fill: prefiltered circuit HDRI specular/diffuse reflections with `background: false` (no daytime meadow backdrop). */
export function circuitSky(look: CircuitLook): AuraNodeBuilder<AuraSceneNode> {
  return environments.hdri({
    name: `td sky ${look.hdri}`,
    texture: HDRI_BY_ID[look.hdri],
    intensity: look.environmentIntensity,
    rotation: degToRad(look.environmentRotationDeg),
    background: false
  }).runtime(game.runtimeNode(RIG_IDS.sky));
}

/** WP-07 procedural night-industrial / foundry / twilight sky dome per circuit (`captureEnvironment: false` keeps HDRI IBL). */
export function circuitSkyDome(look: CircuitLook): AuraNodeBuilder<AuraSceneNode> {
  return sky.gradient({
    name: "td sky dome",
    zenith: look.sky.zenith,
    horizon: look.sky.horizon,
    ground: look.sky.ground,
    stars: look.sky.stars,
    clouds: look.sky.clouds,
    captureEnvironment: false,
    affectsFog: false
  }).runtime(game.runtimeNode(RIG_IDS.skyDome));
}

/** Texture repeats across one road tile (22.4 x 13.1 m): about 5.6 m of asphalt per repeat. */
export const ROAD_TEXTURE_REPEAT: readonly [number, number] = [4, 2.4];

/** HS-07 road deck: the asphalt set at the circuit's effective roughness (the factor scales the map's 0.745 mean). */
export function roadMaterial(look: CircuitLook, tint: string): AuraMaterialSpec {
  const repeat = { scale: ROAD_TEXTURE_REPEAT };
  return material.pbr({
    color: tint,
    roughness: Math.min(1, look.road.roughness / ASPHALT_ROUGHNESS_MEAN),
    metalness: look.road.metalness,
    texture: textures.heatsinkAsphaltColor,
    normal: textures.heatsinkAsphaltNormal,
    normalScale: 0.85,
    roughnessMap: textures.heatsinkAsphaltRoughness,
    envMapIntensity: 1.35,
    texTransforms: { baseColor: repeat, normal: repeat, metallicRoughness: repeat }
  });
}

/** WP-07 reflections: prefiltered HDRI specular IBL + screen-space reflections on wet asphalt circuits (zero live cubemap probes). */
export function circuitReflections(look: CircuitLook): AuraNodeBuilder<AuraSceneNode>[] {
  if (look.reflections.ssr <= 0) return [];
  return [
    effects.screenSpaceReflections({
      name: "td wet road ssr",
      intensity: look.reflections.ssr,
      roughness: Math.min(0.35, look.road.roughness),
      maxDistance: 42,
      thickness: 0.3
    })
  ];
}

export const EMBER_SPAWN = { position: [0, -2.5, -26] as [number, number, number], radius: 26 } as const;

export function circuitWeather(look: CircuitLook, reducedMotion: boolean): AuraNodeBuilder<AuraSceneNode>[] {
  if (reducedMotion) return [];
  switch (look.weather) {
    case "rain":
      return [effects.rain({ name: "td rain", intensity: 0.5, density: 0.4, color: "#9eb4d4", speed: 1.3, wind: [-0.4, -6, 2.5], particleCount: 900, splashes: true, mist: false })];
    case "dust":
      return [effects.snow({ name: "td dust", intensity: 0.34, density: 0.32, color: "#9c724c", speed: 0.6, wind: [-6, -0.3, 3], particleCount: 520, splashes: false, mist: false })];
    case "embers":
      return [effects.particles({
        name: "td embers",
        position: EMBER_SPAWN.position,
        radius: EMBER_SPAWN.radius,
        rate: 30,
        maxParticles: 90,
        loop: true,
        prewarm: 3,
        lifetime: [2.5, 4.5],
        speed: 1.5,
        gravity: 1.2,
        drag: 0.4,
        size: [0.04, 0.09],
        color: "#ff7a2e",
        intensity: 3.5,
        blend: "additive"
      })];
    default:
      return [];
  }
}

/** HS-05 atmosphere and WP-07 post stack (`cinematicBloom`, `colorGrade` foundry LUT, `ambientOcclusion`, `contactShadows`). */
export function circuitPost(look: CircuitLook, options: { readonly exposureEv?: number; readonly ambientOcclusion?: boolean } = {}): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [
    effects.fog({
      name: "td fog",
      color: look.fog.color,
      density: look.fog.density,
      near: 68,
      far: 340,
      maxOpacity: 0.38,
      intensity: 0.3,
      affectsBackground: false
    }),
    effects.colorGrade({
      name: "td grade",
      exposure: Math.pow(2, options.exposureEv ?? look.exposureEv),
      contrast: look.grade.contrast,
      saturation: look.grade.saturation,
      temperature: look.grade.temperature,
      tint: look.grade.tint,
      lut: luts.heatsinkFoundryLut as unknown as AuraLutAssetRef,
      lutIntensity: look.lutIntensity
    }),
    effects.cinematicBloom({
      name: "td warm bloom",
      intensity: look.bloom.intensity,
      threshold: look.bloom.threshold,
      color: look.bloom.color,
      radius: 0.26,
      antiBlowout: true,
      maxIntensity: 0.62,
      softKnee: 0.35,
      shoulder: 0.78
    }),
    effects.vignette({ name: "td vignette", intensity: look.vignette, smoothness: 0.65 })
  ];
  if (options.ambientOcclusion !== false) out.push(effects.ambientOcclusion({ name: "td ambient occlusion", intensity: 0.52, radius: 0.72 }));
  out.push(effects.contactShadows({ ...CONTACT_SHADOWS, lights: "shadowed" }));
  if (look.grain > 0) out.push(effects.filmGrain({ name: "td film grain", intensity: look.grain }));
  if (look.volumetricFog) {
    const v = look.volumetricFog;
    out.push(effects.volumetricFog({ name: "td dust god rays", color: v.color, density: v.density, intensity: v.intensity, godRayDensity: v.godRayDensity }));
  }
  return out;
}

export function buildThermalDriftScene(options: SceneOptions) {
  const circuit = options.circuit;
  const look = CIRCUIT_LOOKS[circuit.id];
  const reducedMotion = options.reducedMotion === true;
  const s = scene()
    .background(look.sky.zenith)
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), fov: 68, near: 0.25, far: 650, position: [0, 4.2, 9.5], target: [0, 1.8, -18] }))
    .add(circuitSky(look))
    .add(circuitSkyDome(look))
    .addMany(circuitLights(look))
    .addMany(circuitPost(look, {
      ...(options.exposureEv !== undefined ? { exposureEv: options.exposureEv } : {}),
      ...(options.ambientOcclusion === false ? { ambientOcclusion: false } : {})
    }))
    .addMany(circuitLocalLights(look))
    .addMany(circuitReflections(look))
    .addMany(circuitWeather(look, reducedMotion));

  // Abyssal foundry plain far below the elevated causeway.
  s.add(
    primitives.box({ name: IDS.floor, size: [520, 0.5, 460], material: material.pbr({ color: look.ground, roughness: 0.88, metalness: 0.18 }), castShadow: false })
      .position(0, -8.5, -150).runtime(game.runtimeNode(IDS.floor))
  );
  // HS-04: three parallax curtain-wall skyline layers (6 instanced draws, unshadowed).
  s.addMany(skylineNodes(circuit, look));

  // Road, lanes, brushed-metal barriers, anodized heatsink fins, thermal vents, chevrons, molten gutters, drone plumes & rotors.
  const unshadowed = { castShadow: false, frustumCulled: false } as const;
  s.addMany([
    instances.box({ name: IDS.deckEven, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: roadMaterial(look, look.road.color), transforms: along(INSTANCE_COUNTS.deckEven, 0, -0.18, ROAD_TILE_SPACING * 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.deckEven)),
    instances.box({ name: IDS.deckOdd, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: roadMaterial(look, look.road.colorAlt), transforms: along(INSTANCE_COUNTS.deckOdd, 0, -0.186, ROAD_TILE_SPACING * 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.deckOdd)),
    instances.box({ name: IDS.spineA, size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58], material: spineMaterial(look.accents.secondary), transforms: along(INSTANCE_COUNTS.spineA, 0, 0.03, ROAD_TILE_SPACING * 3), ...unshadowed })
      .runtime(game.runtimeNode(IDS.spineA)),
    instances.box({ name: IDS.spineB, size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58], material: spineMaterial(look.accents.primary), transforms: along(INSTANCE_COUNTS.spineB, 0, 0.03, ROAD_TILE_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.spineB)),
    instances.box({ name: IDS.lanes, size: [0.18, 0.04, ROAD_TILE_SPACING * 0.45], material: emissive(look.accents.lanes, 0.45), transforms: along(INSTANCE_COUNTS.lanes, 5.2, 0.025, ROAD_TILE_SPACING / 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.lanes)),
    instances.custom(buildTrackWallSpec(), { name: IDS.walls, material: MAT_INSTANCED_WALL_ARMOR, transforms: along(INSTANCE_COUNTS.walls, 11.3, 0.55, WALL_SPACING / 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.walls)),
    instances.custom(buildHeatsinkFinSpec(), { name: IDS.fins, material: MAT_INSTANCED_FIN_ARRAY, transforms: along(INSTANCE_COUNTS.fins, HEATSINK_FIN.lateral, HEATSINK_FIN.y, WALL_SPACING / 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.fins)),
    instances.box({ name: IDS.vents, size: THERMAL_VENT.size, material: chevronHeatMaterial(look.accents.primary, 2.2, reducedMotion), transforms: along(INSTANCE_COUNTS.vents, THERMAL_VENT.lateral, THERMAL_VENT.y, WALL_SPACING / 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.vents)),
    instances.box({ name: IDS.chevA, size: [0.22, 0.36, 9.6], material: chevronHeatMaterial(look.accents.primary, CHEVRON_INTENSITY, reducedMotion), transforms: along(INSTANCE_COUNTS.chevA, 10.72, 0.72, WALL_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.chevA)),
    instances.box({ name: IDS.chevB, size: [0.22, 0.36, 9.6], material: chevronHeatMaterial(look.accents.secondary, CHEVRON_INTENSITY, reducedMotion), transforms: along(INSTANCE_COUNTS.chevB, -10.72, 0.72, WALL_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.chevB)),
    instances.box({ name: IDS.gutters, size: GUTTER.size, material: moltenMaterial({ ...look.molten, reducedMotion }), transforms: along(INSTANCE_COUNTS.gutters, GUTTER.lateral, GUTTER.y, WALL_SPACING / 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.gutters)),
    instances.box({ name: IDS.shadows, size: [CONTACT_SHADOW.size, 0.01, CONTACT_SHADOW.size], material: contactShadowMaterial(CONTACT_SHADOW.opacity, CONTACT_SHADOW.size / 2), transforms: along(INSTANCE_COUNTS.shadows, 0, -60, 4), ...unshadowed })
      .runtime(game.runtimeNode(IDS.shadows)),
    instances.custom(buildLaserBoltSpec(), { name: IDS.bolts, material: MAT_LASER_BOLT, transforms: along(INSTANCE_COUNTS.bolts, 0, 1.4, 20), ...unshadowed })
      .runtime(game.runtimeNode(IDS.bolts)),
    instances.custom(buildThrusterPlumeSpec(THRUSTER_PLUME.length / 2, THRUSTER_PLUME.radius), { name: IDS.thrusters, material: thrusterPlumeMaterial(THRUSTER_PLUME.length / 2, reducedMotion), transforms: along(INSTANCE_COUNTS.thrusters, 0, -60, 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.thrusters)),
    instances.box({ name: IDS.rotors, size: [ROTOR_DISC.size, 0.015, ROTOR_DISC.size], material: rotorBlurMaterial(ROTOR_DISC.size / 2, reducedMotion), transforms: along(INSTANCE_COUNTS.rotors, 0, -60, 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.rotors))
  ]);

  // Sculpted shockwave ring, multi-material lathed seeker missiles, and procedural 8x4 plasma / sparks flipbook burst quads.
  s.addMany([
    buildShockwaveRingNode(IDS.ring),
    buildSeekerMissileNode(IDS.missile, false),
    buildSeekerMissileNode(IDS.incoming, true),
    primitives.plane({ name: IDS.plasmaBurst, size: [3.2, 3.2, 0.02], material: flipbookBurstMaterial(getPlasmaFlipbookAtlas().texture), castShadow: false })
      .position(0, -60, 0).runtime(game.runtimeNode(IDS.plasmaBurst)),
    primitives.plane({ name: IDS.sparksBurst, size: [2.2, 2.2, 0.02], material: flipbookBurstMaterial(getSparksFlipbookAtlas().texture), castShadow: false })
      .position(0, -60, 0).runtime(game.runtimeNode(IDS.sparksBurst))
  ]);

  // 1-7: sculpted multi-material playable & rival hover-drones with tinted canopies (`castShadow: false`) and `+Z` afterburner rings.
  for (const id of DRONE_ORDER) {
    s.add(buildCombatDroneNode(id, DRONE_SPECS[id]));
  }
  // 8: sculpted multi-material dropped proximity mine.
  s.add(buildProximityMineNode(IDS.mine));
  // 9-24: sculpted multi-material foundry megastructures, hazards, and track pickups.
  for (const anchor of SINGLE_SCENERY_ANCHORS) {
    s.add(buildSingleSceneryNode(anchor, !UNSHADOWED_ANCHOR_ASSETS.has(anchor.assetKey)));
  }
  // 25-28: repeated track-side arches, tunnels, iron towers, and holo billboards batched into GPU `instances.custom` pools.
  for (const batch of SCENERY_BATCHES) {
    s.add(buildBatchedSceneryNode(batch));
  }
  return s;
}

/** sRGB mix of a hex colour towards white (keeps the hue, lifts the value so a multiply tint keeps texture detail). */
export function liftTowardsWhite(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export const DRONE_HEAT_RIM = { color: "#ff6a1a", power: 2.6, intensity: 1.4 } as const;
export const PLAYER_IRON = { towardsSoot: 0.55, metallic: 0.74, roughness: 0.24, rimIntensity: 2 } as const;

export function playerFoundryLivery(color: string): AuraModelMaterialOverride {
  const n = Number.parseInt(color.replace("#", ""), 16);
  const soot = Number.parseInt("14110f", 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - PLAYER_IRON.towardsSoot) + ((soot >> shift) & 255) * PLAYER_IRON.towardsSoot);
  const iron = `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const paint = material.carPaint({ color: iron, metallic: PLAYER_IRON.metallic, roughness: PLAYER_IRON.roughness, clearcoat: 0.92, clearcoatRoughness: 0.06, envMapIntensity: 1.9 });
  return { color: iron, colorMode: "multiply", clearcoat: paint.clearcoat ?? 0.92, clearcoatRoughness: paint.clearcoatRoughness ?? 0.06, metallic: paint.metallic ?? PLAYER_IRON.metallic, roughness: paint.roughness ?? PLAYER_IRON.roughness, envMapIntensity: paint.envMapIntensity ?? 1.9, rim: { ...DRONE_HEAT_RIM, intensity: PLAYER_IRON.rimIntensity } };
}

export function droneLivery(color: string): AuraModelMaterialOverride {
  const lifted = liftTowardsWhite(color, 0.3);
  const paint = material.carPaint({ color: lifted, metallic: 0.52, roughness: 0.28, clearcoat: 0.88, clearcoatRoughness: 0.08, envMapIntensity: 1.8 });
  return { color: lifted, colorMode: "multiply", clearcoat: paint.clearcoat ?? 0.88, clearcoatRoughness: paint.clearcoatRoughness ?? 0.08, metallic: paint.metallic ?? 0.52, roughness: paint.roughness ?? 0.28, envMapIntensity: paint.envMapIntensity ?? 1.8, rim: DRONE_HEAT_RIM };
}

/** Static GLB model nodes in the scene (`0`: 100% procedural multi-material meshes in WP-03). */
export const MODEL_NODE_COUNT = 0;
