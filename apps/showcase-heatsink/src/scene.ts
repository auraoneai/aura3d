/**
 * Thermal Drift scene: the per-circuit foundry rig, the instanced road, walls, rain and bolts, and the 30 model nodes.
 *
 * GU47 WP-13 (look table: look.ts; art direction: ../art/direction.ts):
 * HS-01: a per-circuit rig replaces the `night-city` look: one PCSS 3-cascade key (the only shadowed light), an
 *   unshadowed coolant counter-rim, the VESPER vent up-fill and an explicit AO node; the two point lights are gone.
 * HS-03: the circuit HDRI is the sky (background on) and the image-based fill; the backdrop wall and the two emissive
 *   horizon bands are gone. A circuit change remounts the scene (main.ts), so every per-circuit node is authored here.
 * HS-05: per-circuit exponential fog; DUSTFALL adds a volumetric inscatter with god rays from its 9-degree sun.
 * HS-02: drone headlight spot, 2 sodium points on the start gantry (1 on VESPER), 2 tunnel strip lights (unshadowed).
 * HS-06: one weather system per circuit (rain, dust or embers), none on reduced motion.
 * HS-12: per-circuit post: warm bloom, grade (with the exposure), vignette, grain on MEGACITY only.
 * HS-15: molten slag gutters and the lava pool (custom shader, one instanced draw); chevrons follow the core heat.
 * C13: about 150 repeated primitives become 9 instanced nodes; emissive decor casts no shadow.
 */
import { AuraNodeBuilder, camera, effects, environments, instances, lights, material, model, primitives, scene, game, type AuraAssetRef, type AuraLutAssetRef, type AuraMaterialSpec, type AuraModelMaterialOverride, type AuraSceneNode } from "@aura3d/engine";
import { ASPHALT_ROUGHNESS_MEAN, assets, HDRI_BY_ID, luts, textures } from "./aura-assets";
import { DRONE_ORDER, DRONE_SPECS, SCENERY_ANCHORS, type CircuitSpec } from "./data";
import { CIRCUIT_LOOKS, rimPosition, sunPosition, type CircuitLook } from "./look";
import { chevronHeatMaterial, moltenMaterial } from "./shaders";
import { LASER_BOLTS } from "./sim";
import { skylineNodes } from "./skyline";

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
  sky: "td-sky"
} as const;

/**
 * HS-02 local lights, all unshadowed (the key is the only caster). The art-direction contract caps the non-key lights at
 * 6 (`packages/game/src/art/define.ts`), and the coolant rim (plus VESPER's up-fill) count against it, so the set is: the
 * headlight spot, two sodium lamps on the start gantry (one centre lamp on VESPER, whose up-fill takes the sixth slot) and
 * one strip light in each tunnel ceiling: 5 local lights (4 on VESPER), 6 non-key lights per circuit. Each anchored
 * light rides with its anchor (main.ts `setPosition` at the anchor's track distance, the E-B light handle path); `offset`
 * is [lateral, height] in metres from the anchor's lateral and base.
 */
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
/** HS-01: PCSS soft shadows over three cascades (the engine drops to 1 cascade PCF on the Low tier). */
export const KEY_SHADOW = { filter: "pcss", cascades: 3, mapSize: 2048, maxDistance: 160, lightSize: 1.5 } as const;

export const IDS = {
  deckEven: "road-deck-even",
  deckOdd: "road-deck-odd",
  spineA: "road-spine-a",
  spineB: "road-spine-b",
  lanes: "road-lanes",
  walls: "track-walls",
  chevA: "wall-chevrons-a",
  chevB: "wall-chevrons-b",
  gutters: "slag-gutters",
  bolts: "laser-bolts",
  floor: "megacity-abyss-floor",
  ring: "player-shockwave-ring",
  missile: "homing-missile-active",
  incoming: "incoming-missile",
  mine: "weapon-mine-active"
} as const;

