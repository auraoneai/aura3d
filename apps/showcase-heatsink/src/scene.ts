/**
 * Thermal Drift scene: the night-city look, the instanced road, walls, rain and bolts, and the 30 model nodes.
 *
 * C12: the game used the daytime `outdoor-day` look (an HDRI and a shadowed key) and then added its own shadowed sun,
 * a second bloom and colour grade (never used, the compiler takes the first) and a hemisphere light the shader drops
 * next to an environment (LIGHT-05). It now uses `night-city` alone for key, fill, grade, AO and bloom, keeps one
 * shadowed light (the look's key), adds only a vignette, a light fog and two unshadowed accent lights, and recolours
 * the sky band, backdrop, floor and accents per circuit (applyCircuitLook).
 * C13: about 150 repeated primitives become 9 instanced nodes; emissive decor casts no shadow.
 * C4: a light fog hides the far end of the scenery window.
 */
import { camera, effects, instances, lights, looks, material, model, primitives, scene, game, type AuraAssetRef } from "@aura3d/engine";
import { assets } from "./aura-assets";
import { DRONE_ORDER, DRONE_SPECS, SCENERY_ANCHORS, type CircuitSpec } from "./data";
import { LASER_BOLTS } from "./sim";

export const ROAD_TILE_COUNT = 16;
export const ROAD_TILE_SPACING = 12;
/** Tiles overlap so the outer edge of a bend never opens a gap between rotated tiles. */
export const ROAD_TILE_LENGTH = ROAD_TILE_SPACING + 1.1;
export const WALL_SEGMENT_COUNT = 14;
export const WALL_SPACING = 13.5;
export const RAIN_STREAK_COUNT = 18;
/** Default exposure for the night look, chosen from the calibration captures (evidence/thermal-drift/audit-fix). */
export const NIGHT_EXPOSURE_EV = 0.4;
export const FOG_COLOR = "#121826";

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
  backdrop: "sky-backdrop",
  bandA: "horizon-band-a",
  bandB: "horizon-band-b",
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
  /** QA: drop the look's ambient-occlusion pass (`?qaAo=off`) for the LIGHT-06 on/off pair. */
  readonly ambientOcclusion?: boolean;
}

export function buildThermalDriftScene(options: SceneOptions) {
  const circuit = options.circuit;
  const overrides = { exposureEv: options.exposureEv ?? NIGHT_EXPOSURE_EV, fogDensityScale: 0, accent: circuit.accentColor };
  const look = options.ambientOcclusion === false
    ? looks.nodes("night-city", overrides).filter((n) => !/ambient occlusion/i.test(String((n.toJSON() as { name?: string }).name ?? "")))
    : [looks.preset("night-city", overrides)];
  const s = scene()
    .addMany(look)
    .background(circuit.skyColor)
    .camera(camera.perspective({ fov: 68, near: 0.25, far: 650, position: [0, 4.2, 9.5], target: [0, 1.8, -18] }))
    .addMany([
      // Two unshadowed accent lights over the road; the look's key is the one shadowed light.
      lights.point({ color: "#ff7a1f", intensity: 1.8, position: [0, 6, -10], distance: 75 }),
      lights.point({ color: "#35d6ff", intensity: 1.5, position: [0, 8, -32], distance: 85 }),
      effects.vignette({ intensity: 0.22, smoothness: 0.65 }),
      effects.fog({ color: FOG_COLOR, density: 0.008, intensity: 0.6 })
    ]);

  // Sky: a backdrop wall in the circuit's sky colour with two emissive horizon bands in front of it.
  s.addMany([
    primitives.box({ name: IDS.backdrop, size: [1100, 260, 2], material: emissive(circuit.skyColor, 0.6), castShadow: false, receiveShadow: false })
      .position(0, 70, -300).runtime(game.runtimeNode(IDS.backdrop)),
    primitives.box({ name: IDS.floor, size: [520, 0.5, 460], material: material.pbr({ color: circuit.fogTint, roughness: 0.92, metalness: 0.12 }), castShadow: false })
      .position(0, -8.5, -150).runtime(game.runtimeNode(IDS.floor)),
    primitives.box({ name: IDS.bandA, size: [520, 26, 2], material: emissive(circuit.accentColor, 0.75), castShadow: false, receiveShadow: false })
      .position(0, 18, -260).runtime(game.runtimeNode(IDS.bandA)),
    primitives.box({ name: IDS.bandB, size: [520, 10, 2], material: emissive(circuit.horizonColor, 0.65), castShadow: false, receiveShadow: false })
      .position(0, 6, -257).runtime(game.runtimeNode(IDS.bandB))
  ]);

  // Road, lanes, walls and chevrons: one instanced node per material.
  const unshadowed = { castShadow: false, frustumCulled: false } as const;
  s.addMany([
    instances.box({ name: IDS.deckEven, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: material.pbr({ color: "#171c26", roughness: 0.34, metalness: 0.42 }), transforms: along(INSTANCE_COUNTS.deckEven, 0, -0.18, ROAD_TILE_SPACING * 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.deckEven)),
    instances.box({ name: IDS.deckOdd, size: [22.4, 0.36, ROAD_TILE_LENGTH], material: material.pbr({ color: "#141922", roughness: 0.38, metalness: 0.36 }), transforms: along(INSTANCE_COUNTS.deckOdd, 0, -0.186, ROAD_TILE_SPACING * 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.deckOdd)),
    instances.box({ name: IDS.spineA, size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58], material: spineMaterial(circuit.horizonColor), transforms: along(INSTANCE_COUNTS.spineA, 0, 0.03, ROAD_TILE_SPACING * 3), ...unshadowed })
      .runtime(game.runtimeNode(IDS.spineA)),
    instances.box({ name: IDS.spineB, size: [0.42, 0.05, ROAD_TILE_SPACING * 0.58], material: spineMaterial(circuit.accentColor), transforms: along(INSTANCE_COUNTS.spineB, 0, 0.03, ROAD_TILE_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.spineB)),
    instances.box({ name: IDS.lanes, size: [0.18, 0.04, ROAD_TILE_SPACING * 0.45], material: emissive("#94a3b8", 0.45), transforms: along(INSTANCE_COUNTS.lanes, 5.2, 0.025, ROAD_TILE_SPACING / 2), ...unshadowed })
      .runtime(game.runtimeNode(IDS.lanes)),
    instances.box({ name: IDS.walls, size: [0.95, 1.35, 12.8], material: material.pbr({ color: "#232936", roughness: 0.52, metalness: 0.45 }), transforms: along(INSTANCE_COUNTS.walls, 11.3, 0.55, WALL_SPACING / 2), frustumCulled: false })
      .runtime(game.runtimeNode(IDS.walls)),
    instances.box({ name: IDS.chevA, size: [0.22, 0.36, 9.6], material: chevronMaterial(circuit.accentColor), transforms: along(INSTANCE_COUNTS.chevA, 10.72, 0.72, WALL_SPACING), ...unshadowed })
      .runtime(game.runtimeNode(IDS.chevA)),
    instances.box({ name: IDS.chevB, size: [0.22, 0.36, 9.6], material: chevronMaterial(circuit.horizonColor), transforms: along(INSTANCE_COUNTS.chevB, -10.72, 0.72, WALL_SPACING), ...unshadowed })
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
