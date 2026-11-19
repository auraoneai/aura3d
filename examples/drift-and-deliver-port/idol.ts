/**
 * Gridlock Courier Idol pass: image-to-3D GLBs (speridlabs/idol/max, admitted through tools/idol/admit.sh) that replace the
 * procedural courier, the 7-class harbour traffic fleet, the sidewalk pedestrians, both harbour landmarks and the most-seen
 * street props. Render layer only: every model is generated at the procedural model's real size (grounded at y = 0, +Z
 * forward) so the FOOTPRINT, solids, replay and camera rigs stay untouched. `?idol=0` restores the procedural art.
 */
import { group, instances, material, model, primitives, type AuraTransformSpec } from "@aura3d/engine";
import { IDOL_ASSETS as assets } from "../../apps/showcase-drift-and-deliver-port/src/idol-assets";
import { vegetationGhostNodes, withGroupRotationOrder, type TrafficFleetKind } from "./art/proceduralModels";
import { IDOL_WHEEL_LAYOUT, bodyLift, createTrafficWheelRig, stepTrafficWheels, trafficWheelNodes, type IdolVehicleKey } from "./wheels";
import type { Pedestrian } from "./city";
import { COURIER_GLASS_ROOF, courierCabinNodes } from "./courierCabin";
import { FADE, registerFadeLayer, vegetationOccluderVolumes } from "./occluderFade";

/** Idol art is on unless the URL says `idol=0` (A/B against the procedural kit). */
export function idolEnabled(): boolean {
  const search = typeof location !== "undefined" ? location.search : "";
  return new URLSearchParams(search).get("idol") !== "0";
}

/* ------------------------------------------------------------------ hero courier */

/**
 * Optional blank plate over the courier's rear plate, for a body where Idol invented plate characters (lesson A3); `null`
 * when the body's own plate is clean. Position is in the body frame before `lift`.
 */
export const COURIER_REAR_PLATE: { readonly size: [number, number, number]; readonly position: [number, number, number] } | null = null;

/**
 * The wheel-less courier body as one Idol model, lifted onto its wheels (the procedural hero wheel nodes spin and steer
 * at the measured arches, see wheels.ts). Same runtime id and Euler order as `buildHeroCourierRigNode`, so
 * `place("car-rig", ...)` drives it unchanged.
 */
export function idolCourierNode(id: string, castShadow: boolean, bodyOrder: "YXZ" | "ZYX" = "ZYX") {
  const lift = bodyLift(IDOL_WHEEL_LAYOUT.gcCourier);
  // Owner QA (Nov 18): the derived glass-roof body (roof parcel and roof skin cut out, see courierCabin.ts) + the cabin with
  // the seated driver, so the courier reads as driven from the bird's-eye chase. `?glassroof=0` shows the admitted body.
  const glassRoof = typeof location === "undefined" || new URLSearchParams(location.search).get("glassroof") !== "0";
  const asset = glassRoof ? { ...assets.gcCourier, ...COURIER_GLASS_ROOF } : assets.gcCourier;
  const body = model(asset as typeof assets.gcCourier, { name: `${id}-idol`, scaleMode: "world", position: [0, lift, 0], castShadow, receiveShadow: true });
  const cabin = glassRoof ? courierCabinNodes(id, lift, castShadow) : [];
  if (!COURIER_REAR_PLATE) return withGroupRotationOrder(group(id, [body, ...cabin]), bodyOrder).runtime({ id });
  const plate = primitives.box({
    name: `${id}-rear-plate`,
    size: COURIER_REAR_PLATE.size,
    position: [COURIER_REAR_PLATE.position[0], COURIER_REAR_PLATE.position[1] + lift, COURIER_REAR_PLATE.position[2]],
    material: material.pbr({ color: "#eef0f2", roughness: 0.42, metallic: 0.05, clearcoat: 0, sheen: 0 }),
    castShadow: false,
    receiveShadow: true
  });
  return withGroupRotationOrder(group(id, [body, ...cabin, plate]), bodyOrder).runtime({ id });
}

/* ------------------------------------------------------------------ traffic fleet */

