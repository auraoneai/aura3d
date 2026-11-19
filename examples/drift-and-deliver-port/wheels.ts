/**
 * Moving parts for the Idol vehicles (render layer only). Idol returns one rigid mesh, so the courier and the 12 traffic
 * bodies are generated WITHOUT wheels and get separate spinning wheels here: the courier keeps the procedural hero wheel
 * nodes (spin by speed, front pair steers), the traffic fleet gets two instanced draws (tyres, rims) whose wheels roll by
 * the distance each car travelled. Hub positions come from the measured empty wheel arches of each body
 * (`IDOL_WHEEL_LAYOUT`); bodies are lifted by `lift` so the tyres stand on the road. Nothing here feeds back into the sim.
 */
import { instances, material, type AuraTransformSpec } from "@aura3d/engine";
import { memoizeGeometry, mergeRawMeshes, transformMesh, wheelAssemblySlots } from "../../apps/showcase-port-shared/proceduralKernel";
import { joinRawMeshes } from "./art/proceduralModels";

export type IdolVehicleKey =
  | "gcCourier"
  | "gcSedanCoral"
  | "gcSedanBlue"
  | "gcHatchMint"
  | "gcHatchOrange"
  | "gcVanCream"
  | "gcVanTerracotta"
  | "gcTruckWhite"
  | "gcTruckBlue"
  | "gcTaxi"
  | "gcBusCream"
  | "gcBusCoral"
  | "gcCruiser";

export interface WheelLayout {
  /** Raise the wheel-less body (grounded at its lowest point) by this much so the tyres touch y = 0. */
  readonly lift: number;
  /** Tyre radius, metres. */
  readonly radius: number;
  /** Hub distance from the centre line, metres. */
  readonly halfTrack: number;
  /** Axle positions along +Z (forward), metres; the largest is the front axle. */
  readonly axles: readonly number[];
}

/**
 * Measured from each wheel-less body's empty arches (side silhouette of the outer flanks): axle z = arch centre,
 * radius from the arch opening, halfTrack = body half-width minus the tyre inset. See tests/unit/drift-and-deliver-port/wheels.test.ts.
 */
export const IDOL_WHEEL_LAYOUT: Readonly<Record<IdolVehicleKey, WheelLayout>> = {
  gcCourier: { lift: 0.12, radius: 0.33, halfTrack: 0.94, axles: [-1.37, 1.31] },
  gcSedanCoral: { lift: 0.1, radius: 0.29, halfTrack: 0.82, axles: [-1.27, 1.3] },
  gcSedanBlue: { lift: 0.16, radius: 0.29, halfTrack: 0.72, axles: [-1.27, 1.3] },
  gcHatchMint: { lift: 0.23, radius: 0.31, halfTrack: 0.6, axles: [-1.3, 1.32] },
  gcHatchOrange: { lift: 0.24, radius: 0.31, halfTrack: 0.56, axles: [-1.3, 1.32] },
  gcVanCream: { lift: 0.24, radius: 0.33, halfTrack: 0.74, axles: [-1.51, 1.62] },
  gcVanTerracotta: { lift: 0.31, radius: 0.33, halfTrack: 0.58, axles: [-1.41, 1.69] },
  // tandem rear axle under the cargo box (the underride rail splits the rear arch into three openings)
  gcTruckWhite: { lift: 0.3, radius: 0.36, halfTrack: 0.78, axles: [-2.4, -1.45, 1.8] },
  gcTruckBlue: { lift: 0.12, radius: 0.38, halfTrack: 0.74, axles: [-1.6, 1.78] },
  gcTaxi: { lift: 0.31, radius: 0.31, halfTrack: 0.63, axles: [-1.07, 1.5] },
  gcBusCream: { lift: 0.14, radius: 0.31, halfTrack: 0.66, axles: [-1.55, 1.32] },
  gcBusCoral: { lift: 0.19, radius: 0.33, halfTrack: 0.8, axles: [-1.55, 1.45] },
  gcCruiser: { lift: 0.15, radius: 0.29, halfTrack: 0.65, axles: [-1.27, 1.45] }
};

export interface Hub {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly side: -1 | 1;
  readonly front: boolean;
}

/** Tyres press this far into the road (contact patch), so no wheel hovers; bodies drop by the same amount. */
export const TYRE_SINK = 0.02;

/** Body height above the road for a layout (`lift` minus the tyre contact sink). */
export const bodyLift = (layout: WheelLayout): number => layout.lift - TYRE_SINK;

/** Hub centres in the vehicle frame (+Z forward, road at y = 0): one wheel per side per axle. */
export function wheelHubs(layout: WheelLayout): Hub[] {
  const front = Math.max(...layout.axles);
  return layout.axles.flatMap((z) => ([-1, 1] as const).map((side) => ({ x: side * layout.halfTrack, y: layout.radius - TYRE_SINK, z, side, front: z === front })));
}

