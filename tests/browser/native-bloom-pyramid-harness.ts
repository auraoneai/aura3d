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
import { Renderer } from "@aura3d/rendering";
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
  | "bloom-soft-knee";

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
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

interface AsyncTwinCapture {
  readonly executionMode: string;
  readonly bloom: PyramidBloomCapture | null;
  readonly passNames: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_BLOOM_PYRAMID_RUNNER__?: {
      renderVariant(id: PyramidVariantId): Promise<PyramidCapture>;
      renderAsyncTwin(): Promise<AsyncTwinCapture>;
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
    renderAsyncTwin: async () => renderAsyncTwin()
  };
}

async function renderVariant(id: PyramidVariantId): Promise<PyramidCapture> {
  const stage = requiredElement("bloom-pyramid-stage");
  stage.style.width = "720px";
  stage.style.height = "480px";
  stage.style.minHeight = "0px";
  stage.replaceChildren();
  const app = createAuraApp(stage, {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: sceneForVariant(id)
  });
  try {
    await waitForAppDraw(app);
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the bloom pyramid probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the bloom pyramid probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    const deviceBloom = diagnostics.renderer?.runtime.bloom ?? null;
    return {
      id,
      bloom: toBloomCapture(deviceBloom),
      actualPasses: [...(diagnostics.renderer?.postprocess?.actualPasses ?? [])],
      pixelBacked: diagnostics.renderer?.postprocess?.pixelBacked ?? false,
      executionMode: diagnostics.renderer?.postprocess?.executionMode ?? "unknown",
      pixels: Array.from(pixels),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    app.dispose();
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
  } else {
    builder.add(effects.bloom({ name: "pyramid soft knee probe", intensity: 1.4, threshold: 0.45, radius: 4, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }));
  }
  return builder;
}

/**
 * Async twin (muse3jsparity-PRD A1.1): the duplicate-gated
 * `executeFusedLdrPostprocessAsync` path must land on the same fused-native
 * execution mode. Root routes never drive `renderAsync`, so this is proven at
 * the rendering-package level and labeled as such — never as root proof.
 */
async function renderAsyncTwin(): Promise<AsyncTwinCapture> {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 120;
  document.body.appendChild(canvas);
  const renderer = await Renderer.create({ backend: "webgl2", canvas, width: 160, height: 120 });
  try {
    const diagnostics = await renderer.renderAsync({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba8",
        bloom: { threshold: 0.45, intensity: 1.4, radius: 4, quality: "balanced", softKnee: 0.25, shoulder: 0.3 }
      }
    });
    const deviceBloom = renderer.getDiagnostics().bloom ?? null;
    return {
      executionMode: diagnostics.postprocessPlan?.executionMode ?? "unknown",
      bloom: toBloomCapture(deviceBloom),
      passNames: [...(diagnostics.postprocessPassNames ?? [])]
    };
  } finally {
    renderer.dispose();
    canvas.remove();
  }
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

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`Bloom pyramid variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Bloom pyramid harness is missing #${id}.`);
  return element;
}

export { variantIds };
