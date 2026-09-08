import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/**
 * A1 native bloom pyramid probe (muse3jsparity-PRD Phase 1).
 *
 * Two variants share one scene body — a typed GLB subject, an emissive bar for
 * bloom to threshold on, a floor, fixed lighting and camera. The ONLY difference
 * is the bloom quality option, so any measured pixel delta is attributable to
 * the pyramid path versus the legacy single-scale path. The harness reports the
 * device-observed bloom diagnostics (quality, mip count, target bytes) alongside
 * the pixels: a quality request the renderer never executes must show up as
 * missing diagnostics rather than as a silent pass.
 */

type PyramidVariantId =
  | "bloom-performance"
  | "bloom-balanced"
  | "bloom-cinematic"
  | "bloom-hard-knee"
  | "bloom-soft-knee"
  | "bloom-v01"
  | "bloom-v01-disabled";

interface PyramidBloomCapture {
  readonly quality: string | undefined;
  readonly mipCount: number | undefined;
  readonly targetCount: number | undefined;
  readonly targetBytes: number | undefined;
  readonly halfFloat: boolean | undefined;
  readonly threshold: number | undefined;
  readonly intensity: number | undefined;
  readonly softKnee: number | undefined;
  readonly shoulder: number | undefined;
}

interface PyramidCapture {
  readonly id: PyramidVariantId;
  readonly bloom: PyramidBloomCapture | null;
  readonly actualPasses: readonly string[];
  readonly pixelBacked: boolean;
  readonly executionMode: string;
  readonly nativeDrawArrays: number;
  readonly nativeDrawElements: number;
  readonly hotPathReadbacks: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}


declare global {
  interface Window {
    __AURA3D_BLOOM_PYRAMID_RUNNER__?: {
      renderVariant(id: PyramidVariantId): Promise<PyramidCapture>;
      renderAsyncTwin(id: PyramidVariantId): Promise<PyramidCapture>;
      lifecycle(): Promise<{ mutationRejected: boolean; disposedRejected: boolean; resizeDeferred: boolean; resizeApplied: boolean; captureFailureRecovered: boolean; pausePreserved: boolean }>;
    };
    __AURA3D_BLOOM_PYRAMID_ERROR__?: string;
  }
}

const variantIds: readonly PyramidVariantId[] = [
  "bloom-performance",
  "bloom-balanced",
  "bloom-cinematic",
  "bloom-hard-knee",
  "bloom-soft-knee"
];

