import { group, instances, material, model, primitives, type AuraRuntimeNodeHandle, type AuraTransformSpec } from "@aura3d/engine";

type AnimationPose = NonNullable<Parameters<AuraRuntimeNodeHandle["setAnimationPose"]>[0]>;
import { assets } from "../aura-assets.route";
import type { GridAssetKey } from "../aura-assets";
import type { PlayableCarId } from "../rules";

/**
 * Idol wow pass (2026-11): the cars, the cable car and the kerbside commuter players see most are image-to-3D GLBs
 * generated with `tools/idol/specs/teleoperator.json` (speridlabs/idol/max on fal.ai) and admitted to the root manifest.
 * Render layer only: every model is fitted to the exact box of the procedural builder it replaces (`proceduralModels.ts`),
 * so collision, camera rigs, the roof LiDAR crown and the rear lamp overlays keep their anchors.
 *
 * Idol GLBs face +Z, grounded at y = 0, centred on x/z. Grid Dispatch vehicles face -Z (headlamps at -halfL), so each
 * model sits in a runtime group (the group keeps the runtime id the game moves) turned by PI inside it.
 */
type GroupNodeBuilder = ReturnType<typeof group>;
type V3 = readonly [number, number, number];
type ModelAsset = Parameters<typeof model>[0] & { readonly bounds?: readonly number[] };

/** Procedural builder boxes [width x, height y, length z] measured from `proceduralModels.ts` (tests/unit/teleoperator). */
export const IDOL_FIT_BOXES = {
  cruiser: [1.94, 1.86, 3.97],
  coupe: [2.08, 1.83, 3.99],
  truck: [2.29, 2.23, 5.63],
  gt: [2.18, 1.29, 4.66],
  interceptor: [2.07, 1.28, 4.56],
  shuttle: [1.9, 2.7, 3.9],
  champagne: [2.18, 1.29, 4.02],
  response: [2.07, 1.79, 4.56],
  cableCar: [2.8, 3.46, 8.16],
  amber: [2.18, 1.29, 4.66],
  sedan: [1.92, 1.5, 4.69],
  hatchback: [1.92, 1.56, 3.85],
  bus: [2.23, 2.74, 4.69],
  boxTruck: [2.48, 3.36, 7.53],
  pickup: [2.06, 1.82, 5.19],
  coupeTraffic: [1.92, 1.4, 4.53],
  parkedSedan: [1.89, 1.46, 4.7],
  parkedHatch: [1.89, 1.52, 3.86]
} as const satisfies Record<string, V3>;
export type IdolFitBox = keyof typeof IDOL_FIT_BOXES;

/**
 * Per-axis correction on top of the length fit. Idol rebuilds a 30-degree reference with the width under-estimated (the
 * depth it cannot see), so width may grow up to +40 % towards the procedural box; height follows within +-12 % so the
 * silhouette stays the model's own.
 */
export const IDOL_FIT_WIDTH_RANGE = [0.88, 1.4] as const;
export const IDOL_FIT_HEIGHT_RANGE = [0.88, 1.12] as const;

/** Scale mapping the GLB's admitted bounds onto a procedural box (the PI turn keeps axes): length exact, width/height clamped. */
export function idolFitScale(asset: ModelAsset, box: V3): [number, number, number] {
  const b = asset.bounds;
  if (!b || b.length < 3 || !(b[0]! > 0 && b[1]! > 0 && b[2]! > 0)) return [1, 1, 1];
  const s = box[2] / b[2]!;
  const axis = (target: number, size: number, [lo, hi]: readonly [number, number]): number => s * Math.min(hi, Math.max(lo, target / (size * s)));
  return [axis(box[0], b[0]!, IDOL_FIT_WIDTH_RANGE), axis(box[1], b[1]!, IDOL_FIT_HEIGHT_RANGE), s];
}

/**
 * Blank rear plate over the characters Idol invented on a hatchback's plate (GLB space: plate centre height and the rear
 * face depth measured from the mesh, rear is -Z before the PI turn).
 */
interface IdolRearPlate { readonly y: number; readonly rearZ: number }
const PLATE_SIZE: V3 = [0.5, 0.13, 0.02];
const PLATE_MATERIAL = material.pbr({ name: "gd-blank-plate", color: "#d8dde3", roughness: 0.55, metalness: 0.1 });

