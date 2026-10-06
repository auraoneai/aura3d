/**
 * PRD-15 §T2.9 — free functions over `Renderer` for the members the deleted
 * `A3DRenderer` class had that `Renderer` lacks (`renderFrame`,
 * `renderFrameAsync`, `renderInteractiveFrame`). `evidence()` moved to
 * `a3dRendererEvidence` in `../agent-api/devtools/rendererReports.ts`; the
 * `renderer-imports` codemod rewrites `.renderFrame(input)` call sites to
 * `a3dRenderFrame(renderer, input)`.
 *
 * Semantics are the deleted class's own: render, then report the backend from
 * `device.kind` plus the interactive feature rows (the two readback features
 * the frame path cannot advertise are filtered by
 * `rendererInteractiveFeatureReport`).
 */

import type {
  CameraLike,
  ProductionRendererBackend,
  ProductionRendererInput,
  RenderSource,
  RendererInput,
  RenderItem,
  RuntimeParityFrameRenderResult
} from "@aura3d/rendering";
import type { Scene } from "@aura3d/scene";
import { Renderer, rendererInteractiveFeatureReport } from "@aura3d/rendering";

type A3DRenderFrameSource = RendererInput | RenderSource | Iterable<RenderItem> | Scene;

function backendOf(renderer: Renderer): ProductionRendererBackend {
  return renderer.device.kind === "webgpu" ? "webgpu" : "webgl2";
}

function normalizeFrameInput(input: ProductionRendererInput | A3DRenderFrameSource): {
  readonly source: RenderSource | Iterable<RenderItem> | Scene;
  readonly camera?: CameraLike;
} {
  const candidate = input as Partial<ProductionRendererInput> | null | undefined;
  if (candidate && typeof candidate === "object" && "source" in candidate && candidate.source !== undefined) {
    return { source: candidate.source as RenderSource, camera: candidate.camera };
  }
  return { source: input as RenderSource | Iterable<RenderItem> | Scene };
}

/**
 * Former `A3DRenderer.renderFrame` / `ProductionWebGL2Renderer.renderInteractiveFrame`:
 * synchronous frame render returning backend + diagnostics + feature rows.
 */
export function a3dRenderFrame(renderer: Renderer, input: ProductionRendererInput): RuntimeParityFrameRenderResult {
  const frame = normalizeFrameInput(input);
  const diagnostics = renderer.render(frame.source, frame.camera);
  return {
    backend: backendOf(renderer),
    diagnostics,
    features: rendererInteractiveFeatureReport(renderer, diagnostics, input)
  };
}

/** Former `renderFrameAsync` — the async dispatch used by the WebGPU backend route. */
export async function a3dRenderFrameAsync(renderer: Renderer, input: ProductionRendererInput): Promise<RuntimeParityFrameRenderResult> {
  const frame = normalizeFrameInput(input);
  const diagnostics = await renderer.renderAsync(frame.source, frame.camera);
  return {
    backend: backendOf(renderer),
    diagnostics,
    features: rendererInteractiveFeatureReport(renderer, diagnostics, input)
  };
}
