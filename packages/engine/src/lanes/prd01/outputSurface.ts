/**
 * PRD-01 C-05 output surface (PR 0 stub). The C-38 extension factory mounts
 * this on `app.output` for every app; until Phase 2/4 land the OutputPass and
 * present path, the surface records requested intent honestly and delegates to
 * what exists today:
 *  - `capture()` delegates to `app.screenshot()` (canvas PNG).
 *  - `setOutputOverlay()` mounts a `.a3d-output-overlay` DOM element over the
 *    app's canvas (documented dom-fallback semantics).
 *  - `setOutput()` records intent; `diagnostics().output` reports requested vs
 *    applied so the divergence is visible instead of silent.
 *  - `onRendererError()` fires for errors observed via `app.diagnostics()`.
 */

import type { AuraApp, AuraCreateAppOptions } from "../../agent-api/index";
import type { AuraOutputOptions, AuraOutputOverlay, AuraOutputSurface } from "../../contracts/output";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { PRD01_OUTPUT_STATE, type Prd01OutputState } from "./diagnostics";

export const PRD01_OUTPUT_DISPOSE = Symbol.for("a3d.prd01.output-dispose");

type RendererErrorListener = (e: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void;

function findAppCanvas(app: AuraApp): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const shot = app.screenshot();
  if (shot.width <= 0) return null;
  // The lane bench page mounts exactly one canvas; when several exist the
  // overlay is reported as not applied rather than guessed.
  const canvases = Array.from(document.querySelectorAll("canvas"));
  const candidates = canvases.filter((canvas) => canvas.width === shot.width && canvas.height === shot.height);
  return candidates.length === 1 ? candidates[0]! : null;
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (typeof fetch === "function") return fetch(dataUrl).then((response) => response.blob());
  return Promise.resolve(new Blob([dataUrl], { type: "image/png" }));
}

export function createPrd01OutputSurface(
  app: AuraApp,
  ctx: { readonly flags: QrFlags; readonly options: AuraCreateAppOptions }
): AuraOutputSurface {
  const requested: Record<string, unknown> = { ...(ctx.options.output ?? {}) };
  const applied: Record<string, unknown> = {};
  const listeners = new Set<RendererErrorListener>();
  const emitted: { code: string; message: string }[] = [];
  let overlayEl: HTMLDivElement | null = null;
  let disposed = false;
  let lastErrorCount = 0;
  void ctx.flags; // Phase 2/4: the real output path switches on A3D_QR_CORE; the stub is identical either way.

  const emitObservedErrors = (): void => {
    if (listeners.size === 0) return;
    let errors: readonly string[] = [];
    try {
      errors = app.diagnostics().errors;
    } catch {
      return;
    }
    if (errors.length <= lastErrorCount) return;
    for (const message of errors.slice(lastErrorCount)) {
      const entry = { code: "renderer-error", message: String(message) };
      emitted.push(entry);
      for (const listener of listeners) listener(entry);
    }
    lastErrorCount = errors.length;
  };
  const errorWatch: ReturnType<typeof setInterval> | undefined =
    typeof setInterval === "function" ? setInterval(emitObservedErrors, 400) : undefined;

  const state: Prd01OutputState = {
    snapshot: () => ({
      implementation: "stub" as const,
      requested: { ...requested },
      applied: { ...applied },
      overlay: { mounted: overlayEl !== null, via: overlayEl === null ? "none" : "dom" },
      rendererErrors: [...emitted]
    })
  };

  const surface = {
    [PRD01_OUTPUT_STATE]: state,
    setOutput(output: Partial<AuraOutputOptions>): void {
      Object.assign(requested, output);
      // Nothing consumes output options until the Phase-2/4 present path lands;
      // the requested-vs-applied divergence is reported via diagnostics().output.
    },
    setOutputOverlay(overlay: AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" } {
      if (disposed) return { applied: false, reason: "disposed" };
      const canvas = findAppCanvas(app);
      if (!canvas) return { applied: false, reason: "dom-fallback" };
      overlayEl ??= document.createElement("div");
      overlayEl.className = "a3d-output-overlay";
      const rect = canvas.getBoundingClientRect();
      overlayEl.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:2;`;
      const flash = overlay.flash ?? [0, 0, 0, 0];
      const vignette = overlay.vignette ?? [0, 0, 0, 0];
      overlayEl.style.background = `rgba(${Math.round(flash[0] * 255)},${Math.round(flash[1] * 255)},${Math.round(flash[2] * 255)},${flash[3]})`;
      overlayEl.style.boxShadow = vignette[3] > 0 ? `inset 0 0 ${Math.round(rect.width * vignette[2] * 100)}px rgba(0,0,0,${vignette[3]})` : "";
      if (overlayEl.parentElement !== document.body) document.body.appendChild(overlayEl);
      return { applied: true, reason: "dom-fallback" };
    },
    async capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob> {
      const shot = app.screenshot();
      const blob = await dataUrlToBlob(shot.dataUrl);
      if (options?.type === "image-bitmap" && typeof createImageBitmap === "function") {
        return createImageBitmap(blob);
      }
      return blob;
    },
    onRendererError(listener: RendererErrorListener): () => void {
      listeners.add(listener);
      emitObservedErrors();
      return () => {
        listeners.delete(listener);
      };
    }
  };

  // C-05 flattened members (CONTRACTS.md C-38 note): the extension registry
  // only assigns `app[ext.member]`; flattening is the provider's job.
  const mutableApp = app as AuraApp & {
    setOutput?: AuraOutputSurface["setOutput"];
    setOutputOverlay?: AuraOutputSurface["setOutputOverlay"];
    capture?: AuraOutputSurface["capture"];
    onRendererError?: AuraOutputSurface["onRendererError"];
  };
  mutableApp.setOutput = surface.setOutput;
  mutableApp.setOutputOverlay = surface.setOutputOverlay;
  mutableApp.capture = surface.capture;
  mutableApp.onRendererError = surface.onRendererError;

  const disposable = surface as AuraOutputSurface & { [PRD01_OUTPUT_STATE]: Prd01OutputState; [PRD01_OUTPUT_DISPOSE]: () => void };
  disposable[PRD01_OUTPUT_DISPOSE] = () => {
    disposed = true;
    if (errorWatch !== undefined) clearInterval(errorWatch);
    overlayEl?.remove();
    overlayEl = null;
    listeners.clear();
  };
  return disposable;
}

export function disposePrd01OutputSurface(surface: AuraOutputSurface): void {
  (surface as AuraOutputSurface & { [PRD01_OUTPUT_DISPOSE]?: () => void })[PRD01_OUTPUT_DISPOSE]?.();
}
