/**
 * PRD-01 C-05 output surface. The C-38 extension factory mounts this on
 * `app.output` for every app:
 *  - `setOutput()`/`setOutputOverlay()` forward to the live `Renderer` via the
 *    Q-15-1 `PRD01_RENDERER` seam when `A3D_QR_CORE_OUTPUT` is on and the
 *    mount has landed; calls before mount flush on the error-watch interval
 *    or at `capture()`. Off the flag (or another backend) the surface records
 *    intent and `setOutputOverlay` keeps the DOM fallback.
 *  - `capture()` renders one frame synchronously and readPixels the canvas
 *    framebuffer in the same task (`app.screenshot()` PNG fallback).
 *  - `diagnostics().output` reports requested vs applied so divergence is
 *    visible instead of silent.
 *  - `onRendererError()` fires for errors observed via `app.diagnostics()`.
 */

import type { AuraApp, AuraCreateAppOptions } from "../../agent-api/index";
import type { AuraOutputOptions, AuraOutputOverlay, AuraOutputSurface } from "../../contracts/output";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { qrCoreOutputOn } from "@aura3d/rendering";
import type { AuraToneMappingOperator } from "../../contracts/output";
import { PRD01_OUTPUT_STATE, type Prd01OutputState } from "./diagnostics";

/**
 * C-05 URL reader (Phase 5, §14): games opt in to the tonemap A/B with
 * `?aura3d-tonemap=aces|agx` (plus `&aura3d-exp=<n>` for the ramp). Wins over
 * `options.output.toneMapping`; invalid values are ignored. Re-exported
 * through `lanes/prd01.ts`.
 */
export function readAura3dTonemapQuery(search?: string): { readonly toneMapping?: AuraToneMappingOperator; readonly exposure?: number } {
  if (typeof window === "undefined" && search === undefined) return {};
  const params = new URLSearchParams(search ?? window.location.search);
  const tm = params.get("aura3d-tonemap") ?? params.get("tm");
  const operators: readonly AuraToneMappingOperator[] = ["none", "linear", "reinhard", "aces", "agx", "neutral"];
  const expParam = params.get("aura3d-exp") ?? params.get("exp");
  const exp = expParam === null ? NaN : Number(expParam);
  return {
    ...(tm !== null && (operators as readonly string[]).includes(tm) ? { toneMapping: tm as AuraToneMappingOperator } : {}),
    ...(Number.isFinite(exp) ? { exposure: exp } : {})
  };
}

export const PRD01_OUTPUT_DISPOSE = Symbol.for("a3d.prd01.output-dispose");

/** Q-15-1 seam: the live `Renderer` hangs here once the production mount lands. */
const PRD01_RENDERER = Symbol.for("a3d.prd01.renderer");

interface Prd01OutputRenderer {
  setOutput(options: {
    readonly toneMapping?: AuraOutputOptions["toneMapping"];
    readonly exposure?: number;
    readonly dithering?: boolean;
    readonly backgroundCoverage?: boolean;
    readonly overlay?: AuraOutputOverlay;
  }): void;
  setOutputOverlay(overlay: AuraOutputOverlay | null): void;
  readonly appliedOutput?: unknown;
}

function laneRenderer(app: AuraApp): Prd01OutputRenderer | undefined {
  return (app as unknown as Record<symbol, Prd01OutputRenderer | undefined>)[PRD01_RENDERER];
}

