// PR 0b-2 carve-out (CONTRACTS.md §3.3) — moved from ForwardPass.ts; #181 adds the
// PRD 11 multi-draw fast path (inert unless an item carries `multiDraw`).

import type { Geometry } from "../Geometry.js";
import type { RenderDevice, DrawCommand, InstanceVertexAttribute, RenderBuffer, UniformValue } from "../RenderDevice.js";
import type { RenderPipeline } from "../RenderPipeline.js";
import type { RenderItem } from "../contracts/renderItem.js";
import type { RenderItemDrawRange } from "../ForwardPass.js";
import type { Prd11MultiDrawItem } from "../batching/shaders/drawId.glsl.js";

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
  // #181: a PRD 11 multi-draw member (`item.multiDraw.mode === "multi-draw"`,
  // set by `buildMultiDrawBatch` consumers) is deferred so the whole run of
  // consecutive members becomes one `device.multiDrawElementsInstanced` call.
  // Any other draw flushes the run first, so submission order is unchanged.
  const marker = (item as RenderItem & Prd11MultiDrawItem).multiDraw;
  if (marker?.mode === "multi-draw" && typeof device.multiDrawElementsInstanced === "function") {
    enqueueMultiDraw(device, command, marker.drawData ?? item.material);
    return;
  }
  flushMultiDrawQueue(device);
  device.draw(command);
}

interface MultiDrawRun {
  groupKey: unknown;
  readonly commands: DrawCommand[];
}

const multiDrawRuns = new WeakMap<RenderDevice, MultiDrawRun>();

function enqueueMultiDraw(device: RenderDevice, command: DrawCommand, groupKey: unknown): void {
  let run = multiDrawRuns.get(device);
  if (!run) {
    run = { groupKey, commands: [] };
    multiDrawRuns.set(device, run);
  }
  if (run.commands.length > 0 && run.groupKey !== groupKey) flushMultiDrawQueue(device);
  run.groupKey = groupKey;
  run.commands.push(command);
}

/**
 * #181: issue the pending multi-draw run on `device` (no-op when empty). One
 * member draws through `device.draw`; two or more go through
 * `device.multiDrawElementsInstanced`, which itself falls back to a per-entry
 * loop when `WEBGL_multi_draw` is absent or the entries are not compatible.
 * `ForwardPass.execute` calls this after its item loop.
 */
export function flushMultiDrawQueue(device: RenderDevice): number {
  const run = multiDrawRuns.get(device);
  if (!run || run.commands.length === 0) return 0;
  const commands = run.commands.splice(0, run.commands.length);
  run.groupKey = undefined;
  if (commands.length === 1 || typeof device.multiDrawElementsInstanced !== "function") {
    for (const command of commands) device.draw(command);
  } else {
    device.multiDrawElementsInstanced(commands);
  }
  return commands.length;
}
