// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/RenderShared.ts — owner lane 01.

import type { RenderItem, SkinningPaletteBinding } from "../ForwardPass";
import { Geometry } from "../Geometry";
import type { MorphTargetDelta } from "../MorphTarget";
import { RenderDeviceError } from "../RenderDevice";
import { computeSkinnedMorphTargetWeightedBounds } from "../SkinningBounds";
import type { RenderSource } from "../contracts/renderSource";
import { Bounds3 as SceneBounds3, type Mat4, Scene, identityMat4, multiplyMat4 } from "@aura3d/scene";

export function isIterable(value: unknown): value is Iterable<RenderItem> {
  return typeof (value as Iterable<RenderItem>)[Symbol.iterator] === "function";
}

export function toMat4(value: Float32Array | readonly number[], field: string, label?: string): Mat4 {
  const values = Array.from(value);
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new RenderDeviceError("Renderer matrix inputs must be finite mat4 values", "RENDERER_MATRIX_CONTRACT", {
      field,
      label,
      scalars: values.length
    });
  }
  return values as Mat4;
}

export function sceneFromSource(source: RenderSource | Iterable<RenderItem> | Scene): Scene | undefined {
  return source instanceof Scene ? source : isIterable(source) ? undefined : source.scene;
}

export function renderableWorldBounds(
  geometry: Geometry,
  modelMatrix: Mat4,
  instanceTransforms?: Float32Array | readonly number[],
  morphTargets?: readonly MorphTargetDelta[],
  morphWeights?: readonly number[],
  skinning?: SkinningPaletteBinding
): SceneBounds3 {
  const envelope = computeSkinnedMorphTargetWeightedBounds(geometry, skinning, morphTargets, morphWeights);
  const local = new SceneBounds3(
    [envelope.min[0], envelope.min[1], envelope.min[2]],
    [envelope.max[0], envelope.max[1], envelope.max[2]]
  );
  if (!instanceTransforms) {
    return local.transform(modelMatrix);
  }

  let bounds = new SceneBounds3();
  for (let offset = 0; offset < instanceTransforms.length; offset += 16) {
    const instanceMatrix = toMat4(instanceTransforms.slice(offset, offset + 16), "instanceTransforms");
    bounds = bounds.union(local.transform(multiplyMat4(modelMatrix, instanceMatrix)));
  }
  return bounds;
}

export function collectItemBounds(items: readonly RenderItem[], respectAutoFrameExclusion: boolean): SceneBounds3 | undefined {
  let bounds: SceneBounds3 | undefined;
  for (const item of items) {
    if (respectAutoFrameExclusion && item.includeInAutoFrame === false) continue;
    const itemBounds = renderableWorldBounds(item.geometry, toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label), item.instanceTransforms, item.morphTargets, item.morphWeights, item.skinning);
    bounds = bounds ? bounds.union(itemBounds) : itemBounds;
  }
  return bounds;
}
