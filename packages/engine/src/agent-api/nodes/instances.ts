// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// PRD-10 T3.8: `instances.model` gains the §4.1 world options (`static`,
// `chunkSize`, `shadowLod`, `wind`, `impostor`). When any is set, the emitted
// node carries the §7.1.5 `placements` block so the C-36 handler promotes it
// to a `scatter` node under `A3D_QR_WORLD`; flag off consumes the model node
// exactly as before.

import type { AuraAssetRef, AuraColor, AuraGroupNode, AuraMaterialSpec, AuraModelNode, AuraModelOptions, AuraPrimitiveNode, AuraPrimitiveOptions, AuraSceneNode, AuraTransformSpec, AuraVec3 } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";
import { colorToRgba } from "../colorUtils.js";
import { geometry } from "../nodes/geometry.js";
import { buildModel, MODEL_OPTION_KEYS } from "../nodes/model.js";
import { INSTANCED_PRIMITIVE_OPTION_KEYS, primitive } from "../nodes/primitives.js";
import { createInstancedModelNode, type InstancedModelVec3 } from "../../instances-model/InstancedModel.js";
import { defineAuraCustomGeometry, type AuraCustomGeometrySpec } from "../RootGeometry.js";
import { material } from "./material.js";
import { lights } from "./lights.js";
import { instancedMeshFactory } from "./batchedState.js";
import { lazyNamespace } from "../lazyNamespace.js";

/**
 * GU47 E-G (WP-7): what an instance colour multiplies — `"base"` (base
 * colour, today's behaviour), `"emissive"` (emissive only) or `"both"`.
 * Stamped on the node for the renderer (E-D reads it).
 * GU47(E-D): E-D declares `AuraInstanceColorTarget` and the node fields
 * `AuraPrimitiveNode.instanceColorTarget` / `AuraModelNode.instanceColorTarget`
 * in nodes/types.ts; swap this local alias and the structural stamps below to
 * them once E-D merges.
 */
type InstanceColorTarget = "base" | "emissive" | "both";

/** The options every `instances.<primitive>` builder takes. */
export type AuraInstancedPrimitiveOptions = AuraPrimitiveOptions & {
  readonly transforms: readonly AuraTransformSpec[];
  readonly colors?: readonly AuraColor[];
  /** GU47 E-G: what the instance `colors` tint (default `"base"`). */
  readonly instanceColorTarget?: InstanceColorTarget;
};

/**
 * GU47 E-G (WP-7): one clustered point light per instance of
 * `instances.model` (lamp posts, lanterns). `offset` is in the instance's
 * local frame (it rotates and scales with the instance); `power` is in watts
 * and `distance` is the light range in metres (`lights.point`).
 */
export interface AuraInstanceLightsOptions {
  readonly offset: AuraVec3;
  readonly color: string;
  readonly power: number;
  readonly distance: number;
}

/** `instances.model` options. */
export type AuraInstancedModelOptions = AuraModelOptions & {
  readonly transforms: readonly AuraTransformSpec[];
  readonly colors?: readonly AuraColor[];
  readonly lod?: { readonly levels: readonly { readonly maxDistance: number }[]; readonly hysteresis?: number };
  readonly instancingAware?: boolean;
  readonly maxInstancesPerDraw?: number;
  // PRD-10 §4.1 world options — any set marks the node for scatter promotion.
  readonly static?: boolean;
  readonly chunkSize?: number;
  readonly shadowLod?: "none" | "lod1" | "impostor";
  readonly wind?: boolean;
  readonly impostor?: AuraAssetRef<"texture"> | "none";
  /** GU47 E-G: what the instance `colors` tint (default `"base"`). */
  readonly instanceColorTarget?: InstanceColorTarget;
  /** GU47 E-G: one point light per instance; the builder then returns a group (model + lights). */
  readonly lights?: AuraInstanceLightsOptions;
};

/** `instances.model`: a group (model + per-instance point lights) when `lights` is set, else the model node. */
export interface AuraInstancesModelBuilder {
  <TAsset extends AuraAssetRef<"model">>(asset: TAsset, options: AuraInstancedModelOptions & { readonly lights: AuraInstanceLightsOptions }): AuraNodeBuilder<AuraGroupNode>;
  <TAsset extends AuraAssetRef<"model">>(asset: TAsset, options: AuraInstancedModelOptions): AuraNodeBuilder<AuraModelNode>;
}