/** Paint variants per class: cars of a class alternate between them, one instanced draw per variant. */
export const IDOL_TRAFFIC_VARIANTS: Readonly<Record<TrafficFleetKind, readonly Exclude<IdolVehicleKey, "gcCourier">[]>> = {
  sedan: ["gcSedanCoral", "gcSedanBlue"],
  hatch: ["gcHatchMint", "gcHatchOrange"],
  van: ["gcVanCream", "gcVanTerracotta"],
  truck: ["gcTruckWhite", "gcTruckBlue"],
  taxi: ["gcTaxi"],
  bus: ["gcBusCream", "gcBusCoral"],
  cruiser: ["gcCruiser"]
};

const FLEET_ORDER: readonly TrafficFleetKind[] = ["sedan", "hatch", "van", "truck", "taxi", "bus", "cruiser"];

export interface IdolTrafficGroup {
  readonly id: string;
  readonly kind: TrafficFleetKind;
  readonly layerIds: readonly string[];
  readonly cars: readonly number[];
  readonly scale: number;
  /** Body height above the road (the wheel-less body rides on its separate wheels). */
  readonly lift: number;
}

/**
 * Same class assignment as `buildProceduralTrafficFleet` (car i is class `i % 7`); within a class the cars alternate between
 * the paint variants. Returns instanced model nodes plus the groups `placeTraffic` updates each frame.
 */
export function buildIdolTrafficFleet(
  traffic: readonly { readonly x: number; readonly z: number; readonly yaw: number }[],
  castShadow: boolean
) {
  const nodes: ReturnType<typeof instances.model>[] = [];
  const groups: IdolTrafficGroup[] = [];
  /** Idol body of every traffic car, for the wheel rig. */
  const carKeys: Exclude<IdolVehicleKey, "gcCourier">[] = new Array(traffic.length);
  for (const kind of FLEET_ORDER) {
    const classCars = traffic.map((_, i) => i).filter((i) => FLEET_ORDER[i % FLEET_ORDER.length] === kind);
    const variants = IDOL_TRAFFIC_VARIANTS[kind];
    variants.forEach((key, v) => {
      const cars = classCars.filter((_, n) => n % variants.length === v);
      if (cars.length === 0) return;
      const id = `traffic-${kind}-${v}`;
      const lift = bodyLift(IDOL_WHEEL_LAYOUT[key]);
      for (const i of cars) carKeys[i] = key;
      const transforms: AuraTransformSpec[] = cars.map((i) => ({ position: [traffic[i]!.x, lift, traffic[i]!.z], rotation: [0, traffic[i]!.yaw, 0], scale: 1 }));
      nodes.push(instances.model(assets[key] as typeof assets.gcSedanCoral, { name: id, scaleMode: "world", transforms, castShadow, receiveShadow: true }).runtime({ id }));
      groups.push({ id, kind, layerIds: [id], cars, scale: 1, lift });
    });
  }
  // separate rolling wheels for every car (two instanced draws), written each frame by stepTrafficWheels
  const wheels = createTrafficWheelRig(carKeys);
  stepTrafficWheels(wheels, traffic.flatMap((t) => [t.x, t.z, t.yaw]));
  return { nodes: [...nodes, ...trafficWheelNodes(wheels, castShadow)], groups, wheels };
}

/* ------------------------------------------------------------------ pedestrians */

const PED_KEYS = ["gcPedA", "gcPedB", "gcPedC", "gcPedD", "gcPedE", "gcPedF"] as const;
/** Idol people are 1.64-1.80 m tall (mean 1.71 m); the procedural figure is 1.69 m at scale 1, so the seeded scale is kept. */
const PED_SCALE = 1.69 / 1.71;

/**
 * Static sidewalk pedestrians as six instanced Idol people (one draw each). Same position, facing (+Z at yaw 0) and
 * height scale as the merged procedural figures, which are skipped from the props mesh when these are mounted.
 */
