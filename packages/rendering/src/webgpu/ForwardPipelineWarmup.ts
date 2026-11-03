/**
 * WP-03: map a precompiled scene's forward draws to native render-pipeline
 * warm requests. Each item contributes its draw identity — the generated
 * program variant precompile compiled for it, its WP-05 vertex layout and
 * topology, and its material's WP-31 draw state — for the canvas the frame
 * will present to. The device applies the WP-30 depth convention, target
 * formats and sample count. Items whose per-draw layout is only known while
 * drawing (instance streams, CPU morphing, point quads) are left to the draw.
 */
import type { ProgramCacheLike, ProgramFeatures } from "../contracts/program";
import type { RenderItem } from "../contracts/renderItem";
import type { AuraQualityTier } from "../contracts/quality";
import { DEFAULT_RENDER_STATE, type Material } from "../Material";
import { MaterialInstance } from "../MaterialInstance";
import type { RenderShaderProgram } from "../RenderDevice";
import { collectWarmupFeatures, type WarmupInput } from "../program/ProgramWarmup";
import type { WebGPURenderPipelineWarmRequest } from "../WebGPUDevice";

/** Ready-program probe (`ProgramCache.peekReady`); undefined while pending or stale. */
type ReadyProgramProbe = { peekReady?(features: ProgramFeatures): RenderShaderProgram | undefined };

export function forwardPipelineWarmRequests(
  items: readonly RenderItem[],
  perItem: ReadonlyMap<RenderItem, readonly Partial<ProgramFeatures>[]>,
  input: WarmupInput,
  tier: AuraQualityTier,
  cache: ProgramCacheLike,
  canvasSize: { readonly width: number; readonly height: number }
): WebGPURenderPipelineWarmRequest[] {
  const peek = (cache as ProgramCacheLike & ReadyProgramProbe).peekReady;
  if (typeof peek !== "function") return [];
  const requests: WebGPURenderPipelineWarmRequest[] = [];
  for (const item of items) {
    const variants = perItem.get(item);
    if (!variants?.length || item.instanceTransforms || item.instanceAttributes?.length || item.morphTargets || item.morphWeights) continue;
    const material = item.material;
    const base = (material instanceof MaterialInstance ? material.baseMaterial : material) as Material | undefined;
    if (!base) continue;
    const topology = item.geometry.topology ?? "triangles";
    if (topology === "points") continue;
    const renderState = { ...DEFAULT_RENDER_STATE, ...base.renderState };
    // The same forward variants program warmup compiled for this item.
    for (const features of collectWarmupFeatures({ ...input, materials: variants, includeDepth: false }, tier)) {
      const shader = peek.call(cache, features);
      if (!shader) continue;
      requests.push({ shader, vertexFormat: item.geometry.vertexBuffer.format, topology, renderState, target: null, canvasSize });
    }
  }
  return requests;
}