/** Wheel-less Idol bodies (`gd*W`): the wheels are a separate spinning instanced pool (`wheels.ts`, `sf-wheels`). Parked cars keep their wheeled `gd*T` bodies (static). */
export type IdolBodyKey =
  | "gdCruiserPodW3" | "gdCrossoverAvW" | "gdHeavySemiW" | "gdGtCrimsonW" | "gdInterceptorCobaltW"
  | "gdShuttleW" | "gdGtChampagneW" | "gdResponseSuvW" | "gdCableCarW" | "gdGtAmberW"
  | "gdSedanSlateW" | "gdSedanPearlW" | "gdCoupeNavyW" | "gdTaxiCabW" | "gdHatchCoralW" | "gdHatchMintW"
  | "gdTransitBusW" | "gdPickupGraphiteW" | "gdPickupBronzeW" | "gdBoxTruckW";

const BODY_ASSET: Readonly<Record<IdolBodyKey, ModelAsset>> = {
  gdCruiserPodW3: assets.gdCruiserPodW3, gdCrossoverAvW: assets.gdCrossoverAvW, gdHeavySemiW: assets.gdHeavySemiW,
  gdGtCrimsonW: assets.gdGtCrimsonW, gdInterceptorCobaltW: assets.gdInterceptorCobaltW, gdShuttleW: assets.gdShuttleW,
  gdGtChampagneW: assets.gdGtChampagneW, gdResponseSuvW: assets.gdResponseSuvW, gdCableCarW: assets.gdCableCarW,
  gdGtAmberW: assets.gdGtAmberW, gdSedanSlateW: assets.gdSedanSlateW, gdSedanPearlW: assets.gdSedanPearlW,
  gdCoupeNavyW: assets.gdCoupeNavyW, gdTaxiCabW: assets.gdTaxiCabW, gdHatchCoralW: assets.gdHatchCoralW,
  gdHatchMintW: assets.gdHatchMintW, gdTransitBusW: assets.gdTransitBusW, gdPickupGraphiteW: assets.gdPickupGraphiteW,
  gdPickupBronzeW: assets.gdPickupBronzeW, gdBoxTruckW: assets.gdBoxTruckW
};

const BODY_BOX: Readonly<Record<IdolBodyKey, IdolFitBox>> = {
  gdCruiserPodW3: "cruiser", gdCrossoverAvW: "coupe", gdHeavySemiW: "truck", gdGtCrimsonW: "gt", gdInterceptorCobaltW: "interceptor",
  gdShuttleW: "shuttle", gdGtChampagneW: "champagne", gdResponseSuvW: "response", gdCableCarW: "cableCar", gdGtAmberW: "amber",
  gdSedanSlateW: "sedan", gdSedanPearlW: "sedan", gdCoupeNavyW: "coupeTraffic", gdTaxiCabW: "coupeTraffic", gdHatchCoralW: "hatchback",
  gdHatchMintW: "hatchback", gdTransitBusW: "bus", gdPickupGraphiteW: "pickup", gdPickupBronzeW: "pickup", gdBoxTruckW: "boxTruck"
};

/** Road-wheel radius (m) per procedural class, from the procedural `pushWheelSet` calls. */
const CLASS_WHEEL_RADIUS: Readonly<Record<IdolFitBox, number>> = {
  cruiser: 0.36, coupe: 0.37, truck: 0.5, gt: 0.36, interceptor: 0.36, shuttle: 0.34, champagne: 0.35, response: 0.38, cableCar: 0.3,
  amber: 0.36, sedan: 0.34, hatchback: 0.32, bus: 0.41, boxTruck: 0.46, pickup: 0.4, coupeTraffic: 0.34, parkedSedan: 0.33, parkedHatch: 0.33
};

/**
 * Wheel arches measured from each wheel-less body GLB (GLB space: +Z front, y up from the body's lowest point):
 * half width, arch centre z per axle (front first) and the arch crown height, measured once with an arch scan of the
 * lowest side vertices along z; tests/unit/teleoperator/idol-wheels.test.ts checks the hubs against the GLB bounds.
 */
