import {
  camera,
  createAuraApp,
  defineAuraAssets,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

/**
 * C3 texture-pipeline probe (muse3jsparity-PRD C3).
 *
 * Variants share one scene body: a single box subject, floor, fixed lighting
 * and camera. The ONLY differences are the box material: scalar baseline,
 * fully-disciplined textures (baseColor+emissive sRGB; normal+metal-rough+AO
 * linear) with the C3 default 8x sampler request, and the same maps with a
 * 1x request. The upgrade runs post-mount, so the harness polls
 * texturedMaterials until the swap lands instead of screenshotting the
 * scalar first frame.
 */

const textures = defineAuraAssets({
  checker: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-checker.png", hash: "99496e5e0a5e216a" },
  rough: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-rough.png", hash: "c027b3ed2eda3e09" },
  normal: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-normal.png", hash: "2ac1b91fd6c3f927" },
  occlusion: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-occlusion.png", hash: "c1occlusion00000000" },
  emissive: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-emissive.png", hash: "c1emissive00000000" }
});

type C3VariantId = "scalar" | "disciplined" | "aniso1";

interface C3TexturedMaterial {
  readonly nodeName: string;
  readonly levelName: string;
  readonly status: string;
  readonly slots: readonly string[];
  readonly pixelBacked: boolean;
  readonly warnings: readonly string[];
}

interface C3Capture {
  readonly id: C3VariantId;
  readonly texturedMaterials: readonly C3TexturedMaterial[];
  readonly samplerAnisotropyUploads: number;
  readonly maxTextureAnisotropy: number;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __AURA3D_C3_RUNNER__?: {
      renderVariant(id: C3VariantId): Promise<C3Capture>;
    };
    __AURA3D_C3_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  window.__AURA3D_C3_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_C3_RUNNER__ = {
    renderVariant: async (id) => renderVariant(id)
  };
}

async function renderVariant(id: C3VariantId): Promise<C3Capture> {
  const stage = requiredElement("c3-stage");
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
    if (id === "disciplined" || id === "aniso1") {
      await waitForTextured(app);
      // One extra beat so sampler-object uploads settle before readback.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      app.step(1 / 60);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the C3 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the C3 probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    const runtime = diagnostics.renderer?.runtime as
      | { readonly texturedMaterials?: readonly C3TexturedMaterial[]; readonly samplerAnisotropyUploads?: number; readonly maxTextureAnisotropy?: number }
      | undefined;
    return {
      id,
      texturedMaterials: [...(runtime?.texturedMaterials ?? [])],
      samplerAnisotropyUploads: runtime?.samplerAnisotropyUploads ?? 0,
      maxTextureAnisotropy: runtime?.maxTextureAnisotropy ?? 1,
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

function boxMaterial(id: C3VariantId) {
  if (id === "disciplined") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal,
      occlusionMap: textures.occlusion,
      occlusionStrength: 1,
      emissiveMap: textures.emissive,
      emissiveIntensity: 1.6,
      textureAnisotropy: 8
    });
  }
  if (id === "aniso1") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal,
      occlusionMap: textures.occlusion,
      occlusionStrength: 1,
      emissiveMap: textures.emissive,
      emissiveIntensity: 1.6,
      textureAnisotropy: 1
    });
  }
  return material.pbr({ color: "#c96a1e", roughness: 0.6, metallic: 0 });
}

function sceneForVariant(id: C3VariantId) {
  return scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 1.6, 3.4], target: [0, 0.6, 0], fov: 42 }))
    .add(primitives.plane({
      name: "c3 floor",
      material: material.pbr({ color: "#3a4350", roughness: 0.9, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(primitives.box({
      name: "c3 subject box",
      material: boxMaterial(id)
    }).position(0, 0.6, 0).scale([1.2, 1.2, 1.2]))
    .add(lights.directional({ name: "c3 key", position: [2.6, 4.2, 2.4], intensity: 2.2 }));
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`C3 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForTextured(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const materials = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
    if (materials.some((entry) => entry.nodeName === "c3 subject box" && entry.pixelBacked)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const materials = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
  const subject = materials.find((entry) => entry.nodeName === "c3 subject box");
  if (!subject || !subject.pixelBacked) {
    throw new Error(`C3 textured upgrade never landed: ${JSON.stringify(materials)} warnings=${JSON.stringify(app.diagnostics().warnings)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`C3 harness is missing #${id}.`);
  return element;
}