export function idolPedestrianNodes(pedestrians: readonly Pedestrian[]) {
  return PED_KEYS.flatMap((key, v) => {
    const mine = pedestrians.filter((_, n) => n % PED_KEYS.length === v);
    if (mine.length === 0) return [];
    const transforms: AuraTransformSpec[] = mine.map((p) => ({ position: [p.x, -PED_SINK, p.z], rotation: [0, p.yaw, 0], scale: p.scale * PED_SCALE }));
    return [instances.model(assets[key] as typeof assets.gcPedA, { name: `pedestrians-${key}`, scaleMode: "world", transforms, castShadow: false, receiveShadow: true })];
  });
}

/* ------------------------------------------------------------------ landmarks & street props */

export type IdolPropKind = "tree" | "palm" | "shelter" | "hydrant" | "watertank" | "scooter" | "clocktower" | "lighthouse";

/**
 * Metres each ground-standing Idol base sinks below the flat road / sidewalk plane (y = 0; park and plaza decals lie 4 cm
 * above it), so no base edge floats. Rooftop tanks are sunk onto the roof cap in `planProps` (`PROP_SINK.watertank`).
 */
export const IDOL_GROUND_SINK: Readonly<Partial<Record<IdolPropKind, number>>> = { tree: 0.12, palm: 0.12, hydrant: 0.05, scooter: 0.03, clocktower: 0.15, lighthouse: 0.15 };
/** Shoe soles sink a little so feet never hover; more would bury the shoes. */
export const PED_SINK = 0.03;

/** Kinds with an Idol model; the bus shelter stays procedural (Idol tore its glass walls and roof apart). */
const PROP_ASSET: Readonly<Partial<Record<IdolPropKind, keyof typeof assets>>> = {
  tree: "gcTree",
  palm: "gcPalm",
  hydrant: "gcHydrant",
  watertank: "gcWatertank",
  scooter: "gcScooter",
  clocktower: "gcClocktower",
  lighthouse: "gcLighthouse"
};


/**
 * Builds the Idol replacement for one prop kind from the procedural kit's metre transforms (`toMetreTransforms` already
 * maps the placement to world metres for a model of the procedural reference size, which is the size each Idol prop was
 * generated at). Landmarks mount as single models with the landmark node ids; repeated props are one instanced draw.
 * Returns `null` (keep the procedural build) for kinds without an Idol model.
 */
export function idolPropNodes(kind: IdolPropKind, transforms: readonly AuraTransformSpec[], castShadow: boolean) {
  const key = PROP_ASSET[kind];
  if (!key) return null;
  const asset = assets[key] as typeof assets.gcTree;
  // sink ground-standing bases into the road plane / park decal (the roof tanks are already sunk onto their roof cap)
  const sink = IDOL_GROUND_SINK[kind] ?? 0;
  const turned = transforms.map((t) => ({ ...t, position: [t.position?.[0] ?? 0, (t.position?.[1] ?? 0) - sink, t.position?.[2] ?? 0] as [number, number, number] }));
  if (kind === "clocktower" || kind === "lighthouse") {
    const t = turned[0]!;
    const s = typeof t.scale === "number" ? t.scale : 1;
    return [
      group(`landmark-${kind}`, [model(asset, { name: `landmark-${kind}-idol`, scaleMode: "world", castShadow, receiveShadow: true })], {
        position: t.position,
        rotation: t.rotation,
        scale: s
      })
    ];
  }
  const main = instances.model(asset, { name: `model-${kind}-idol`, scaleMode: "world", transforms: turned, castShadow, receiveShadow: true });
  if (kind !== "tree" && kind !== "palm") return [main];
  // Owner QA (Nov 18/19): trees and palms between the chase eye and the courier step out of the Idol draw into translucent
  // ghost draws (occluderFade.ts). The ghosts are the code-built tree / palm shapes: a GLB `material` override keeps the
  // glTF's opaque blend state, so a ghost of the Idol model itself drew solid and the trees never faded.
  const id = `model-${kind}-idol`;
  const bounds = (asset as { readonly bounds?: readonly number[] }).bounds ?? [3, 5, 3];
  registerFadeLayer({
    opaqueIds: [id],
    ghostIds: FADE.opacities.map((_, k) => `model-${kind}-ghost-${k}`),
    transforms: turned,
    volumes: turned.map((t) => vegetationOccluderVolumes(t, bounds))
  });
  return [main.runtime({ id }), ...vegetationGhostNodes(kind)];
}