export const instances = lazyNamespace(() => ({
  box: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("box", options),
  sphere: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("sphere", options),
  plane: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("plane", options),
  cylinder: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("cylinder", options),
  capsule: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("capsule", options),
  torus: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("torus", options),
  // ── threejs-parity L2-01 (SG-03): instanced widened kinds share the params
  // block with their `primitives.*` siblings.
  cone: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("cone", options),
  circle: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("circle", options),
  ring: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("ring", options),
  tube: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("tube", options),
  lathe: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("lathe", options),
  extrude: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("extrude", options),
  shape: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("shape", options),
  torusKnot: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("torusKnot", options),
  polyhedron: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("polyhedron", options),
  roundedBox: (options: AuraInstancedPrimitiveOptions) => instancedPrimitive("roundedBox", options),
  /**
   * SG-01 (parity-L5): `instances.mesh(geometry, material, count)` — three.js
   * `InstancedMesh` parity on the dense instance store (per-instance
   * transforms/colors via `setMatrixAt`/`setColorAt`, `count` draw bound,
   * `computeBoundingSphere`). `geometry` accepts a @aura3d/rendering
   * `Geometry`, a builtin primitive name, or an `AuraCustomGeometrySpec`.
   */
  mesh: (
    geometry: import("./instancedMesh.js").AuraInstancedGeometryInput,
    material: AuraMaterialSpec | undefined,
    count: number
  ) => instancedMeshFactory()(geometry, material, count),
  custom: (
    spec: AuraCustomGeometrySpec,
    options: Omit<AuraInstancedPrimitiveOptions, "geometry">
  ) => instancedPrimitive("custom", { ...options, geometry: defineAuraCustomGeometry(spec) }),
  /**
   * P2 instanced GLB models (muse3jsparity-PRD): one draw class for repeated
   * static models. Skinned actors fall back with a D1 warning at mount (E1
   * owns rigs); explicitly unaware materials warn at build.
   */
  model: instancedModel
} as const));

function instancedModel<TAsset extends AuraAssetRef<"model">>(asset: TAsset, options: AuraInstancedModelOptions & { readonly lights: AuraInstanceLightsOptions }): AuraNodeBuilder<AuraGroupNode>;
function instancedModel<TAsset extends AuraAssetRef<"model">>(asset: TAsset, options: AuraInstancedModelOptions): AuraNodeBuilder<AuraModelNode>;
function instancedModel<TAsset extends AuraAssetRef<"model">>(asset: TAsset, options: AuraInstancedModelOptions): AuraNodeBuilder<AuraModelNode> | AuraNodeBuilder<AuraGroupNode> {
  const model = instancedModelNode(asset, options);
  if (!options.lights) return model;
  const node = model.toJSON();
  const group: AuraGroupNode = {
    kind: "group",
    name: `${node.name ?? "instances.model"} with lights`,
    children: [node, ...instanceLightNodes(node.name ?? "instances.model", options.transforms, options.lights)]
  };
  return new AuraNodeBuilder<AuraGroupNode>(group);
}

/** Rotate `v` by Euler XYZ radians — the same basis as `packScatterPlacements` (three.js XYZ order). */
function rotateEulerXYZ(v: readonly [number, number, number], r: readonly [number, number, number]): [number, number, number] {
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
  const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
  const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  const m00 = cy * cz, m01 = -cy * sz, m02 = sy;
  const m10 = cz * sx * sy + cx * sz, m11 = cx * cz - sx * sy * sz, m12 = -cy * sx;
  const m20 = sx * sz - cx * cz * sy, m21 = cx * sy * sz + cz * sx, m22 = cx * cy;
  return [m00 * v[0] + m01 * v[1] + m02 * v[2], m10 * v[0] + m11 * v[1] + m12 * v[2], m20 * v[0] + m21 * v[1] + m22 * v[2]];
}

/**
 * GU47 E-G (WP-7): one `lights.point` per instance at
 * `position + R(rotation) * (scale * offset)`, in the model node's space.
 * Many point lights take the renderer's clustered-light path.
 */
export function instanceLightNodes(name: string, transforms: readonly AuraTransformSpec[], spec: AuraInstanceLightsOptions): AuraSceneNode[] {
  return transforms.map((t, i) => {
    const p = t.position ?? [0, 0, 0];
    const s = t.scale === undefined ? [1, 1, 1] : typeof t.scale === "number" ? [t.scale, t.scale, t.scale] : t.scale;
    const local: [number, number, number] = [spec.offset[0] * s[0]!, spec.offset[1] * s[1]!, spec.offset[2] * s[2]!];
    const o = rotateEulerXYZ(local, t.rotation ?? [0, 0, 0]);
    return lights.point({
      name: `${name} light ${i}`,
      position: [p[0] + o[0], p[1] + o[1], p[2] + o[2]],
      color: spec.color,
      power: spec.power,
      distance: spec.distance
    }).toJSON() as AuraSceneNode;
  });
}

