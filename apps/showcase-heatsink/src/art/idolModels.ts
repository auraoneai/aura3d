/**
 * Idol wow pass (Nov 2026): high-detail image-to-3D GLBs (speridlabs/idol/max on fal.ai, tools/idol/specs/heatsink.json)
 * replace the procedural drones, foundry landmarks, track hazards and pickups players see most. Render layer only: every
 * node keeps its runtime id, anchor pivot (ground at y = 0), footprint (`maxDim`) and the game's -Z forward axis, so the
 * frozen simulation, collision and camera rigs are untouched. Each GLB is normalised to metres, grounded and facing +Z, so
 * drones turn half a revolution to face the game's -Z nose. Lava curtain, coolant spillway, overpass, road arches, tunnel portals, the T/L crane towers, holo
 * billboards, boost pads, missiles and VFX stay procedural (emissive/animated gameplay surfaces). A key that is not admitted
 * falls back to its procedural builder.
 */
import {
  game,
  geometry,
  group,
  instances,
  material,
  model,
  type AuraCustomGeometrySpec,
  type AuraModelMaterialOverride,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import { assets } from "../aura-assets.route";
import type { DroneId, DroneSpec, SceneryAnchor } from "../data";
import { mergeRawMeshes, tubeSweepMesh, type V4 } from "../../../showcase-port-shared/proceduralKernel";

/**
 * Literal references, so `aura3d assets typegen --route apps/showcase-heatsink` emits exactly these GLBs into
 * src/aura-assets.route.ts (the route never loads the 2.6 MB repository-wide catalogue).
 */
const IDOL = {
  tdDroneOrion: assets.tdDroneOrion,
  tdDroneVolt: assets.tdDroneVolt,
  tdDroneBastion: assets.tdDroneBastion,
  tdDroneSpectre: assets.tdDroneSpectre,
  tdDroneRazor: assets.tdDroneRazor,
  tdDroneNighthawk: assets.tdDroneNighthawk,
  tdDroneWraith: assets.tdDroneWraith,
  tdCoolingTower: assets.tdCoolingTower,
  tdSmokestacks: assets.tdSmokestacks,
  tdWaterTower: assets.tdWaterTower,
  tdLadleCrane: assets.tdLadleCrane,
  tdReactorRing: assets.tdReactorRing,
  tdGantryStart: assets.tdGantryStart,
  tdBarrier: assets.tdBarrier,
  tdExplosiveBarrel: assets.tdExplosiveBarrel,
  tdCoolantCell: assets.tdCoolantCell,
  tdShieldPickup: assets.tdShieldPickup,
  tdShockwavePylon: assets.tdShockwavePylon,
  tdMine: assets.tdMine
} as const;
type IdolKey = keyof typeof IDOL;
type ModelRef = Parameters<typeof model>[0];

/** The Idol GLB for `key` (undefined would keep the procedural builder; every key above is admitted). */
export function idolAsset(key: IdolKey): ModelRef | undefined {
  return IDOL[key] as ModelRef | undefined;
}
const ref = (key: IdolKey): ModelRef => {
  const asset = idolAsset(key);
  if (!asset) throw new Error(`thermal-drift: Idol model ${key} is not admitted`);
  return asset;
};

export const IDOL_DRONE_KEYS: Readonly<Record<DroneId, IdolKey>> = {
  orion: "tdDroneOrion",
  volt: "tdDroneVolt",
  bastion: "tdDroneBastion",
  spectre: "tdDroneSpectre",
  razor: "tdDroneRazor",
  nighthawk: "tdDroneNighthawk",
  wraith: "tdDroneWraith"
};

/**
 * Drone-local metres from the hover centre (the node origin) to the Idol hull's belly; the procedural sculpts reach
 * 0.26-0.49 m below the hover centre, so the GLB's grounded base sits at the same depth.
 */
export const IDOL_DRONE_BELLY_Y = -0.3;

/**
 * Twin tail nozzles of each Idol hull in drone-local metres (x lateral, y up from the hover centre, z = +back), measured
 * from the GLB vertices (rear-most 10% of the hull within the central 44% of its width; tools: nozzles.py in the Idol pass
 * notes). Bastion has no open nozzles, so its plumes leave the rear armour at mid-body height.
 */
export const IDOL_NOZZLES: Readonly<Record<DroneId, { readonly lateral: number; readonly y: number; readonly back: number }>> = {
  orion: { lateral: 0.37, y: 0.26, back: 1.86 },
  volt: { lateral: 0.26, y: 0.75, back: 1.76 },
  bastion: { lateral: 0.3, y: 0.7, back: 2.0 },
  spectre: { lateral: 0.38, y: 0.16, back: 1.77 },
  razor: { lateral: 0.17, y: -0.03, back: 1.88 },
  nighthawk: { lateral: 0.54, y: 0.15, back: 1.89 },
  wraith: { lateral: 0.14, y: -0.01, back: 1.61 }
};

/**
 * The four bladed lift-fan ducts of each Idol hull (drone-local metres: `lateral` either side, `fore` towards the -Z nose,
 * `aft` towards the tail, `y` just under the duct lip, `radius` of the throat), measured from the GLB vertices per corner
 * quadrant and averaged left/right. The procedural rotor-blur discs spin inside them (main.ts), so the fans move again.
 */
export const IDOL_FANS: Readonly<Record<DroneId, { readonly lateral: number; readonly fore: number; readonly aft: number; readonly y: number; readonly radius: number }>> = {
  orion: { lateral: 1.12, fore: 0.67, aft: 0.58, y: 0.07, radius: 0.24 },
  volt: { lateral: 1.37, fore: 0.95, aft: 1.06, y: 0.5, radius: 0.3 },
  bastion: { lateral: 1.58, fore: 1.41, aft: 1.4, y: 1.09, radius: 0.36 },
  spectre: { lateral: 1.43, fore: 1.22, aft: 1.2, y: -0.01, radius: 0.28 },
  razor: { lateral: 1.17, fore: 1.16, aft: 1.31, y: 0.0, radius: 0.27 },
  nighthawk: { lateral: 1.44, fore: 1.04, aft: 1.26, y: 0.11, radius: 0.3 },
  wraith: { lateral: 1.19, fore: 1.48, aft: 1.41, y: -0.05, radius: 0.25 }
};

/** Fan spin (radians) at `seconds` for corner `corner` (0..3): about 7.6 rev/s, neighbouring fans counter-rotate. */
export function fanSpinAngle(seconds: number, corner: number): number {
  return seconds * 48 * (corner % 2 === 0 ? 1 : -1) + corner * 0.785;
}

/** Runtime id of the empty child node at a drone's nozzle pair (the attached exhaust emitter follows it). */
export const exhaustNodeId = (spec: DroneSpec): string => `${spec.nodeId}-exhaust`;

/** Track-side anchor asset key -> Idol GLB (anchors not listed keep their procedural builder). */
export const IDOL_SCENERY_KEYS: Readonly<Partial<Record<string, { readonly key: IdolKey; readonly yaw?: number }>>> = {
  heatsinkGantryStart: { key: "tdGantryStart" },
  heatsink_thermalLadleCrane: { key: "tdLadleCrane" },
  // heatsink_thermalTowerTIron and the batched L towers stay procedural: both Idol crane towers came back with floating jib debris.
  heatsink_thermalCoolingTower: { key: "tdCoolingTower" },
  heatsink_thermalSmokestacks: { key: "tdSmokestacks" },
  heatsink_thermalWaterTower: { key: "tdWaterTower" },
  heatsink_thermalReactorRing: { key: "tdReactorRing" },
  // Normalised with its long side along Z (yawDeg 45 in the spec), like the procedural 1.2 x 1.35 x 3.8 m barrier.
  heatsinkBarrierA: { key: "tdBarrier" },
  heatsinkExplosiveBarrel: { key: "tdExplosiveBarrel" },
  heatsinkCoolingCanister: { key: "tdCoolantCell" },
  heatsinkShieldPickup: { key: "tdShieldPickup" },
  heatsinkWeaponShockwave: { key: "tdShockwavePylon" }
};

/** Batched (instanced) anchors -> Idol GLB (`instances.model`); instance matrices are still written by main.ts's InstanceWriter. */
export const IDOL_BATCH_KEYS: Readonly<Partial<Record<string, IdolKey>>> = {
  // heatsink_thermalArchIron stays procedural: the Idol arch came back as a deep vault with smeared geometry in its opening.
  // heatsinkTunnelFrame stays procedural: the Idol portal came back as a 36 m-deep roofed tunnel, not a portal frame.
};

/** Aura3D 5.7.1 clearcoat drone hull finish: dielectric lacquer + warm foundry rim so hulls gleam cleanly in wet/night IBL. */
function droneClearcoatOverride(isPlayer: boolean): readonly AuraModelMaterialOverride[] {
  return [
    {
      metallic: isPlayer ? 0.16 : 0.12,
      roughness: 0.24,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: isPlayer ? 1.85 : 1.55,
      rim: { color: "#ff8a1f", power: 2.6, intensity: isPlayer ? 1.45 : 0.9 }
    }
  ];
}

const NACELLE_RING_MAT = material.emissive({
  name: "td drone nacelle ring",
  color: "#ff9b3d",
  emissive: "#ff8a1f",
  emissiveIntensity: 3.8,
  roughness: 0.14,
  practical: true
});

const NACELLE_RING_SPECS = new Map<DroneId, AuraCustomGeometrySpec>();

/** Twin HDR emissive tail nacelle rings seated at each drone's measured `IDOL_NOZZLES` sockets. */
function buildDroneNacelleRingsSpec(id: DroneId): AuraCustomGeometrySpec {
  const cached = NACELLE_RING_SPECS.get(id);
  if (cached) return cached;
  const n = IDOL_NOZZLES[id];
  const r = id === "bastion" ? 0.19 : 0.145;
  const tube = 0.028;
  const rings = [-1, 1].map((side) => {
    const cx = side * n.lateral;
    const pts: V4[] = [];
    for (let i = 0; i <= 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, n.y + Math.sin(a) * r, n.back - 0.06, tube]);
    }
    return tubeSweepMesh(pts, 6, false);
  });
  const spec = mergeRawMeshes(rings);
  NACELLE_RING_SPECS.set(id, spec);
  return spec;
}