export const IDOL_WHEEL_ARCHES: Readonly<Record<IdolBodyKey, { readonly halfW: number; readonly archZ: readonly number[]; readonly archTop: number }>> = {
  gdBoxTruckW: { halfW: 1.404, archZ: [2.544, -1.509], archTop: 0.672 },
  gdCableCarW: { halfW: 1.373, archZ: [2.6, -2.6], archTop: 0.0 },
  gdCoupeNavyW: { halfW: 0.878, archZ: [1.357, -1.3], archTop: 0.494 },
  gdCrossoverAvW: { halfW: 0.964, archZ: [1.145, -1.248], archTop: 0.604 },
  gdCruiserPodW3: { halfW: 0.688, archZ: [1.195, -0.996], archTop: 0.614 },
  gdGtAmberW: { halfW: 0.948, archZ: [1.339, -1.342], archTop: 0.558 },
  gdGtChampagneW: { halfW: 0.817, archZ: [1.155, -1.167], archTop: 0.488 },
  gdGtCrimsonW: { halfW: 0.951, archZ: [1.394, -1.33], archTop: 0.565 },
  gdHatchCoralW: { halfW: 0.747, archZ: [1.164, -1.255], archTop: 0.41 },
  gdHatchMintW: { halfW: 0.751, archZ: [1.243, -1.217], archTop: 0.425 },
  gdHeavySemiW: { halfW: 0.83, archZ: [1.894, -1.073, -2.179], archTop: 0.578 },
  gdInterceptorCobaltW: { halfW: 0.87, archZ: [1.303, -1.315], archTop: 0.55 },
  gdPickupBronzeW: { halfW: 0.923, archZ: [1.756, -1.557], archTop: 0.549 },
  gdPickupGraphiteW: { halfW: 0.994, archZ: [1.751, -1.558], archTop: 0.587 },
  gdResponseSuvW: { halfW: 0.8, archZ: [1.361, -1.262], archTop: 0.482 },
  gdSedanPearlW: { halfW: 0.859, archZ: [1.448, -1.235], archTop: 0.509 },
  gdSedanSlateW: { halfW: 0.784, archZ: [1.477, -1.229], archTop: 0.476 },
  gdShuttleW: { halfW: 0.673, archZ: [1.312, -1.212], archTop: 0.37 },
  gdTaxiCabW: { halfW: 0.838, archZ: [1.412, -1.184], archTop: 0.504 },
  gdTransitBusW: { halfW: 0.825, archZ: [1.523, -1.4], archTop: 0.455 }
};

export interface IdolWheelLayout {
  /** How far the body is raised so the wheels stand on the road (m). */
  readonly lift: number;
  readonly radius: number;
  readonly width: number;
  /** Hub centres in the vehicle group frame (front is -Z), front axle first. */
  readonly hubs: readonly V3[];
  /** Hub indices on the steering (front) axle. */
  readonly steer: readonly number[];
}

/** Per-axis fit scale of a body in its vehicle group. */
export function idolBodyFit(key: IdolBodyKey): [number, number, number] {
  return idolFitScale(BODY_ASSET[key], IDOL_FIT_BOXES[BODY_BOX[key]]);
}

/** Roof height of a body in its vehicle group: fitted GLB height + wheel lift. */
export function idolBodyTopY(key: IdolBodyKey): number {
  const b = BODY_ASSET[key].bounds;
  return (b && b.length >= 2 ? b[1]! * idolBodyFit(key)[1] : IDOL_FIT_BOXES[BODY_BOX[key]][1]) + idolWheelLayout(key).lift;
}

/** Wheel layout for one body in its vehicle group (after the length fit and the PI turn). */
export function idolWheelLayout(key: IdolBodyKey): IdolWheelLayout {
  const asset = BODY_ASSET[key], box = IDOL_FIT_BOXES[BODY_BOX[key]];
  const fit = idolFitScale(asset, box);
  const arch = IDOL_WHEEL_ARCHES[key];
  const cable = key === "gdCableCarW";
  const classR = CLASS_WHEEL_RADIUS[BODY_BOX[key]];
  const crown = arch.archTop * fit[1];
  // wheel top sits 4 cm under the arch crown with the body lifted by `lift`; lift stays in a believable band
  let radius = classR;
  let lift = 2 * radius + 0.04 - crown;
  if (lift < 0.06) { lift = 0.06; radius = (crown + lift - 0.04) / 2; }
  // a cable car rides its trucks under a flat floor, so it may sit higher than a road car
  const maxLift = cable ? 0.7 : 0.42;
  if (lift > maxLift) { lift = maxLift; radius = (crown + lift - 0.04) / 2; }
  const width = Math.min(0.42, radius * 0.66);
  const hx = cable ? 0.72 : Math.max(0.3, arch.halfW * fit[0] - width * 0.55);
  const hubs: V3[] = [];
  for (const z of arch.archZ) for (const sx of [-1, 1]) hubs.push([sx * hx, radius, -z * fit[2]]);
  return { lift, radius, width, hubs, steer: cable ? [] : [0, 1] };
}

