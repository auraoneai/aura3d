// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// PRD-10 T3.8: `instances.model` gains the §4.1 world options (`static`,
// `chunkSize`, `shadowLod`, `wind`, `impostor`). When any is set, the emitted
// node carries the §7.1.5 `placements` block so the C-36 handler promotes it
// to a `scatter` node under `A3D_QR_WORLD`; flag off consumes the model node
// exactly as before.

import type { AuraAssetRef, AuraColor, AuraModelNode, AuraModelOptions, AuraPrimitiveNode, AuraPrimitiveOptions, AuraTransformSpec, AuraVec3 } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";
import { colorToRgba } from "../colorUtils.js";
import { geometry } from "../nodes/geometry.js";
import { model } from "../nodes/model.js";
import { primitive } from "../nodes/primitives.js";
import { createInstancedModelNode, type InstancedModelVec3 } from "../../instances-model/InstancedModel.js";
import { defineAuraCustomGeometry, type AuraCustomGeometrySpec } from "../RootGeometry.js";
import { material } from "./material.js";
import { lazyNamespace } from "../lazyNamespace.js";


export const instances = lazyNamespace(() => ({
  box: (options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }) => instancedPrimitive("box", options),
  sphere: (options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }) => instancedPrimitive("sphere", options),
  plane: (options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }) => instancedPrimitive("plane", options),
  cylinder: (options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }) => instancedPrimitive("cylinder", options),
  capsule: (options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }) => instancedPrimitive("capsule", options),
  torus: (options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }) => instancedPrimitive("torus", options),
  custom: (
    spec: AuraCustomGeometrySpec,
    options: Omit<AuraPrimitiveOptions, "geometry"> & {
      readonly transforms: readonly AuraTransformSpec[];
      readonly colors?: readonly AuraColor[];
    }
  ) => instancedPrimitive("custom", { ...options, geometry: defineAuraCustomGeometry(spec) }),
  /**
   * P2 instanced GLB models (muse3jsparity-PRD): one draw class for repeated
   * static models. Skinned actors fall back with a D1 warning at mount (E1
   * owns rigs); explicitly unaware materials warn at build.
   */
  model: <TAsset extends AuraAssetRef<"model">>(
    asset: TAsset,
    options: AuraModelOptions & {
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
    }
  ): AuraNodeBuilder<AuraModelNode> => {
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
    const base = model(asset, options).toJSON();
    // PRD-10 T3.8: world options present ⇒ stamp the §7.1.5 placements block
    // (structural extension of the model node; promoted to `kind:"scatter"` by
    // the C-36 world handler under A3D_QR_WORLD — see compiler/world.ts).
    const worldOpted = options.static !== undefined || options.chunkSize !== undefined || options.shadowLod !== undefined || options.wind !== undefined || options.impostor !== undefined;
    const placements = worldOpted ? packScatterPlacements(asset, options.transforms, options.colors, options) : undefined;
    const node: AuraModelNode & { readonly placements?: AuraScatterPlacement } = {
      ...base,
      ...(placements ? { placements } : {}),
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
} as const));

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

export function instancedPrimitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }): AuraNodeBuilder<AuraPrimitiveNode> {
  if (options.transforms.length === 0) throw new Error("Aura3D instancing requires at least one transform.");
  if (options.colors && options.colors.length !== options.transforms.length) throw new Error("Aura3D instance color count must match transform count.");
  return primitive(primitiveName, { ...options, instances: options.transforms, instanceColors: options.colors });
}
