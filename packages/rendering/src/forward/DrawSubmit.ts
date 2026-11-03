// PR 0b-2 carve-out (CONTRACTS.md §3.3) — moved from ForwardPass.ts.

import type { Geometry } from "../Geometry.js";
import { RenderDeviceError, type RenderDevice, type DrawCommand, type InstanceVertexAttribute, type RenderBuffer, type UniformValue } from "../RenderDevice.js";
import type { RenderPipeline } from "../RenderPipeline.js";
import type { RenderItem } from "../contracts/renderItem.js";
import type { RenderItemDrawRange } from "../ForwardPass.js";

/** Free variables of the moved draw-issuance block, per §3.1. */
export interface SubmitDrawBindings {
  readonly item: RenderItem;
  readonly vertexBuffer: RenderBuffer;
  readonly vertexBuffers?: DrawCommand["vertexBuffers"];
  readonly indexBuffer: RenderBuffer | undefined;
  readonly drawRange: RenderItemDrawRange;
  readonly uniforms: Map<string, UniformValue>;
  readonly nativeStorageBindings?: DrawCommand["nativeStorageBindings"];
  /** Require an actual native submission; such a draw cannot be deferred. */
  readonly checked?: boolean;
  readonly instanceBinding: { readonly count: number; readonly attributes?: readonly InstanceVertexAttribute[] };
}

/**
 * §3.3 — the device draw issuance inside drawItem. `instanceCount`/`ranges`
 * are the PRD 11 contract surface (the verbatim block carries today's values
 * through `bindings`).
 */
export function createForwardDrawCommand(
  pipeline: RenderPipeline,
  geometry: Geometry,
  instanceCount: number,
  ranges: RenderItemDrawRange,
  bindings: SubmitDrawBindings
): DrawCommand {
  const { item, vertexBuffer, vertexBuffers, indexBuffer, drawRange, uniforms, instanceBinding, nativeStorageBindings } = bindings;
  void ranges;
  const command: DrawCommand = pipeline.createDrawCommand({
    label: item.label,
    vertexBuffer,
    ...(vertexBuffers !== undefined ? { vertexBuffers } : {}),
    vertexCount: indexBuffer !== undefined ? geometry.vertexBuffer.vertexCount : drawRange.count,
    ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
    uniforms,
    ...(nativeStorageBindings !== undefined ? { nativeStorageBindings } : {}),
    ...(item.instanceTransforms ? { instanceCount: instanceBinding.count } : instanceCount !== 1 ? { instanceCount } : {}),
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
  return command;
}

export function submitDraw(
  device: RenderDevice,
  pipeline: RenderPipeline,
  geometry: Geometry,
  instanceCount: number,
  ranges: RenderItemDrawRange,
  bindings: SubmitDrawBindings
): void {
  const command = createForwardDrawCommand(pipeline, geometry, instanceCount, ranges, bindings);
  if (bindings.checked) {
    if (!device.drawChecked) throw new RenderDeviceError("Checked forward submission is unavailable", "FORWARD_CHECKED_SUBMISSION_UNAVAILABLE", { label: bindings.item.label });
    device.drawChecked(command);
    return;
  }
  // Submit each logical draw immediately. Deferred batching can run an earlier
  // draw after a later callback and bypass a public device.draw override.
  device.draw(command);
}

/** Compatibility hook for callers that used to flush deferred forward draws. */
export function flushMultiDrawQueue(_device: RenderDevice): number { return 0; }
