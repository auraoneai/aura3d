/**
 * PRD-01 §15 Phase-2 app-level conformance (?tools=canvas-dpr|app-capture|renderer-mount-failure).
 * Canvas-DPR exercises §6.9 `resolveCanvasPixelRatio` through `Renderer.resizeToDisplay`;
 * app-capture exercises the real C-05 `capture()` (same-task readPixels, no
 * preserveDrawingBuffer) against `canvas.toDataURL()`; renderer-mount-failure
 * forces `ProductionRuntimeRenderer.create` to reject and records the C-36
 * forwarding contract end to end.
 */

import { Renderer, ProductionRuntimeRenderer, QUALITY_TIERS, resolveCanvasContextAttributes } from "@aura3d/rendering";
import { createAuraApp, scene, primitives, material, camera, lights } from "@aura3d/engine";

declare global {
  interface Window {
    __QR_DPR__?: CanvasDprReport;
    __QR_CAPTURE__?: AppCaptureReport;
    __QR_MOUNT__?: MountFailureReport;
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* ?tools=canvas-dpr — §6.9 backing = resolved pixelRatio × CSS size     */
/* ------------------------------------------------------------------ */

export interface CanvasDprReport {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly devicePixelRatio: number;
  readonly reportedPixelRatio: number;
  readonly errors: readonly string[];
}

export async function runCanvasDprTool(stage: HTMLElement): Promise<CanvasDprReport> {
  const errors: string[] = [];
  const canvas = document.createElement("canvas");
  canvas.style.width = "320px";
  canvas.style.height = "180px";
  stage.appendChild(canvas);
  let backingWidth = 0;
  let backingHeight = 0;
  let reportedPixelRatio = 0;
  const flagOn = (new URLSearchParams(window.location.search).get("a3d-qr") ?? "").split(",").includes("core");
  try {
    const renderer = await Renderer.create({
      canvas,
      backend: "webgl2",
      // §6.9: no explicit pixelRatio — High tier caps at 2, so DPR 2 wins at
      // deviceScaleFactor 2; the report asserts backing = 2× CSS.
      resolution: {},
      qualityTier: QUALITY_TIERS.high,
      // §6.9 lane canvas context attributes (flag-off keeps the legacy set).
      ...resolveCanvasContextAttributes({
        flagOn,
        warn: (message) => console.warn(message)
      })
    });
    renderer.resizeToDisplay();
    await nextFrame();
    backingWidth = canvas.width;
    backingHeight = canvas.height;
    reportedPixelRatio = renderer.resolutionReport.pixelRatio;
    renderer.dispose();
  } catch (error) {
    errors.push(String(error));
  }
  const report: CanvasDprReport = {
    cssWidth: 320,
    cssHeight: 180,
    backingWidth,
    backingHeight,
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    reportedPixelRatio,
    errors
  };
  window.__QR_DPR__ = report;
  return report;
}

/* ------------------------------------------------------------------ */
/* ?tools=app-capture — C-05 capture() real (same-task readPixels)       */
/* ------------------------------------------------------------------ */

export interface AppCaptureReport {
  readonly captureMime: string;
  readonly captureWidth: number;
  readonly captureHeight: number;
  readonly toDataUrlWidth: number;
  readonly toDataUrlHeight: number;
  readonly mad: number;
  readonly maxDiff: number;
  readonly captureNonBlank: boolean;
  readonly errors: readonly string[];
}

async function blobToPixels(blob: Blob): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const probe = document.createElement("canvas");
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const ctx = probe.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, probe.width, probe.height);
  return { data: image.data, width: image.width, height: image.height };
}