/** Instance counts per instanced node. */
export const INSTANCE_COUNTS = {
  deckEven: ROAD_TILE_COUNT / 2,
  deckOdd: ROAD_TILE_COUNT / 2,
  spineA: Math.ceil(ROAD_TILE_COUNT / 3),
  // Every third tile (by absolute index) is spine A: 16 consecutive tiles hold 5 or 6 of them.
  spineB: ROAD_TILE_COUNT - Math.floor(ROAD_TILE_COUNT / 3),
  lanes: ROAD_TILE_COUNT * 2,
  walls: WALL_SEGMENT_COUNT * 2,
  chevA: WALL_SEGMENT_COUNT,
  chevB: WALL_SEGMENT_COUNT,
  // HS-15: one molten gutter per wall segment and side, plus the pool under the lava curtain (last slot).
  gutters: WALL_SEGMENT_COUNT * 2 + 1,
  bolts: LASER_BOLTS
} as const;

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
/** Wall chevron emissive intensity (the old `chevronMaterial`), before the HS-15 heat gain. */
export const CHEVRON_INTENSITY = 1.65;

const asset = (key: string): AuraAssetRef<"model"> => {
  const ref = (assets as unknown as Record<string, AuraAssetRef<"model">>)[key];
  if (!ref) throw new Error(`thermal-drift: asset ${key} is not in apps/showcase-heatsink/src/aura-assets.ts`);
  return ref;
};

/** Initial transforms spread along the road, so every instanced node starts with honest bounds. */
const along = (count: number, x: number, y: number, spacing: number) =>
  Array.from({ length: count }, (_, i) => ({ position: [x, y, 8 - i * spacing] as [number, number, number] }));

export const emissive = (color: string, intensity: number) => material.emissive({ color, emissive: color, emissiveIntensity: intensity });
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

/** HS-01 lighting rig: one shadowed key, the unshadowed counter-rim, the VESPER up-fill. Fill is the HDRI (no ambient). */
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
    // Vents below the causeway: a warm light travelling upwards, so undersides and arches glow from beneath.
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

/** HS-03 sky: the circuit HDRI drawn as the background and used as the image-based fill. */
export function circuitSky(look: CircuitLook): AuraNodeBuilder<AuraSceneNode> {
  return environments.hdri({
    name: `td sky ${look.hdri}`,
    texture: HDRI_BY_ID[look.hdri],
    intensity: look.environmentIntensity,
    rotation: degToRad(look.environmentRotationDeg),
    background: true
  }).runtime(game.runtimeNode(RIG_IDS.sky));
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
    normalScale: 0.8,
    roughnessMap: textures.heatsinkAsphaltRoughness,
    texTransforms: { baseColor: repeat, normal: repeat, metallicRoughness: repeat }
  });
}

/**
 * The C-10 reflection-probe node `probes.reflection` emits (same fields and defaults). GU47(E-G): `probes` is not
 * exported from the `@aura3d/engine` root yet (lane report handoff); swap to `probes.reflection(...)` when it is.
 */
function reflectionProbe(options: { readonly name: string; readonly position: readonly [number, number, number]; readonly box: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }; readonly resolution: 64 | 128 | 256; readonly everyNFrames: number }): AuraNodeBuilder<AuraSceneNode> {
  return new AuraNodeBuilder<AuraSceneNode>({
    kind: "probe",
    probe: "reflection",
    name: options.name,
    options: { name: options.name, position: options.position, box: options.box, resolution: options.resolution, update: { everyNFrames: options.everyNFrames }, blendDistance: 1, priority: 0, intensity: 1 }
  } as unknown as AuraSceneNode);
}

/** HS-07 reflections: a road probe refreshed 1 frame in 6 and SSR on the wet circuits (E-C). */
export function circuitReflections(look: CircuitLook): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [];
  if (look.reflections.probe) {
    out.push(reflectionProbe({ name: "td road probe", position: [0, 2.5, -14], box: { min: [-14, -1, -70], max: [14, 24, 12] }, resolution: 64, everyNFrames: 6 }));
  }
  if (look.reflections.ssr > 0) out.push(effects.screenSpaceReflections({ name: "td wet road ssr", intensity: look.reflections.ssr }));
  return out;
}