function instancedModelNode<TAsset extends AuraAssetRef<"model">>(asset: TAsset, options: AuraInstancedModelOptions): AuraNodeBuilder<AuraModelNode> {
    const built = createInstancedModelNode({
      asset,
      ...(options.name !== undefined ? { name: options.name } : {}),
      transforms: options.transforms.map((transform) => ({
        ...(transform.position !== undefined ? { position: [...transform.position] as InstancedModelVec3 } : {}),
        ...(transform.rotation !== undefined ? { rotation: [...transform.rotation] as InstancedModelVec3 } : {}),
        ...(transform.scale !== undefined
          ? { scale: typeof transform.scale === "number" ? transform.scale : [...transform.scale] as InstancedModelVec3 }
          : {})
      })),
      ...(options.colors ? { colors: [...options.colors] } : {}),
      ...(options.lod ? { lod: options.lod } : {}),
      materialInstancingAware: options.instancingAware ?? true,
      ...(options.maxInstancesPerDraw !== undefined ? { maxInstancesPerDraw: options.maxInstancesPerDraw } : {}),
      ...(options.material?.name !== undefined ? { materialName: options.material.name } : {})
    });
    const base = buildModel(asset, options, { builder: "instances.model", validKeys: INSTANCED_MODEL_OPTION_KEYS }).toJSON();
    // PRD-10 T3.8: world options present ⇒ stamp the §7.1.5 placements block
    // (structural extension of the model node; promoted to `kind:"scatter"` by
    // the C-36 world handler under A3D_QR_WORLD — see compiler/world.ts).
    const worldOpted = options.static !== undefined || options.chunkSize !== undefined || options.shadowLod !== undefined || options.wind !== undefined || options.impostor !== undefined;
    const placements = worldOpted ? packScatterPlacements(asset, options.transforms, options.colors, options) : undefined;
    const node: AuraModelNode & { readonly placements?: AuraScatterPlacement; readonly instanceColorTarget?: InstanceColorTarget } = {
      ...base,
      ...(placements ? { placements } : {}),
      ...(options.instanceColorTarget !== undefined ? { instanceColorTarget: options.instanceColorTarget } : {}),
      instances: built.node.instances.map((transform) => ({
        ...(transform.position ? { position: [...transform.position] as AuraVec3 } : {}),
        ...(transform.rotation ? { rotation: [...transform.rotation] as AuraVec3 } : {}),
        ...(transform.scale !== undefined ? { scale: transform.scale } : {})
      })),
      // Safe: the builder only accepts AuraColor strings above, so no RGB tuples reach the node.
      ...(built.node.instanceColors ? { instanceColors: [...built.node.instanceColors] as AuraColor[] } : {}),
      ...(built.node.instanceLod ? { instanceLod: built.node.instanceLod } : {}),
      instanceCulling: {
        instanceCount: built.node.instanceCulling.instanceCount,
        centroid: [...built.node.instanceCulling.centroid] as AuraVec3,
        boundingRadius: built.node.instanceCulling.boundingRadius,
        cullable: true as const
      },
      ...(built.diagnostics.fallbackWarning ? { instancedModelWarning: built.diagnostics.fallbackWarning.diagnostic } : {})
    };
    return new AuraNodeBuilder<AuraModelNode>(node);
}

/** `instances.model` reads the `model()` options plus these (anim-phys-06). */
const INSTANCED_MODEL_OPTION_KEYS: readonly string[] = [
  ...MODEL_OPTION_KEYS,
  "transforms", "colors", "lod", "instancingAware", "maxInstancesPerDraw",
  "static", "chunkSize", "shadowLod", "wind", "impostor",
  // GU47 E-G (WP-7)
  "instanceColorTarget", "lights"
];

/** `instances.<primitive>` / `instances.custom` read the primitive options plus these. */
const INSTANCED_PRIMITIVE_BUILDER_KEYS: readonly string[] = [...INSTANCED_PRIMITIVE_OPTION_KEYS, "instanceColorTarget"];

