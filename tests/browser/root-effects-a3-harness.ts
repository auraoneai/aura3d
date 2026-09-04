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

type A3VariantId =
  | "baseline"
  | "color-grade"
  | "outline"
  | "fxaa"
  | "ssr"
  | "dof"
  | "motion-blur"
  | "taa";

interface A3Capture {
  readonly id: A3VariantId;
  readonly actualPasses: readonly string[];
  readonly requestedPasses: readonly string[];
  readonly pixelBacked: boolean;
  readonly executionMode: string;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __AURA3D_A3_RUNNER__?: {
      renderVariant(id: A3VariantId): Promise<A3Capture>;
    };
    __AURA3D_A3_ERROR__?: string;
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
    renderVariant: async (id) => renderVariant(id)
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