export function buildIdolDroneNode(id: DroneId, spec: DroneSpec): AuraNodeBuilder<AuraSceneNode> {
  const isPlayer = id === "orion";
  return group(
    spec.nodeId,
    [
      model(ref(IDOL_DRONE_KEYS[id]), {
        name: `${spec.nodeId}-hull`,
        scaleMode: "world",
        role: isPlayer ? "primaryCharacter" : "setDressing",
        materialOverrides: droneClearcoatOverride(isPlayer),
        castShadow: isPlayer,
        receiveShadow: true
      })
        .position(0, IDOL_DRONE_BELLY_Y, 0)
        .rotate(0, Math.PI, 0),
      geometry.custom(buildDroneNacelleRingsSpec(id), {
        name: `${spec.nodeId}-nacelle-rings`,
        material: NACELLE_RING_MAT,
        castShadow: false,
        receiveShadow: false
      }),
      group(exhaustNodeId(spec), [], { position: [0, IDOL_NOZZLES[id].y, IDOL_NOZZLES[id].back] }).runtime(game.runtimeNode(exhaustNodeId(spec)))
    ],
    { position: [0, 1.45, isPlayer ? -0.4 : -24] }
  ).runtime(game.runtimeNode(spec.nodeId, isPlayer ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined)) as AuraNodeBuilder<AuraSceneNode>;
}

