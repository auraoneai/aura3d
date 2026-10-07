// PRD-15 T2.9 — the advanced-runtime `A3DRenderer` wrapper collapsed onto the
// single C-29 `Renderer` (resizeToDisplay :501, startAnimationLoop :525,
// render/renderAsync overloads :539-541/:596, captureFrame :785 all exist on
// the base class). The wrapper's `evidence()` moved to
// `agent-api/devtools/rendererReports.ts` as `a3dRendererEvidence` — the
// per-instance bookkeeping it reported (frameTimeMs, renderSize, disposed,
// lastDiagnostics) has no public accessor on `Renderer`; see Q-01-4 for the
// requested frame-size accessor.
// Callers that used `render(a3dScene)`/`captureFrame(a3dScene)` pass
// `a3dScene.toRenderSource()` directly — the wrapper's `normalizeSource`
// unwrapping moved to call sites.
export { Renderer as A3DRenderer } from "@aura3d/rendering";
export type { RendererOptions as A3DRendererOptions } from "@aura3d/rendering";
export type {
  A3DRendererEvidence,
  A3DRendererEvidenceOptions
} from "../agent-api/devtools/rendererReports.js";