const TAU = Math.PI * 2;
/** Rolling without slip: the wheel turns `distance / radius` radians (positive = rolling forward). */
export function advanceSpin(spin: number, distance: number, radius: number): number {
  const next = (spin + distance / radius) % TAU;
  return next < 0 ? next + TAU : next;
}

/**
 * Highest drawn wheel spin (rad/s) and largest drawn step per frame (rad). Above them the 5-6 spoke rims step more than
 * about a quarter of a spoke gap a frame and strobe (temporal aliasing reads as a shaking, stopped or backwards wheel). The
 * tyre itself is always drawn (no blur swap); the road, traffic and speed lines carry the speed above the cap.
 */
export const WHEEL_SPIN_SHOWN_MAX = 18;
export const WHEEL_SPIN_STEP_MAX = 0.3;

/** Drawn spin step for rolling `distance` metres in `dt` seconds: distance / radius, capped against strobing. */
export function shownSpinStep(distance: number, radius: number, dt: number): number {
  const roll = distance / radius;
  const cap = Math.min(WHEEL_SPIN_STEP_MAX, WHEEL_SPIN_SHOWN_MAX * Math.max(0, dt));
  return Math.sign(roll) * Math.min(Math.abs(roll), cap);
}

/** `advanceSpin` with the strobe cap: the drawn wheel angle after rolling `distance` metres in `dt` seconds. */
export function advanceShownSpin(spin: number, distance: number, radius: number, dt: number): number {
  const next = (spin + shownSpinStep(distance, radius, dt)) % TAU;
  return next < 0 ? next + TAU : next;
}

/* ------------------------------------------------------------------ courier */

/** Hero wheel geometry radius (`HERO_COURIER_WHEEL_RADIUS`); Idol hubs scale the wheel nodes to the measured arch. */
export const HERO_WHEEL_GEOMETRY_RADIUS = 0.34;

export interface CourierWheelPose {
  readonly id: "courier-wheel-fl" | "courier-wheel-fr" | "courier-wheel-rl" | "courier-wheel-rr";
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly side: -1 | 1;
  readonly front: boolean;
  /** Uniform scale applied to the hero wheel node. */
  readonly scale: number;
}

/** The four courier wheel node poses for the Idol body (same ids as `HERO_COURIER_WHEEL_POSES`). */
export function idolCourierWheelPoses(layout: WheelLayout = IDOL_WHEEL_LAYOUT.gcCourier): readonly CourierWheelPose[] {
  return wheelHubs(layout).map((h) => ({
    id: `courier-wheel-${h.front ? "f" : "r"}${h.side < 0 ? "l" : "r"}` as CourierWheelPose["id"],
    ox: h.x,
    oy: h.y,
    oz: h.z,
    side: h.side,
    front: h.front,
    scale: layout.radius / HERO_WHEEL_GEOMETRY_RADIUS
  }));
}

/**
 * World placement of one courier wheel node, exactly as `main.ts` drives it: hub rotated by the body yaw around the car
 * centre, spin about the axle (pitch + spin) and the front pair steered by `steerYaw` ("YXZ" node rotation order).
 */
export function courierWheelPlacement(
  w: { readonly ox: number; readonly oy: number; readonly oz: number; readonly front: boolean },
  car: { readonly x: number; readonly z: number; readonly yaw: number; readonly pitch: number; readonly steerYaw: number },
  spin: number
): { readonly position: [number, number, number]; readonly rotation: [number, number, number] } {
  const sy = Math.sin(car.yaw);
  const cy = Math.cos(car.yaw);
  return {
    position: [car.x + w.ox * cy + w.oz * sy, w.oy, car.z - w.ox * sy + w.oz * cy],
    rotation: [car.pitch + spin, car.yaw + (w.front ? car.steerYaw : 0), 0]
  };
}

/* ------------------------------------------------------------------ traffic */

export const TRAFFIC_WHEEL_IDS = { tyre: "traffic-wheels-tyre", rim: "traffic-wheels-rim" } as const;

interface WheelEntry {
  readonly car: number;
  readonly hub: Hub;
  readonly radius: number;
}

export interface TrafficWheelRig {
  readonly entries: readonly WheelEntry[];
  /** Per-car spin angle, radians. */
  readonly spin: Float64Array;
  /** Last seen x, z per car (NaN until the first frame). */
  readonly last: Float64Array;
  readonly transforms: AuraTransformSpec[];
}

