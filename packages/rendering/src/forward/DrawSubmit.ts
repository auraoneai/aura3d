// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from ForwardPass.ts; 0 changed logic lines.

import type { Geometry } from "../Geometry.js";
import type { RenderDevice, DrawCommand, InstanceVertexAttribute, RenderBuffer, UniformValue } from "../RenderDevice.js";
import type { RenderPipeline } from "../RenderPipeline.js";
import type { RenderItem } from "../contracts/renderItem.js";
import type { RenderItemDrawRange } from "../ForwardPass.js";

/** Free variables of the moved draw-issuance block, per §3.1. */
export interface SubmitDrawBindings {
  readonly item: RenderItem;
  readonly vertexBuffer: RenderBuffer;
  readonly indexBuffer: RenderBuffer | undefined;
  readonly drawRange: RenderItemDrawRange;
  readonly uniforms: Map<string, UniformValue>;
  readonly instanceBinding: { readonly count: number; readonly attributes?: readonly InstanceVertexAttribute[] };
}

/**
 * §3.3 — the device draw issuance inside drawItem. `instanceCount`/`ranges`
 * are the PRD 11 contract surface (the verbatim block carries today's values
 * through `bindings`).
 */
export function submitDraw(
  device: RenderDevice,
  pipeline: RenderPipeline,
  geometry: Geometry,
  instanceCount: number,
  ranges: RenderItemDrawRange,
  bindings: SubmitDrawBindings
): void {
  const { item, vertexBuffer, indexBuffer, drawRange, uniforms, instanceBinding } = bindings;
  void instanceCount;
  void ranges;
  const command: DrawCommand = pipeline.createDrawCommand({
    label: item.label,
    vertexBuffer,
    vertexCount: indexBuffer !== undefined ? geometry.vertexBuffer.vertexCount : drawRange.count,
    ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
    uniforms,
    ...(item.instanceTransforms ? { instanceCount: instanceBinding.count } : {}),
    ...(instanceBinding.attributes ? { instanceAttributes: instanceBinding.attributes } : {})
  });
  if (indexBuffer !== undefined) {
    Object.assign(command, {
      indexBuffer,
      indexType: geometry.indexBuffer?.type,
      indexCount: drawRange.count,
      ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
    });
  }
  device.draw(command);
}