function idolVehicleNode(
  name: string,
  key: IdolBodyKey,
  options: { readonly id?: string; readonly tags?: readonly string[]; readonly position?: V3; readonly scale?: number | V3; readonly castShadow?: boolean; readonly plate?: IdolRearPlate }
): GroupNodeBuilder {
  const asset = BODY_ASSET[key];
  const fit = idolFitScale(asset, IDOL_FIT_BOXES[BODY_BOX[key]]);
  const { lift } = idolWheelLayout(key);
  const body = model(asset, {
    name: `${name}-idol`,
    scaleMode: "world",
    role: "setDressing",
    castShadow: options.castShadow ?? true,
    receiveShadow: true,
    position: [0, lift, 0],
    rotation: [0, Math.PI, 0],
    scale: fit
  });
  const children: NonNullable<Parameters<typeof group>[1]>[number][] = [body];
  if (options.plate) {
    children.push(
      primitives.box({ name: `${name}-plate`, size: [...PLATE_SIZE] as [number, number, number], material: PLATE_MATERIAL, castShadow: false, receiveShadow: true })
        .position(0, lift + options.plate.y * fit[1], (-options.plate.rearZ + PLATE_SIZE[2] / 2) * fit[2])
    );
  }
  let root = group(name, children, {
    ...(options.position ? { position: [...options.position] as [number, number, number] } : {}),
    ...(options.scale !== undefined ? { scale: typeof options.scale === "number" ? options.scale : ([...options.scale] as [number, number, number]) } : {})
  });
  if (options.id) root = root.runtime({ id: options.id, ...(options.tags ? { tags: [...options.tags] } : {}) });
  return root;
}

export const PLAYER_BODY: Readonly<Record<PlayableCarId, IdolBodyKey>> = {
  // re-rolled (W3): the first wheel-less pod read as a crumpled tarp on its glass canopy in the real-GPU QA
  cruiser: "gdCruiserPodW3",
  coupe: "gdCrossoverAvW",
  truck: "gdHeavySemiW",
  gt: "gdGtCrimsonW",
  interceptor: "gdInterceptorCobaltW"
};

/** Playable fleet (`player-car-*`), same ids, tags, position and hide-scale contract as `buildPlayableFleetCarNode`. */
export function buildIdolPlayableCarNode(
  id: PlayableCarId,
  options: { readonly nodeId: string; readonly position: V3; readonly scale: number | V3; readonly tags?: readonly string[] }
): GroupNodeBuilder {
  return idolVehicleNode(options.nodeId, PLAYER_BODY[id], { id: options.nodeId, tags: options.tags, position: options.position, scale: options.scale });
}

/** AI rivals (`rival-car-0..4`): shuttle, champagne coupe, liveried response SUV, cable car, amber GT. */
export const RIVAL_BODY: readonly IdolBodyKey[] = ["gdShuttleW", "gdGtChampagneW", "gdResponseSuvW", "gdCableCarW", "gdGtAmberW"];

export function buildIdolRivalCarNode(rivalIndex: number, position: V3): GroupNodeBuilder {
  const id = `rival-car-${rivalIndex}`;
  return idolVehicleNode(id, RIVAL_BODY[rivalIndex] ?? RIVAL_BODY[0]!, { id, position, castShadow: false });
}

/** Body of avenue traffic slot `slotIndex` (same class and paint choice per slot as `buildAvenueTrafficCarNode`). */
export function trafficBody(slotIndex: number, asset: GridAssetKey): IdolBodyKey {
  if (asset === "gridVan") return "gdTransitBusW";
  if (asset === "gridBoxTruck") return "gdBoxTruckW";
  if (asset === "gridPickup") return slotIndex % 2 === 0 ? "gdPickupGraphiteW" : "gdPickupBronzeW";
  if (asset === "gridHatch") return slotIndex % 2 === 0 ? "gdHatchCoralW" : "gdHatchMintW";
  if (asset === "gridTaxi") return slotIndex === 1 ? "gdTaxiCabW" : "gdCoupeNavyW";
  return slotIndex === 0 ? "gdSedanSlateW" : "gdSedanPearlW";
}

/** Blank plates over Idol-invented plate characters, per body (GLB space). */
const BODY_PLATE: Partial<Record<IdolBodyKey, IdolRearPlate>> = {
  gdHatchCoralW: { y: 0.52, rearZ: -1.872 }
};