export async function runAppCaptureTool(stage: HTMLElement): Promise<AppCaptureReport> {
  const errors: string[] = [];
  const flags = new URLSearchParams(window.location.search).get("a3d-qr") ?? "none";
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  canvas.style.width = "128px";
  canvas.style.height = "96px";
  stage.appendChild(canvas);

  let captureMime = "";
  let captureWidth = 0;
  let captureHeight = 0;
  let urlWidth = 0;
  let urlHeight = 0;
  let mad = 0;
  let maxDiff = 0;
  let captureNonBlank = false;

  try {
    const snapshot = scene()
      .background("#2255aa")
      .add(
        primitives
          .box({ name: "capture-cube", material: material.emissive({ color: "#ffcc00" }) })
          .position(0, 0, 0)
      )
      .add(lights.directional({ position: [1, 3, 2], intensity: 2 }))
      .camera(camera.perspective({ fov: 50, position: [0, 0, 3] }))
      .toJSON();

    const app = createAuraApp(canvas, {
      scene: snapshot,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      pixelRatio: 1,
      resize: false,
      autoStart: false,
      qualityRebuild: { flags: [flags] }
    });
    await app.ready();
    app.step(1 / 30);
    await nextFrame();

    const captureFn = (app as { capture?: (o?: { type?: "image-bitmap" | "png-blob" }) => Promise<ImageBitmap | Blob> }).capture;
    if (!captureFn) {
      errors.push("app.capture is not mounted (extension did not resolve)");
    } else {
      // Same-task reference: a fresh step immediately before toDataURL reads
      // the pre-composite buffer, so the baseline is valid regardless of
      // preserveDrawingBuffer.
      app.step(1 / 30);
      const referenceUrl = canvas.toDataURL("image/png");
      const captureBlob = await captureFn({ type: "png-blob" });
      captureMime = captureBlob instanceof Blob ? captureBlob.type : "image-bitmap";

      const refBlob = await fetch(referenceUrl).then((r) => r.blob());
      const reference = await blobToPixels(refBlob);
      const captured = captureBlob instanceof Blob
        ? await blobToPixels(captureBlob)
        : await (async () => {
            const probe = document.createElement("canvas");
            probe.width = (captureBlob as ImageBitmap).width;
            probe.height = (captureBlob as ImageBitmap).height;
            const ctx = probe.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(captureBlob as ImageBitmap, 0, 0);
            const image = ctx.getImageData(0, 0, probe.width, probe.height);
            return { data: image.data, width: image.width, height: image.height };
          })();

      urlWidth = reference.width;
      urlHeight = reference.height;
      captureWidth = captured.width;
      captureHeight = captured.height;

      if (reference.width === captured.width && reference.height === captured.height) {
        const len = reference.data.length;
        let totalDiff = 0;
        let peak = 0;
        let nonZero = 0;
        for (let i = 0; i < len; i++) {
          const diff = Math.abs(captured.data[i]! - reference.data[i]!);
          totalDiff += diff;
          if (diff > peak) peak = diff;
          if (captured.data[i]! > 0) nonZero += 1;
        }
        mad = totalDiff / len;
        maxDiff = peak;
        captureNonBlank = nonZero > len * 0.9;
      } else {
        errors.push(`size mismatch: capture ${captured.width}x${captured.height} vs toDataURL ${reference.width}x${reference.height}`);
      }
    }
    app.dispose();
  } catch (error) {
    errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }

  const report: AppCaptureReport = {
    captureMime,
    captureWidth,
    captureHeight,
    toDataUrlWidth: urlWidth,
    toDataUrlHeight: urlHeight,
    mad,
    maxDiff,
    captureNonBlank,
    errors
  };
  window.__QR_CAPTURE__ = report;
  return report;
}

/* ------------------------------------------------------------------ */
/* ?tools=renderer-mount-failure — C-05/C-36 onRendererError forwarding  */
/* ------------------------------------------------------------------ */

export interface MountFailureReport {
  readonly readyResolved: boolean;
  readonly errorsCount: number;
  readonly errorsContainRendererMountFailed: boolean;
  readonly degradationsContainCode: boolean;
  readonly onRendererErrorFired: number;
  readonly firedCodes: readonly string[];
  readonly strictReadyRejected: boolean | null;
  readonly errors: readonly string[];
}

export async function runMountFailureTool(stage: HTMLElement): Promise<MountFailureReport> {
  const errors: string[] = [];
  const fired: { code: string; message: string }[] = [];
  let readyResolved = false;
  let errorsCount = 0;
  let errorsContainCode = false;
  let degradationsContainCode = false;
  let strictRejected: boolean | null = null;

  const originalCreate = ProductionRuntimeRenderer.create;
  (ProductionRuntimeRenderer as unknown as { create: typeof originalCreate }).create = () =>
    Promise.reject(new Error("prd01 forced renderer mount failure"));

  const mount = async (rendererOptions: Record<string, unknown>) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.style.width = "64px";
    canvas.style.height = "64px";
    stage.appendChild(canvas);
    const snapshot = scene()
      .add(primitives.box({ name: "mount-cube", material: material.emissive({ color: "#cc3355" }) }))
      .camera(camera.perspective({ fov: 50, position: [0, 0, 3] }))
      .toJSON();
    const app = createAuraApp(canvas, {
      scene: snapshot,
      renderer: { mode: "production", fallback: "safe-basic", ...rendererOptions },
      pixelRatio: 1,
      resize: false,
      autoStart: false,
      qualityRebuild: { flags: ["core"] }
    });
    return { app, canvas };
  };

  try {
    const { app } = await mount({});
    const unsubscribe = app.onRendererError?.((e: { code: string; message: string }) => fired.push(e));
    readyResolved = await app.ready().then(() => true).catch(() => false);
    // Errors land when the failed mount settles; give the watcher a beat.
    for (let i = 0; i < 40; i++) {
      const diagnostics = app.diagnostics() as {
        readonly errors: readonly string[];
        readonly degradations?: readonly { readonly code: string }[];
      };
      errorsCount = diagnostics.errors.length;
      errorsContainCode = diagnostics.errors.some((m) => /mount|renderer|fallback|failed/i.test(m));
      degradationsContainCode = diagnostics.degradations?.some((d) => d.code === "renderer-mount-failed") ?? false;
      if (fired.length > 0 || errorsCount > 0) break;
      await sleep(100);
    }
    unsubscribe?.();
    app.dispose();

    // strictMount is diagnosticOnly until lane 15's strict surface lands —
    // record what happens, the spec asserts it when the contract activates.
    const strict = await mount({ strictMount: true });
    strictRejected = await strict.app.ready().then(() => false).catch(() => true);
    strict.app.dispose();
  } catch (error) {
    errors.push(String(error));
  } finally {
    (ProductionRuntimeRenderer as unknown as { create: typeof originalCreate }).create = originalCreate;
  }

  const report: MountFailureReport = {
    readyResolved,
    errorsCount,
    errorsContainRendererMountFailed: errorsContainCode,
    degradationsContainCode,
    onRendererErrorFired: fired.length,
    firedCodes: fired.map((f) => f.code),
    strictReadyRejected: strictRejected,
    errors
  };
  window.__QR_MOUNT__ = report;
  return report;
}
