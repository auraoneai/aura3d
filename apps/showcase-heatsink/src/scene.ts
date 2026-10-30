/**
 * Thermal Drift scene: the per-circuit foundry rig, the instanced road, walls, rain and bolts, and the 30 model nodes.
 *
 * GU47 WP-13 (look table: look.ts; art direction: ../art/direction.ts):
 * HS-01: a per-circuit rig replaces the `night-city` look: one PCSS 3-cascade key (the only shadowed light), an
 *   unshadowed coolant counter-rim, the VESPER vent up-fill and an explicit AO node; the two point lights are gone.
 * HS-03: the circuit HDRI is the sky (background on) and the image-based fill; the backdrop wall and the two emissive
 *   horizon bands are gone. A circuit change remounts the scene (main.ts), so every per-circuit node is authored here.
 * HS-05: per-circuit exponential fog; DUSTFALL adds a volumetric inscatter with god rays from its 9-degree sun.
 * HS-12: per-circuit post: warm bloom, grade (with the exposure), vignette, grain on MEGACITY only.
 * C13: about 150 repeated primitives become 9 instanced nodes; emissive decor casts no shadow.
 */
import { camera, effects, environments, instances, lights, material, model, primitives, scene, game, type AuraAssetRef, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { assets, HDRI_BY_ID } from "./aura-assets";
import { DRONE_ORDER, DRONE_SPECS, SCENERY_ANCHORS, type CircuitSpec } from "./data";
import { CIRCUIT_LOOKS, rimPosition, sunPosition, type CircuitLook } from "./look";
import { LASER_BOLTS } from "./sim";
import { skylineNodes } from "./skyline";

export const ROAD_TILE_COUNT = 16;
export const ROAD_TILE_SPACING = 12;
/** Tiles overlap so the outer edge of a bend never opens a gap between rotated tiles. */
export const ROAD_TILE_LENGTH = ROAD_TILE_SPACING + 1.1;
export const WALL_SEGMENT_COUNT = 14;
export const WALL_SPACING = 13.5;
export const RAIN_STREAK_COUNT = 18;

/** Runtime ids of the rig nodes E-B drives at runtime (sector cross-fades, HS-16). */
export const RIG_IDS = {
  key: "td-key-light",
  rim: "td-rim-light",
  upFill: "td-vent-up-fill",
  sky: "td-sky"
} as const;
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
  rain: "rain-streaks",
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
  rain: RAIN_STREAK_COUNT,
  bolts: LASER_BOLTS
} as const;

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
export const chevronMaterial = (color: string) => emissive(color, 1.65);

export interface SceneOptions {
  readonly circuit: CircuitSpec;
  /** QA: exposure override for calibration (`?qaEv=`). */
  readonly exposureEv?: number;
  /** QA: drop the explicit ambient-occlusion pass (`?qaAo=off`) for the LIGHT-06 on/off pair. */
  readonly ambientOcclusion?: boolean;
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
      tint: look.grade.tint
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
  const s = scene()
    .background(look.fog.color)
    .camera(camera.perspective({ fov: 68, near: 0.25, far: 650, position: [0, 4.2, 9.5], target: [0, 1.8, -18] }))
    .add(circuitSky(look))
    .addMany(circuitLights(look))
    .addMany(circuitPost(look, {
      ...(options.exposureEv !== undefined ? { exposureEv: options.exposureEv } : {}),
      ...(options.ambientOcclusion === false ? { ambientOcclusion: false } : {})
    }));

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
    instances.box({ name: IDS.deckEven, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: material.pbr({ color: "#171c26", roughness: 0.34, metalness: 0.42 }), transforms: along(INSTANCE_COUNTS.deckEven, 0, -0.18, ROAD_TILE_SPACING * 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.deckEven)),
    instances.box({ name: IDS.deckOdd, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: material.pbr({ color: "#141922", roughness: 0.38, metalness: 0.36 }), transforms: along(INSTANCE_COUNTS.deckOdd, 0, -0.186, ROAD_TILE_SPACING * 2), frustumCulled: false })
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
    instances.box({ name: IDS.chevA, size: [0.22, 0.36, 9.6], material: chevronMaterial(look.accents.primary), transforms: along(INSTANCE_COUNTS.chevA, 10.72, 0.72, WALL_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.chevA)),
    instances.box({ name: IDS.chevB, size: [0.22, 0.36, 9.6], material: chevronMaterial(look.accents.secondary), transforms: along(INSTANCE_COUNTS.chevB, -10.72, 0.72, WALL_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.chevB)),
    instances.box({ name: IDS.rain, size: [0.03, 1.35, 0.03], material: emissive("#60a5fa", 0.55), transforms: along(INSTANCE_COUNTS.rain, 0, 4, 4), ...unshadowed })
      .runtime(game.runtimeNode(IDS.rain)),
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

  // 1-7: the drones (one is the player, six stand in for the drawn rivals).
  for (const id of DRONE_ORDER) {
    const spec = DRONE_SPECS[id];
    s.add(
      model(asset(spec.assetKey), { name: spec.nodeId, role: "primaryVehicle", scaleMode: "fit", targetMaxDimension: spec.maxDim })
        .position(0, 1.45, id === "orion" ? -0.4 : -24)
        .runtime(game.runtimeNode(spec.nodeId, id === "orion" ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined))
    );
  }
  // 8: the dropped proximity mine (hidden until deployed).
  s.add(
    model(assets.heatsinkWeaponMine, { name: IDS.mine, role: "setDressing", scaleMode: "fit", targetMaxDimension: 1.45 })
      .position(0, 0.35, -28).runtime(game.runtimeNode(IDS.mine))
  );
  // 9-30: track-side anchors, the shockwave pylon included.
  for (const anchor of SCENERY_ANCHORS) {
    s.add(
      model(asset(anchor.assetKey), { name: anchor.id, role: "setDressing", scaleMode: "fit", targetMaxDimension: anchor.maxDim })
        .position(anchor.lateralX, anchor.baseY, -anchor.s).rotate(0, anchor.yaw, 0).runtime(game.runtimeNode(anchor.id))
    );
  }
  return s;
}

/** Model nodes in the scene (route-health budget: 32). */
export const MODEL_NODE_COUNT = DRONE_ORDER.length + 1 + SCENERY_ANCHORS.length;