/** Avenue traffic (`traffic-0..9`). */
export function buildIdolTrafficCarNode(slotIndex: number, asset: GridAssetKey, position: V3): GroupNodeBuilder {
  const id = `traffic-${slotIndex}`;
  const key = trafficBody(slotIndex, asset);
  const plate = BODY_PLATE[key];
  return idolVehicleNode(id, key, { id, position, castShadow: false, ...(plate ? { plate } : {}) });
}

/** Yaw added to every parked-car instance: the procedural parked cars faced -Z, the Idol models face +Z. */
export const IDOL_PARKED_YAW = Math.PI;

/**
 * Parked cars on the cross streets as instanced Idol models (pearl sedan / white hatch tinted per instance by the
 * existing palette). Instance transforms carry the fit scale, so `parkedInstanceTransform` must be used at runtime.
 */
export function idolParkedAsset(poolIndex: number): { readonly asset: ModelAsset; readonly box: V3 } {
  return poolIndex === 0
    ? { asset: assets.gdSedanPearlT, box: IDOL_FIT_BOXES.parkedSedan }
    : { asset: assets.gdParkedHatchWhiteT, box: IDOL_FIT_BOXES.parkedHatch };
}

export function parkedInstanceTransform(poolIndex: number, position: V3, yaw: number): AuraTransformSpec {
  const { asset, box } = idolParkedAsset(poolIndex);
  return { position: [...position] as [number, number, number], rotation: [0, yaw + IDOL_PARKED_YAW, 0], scale: idolFitScale(asset, box) };
}

export function buildIdolParkedPool(poolIndex: number, count: number, colors: readonly string[], pool: (n: number) => AuraTransformSpec[]) {
  const { asset } = idolParkedAsset(poolIndex);
  return instances.model(asset, {
    name: `sf-parked-${poolIndex}`,
    scaleMode: "world",
    castShadow: false,
    receiveShadow: true,
    transforms: pool(count),
    colors: [...colors]
  });
}

/** Sidewalk slab top (sf-sidewalk-left/right: centre y 0.09, height 0.18; Grid Dispatch's avenue is flat). */
export const SIDEWALK_TOP_Y = 0.18;
/** Street-tree base: sunk 0.18 m into the sidewalk slab so the trunk flare never floats (within the 0.1-0.2 m rule). */
export const TREE_BASE_Y = SIDEWALK_TOP_Y - 0.18;

/** Idol plane tree: 5.6 m tall like the procedural trunk + crown; the canopy is narrowed so it stays over the sidewalk. */
export const IDOL_TREE_SCALE: V3 = [0.75, 1, 0.75];

export function buildIdolStreetTreePool(transforms: AuraTransformSpec[]) {
  return instances.model(assets.gdStreetTree, { name: "sf-tree-trunks", scaleMode: "world", castShadow: true, receiveShadow: true, transforms });
}

/** Ground-level tree instance with a per-tree yaw so the 12 copies do not read as clones. */
export function streetTreeInstanceTransform(position: V3, index: number): AuraTransformSpec {
  const jitter = 1 + ((index * 37) % 7) * 0.02;
  return { position: [...position] as [number, number, number], rotation: [0, (index * 2.399) % (Math.PI * 2), 0], scale: [IDOL_TREE_SCALE[0] * jitter, IDOL_TREE_SCALE[1] * jitter, IDOL_TREE_SCALE[2] * jitter] };
}

/**
 * Waterfront terminal and clock tower closing the avenue vista (`sf-ferry-clocktower`, procedural 94 m wide, tower 76.5 m).
 * The Idol model is 94 m wide with an 85 m tower and a deeper hall; 0.9 uniform keeps the tower at the procedural height.
 * Its landing piers face +Z (toward the camera); centred on the procedural origin the facade lands on the procedural
 * facade line (z ~ +16) and the hall stays in front of the bridge deck (z -47 relative).
 */
export function buildIdolFerryTerminalNode(position: V3): GroupNodeBuilder {
  const s = 0.9;
  return group("sf-ferry-clocktower", [
    model(assets.gdFerryTerminal, { name: "sf-ferry-clocktower-idol", scaleMode: "world", role: "setDressing", castShadow: false, receiveShadow: true, scale: [s, s, s] })
  ], { position: [...position] as [number, number, number] });
}

/**
 * Pyramid tower (`sf-pyramid-tower`, procedural 30.8 m footprint, 150 m tall). The Idol tower is 150 m tall on a 90 x 115 m
 * stepped podium; the footprint is pulled in to the procedural one so it clears the street-front blocks.
 */