/** §7.1.5 scatter placements block carried on a model node pending promotion. */
export interface AuraScatterPlacement {
  readonly asset: AuraAssetRef<"model">;
  readonly matrices: Float32Array;          // row-major mat3x4 per instance
  readonly colors?: Float32Array;           // rgba per instance
  readonly wind?: boolean;
  readonly impostor?: AuraAssetRef<"texture"> | "none";
  readonly shadowLod?: "none" | "lod1" | "impostor";
  readonly chunkSize?: number;
  readonly tags?: readonly string[];
}

/** Compose `transforms` into packed row-major mat3x4 matrices (12 f32 each). */
function packScatterPlacements(
  asset: AuraAssetRef<"model">,
  transforms: readonly AuraTransformSpec[],
  colors: readonly AuraColor[] | undefined,
  options: { readonly wind?: boolean; readonly impostor?: AuraAssetRef<"texture"> | "none"; readonly shadowLod?: "none" | "lod1" | "impostor"; readonly chunkSize?: number }
): AuraScatterPlacement {
  const matrices = new Float32Array(transforms.length * 12);
  transforms.forEach((t, i) => {
    const p = t.position ?? [0, 0, 0];
    const r = t.rotation ?? [0, 0, 0];
    const sc = t.scale === undefined ? [1, 1, 1] : typeof t.scale === "number" ? [t.scale, t.scale, t.scale] : t.scale;
    // Euler XYZ → R = Rx*Ry*Rz applied column-major; emit row-major mat3x4.
    const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
    const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
    const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
    // R = Rz*Ry*Rx (three.js default order ZYX applied R*v)
    const m00 = cy * cz, m01 = -cy * sz, m02 = sy;
    const m10 = cz * sx * sy + cx * sz, m11 = cx * cz - sx * sy * sz, m12 = -cy * sx;
    const m20 = sx * sz - cx * cz * sy, m21 = cx * sy * sz + cz * sx, m22 = cx * cy;
    // §9.3 row-major mat3x4: 3 rows × [basis row, translation component];
    // scale multiplies the basis columns (sc[j] on column j).
    const o = i * 12;
    matrices[o + 0] = m00 * sc[0]; matrices[o + 1] = m01 * sc[1]; matrices[o + 2] = m02 * sc[2]; matrices[o + 3] = p[0];
    matrices[o + 4] = m10 * sc[0]; matrices[o + 5] = m11 * sc[1]; matrices[o + 6] = m12 * sc[2]; matrices[o + 7] = p[1];
    matrices[o + 8] = m20 * sc[0]; matrices[o + 9] = m21 * sc[1]; matrices[o + 10] = m22 * sc[2]; matrices[o + 11] = p[2];
  });
  const packedColors = colors && colors.length > 0
    ? Float32Array.from(colors.flatMap((c) => colorToRgba(c)))
    : undefined;
  return {
    asset,
    matrices,
    ...(packedColors ? { colors: packedColors } : {}),
    ...(options.wind !== undefined ? { wind: options.wind } : {}),
    ...(options.impostor !== undefined ? { impostor: options.impostor } : {}),
    ...(options.shadowLod !== undefined ? { shadowLod: options.shadowLod } : {}),
    // §11 surface table: chunkSize defaults to 32 when the call has > 256 instances.
    ...(options.chunkSize !== undefined || transforms.length > 256 ? { chunkSize: options.chunkSize ?? 32 } : {})
  };
}

export function instancedPrimitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraInstancedPrimitiveOptions): AuraNodeBuilder<AuraPrimitiveNode> {
  // Zero transforms is valid (a pool that is empty this frame): the compiler skips the node with INSTANCES_EMPTY.
  if (options.colors && options.colors.length !== options.transforms.length) throw new Error("Aura3D instance color count must match transform count.");
  const { transforms, colors, instanceColorTarget, ...primitiveOptions } = options;
  // The OPTION_IGNORED note names `instances.<kind>` and accepts `transforms` / `colors` (anim-phys-07).
  const built = primitive(primitiveName, { ...primitiveOptions, instances: transforms, instanceColors: colors }, {
    builder: `instances.${primitiveName}`,
    validKeys: INSTANCED_PRIMITIVE_BUILDER_KEYS,
    options
  });
  if (instanceColorTarget === undefined) return built;
  // GU47 E-G (WP-7): stamp the colour target for the renderer (GU47(E-D) node field).
  const node: AuraPrimitiveNode & { readonly instanceColorTarget: InstanceColorTarget } = { ...built.toJSON(), instanceColorTarget };
  return new AuraNodeBuilder<AuraPrimitiveNode>(node);
}