/** One wheel entry per hub of every traffic car; `carKeys[i]` is the Idol body of traffic car `i`. */
export function createTrafficWheelRig(carKeys: readonly IdolVehicleKey[]): TrafficWheelRig {
  const entries: WheelEntry[] = [];
  carKeys.forEach((key, car) => {
    const layout = IDOL_WHEEL_LAYOUT[key];
    for (const hub of wheelHubs(layout)) entries.push({ car, hub, radius: layout.radius });
  });
  return {
    entries,
    spin: new Float64Array(carKeys.length),
    last: new Float64Array(carKeys.length * 2).fill(Number.NaN),
    transforms: entries.map(() => ({ position: [0, -60, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 0.34 }))
  };
}

/** A car that jumps further than this in one frame was respawned, not driven: its wheels do not spin for the jump. */
const TELEPORT_M = 12;

/**
 * Advances every car's wheel spin by the signed distance it moved along its heading since the last frame (capped against
 * strobing, `shownSpinStep`) and writes the wheel transforms. `shown` is the traffic render buffer (x, z, yaw per car).
 */
export function stepTrafficWheels(rig: TrafficWheelRig, shown: ArrayLike<number>, dt = 1 / 60): AuraTransformSpec[] {
  const cars = rig.spin.length;
  const radiusOf = new Float64Array(cars);
  for (const e of rig.entries) radiusOf[e.car] = e.radius;
  for (let i = 0; i < cars; i++) {
    const x = shown[3 * i]!;
    const z = shown[3 * i + 1]!;
    const yaw = shown[3 * i + 2]!;
    const lx = rig.last[2 * i]!;
    const lz = rig.last[2 * i + 1]!;
    if (Number.isFinite(lx)) {
      const dx = x - lx;
      const dz = z - lz;
      if (Math.hypot(dx, dz) < TELEPORT_M) rig.spin[i] = advanceShownSpin(rig.spin[i]!, dx * Math.sin(yaw) + dz * Math.cos(yaw), radiusOf[i] || 0.34, dt);
    }
    rig.last[2 * i] = x;
    rig.last[2 * i + 1] = z;
  }
  rig.entries.forEach((e, n) => {
    const x = shown[3 * e.car]!;
    const z = shown[3 * e.car + 1]!;
    const yaw = shown[3 * e.car + 2]!;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const t = rig.transforms[n] as { position: [number, number, number]; rotation: [number, number, number]; scale: number };
    t.position[0] = x + e.hub.x * c + e.hub.z * s;
    t.position[1] = e.hub.y;
    t.position[2] = z - e.hub.x * s + e.hub.z * c;
    // unit wheel with its axle on +Z: Ry(yaw + 90deg) * Rz(spin) == Ry(yaw) * Rx(spin) on an X-axle wheel (engine Euler = Rx*Ry*Rz)
    t.rotation[0] = 0;
    t.rotation[1] = yaw + Math.PI / 2;
    t.rotation[2] = rig.spin[e.car]!;
    t.scale = e.radius;
  });
  return rig.transforms;
}

/** Unit-radius traffic wheel meshes (axle on +Z, hub at the origin): the tyre and the rim (+ rotor) parts. */
export function unitWheelMeshes() {
  const slots = wheelAssemblySlots({ radius: 1, width: 0.66, spokeCount: 5, tireMat: 0, rimMat: 1, rotorMat: 2 });
  const toZ = (meshes: Parameters<typeof joinRawMeshes>[0]) => transformMesh(joinRawMeshes(meshes), { rot: [0, -Math.PI / 2, 0] });
  return { tyre: toZ(slots.filter((s) => s.materialIndex === 0).map((s) => s.mesh)), rim: toZ(slots.filter((s) => s.materialIndex !== 0).map((s) => s.mesh)) };
}

/** Unit-radius wheel (axle on +Z) split into tyre and rim meshes; scaled per instance to each body's tyre radius. */
function unitWheelSpecs() {
  return {
    tyre: memoizeGeometry("drift:idol-wheel-tyre", () => mergeRawMeshes([unitWheelMeshes().tyre])),
    rim: memoizeGeometry("drift:idol-wheel-rim", () => mergeRawMeshes([unitWheelMeshes().rim]))
  };
}

/** Two instanced draws for every traffic wheel (positions are written each frame by `stepTrafficWheels`). */
export function trafficWheelNodes(rig: TrafficWheelRig, castShadow: boolean) {
  const specs = unitWheelSpecs();
  return [
    instances.custom(specs.tyre, { name: TRAFFIC_WHEEL_IDS.tyre, transforms: rig.transforms, material: material.blackRubber({ color: "#15181e", roughness: 0.9 }), castShadow, receiveShadow: true, frustumCulled: false }).runtime({ id: TRAFFIC_WHEEL_IDS.tyre }),
    instances.custom(specs.rim, { name: TRAFFIC_WHEEL_IDS.rim, transforms: rig.transforms, material: material.metal({ color: "#cfd8e4", roughness: 0.3, metallic: 0.86, envMapIntensity: 1.0 }), castShadow: false, receiveShadow: true, frustumCulled: false }).runtime({ id: TRAFFIC_WHEEL_IDS.rim })
  ];
}
