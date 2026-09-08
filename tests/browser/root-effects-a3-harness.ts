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
 * A3 root effects probe (muse3jsparity-PRD Phase 1).
 *
 * Every variant shares one scene body — a typed GLB subject, an emissive bar,
 * a floor, fixed lighting and camera. The ONLY difference is the single A3
 * effect node, so any measured pixel delta is attributable to that pass.
 * Withheld intents (motion-blur, taa) must keep drawing and surface an
 * explicit warning instead of submitting a doomed pass.
 */

export type A3VariantId =
  | "baseline"
  | "color-grade"
  | "outline"
  | "fxaa"
  | "ssr"
  | "dof"
  | "motion-blur"
  | "taa";

export interface A3Capture {
  readonly id: A3VariantId;
  readonly actualPasses: readonly string[];
  readonly requestedPasses: readonly string[];
  readonly pixelBacked: boolean;
  readonly executionMode: string;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly nativeTemporalPasses?: number;
  readonly nativeTemporalBindings?: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __AURA3D_A3_RUNNER__?: {
      renderVariant(id: A3VariantId): Promise<A3Capture>;
      renderTemporalSequence: typeof renderTemporalSequence;
    };
    __AURA3D_A3_ERROR__?: string;
    __AURA3D_R02_PHASE__?: { effect: string; motion: string; phase: string; frame: number; diagnostics?: unknown };
  }
}

const variantIds: readonly A3VariantId[] = [
  "baseline",
  "color-grade",
  "outline",
  "fxaa",
  "ssr",
  "dof",
  "motion-blur",
  "taa"
];