/**
 * HS-06 weather, one system per circuit, replacing the 18 rain boxes: sodium-lit rain with splashes on MEGACITY, a
 * wind-driven ochre dust field on DUSTFALL (the camera-following snow volume, recoloured), rising additive embers on
 * VESPER. Reduced motion mounts none (live count 0). Each is one particle draw.
 *
 * The embers spawn on a 26 m disc below the deck (the legacy `radius` disc: the production lowering does not consume
 * the PRD-07 `shape`/`shapeSize` fields yet) and accelerate upwards (`gravity` is the signed y acceleration), so they
 * rise from the vents past the causeway edges.
 */
export const EMBER_SPAWN = { position: [0, -2.5, -26] as [number, number, number], radius: 26 } as const;

export function circuitWeather(look: CircuitLook, reducedMotion: boolean): AuraNodeBuilder<AuraSceneNode>[] {
  if (reducedMotion) return [];
  switch (look.weather) {
    case "rain":
      return [effects.rain({ name: "td rain", intensity: 0.55, density: 0.45, color: "#d9b08a", speed: 1.3, wind: [-0.4, -6, 2.5], particleCount: 900, splashes: true, mist: true })];
    case "dust":
      return [effects.snow({ name: "td dust", intensity: 0.5, density: 0.55, color: "#c8925a", speed: 0.6, wind: [-6, -0.3, 3], particleCount: 700, splashes: false, mist: true })];
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
        // A scalar speed lowers to the range [0.7 x, x] (the node type narrows `speed` to a number).
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

/** HS-05 atmosphere and HS-12 post for a circuit (AO is HS-01's explicit pass). */
export function circuitPost(look: CircuitLook, options: { readonly exposureEv?: number; readonly ambientOcclusion?: boolean } = {}): AuraNodeBuilder<AuraSceneNode>[] {
  const out: AuraNodeBuilder<AuraSceneNode>[] = [
    effects.fog({ name: "td fog", color: look.fog.color, density: look.fog.density, intensity: 0.6 }),
    effects.colorGrade({
      name: "td grade",
      exposure: Math.pow(2, options.exposureEv ?? look.exposureEv),
      contrast: look.grade.contrast,
      saturation: look.grade.saturation,
      temperature: look.grade.temperature,
      tint: look.grade.tint,
      // HS-12: the authored foundry LUT (S10b display grade) at the circuit's strength.
      lut: luts.heatsinkFoundryLut as unknown as AuraLutAssetRef,
      lutIntensity: look.lutIntensity
    }),
    effects.bloom({ name: "td warm bloom", intensity: look.bloom.intensity, threshold: look.bloom.threshold, color: look.bloom.color }),
    effects.vignette({ name: "td vignette", intensity: look.vignette, smoothness: 0.65 })
  ];
  if (options.ambientOcclusion !== false) out.push(effects.ambientOcclusion({ name: "td ambient occlusion", intensity: 0.5, radius: 0.7 }));
  if (look.grain > 0) out.push(effects.filmGrain({ name: "td film grain", intensity: look.grain }));
  if (look.volumetricFog) {
    const v = look.volumetricFog;
    // God rays take their direction from the shadowed key (the 9-degree burnt sun); no screen anchor is authored.
    out.push(effects.volumetricFog({ name: "td dust god rays", color: v.color, density: v.density, intensity: v.intensity, godRayDensity: v.godRayDensity }));
  }
  return out;
}

export function buildThermalDriftScene(options: SceneOptions) {
  const circuit = options.circuit;
  const look = CIRCUIT_LOOKS[circuit.id];
  const reducedMotion = options.reducedMotion === true;
  const s = scene()
    .background(look.fog.color)
    .camera(camera.perspective({ fov: 68, near: 0.25, far: 650, position: [0, 4.2, 9.5], target: [0, 1.8, -18] }))
    .add(circuitSky(look))
    .addMany(circuitLights(look))
    .addMany(circuitPost(look, {
      ...(options.exposureEv !== undefined ? { exposureEv: options.exposureEv } : {}),
      ...(options.ambientOcclusion === false ? { ambientOcclusion: false } : {})
    }))
    .addMany(circuitLocalLights(look))
    .addMany(circuitReflections(look))
    .addMany(circuitWeather(look, reducedMotion));

  // Ground far below the elevated road (the HDRI is the sky; no backdrop wall or horizon bands).
  s.add(
    primitives.box({ name: IDS.floor, size: [520, 0.5, 460], material: material.pbr({ color: look.ground, roughness: 0.92, metalness: 0.12 }), castShadow: false })
      .position(0, -8.5, -150).runtime(game.runtimeNode(IDS.floor))
  );
  // HS-04: three parallax skyline layers (6 instanced draws, unshadowed).
  s.addMany(skylineNodes(circuit, look));

  // Road, lanes, walls and chevrons: one instanced node per material.
  const unshadowed = { castShadow: false, frustumCulled: false } as const;
  s.addMany([
    // HS-07: CC0 worn asphalt per circuit (wet MEGACITY/VESPER, dusty ochre DUSTFALL).
    instances.box({ name: IDS.deckEven, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: roadMaterial(look, look.road.color), transforms: along(INSTANCE_COUNTS.deckEven, 0, -0.18, ROAD_TILE_SPACING * 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.deckEven)),
    instances.box({ name: IDS.deckOdd, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: roadMaterial(look, look.road.colorAlt), transforms: along(INSTANCE_COUNTS.deckOdd, 0, -0.186, ROAD_TILE_SPACING * 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.deckOdd)),
    // Warm foundry accents per circuit (look.ts); coolant cyan stays off the road.
    instances.box({ name: IDS.spineA, size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58], material: spineMaterial(look.accents.secondary), transforms: along(INSTANCE_COUNTS.spineA, 0, 0.03, ROAD_TILE_SPACING * 3), ...unshadowed })
      .runtime(game.runtimeNode(IDS.spineA)),
    instances.box({ name: IDS.spineB, size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58], material: spineMaterial(look.accents.primary), transforms: along(INSTANCE_COUNTS.spineB, 0, 0.03, ROAD_TILE_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.spineB)),
    instances.box({ name: IDS.lanes, size: [0.18, 0.04, ROAD_TILE_SPACING * 0.45], material: emissive(look.accents.lanes, 0.45), transforms: along(INSTANCE_COUNTS.lanes, 5.2, 0.025, ROAD_TILE_SPACING / 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.lanes)),
    instances.box({ name: IDS.walls, size: [0.95, 1.35, 12.8], material: material.pbr({ color: "#232936", roughness: 0.52, metalness: 0.45 }), transforms: along(INSTANCE_COUNTS.walls, 11.3, 0.55, WALL_SPACING / 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.walls)),
    // HS-15: the chevrons brighten with the core heat (u_heat, +25% at 90%); one custom program for both nodes.
    instances.box({ name: IDS.chevA, size: [0.22, 0.36, 9.6], material: chevronHeatMaterial(look.accents.primary, CHEVRON_INTENSITY, reducedMotion), transforms: along(INSTANCE_COUNTS.chevA, 10.72, 0.72, WALL_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.chevA)),
    instances.box({ name: IDS.chevB, size: [0.22, 0.36, 9.6], material: chevronHeatMaterial(look.accents.secondary, CHEVRON_INTENSITY, reducedMotion), transforms: along(INSTANCE_COUNTS.chevB, -10.72, 0.72, WALL_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.chevB)),
    // HS-15: molten slag gutters at the foot of both walls and the pool under the lava curtain, one instanced draw.
    instances.box({ name: IDS.gutters, size: GUTTER.size, material: moltenMaterial({ ...look.molten, reducedMotion }), transforms: along(INSTANCE_COUNTS.gutters, GUTTER.lateral, GUTTER.y, WALL_SPACING / 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.gutters)),
    instances.box({ name: IDS.bolts, size: [0.14, 0.14, 2.8], material: emissive("#ff4d1f", 2.6), transforms: along(INSTANCE_COUNTS.bolts, 0, 1.4, 20), ...unshadowed })
      .runtime(game.runtimeNode(IDS.bolts))
  ]);

  // Shockwave ring and the two missiles (the player's and an incoming one).
  s.addMany([
    primitives.torus({ name: IDS.ring, size: [2.2, 2.2, 0.14], material: emissive("#35d6ff", 2.4), castShadow: false })
      .position(0, -60, 0).rotate(Math.PI * 0.5, 0, 0).runtime(game.runtimeNode(IDS.ring)),
    primitives.cylinder({ name: IDS.missile, size: [0.26, 1.9, 0.26], material: emissive("#ff4d1f", 2.4), castShadow: false })
      .position(0, -60, 0).rotate(Math.PI * 0.5, 0, 0).runtime(game.runtimeNode(IDS.missile)),
    primitives.cylinder({ name: IDS.incoming, size: [0.3, 2.1, 0.3], material: emissive("#ff2952", 2.6), castShadow: false })
      .position(0, -60, 0).rotate(Math.PI * 0.5, 0, 0).runtime(game.runtimeNode(IDS.incoming))
  ]);

  // 1-7: the drones (one is the player, six stand in for the drawn rivals). HS-10 interim: each grey GLB is tinted
  // (multiply, textures kept) towards its DRONE_SPECS colour under a clearcoat lacquer until the wp36 livery retextures
  // (with emissive nozzles) are admitted.
  for (const id of DRONE_ORDER) {
    const spec = DRONE_SPECS[id];
    s.add(
      model(asset(spec.assetKey), { name: spec.nodeId, role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: spec.maxDim, materialOverrides: [droneLivery(spec.color)] })
        .position(0, 1.45, id === "orion" ? -0.4 : -24)
        .runtime(game.runtimeNode(spec.nodeId, id === "orion" ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined))
    );
  }
  // 8: the dropped proximity mine (hidden until deployed).
  s.add(
    model(assets.heatsinkWeaponMine, { name: IDS.mine, role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.45 })
      .position(0, 0.35, -28).runtime(game.runtimeNode(IDS.mine))
  );
  // 9-30: track-side anchors, the shockwave pylon included. HS-20: far towers and emissive pieces cast no shadow (each
  // caster is drawn once per cascade, three cascades since HS-01); arches, gantry, tunnels and overpass keep theirs.
  for (const anchor of SCENERY_ANCHORS) {
    s.add(
      model(asset(anchor.assetKey), { name: anchor.id, role: "setDressing", scaleMode: "fit", targetMaxDimension: anchor.maxDim, ...(UNSHADOWED_ANCHOR_ASSETS.has(anchor.assetKey) ? { castShadow: false } : {}) })
        .position(anchor.lateralX, anchor.baseY, -anchor.s).rotate(0, anchor.yaw, 0).runtime(game.runtimeNode(anchor.id))
    );
  }
  return s;
}

/** sRGB mix of a hex colour towards white (keeps the hue, lifts the value so a multiply tint keeps texture detail). */
export function liftTowardsWhite(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** HS-10 interim livery: DRONE_SPECS colour (lifted 30% towards white) multiplied over the authored maps, lacquered. */
export function droneLivery(color: string): AuraModelMaterialOverride {
  return { color: liftTowardsWhite(color, 0.3), colorMode: "multiply", clearcoat: 0.65, clearcoatRoughness: 0.16 };
}

/** HS-20: anchors drawn without a shadow caster (far side towers, emissive holo, checkpoint ring and lava curtain). */
export const UNSHADOWED_ANCHOR_ASSETS: ReadonlySet<string> = new Set([
  "heatsinkTowerL",
  "heatsinkTowerT",
  "heatsinkTowerX",
  "heatsinkHoloBillboard",
  "heatsinkCheckpointRing",
  "heatsinkLavaFall"
]);

/** Model nodes in the scene (route-health budget: 32). */
export const MODEL_NODE_COUNT = DRONE_ORDER.length + 1 + SCENERY_ANCHORS.length;
