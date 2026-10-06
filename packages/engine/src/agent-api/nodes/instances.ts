// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraColor, AuraModelNode, AuraModelOptions, AuraPrimitiveNode, AuraPrimitiveOptions, AuraTransformSpec, AuraVec3 } from "../index.js";
import { AuraNodeBuilder, geometry, model, primitive } from "../index.js";
import { createInstancedModelNode, type InstancedModelVec3 } from "../../instances-model/InstancedModel.js";
import { defineAuraCustomGeometry, type AuraCustomGeometrySpec } from "../RootGeometry.js";
import { material } from "./material.js";

export const instances = {
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
    return new AuraNodeBuilder<AuraModelNode>({
      ...base,
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
    });
  }
} as const;

export function instancedPrimitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions & { readonly transforms: readonly AuraTransformSpec[]; readonly colors?: readonly AuraColor[] }): AuraNodeBuilder<AuraPrimitiveNode> {
  if (options.transforms.length === 0) throw new Error("Aura3D instancing requires at least one transform.");
  if (options.colors && options.colors.length !== options.transforms.length) throw new Error("Aura3D instance color count must match transform count.");
  return primitive(primitiveName, { ...options, instances: options.transforms, instanceColors: options.colors });
}