export const IDOL_PYRAMID_FOOTPRINT_SCALE = 0.34;
export function buildIdolPyramidTowerNode(position: V3): GroupNodeBuilder {
  const f = IDOL_PYRAMID_FOOTPRINT_SCALE;
  return group("sf-pyramid-tower", [
    model(assets.gdPyramidTower, { name: "sf-pyramid-tower-idol", scaleMode: "world", role: "setDressing", castShadow: false, receiveShadow: true, scale: [f, 1, f] })
  ], { position: [...position] as [number, number, number] });
}

// ---------------------------------------------------------------------------------------------------------------------
// Kerbside commuter: rigged Idol character (28 unnamed bones, idle + walk clips, T-pose bind).
// ---------------------------------------------------------------------------------------------------------------------

/** Scene-node name of the top-level rigged commuter (its runtime id is `taxi-passenger`). */
export const COMMUTER_IDOL_NODE = "taxi-passenger-idol";
/** `gdCommuter.idol.json` normalized.sceneScale: the rigged GLB is 1 m tall and unscaled; this makes it 1.71 m. */
export const COMMUTER_SCENE_SCALE = 1.711;
export const COMMUTER_CLIPS = { idle: "idle", walk: "walk" } as const;

/**
 * The commuter as a TOP-LEVEL rigged model carrying the `taxi-passenger` runtime id. A rigged runtime node nested in a
 * moving group renders in world space (the parent transform is dropped), which put the fare off-screen in the real-GPU
 * QA; main.ts sets this node's world transform every frame (kerb position x yaw x COMMUTER_SCENE_SCALE).
 */
export function buildIdolCommuterNode(options: { readonly id: string; readonly position: V3; readonly rotation: V3 }) {
  const s = COMMUTER_SCENE_SCALE;
  return model(assets.gdCommuter, {
    name: COMMUTER_IDOL_NODE,
    scaleMode: "world",
    role: "primaryCharacter",
    castShadow: true,
    receiveShadow: true,
    position: [...options.position] as [number, number, number],
    rotation: [...options.rotation] as [number, number, number],
    scale: [s, s, s]
  }).runtime({ id: options.id });
}

type Q = readonly [number, number, number, number];
const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qinv = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
function qFromTo(from: V3, to: V3): Q {
  const n = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const a = n(from), b = n(to);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Q = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/**
 * Rest pose of the commuter's right arm in model space (character faces +Z, its right hand is -X), read from the GLB:
 * bone_13 clavicle, bone_14 upper arm (shoulder -> elbow), bone_15 forearm (elbow -> wrist). Rest directions point -X.
 */
export const COMMUTER_RIGHT_ARM = {
  clavicle: "bone_13",
  upperArm: "bone_14",
  forearm: "bone_15",
  clavicleWorld: [0.10182, -0.76143, 0.06395, 0.637] as Q,
  upperArmWorld: [-0.01068, -0.69615, -0.00997, 0.71775] as Q,
  forearmWorld: [0.00515, -0.70192, 0.00515, 0.71222] as Q,
  upperArmDir: [-0.1385, -0.0046, 0] as V3,
  forearmDir: [-0.1165, -0.0054, 0.0053] as V3
};

/**
 * Hail wave layered over the idle clip ("overlay" pose: only the right upper arm and forearm are written). The same
 * gesture as `computeUrbanCommuterPose` hail mode: upper arm raised up-forward and slightly out, forearm near vertical and
 * swinging with the 4.6 rad/s wave; reduced motion holds the raised arm still.
 */
export function commuterHailOverlay(time: number, motionOk: boolean): AnimationPose {
  const a = COMMUTER_RIGHT_ARM;
  const wave = motionOk ? Math.sin(time * 4.6) : 0;
  const upperWorld = qmul(qFromTo(a.upperArmDir, [-0.34, 0.55, 0.76]), a.upperArmWorld);
  const foreWorld = qmul(qFromTo(a.forearmDir, [-0.2 + wave * 0.3, 0.93, 0.3]), a.forearmWorld);
  const upperLocal = qmul(qinv(a.clavicleWorld), upperWorld);
  const foreLocal = qmul(qinv(upperWorld), foreWorld);
  const quat = (q: Q) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
  return { bones: { [a.upperArm]: { rotation: quat(upperLocal) }, [a.forearm]: { rotation: quat(foreLocal) } }, mode: "overlay" };
}
