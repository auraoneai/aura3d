/**
 * PRD-15 T2.5 — the production-runtime renderer reports, surfaced through the
 * engine devtools module as `rendererProofCapture(renderer, input)`,
 * `rendererFeatureReport(renderer)` and `rendererShadowReport(renderer)`.
 *
 * Implementation lives in `packages/rendering/src/production-runtime/renderProofs.ts`:
 * `workflows` cannot import `engine` (engine depends on workflows), so the
 * render-side proof machinery is hosted next to `analyzePixels` and re-exported
 * here unchanged — this module is the public entry point named by T2.5.
 */
import type { Renderer } from "@aura3d/rendering";
import { renderer } from "./rendererDiagnostics.js";

export {
  validateProductionRendererInput,
  rendererFeatureReport,
  rendererInteractiveFeatureReport,
  rendererShadowReport,
  rendererProofCapture
} from "@aura3d/rendering/production-runtime";

/**
 * PRD-15 T2.9 — moved verbatim from `advanced-runtime/A3DRenderer.evidence()`:
 * the wrapper's per-instance bookkeeping (`lastFrameTimeMs`, `renderSize`,
 * `disposed`, `lastDiagnostics`) is constructor-injected state that no longer
 * exists now that `A3DRenderer` aliases the base `Renderer`. `frameTimeMs` and
 * `renderSize` are accepted through options; `disposed`/`contextLost` are read
 * from the live device.
 */
export interface A3DRendererEvidenceOptions {
  readonly assetFailures?: readonly string[];
  /** Last measured frame time — the deleted wrapper tracked this per render. */
  readonly frameTimeMs?: number;
  /** Canvas-less devices expose no size; callers pass the last known frame size. */
  readonly renderSize?: { readonly width: number; readonly height: number };
}

export interface A3DRendererEvidence {
  readonly backend: Renderer["device"]["kind"];
  readonly drawCalls: number;
  readonly frameTimeMs: number;
  readonly renderSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly assetFailures: readonly string[];
  readonly contextLost: boolean;
  readonly disposed: boolean;
  readonly lastError: string | null;
}

export function a3dRendererEvidence(renderer: Renderer, options: A3DRendererEvidenceOptions = {}): A3DRendererEvidence {
  const diagnostics = renderer.getDiagnostics();
  const canvas = (renderer.device as { readonly canvas?: { readonly width: number; readonly height: number } }).canvas;
  return {
    backend: renderer.device.kind,
    drawCalls: diagnostics.drawCalls,
    frameTimeMs: options.frameTimeMs ?? 0,
    renderSize: options.renderSize ?? (canvas ? { width: canvas.width, height: canvas.height } : { width: 0, height: 0 }),
    assetFailures: [...(options.assetFailures ?? [])],
    contextLost: diagnostics.contextLost || renderer.device.contextLost,
    disposed: renderer.device.disposed,
    lastError: diagnostics.lastError
  };
}