/** AuraOutputOptions → Renderer output options (autoExposure/preset are lane-03's). */
function toRendererOutput(output: Partial<AuraOutputOptions>): {
  readonly toneMapping?: AuraOutputOptions["toneMapping"];
  readonly exposure?: number;
  readonly dithering?: boolean;
  readonly backgroundCoverage?: boolean;
} {
  return {
    ...(output.toneMapping !== undefined ? { toneMapping: output.toneMapping } : {}),
    ...(output.exposure !== undefined ? { exposure: output.exposure } : {}),
    ...(output.dither !== undefined ? { dithering: output.dither } : {}),
    ...(output.backgroundPassthrough !== undefined ? { backgroundCoverage: output.backgroundPassthrough } : {})
  };
}

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
  const requested: Record<string, unknown> = { ...(ctx.options.output ?? {}), ...readAura3dTonemapQuery() };
  const applied: Record<string, unknown> = {};
  const outputPath = qrCoreOutputOn(ctx.flags);
  let pendingOutput: Partial<AuraOutputOptions> | null = outputPath ? { ...(requested as Partial<AuraOutputOptions>) } : null;
  const listeners = new Set<RendererErrorListener>();
  const emitted: { code: string; message: string }[] = [];
  let overlayEl: HTMLDivElement | null = null;
  let disposed = false;
  let lastErrorCount = 0;

  let lastDegradationCount = 0;
  const emitObservedErrors = (): void => {
    if (listeners.size === 0) return;
    try {
      const diagnostics = app.diagnostics() as {
        readonly errors: readonly string[];
        readonly degradations?: readonly { readonly code: string; readonly message: string; readonly cause?: unknown }[];
      };
      // C-36/C-05 real: forward degradations (renderer-mount-failed et al.)
      // with their actual codes and causes before the plain errors.
      const degradations = diagnostics.degradations ?? [];
      if (degradations.length > lastDegradationCount) {
        for (const degradation of degradations.slice(lastDegradationCount)) {
          const entry = { code: degradation.code, message: degradation.message, cause: degradation.cause };
          emitted.push(entry);
          for (const listener of listeners) listener(entry);
        }
        lastDegradationCount = degradations.length;
      }
      const errors = diagnostics.errors;
      if (errors.length <= lastErrorCount) return;
      for (const message of errors.slice(lastErrorCount)) {
        const entry = { code: "renderer-error", message: String(message) };
        emitted.push(entry);
        for (const listener of listeners) listener(entry);
      }
      lastErrorCount = errors.length;
    } catch {
      return;
    }
  };
  /** Apply any requested-but-unmounted output once `PRD01_RENDERER` attaches. */
  const flushPendingOutput = (): void => {
    if (pendingOutput === null) return;
    const renderer = outputPath ? laneRenderer(app) : undefined;
    if (!renderer) return;
    const pending = pendingOutput;
    pendingOutput = null;
    renderer.setOutput(toRendererOutput(pending));
    Object.assign(applied, pending);
  };

  const errorWatch: ReturnType<typeof setInterval> | undefined =
    typeof setInterval === "function"
      ? setInterval(() => {
          emitObservedErrors();
          flushPendingOutput();
        }, 400)
      : undefined;

  const state: Prd01OutputState = {
    snapshot: () => ({
      implementation: outputPath && laneRenderer(app) ? ("real" as const) : ("stub" as const),
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
      const renderer = outputPath ? laneRenderer(app) : undefined;
      if (!renderer) {
        // Mount pending: the watch interval flushes when PRD01_RENDERER attaches.
        pendingOutput = { ...(pendingOutput ?? {}), ...output };
        return;
      }
      renderer.setOutput(toRendererOutput(output));
      Object.assign(applied, output);
    },
    setOutputOverlay(overlay: AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" } {
      if (disposed) return { applied: false, reason: "disposed" };
      // Phase 4 (C-05): the in-shader OutputPass overlay is the real path under
      // A3D_QR_CORE_OUTPUT; DOM overlay remains the flag-off/other-backend fallback.
      const renderer = outputPath ? laneRenderer(app) : undefined;
      if (renderer) {
        flushPendingOutput();
        renderer.setOutputOverlay({
          flash: overlay.flash ?? [0, 0, 0, 0],
          vignette: overlay.vignette ?? [0, 0, 0, 0],
          shape: overlay.shape ?? [0.7, 0.3],
          fade: overlay.fade ?? [0, 0, 0, 0]
        });
        return { applied: true };
      }
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
      // §6.9/C-05 real readback: render one frame synchronously (app.step) and
      // readPixels the canvas framebuffer in the same task — before the browser
      // composites — so preserveDrawingBuffer is never set. GL origin is
      // bottom-left; rows are flipped for the image APIs.
      flushPendingOutput();
      const canvas = findAppCanvas(app);
      const gl = canvas?.getContext("webgl2") as WebGL2RenderingContext | null;
      if (canvas && gl && !disposed) {
        try {
          app.step();
          const width = canvas.width;
          const height = canvas.height;
          if (width > 0 && height > 0) {
            const pixels = new Uint8Array(width * height * 4);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const flipped = new Uint8ClampedArray(width * height * 4);
            const rowBytes = width * 4;
            for (let y = 0; y < height; y++) {
              flipped.set(pixels.subarray((height - 1 - y) * rowBytes, (height - y) * rowBytes), y * rowBytes);
            }
            const bitmap = await createImageBitmap(new ImageData(flipped, width, height));
            if (options?.type === "image-bitmap") return bitmap;
            const offscreen = new OffscreenCanvas(width, height);
            const ctx2d = offscreen.getContext("2d");
            if (ctx2d) {
              ctx2d.drawImage(bitmap, 0, 0);
              bitmap.close();
              return offscreen.convertToBlob({ type: "image/png" });
            }
            return bitmap;
          }
        } catch {
          // Non-webgl2 backends or a failed step() fall through to the PNG path.
        }
      }
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