void run().catch((error: unknown) => {
  window.__AURA3D_BLOOM_PYRAMID_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_BLOOM_PYRAMID_RUNNER__ = {
    renderVariant: async (id) => renderVariant(id),
    renderAsyncTwin: async (id) => renderVariant(id, true),
    lifecycle: async () => lifecycle()
  };
}

async function renderVariant(id: PyramidVariantId, asynchronous = false): Promise<PyramidCapture> {
  const stage = requiredElement("bloom-pyramid-stage");
  stage.style.width = "720px";
  stage.style.height = "480px";
  stage.style.minHeight = "0px";
  stage.replaceChildren();
  const app = createAuraApp(stage, {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: sceneForVariant(id)
  });
  try {
    await app.ready();
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the bloom pyramid probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the bloom pyramid probe.");
    let nativeDrawArrays = 0, nativeDrawElements = 0, hotPathReadbacks = 0;
    const originalDrawArrays = gl.drawArrays.bind(gl);
    const originalDrawElements = gl.drawElements.bind(gl);
    const originalReadPixels = gl.readPixels.bind(gl);
    gl.drawArrays = (...args) => { nativeDrawArrays++; originalDrawArrays(...args); };
    gl.drawElements = (...args) => { nativeDrawElements++; originalDrawElements(...args); };
    // Reject a CPU fallback at its actual native readback boundary. The explicit
    // capture below runs only after restoring this method.
    gl.readPixels = () => { hotPathReadbacks++; throw new Error("Hot-path GPU readback is forbidden"); };
    try {
      if (asynchronous) await app.stepAsync(1 / 60);
      else app.step(1 / 60);
    } finally {
      gl.drawArrays = originalDrawArrays;
      gl.drawElements = originalDrawElements;
      gl.readPixels = originalReadPixels;
    }
    if (app.diagnostics().errors.length) throw new Error(app.diagnostics().errors.join("; "));
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    const deviceBloom = diagnostics.renderer?.runtime.bloom ?? null;
    return {
      id, nativeDrawArrays, nativeDrawElements, hotPathReadbacks,
      bloom: toBloomCapture(deviceBloom),
      actualPasses: [...(diagnostics.renderer?.postprocess?.actualPasses ?? [])],
      pixelBacked: diagnostics.renderer?.postprocess?.pixelBacked ?? false,
      executionMode: diagnostics.renderer?.postprocess?.executionMode ?? "unknown",
      pixels: Array.from(pixels),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    await app.disposeAsync();
  }
}

function sceneForVariant(id: PyramidVariantId) {
  const builder = scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 2.4, 4.4], target: [0, 0.7, 0], fov: 40 }))
    .add(primitives.plane({
      name: "bloom pyramid floor",
      material: material.pbr({ color: "#9aa2ae", roughness: 0.82, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(model(assets.robotcand, {
      name: "bloom pyramid typed subject",
      targetHeight: 1.5
    }).position(0, 0.78, 0).runtime({ id: "subject" }))
    .add(primitives.box({
      name: "bloom pyramid emissive bar",
      material: material.emissive({ color: "#0b1220", emissive: "#63f5ff", emissiveIntensity: 6 })
    }).position(0, 1.05, -1.2).scale([2.6, 0.18, 0.18]))
    .add(lights.directional({ name: "bloom pyramid key", position: [2.6, 4.2, 2.4], intensity: 2 }));
  if (id === "bloom-performance") {
    builder.add(effects.bloom({ name: "pyramid performance probe", intensity: 1.4, threshold: 0.45, radius: 4 }));
  } else if (id === "bloom-balanced") {
    builder.add(effects.bloom({ name: "pyramid balanced probe", intensity: 1.4, threshold: 0.45, radius: 4, quality: "balanced" }));
  } else if (id === "bloom-cinematic") {
    builder.add(effects.bloom({ name: "pyramid cinematic probe", intensity: 1.4, threshold: 0.45, radius: 4, quality: "cinematic" }));
  } else if (id === "bloom-hard-knee") {
    builder.add(effects.bloom({ name: "pyramid hard knee probe", intensity: 1.4, threshold: 0.45, radius: 4, quality: "balanced", softKnee: 0, shoulder: 0 }));
  } else if (id === "bloom-soft-knee") {
    builder.add(effects.bloom({ name: "pyramid soft knee probe", intensity: 1.4, threshold: 0.45, radius: 4, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }));
  } else if (id === "bloom-v01") {
    builder.add(effects.bloom({ name: "V01 frozen bloom probe", intensity: 0.35, threshold: 0.7, radius: 0.38, quality: "cinematic" }));
  }
  // bloom-v01-disabled intentionally retains the identical scene with no bloom.

  return builder;
}

/** Dispose during a root native submission; synchronous mutation must fail loudly. */
async function lifecycle(): Promise<{ mutationRejected: boolean; disposedRejected: boolean; resizeDeferred: boolean; resizeApplied: boolean; captureFailureRecovered: boolean; pausePreserved: boolean }> {
  const stage = requiredElement("bloom-pyramid-stage");
  const app = createAuraApp(stage, {
    autoStart: false, resize: true, pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: sceneForVariant("bloom-balanced")
  });
  await app.ready();
  const canvas = app.canvas!;
  const initialWidth = canvas.width;
  let resizeDeferred = false;
  let requestedResize = false;
  const resizeFrame = () => {
    if (requestedResize) return;
    requestedResize = true;
    stage.style.width = "640px";
    window.dispatchEvent(new Event("resize"));
    resizeDeferred = canvas.width === initialWidth;
    app.pause();
  };
  app.onFrame(resizeFrame);
  await app.stepAsync(1 / 60);
  app.offFrame(resizeFrame);
  const resizeApplied = canvas.width === 640;
  const pausePreserved = app.runtime.paused;
  const originalCapture = canvas.toDataURL;
  let captureFailed = false;
  canvas.toDataURL = () => { throw new Error("injected capture failure"); };
  try { app.screenshot(); } catch { captureFailed = true; }
  finally { canvas.toDataURL = originalCapture; }
  const priorFrame = app.runtime.frame;
  await app.stepAsync(1 / 60);
  const captureFailureRecovered = captureFailed && app.runtime.frame === priorFrame + 1 && app.screenshot().dataUrl.startsWith("data:image/png");
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  app.onFrame(() => started());
  const pending = app.stepAsync(1 / 60);
  // Attach a handler before disposal can reject the submission.
  const observed = pending.catch(() => undefined);
  await entered;
  let mutationRejected = false;
  try { app.setScene(sceneForVariant("bloom-performance")); } catch { mutationRejected = true; }
  await app.disposeAsync();
  await observed;
  let disposedRejected = false;
  try { await app.stepAsync(1 / 60); } catch { disposedRejected = true; }
  return { mutationRejected, disposedRejected, resizeDeferred, resizeApplied, captureFailureRecovered, pausePreserved };
}

function toBloomCapture(deviceBloom: {
  readonly quality?: string;
  readonly mipCount?: number;
  readonly targetCount?: number;
  readonly targetBytes?: number;
  readonly halfFloat?: boolean;
  readonly threshold?: number;
  readonly intensity?: number;
  readonly softKnee?: number;
  readonly shoulder?: number;
} | null | undefined): PyramidBloomCapture | null {
  if (!deviceBloom) return null;
  return {
    quality: deviceBloom.quality,
    mipCount: deviceBloom.mipCount,
    targetCount: deviceBloom.targetCount,
    targetBytes: deviceBloom.targetBytes,
    halfFloat: deviceBloom.halfFloat,
    threshold: deviceBloom.threshold,
    intensity: deviceBloom.intensity,
    softKnee: deviceBloom.softKnee,
    shoulder: deviceBloom.shoulder
  };
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Bloom pyramid harness is missing #${id}.`);
  return element;
}

export { variantIds };
