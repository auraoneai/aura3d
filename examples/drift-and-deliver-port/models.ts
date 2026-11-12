/**
 * Harbor Drift (`drift-and-deliver-port`): 100% procedural `@aura3d/engine` vehicle, street-prop,
 * and harbor-landmark model registry (zero external binary mesh assets).
 *
 * Every model is synthesized in `art/proceduralModels.ts` from `proceduralKernel` multi-material
 * slots (`+Z` forward, `+Y` up, grounded at `minY = 0`). `propTransform` preserves the `1.9 m`
 * reference normalisation (`size / MODEL_NORM_REF`) consumed by `planProps` and `buildProceduralPropNodes`.
 */
import { group, instances } from "@aura3d/engine";
import { assembleMultiMaterialNode } from "../../apps/showcase-port-shared/proceduralKernel";
import {
  buildHeroCourierRigNode,
  buildProceduralModelAssembly,
  buildTrafficClassSpecs,
  trafficFleetMaterials,
  withGroupRotationOrder,
  type ProceduralModelAssembly
} from "./art/proceduralModels";
import type { CarKind } from "./vehicles";

export interface ProceduralModelDescriptor {
  readonly key: string;
  readonly category: "vehicle" | "prop" | "landmark";
  readonly procedural: true;
  readonly targetMetres: number;
}

export const MODEL_ASSETS = {
  courier: { key: "courier", category: "vehicle", procedural: true, targetMetres: 4.4 },
  sedan: { key: "sedan", category: "vehicle", procedural: true, targetMetres: 4.5 },
  hatch: { key: "hatch", category: "vehicle", procedural: true, targetMetres: 3.7 },
  van: { key: "van", category: "vehicle", procedural: true, targetMetres: 4.7 },
  truck: { key: "truck", category: "vehicle", procedural: true, targetMetres: 6.0 },
  lamp: { key: "lamp", category: "prop", procedural: true, targetMetres: 5.0 },
  signal: { key: "signal", category: "prop", procedural: true, targetMetres: 4.2 },
  tree: { key: "tree", category: "prop", procedural: true, targetMetres: 4.6 },
  palm: { key: "palm", category: "prop", procedural: true, targetMetres: 7.5 },
  shelter: { key: "shelter", category: "prop", procedural: true, targetMetres: 4.2 },
  hydrant: { key: "hydrant", category: "prop", procedural: true, targetMetres: 0.8 },
  clocktower: { key: "clocktower", category: "landmark", procedural: true, targetMetres: 38.0 },
  lighthouse: { key: "lighthouse", category: "landmark", procedural: true, targetMetres: 24.0 },
  watertank: { key: "watertank", category: "landmark", procedural: true, targetMetres: 3.4 }
} as const satisfies Record<string, ProceduralModelDescriptor>;

export type ModelKey = keyof typeof MODEL_ASSETS;
export type PropKey = Exclude<ModelKey, "courier" | "sedan" | "hatch" | "van" | "truck">;
export type CarKey = "courier" | "sedan" | "hatch" | "van" | "truck";

export { buildProceduralModelAssembly, type ProceduralModelAssembly };

const MODEL_NORM_REF = 1.9;

/** Target length along the car in metres (`+Z` forward, grounded at `minY = 0`). */
export const CAR_LENGTH: Record<CarKey, number> = {
  courier: 4.4,
  sedan: 4.5,
  hatch: 3.7,
  van: 4.7,
  truck: 6.0
};

export const TRAFFIC_MODEL: Record<CarKind, Exclude<CarKey, "courier">> = {
  sedan: "sedan",
  hatch: "hatch",
  van: "van",
  pickup: "truck"
};

export const COURIER_PAINT = {
  roughness: 0.24,
  metallic: 0.14,
  clearcoat: 0.72,
  clearcoatRoughness: 0.12,
  envMapIntensity: 1.45
} as const;

export const TRAFFIC_PAINT = {
  roughness: 0.28,
  metallic: 0.12,
  clearcoat: 0.85,
  clearcoatRoughness: 0.08,
  envMapIntensity: 1.38
} as const;

/** Uniform scale factor relative to the `1.9 m` placement reference. */
export const carScale = (key: CarKey): number => CAR_LENGTH[key] / MODEL_NORM_REF;

/**
 * Runtime-addressable procedural multi-material car assembly (`nodes.require(id).setPosition/setRotation`).
 * Uses `"YXZ"` in shift look when requested and `"ZYX"` Euler rotation order by default.
 */
export function carModel(id: string, key: CarKey, castShadow: boolean, bodyOrder: "YXZ" | "ZYX" = "ZYX") {
  if (key === "courier") {
    return buildHeroCourierRigNode(id, castShadow, bodyOrder);
  }
  const assembly = buildProceduralModelAssembly(key);
  const base = assembleMultiMaterialNode(id, [...assembly.slots], [...assembly.materials], {
    castShadow,
    receiveShadow: true
  });
  return withGroupRotationOrder(base, bodyOrder).runtime({ id });
}

/**
 * Procedural multi-material instanced traffic batch for one vehicle class.
 */
export function trafficInstances(
  id: string,
  key: Exclude<CarKey, "courier">,
  castShadow: boolean,
  start: readonly { position: [number, number, number]; rotation: [number, number, number] }[],
  _glossy = false,
  _restyled = false
) {
  const specs = buildTrafficClassSpecs(key);
  const mats = trafficFleetMaterials();
  const transforms = start.map((t) => ({ position: t.position, rotation: t.rotation, scale: 1 }));
  const palette = ["#f08c4b", "#78c8b6", "#f2e6cf", "#3878a8", "#e06d53", "#d8a848"];
  const colors = start.map((_, i) => palette[i % palette.length]!);
  return group(id, [
    instances.custom(specs.body, { name: `${id}-body`, transforms, colors, material: mats.body, castShadow, receiveShadow: true }),
    instances.custom(specs.glass, { name: `${id}-glass`, transforms, material: mats.glass, castShadow: false, receiveShadow: false }),
    instances.custom(specs.rubber, { name: `${id}-rubber`, transforms, material: mats.rubber, castShadow: false, receiveShadow: true }),
    instances.custom(specs.trim, { name: `${id}-trim`, transforms, material: mats.trim, castShadow: false, receiveShadow: true }),
    instances.custom(specs.headGlow, { name: `${id}-head`, transforms, material: mats.head, castShadow: false, receiveShadow: false }),
    instances.custom(specs.tailGlow, { name: `${id}-tail`, transforms, material: mats.tail, castShadow: false, receiveShadow: false })
  ]).runtime({ id });
}

/**
 * Vertical offset for grounded procedural prop placements (`minY = 0` stands flush on `y`).
 */
export const PROP_BELOW: Record<PropKey, number> = {
  lamp: 0,
  signal: 0,
  tree: 0,
  palm: 0,
  shelter: 0,
  hydrant: 0,
  clocktower: 0,
  lighthouse: 0,
  watertank: 0
};

/** Instance transform that stands a prop on the ground at `(x, z)` with its reference span scaled to `size` metres. */
export function propTransform(
  key: PropKey,
  x: number,
  z: number,
  yaw: number,
  size: number,
  y = 0
): { position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  const s = size / MODEL_NORM_REF;
  return { position: [x, y + PROP_BELOW[key] * s, z], rotation: [0, yaw, 0], scale: s };
}