export function hasIdolScenery(anchor: SceneryAnchor): boolean {
  const entry = IDOL_SCENERY_KEYS[anchor.assetKey];
  return entry !== undefined && idolAsset(entry.key) !== undefined;
}

export function buildIdolSceneryNode(anchor: SceneryAnchor, castShadow: boolean): AuraNodeBuilder<AuraSceneNode> {
  const entry = IDOL_SCENERY_KEYS[anchor.assetKey];
  if (!entry) throw new Error(`thermal-drift: no Idol model for ${anchor.assetKey}`);
  const child = model(ref(entry.key), { name: `${anchor.id}-idol`, scaleMode: "world", role: "setDressing", castShadow, receiveShadow: true });
  return group(anchor.id, [entry.yaw ? child.rotate(0, entry.yaw, 0) : child], {
    position: [anchor.lateralX, anchor.baseY, -anchor.s],
    rotation: [0, anchor.yaw, 0]
  }).runtime(game.runtimeNode(anchor.id)) as AuraNodeBuilder<AuraSceneNode>;
}

export function buildIdolBatchedSceneryNode(batch: {
  readonly id: string;
  readonly assetKey: string;
  readonly baseMaxDim: number;
  readonly castShadow: boolean;
  readonly anchors: readonly SceneryAnchor[];
}): AuraNodeBuilder<AuraSceneNode> | null {
  const key = IDOL_BATCH_KEYS[batch.assetKey];
  if (!key || !idolAsset(key)) return null;
  const transforms: AuraTransformSpec[] = batch.anchors.map((anchor) => {
    const u = Math.max(0.01, anchor.maxDim / batch.baseMaxDim);
    return { position: [anchor.lateralX, anchor.baseY, -anchor.s], rotation: [0, anchor.yaw, 0], scale: [u, u, u] };
  });
  return instances
    .model(ref(key), {
      name: batch.id,
      scaleMode: "world",
      role: "setDressing",
      transforms,
      castShadow: batch.castShadow,
      receiveShadow: true
    })
    .runtime(game.runtimeNode(batch.id)) as AuraNodeBuilder<AuraSceneNode>;
}

/** Proximity mine (1.45 m across, grounded), parked where the procedural mine started; null until the GLB is admitted. */
export function buildIdolMineNode(id: string): AuraNodeBuilder<AuraSceneNode> | null {
  if (!idolAsset("tdMine")) return null;
  return group(id, [model(ref("tdMine"), { name: `${id}-idol`, scaleMode: "world", role: "setDressing", castShadow: false, receiveShadow: true })], {
    position: [0, 0.35, -28]
  }).runtime(game.runtimeNode(id)) as AuraNodeBuilder<AuraSceneNode>;
}