void run().catch((error: unknown) => {
  window.__AURA3D_A3_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_A3_RUNNER__ = {
    renderVariant: async (id) => renderVariant(id),
    renderTemporalSequence
  };
}

async function renderVariant(id: A3VariantId): Promise<A3Capture> {
  const stage = requiredElement("a3-stage");
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
    if (!canvas) throw new Error("Aura app did not expose a canvas for the A3 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the A3 probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    return {
      id,
      actualPasses: [...(diagnostics.renderer?.postprocess?.actualPasses ?? [])],
      requestedPasses: [...(diagnostics.renderer?.postprocess?.requestedPasses ?? [])],
      pixelBacked: diagnostics.renderer?.postprocess?.pixelBacked ?? false,
      executionMode: diagnostics.renderer?.postprocess?.executionMode ?? "unknown",
      warnings: [...(diagnostics.warnings ?? [])],
      drawCalls: diagnostics.drawCalls,
      pixels: Array.from(pixels),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    app.dispose();
  }
}

function sceneForVariant(id: A3VariantId) {
  const builder = scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 2.4, 4.4], target: [0, 0.7, 0], fov: 40 }))
    .add(primitives.plane({
      name: "a3 floor",
      material: material.pbr({ color: "#9aa2ae", roughness: 0.82, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(model(assets.robotcand, {
      name: "a3 typed subject",
      targetHeight: 1.5
    }).position(0, 0.78, 0).runtime({ id: "subject" }))
    .add(primitives.box({
      name: "a3 emissive bar",
      material: material.emissive({ color: "#0b1220", emissive: "#63f5ff", emissiveIntensity: 6 })
    }).position(0, 1.05, -1.2).scale([2.6, 0.18, 0.18]))
    .add(lights.directional({ name: "a3 key", position: [2.6, 4.2, 2.4], intensity: 2 }));
  switch (id) {
    case "color-grade":
      builder.add(effects.colorGrade({ name: "a3 grade probe", contrast: 1.35, saturation: 1.4 }));
      break;
    case "outline":
      builder.add(effects.outline({ name: "a3 outline probe", width: 4 }));
      break;
    case "fxaa":
      builder.add(effects.antiAlias({ name: "a3 fxaa probe", mode: "fxaa" }));
      break;
    case "ssr":
      builder.add(effects.screenSpaceReflections({ name: "a3 ssr probe", intensity: 0.9 }));
      break;
    case "dof":
      builder.add(effects.depthOfField({ name: "a3 dof probe", focus: 0.3, aperture: 0.6, maxBlur: 6 }));
      break;
    case "motion-blur":
      builder.add(effects.motionBlur({ name: "a3 motion probe", intensity: 0.5 }));
      break;
    case "taa":
      builder.add(effects.antiAlias({ name: "a3 taa probe", mode: "taa" }));
      break;
    case "baseline":
      break;
  }
  return builder;
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`A3 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`A3 harness is missing #${id}.`);
  return element;
}

export { variantIds };

/** Abstract geometric temporal fixture: no imported/deforming actor can mask velocity defects. */
async function renderTemporalSequence(effect: "baseline" | "motion-blur" | "taa", motion: "static" | "object" | "camera" | "cut" | "jitter" | "disocclusion" | "resume", resetEveryFrame = false, referenceScale = 1) {
  if (![1, 4, 8, 16].includes(referenceScale)) throw new RangeError("Temporal reference scale must be 1, 4, 8 or 16");
  const stage = requiredElement("a3-stage");
  stage.style.width = "240px"; stage.style.height = "160px"; stage.style.minHeight = "0px"; stage.setAttribute("data-aura3d-preserve-page-layout", ""); stage.replaceChildren();
  const temporalCanvas = document.createElement("canvas");
  temporalCanvas.width = 240 * referenceScale; temporalCanvas.height = 160 * referenceScale;
  temporalCanvas.style.width = "240px"; temporalCanvas.style.height = "160px";
  stage.append(temporalCanvas);
  const makeScene = (cut = false) => {
    const result = scene().background("#000000")
      .camera(motion === "camera" ? camera.flythrough({ from: [-.5, 0, 5], to: [.5, 0, 5], target: [0, 0, -100], seconds: .4, easing: "linear", fov: 40 }) : camera.perspective({ position: [cut ? 2 : 0, 0, 5], target: [0, 0, 0], fov: 40 }))
      .add(primitives.box({ name: "abstract temporal edge", material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1 }) }).scale([.3, 2, .1]).runtime({ id: "temporal-edge" }))
      .add(lights.ambient({ intensity: 1 }));
    if (effect === "taa") result.add(effects.antiAlias({ mode: "taa" }));
    if (effect === "motion-blur") result.add(effects.motionBlur({ intensity: 1 }));
    return result;
  };
  window.__AURA3D_R02_PHASE__ = { effect, motion, phase: "create", frame: -1 };
  console.info(`R02 start ${effect}/${motion}`);
  const app = createAuraApp(temporalCanvas, { pixelRatio: 1, resize: false, frameMode: "async", renderer: { mode: "production" }, scene: makeScene() });
  try {
    app.pause();
    window.__AURA3D_R02_PHASE__ = { effect, motion, phase: "ready", frame: -1 };
    await boundedTemporal(app.ready(), "ready");
    const frames: A3Capture[] = [];
    for (let frame = 0; frame < 24; frame++) {
      if (motion === "cut" && frame === 12) app.setScene(makeScene(true));
      if (motion === "object") app.nodes.require("temporal-edge").setPosition((frame - 12) * .035, 0, 0);
      if (motion === "jitter") app.nodes.require("temporal-edge").setPosition((frame % 2 ? 1 : -1) * .006824, 0, 0);
      if (motion === "disocclusion" || motion === "resume") app.nodes.require("temporal-edge").setPosition(frame < 12 ? -.75 : .75, 0, 0);
      if (resetEveryFrame || (motion === "resume" && frame === 12)) { app.resume(); app.pause(); }

      window.__AURA3D_R02_PHASE__ = { effect, motion, phase: "submit", frame, diagnostics: app.diagnostics() };
      if (frame === 0 || frame === 12 || frame === 23) console.info(`R02 submit ${effect}/${motion}/${frame}`);
      await boundedTemporal(app.stepAsync(1 / 60), `submit ${effect}/${motion}/${frame}`);
      window.__AURA3D_R02_PHASE__ = { effect, motion, phase: "readback", frame, diagnostics: app.diagnostics() };
      const canvas = app.canvas!;
      if (canvas.width !== 240 * referenceScale || canvas.height !== 160 * referenceScale) throw new Error(`R02 fixed backing size changed: ${canvas.width}x${canvas.height}`);
      const gl = canvas.getContext("webgl2")!;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      // Independently supersampled display-space reference. The production
      // acceptance path remains scale 1; references average actual GPU samples.
      const output = referenceScale === 1 ? pixels : new Uint8Array(240 * 160 * 4);
      if (referenceScale !== 1) {
        for (let y = 0; y < 160; y++) for (let x = 0; x < 240; x++) for (let channel = 0; channel < 4; channel++) {
          let sum = 0;
          for (let dy = 0; dy < referenceScale; dy++) for (let dx = 0; dx < referenceScale; dx++) {
            sum += pixels[((y * referenceScale + dy) * canvas.width + x * referenceScale + dx) * 4 + channel]!;
          }
          output[(y * 240 + x) * 4 + channel] = Math.round(sum / (referenceScale * referenceScale));
        }
      }
      const diagnostics = app.diagnostics();
      frames.push({ id: effect, actualPasses: [...(diagnostics.renderer?.postprocess.actualPasses ?? [])], requestedPasses: [...(diagnostics.renderer?.postprocess.requestedPasses ?? [])], pixelBacked: diagnostics.renderer?.postprocess.pixelBacked ?? false, executionMode: diagnostics.renderer?.postprocess.executionMode ?? "unknown", warnings: [...diagnostics.warnings], drawCalls: diagnostics.drawCalls, nativeTemporalPasses: diagnostics.renderer?.runtime.nativeTemporalPasses ?? 0, nativeTemporalBindings: diagnostics.renderer?.runtime.nativeTemporalBindings ?? 0, width: 240, height: 160, pixels: Array.from(output) });
    }
    return frames.map(({ pixels, ...frame }) => {
      let binary = "";
      for (let start = 0; start < pixels.length; start += 8192) binary += String.fromCharCode(...pixels.slice(start, start + 8192));
      return { ...frame, pixelsBase64: btoa(binary) };
    });
  } finally {
    console.info("R02 sequence final", JSON.stringify({ effect, motion, phase: window.__AURA3D_R02_PHASE__?.phase, frame: window.__AURA3D_R02_PHASE__?.frame }));
    await boundedTemporal(app.disposeAsync(), "dispose");
  }
}


async function boundedTemporal<T>(operation: Promise<T>, phase: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`R02 ${phase} exceeded 15s; ${JSON.stringify(window.__AURA3D_R02_PHASE__)}`)), 15_000);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
