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
 * C1 root textured-PBR probe (muse3jsparity-PRD Phase 1).
 *
 * Variants share one scene body: a single box subject, floor, fixed lighting
 * and camera. The ONLY difference is the box material: scalar baseline,
 * asset-ref textures (baseColor + roughness + normal), the same textures
 * sampling the uv1 set, and a procedural input (recorded + warned, scalar
 * retained). The upgrade runs post-mount, so the harness polls
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

type C1VariantId = "baseline" | "textured" | "uv1" | "procedural" | "fullmaps" | "xform";

interface C1TexturedMaterial {
  readonly nodeName: string;
  readonly levelName: string;
  readonly status: string;
  readonly slots: readonly string[];
  readonly pixelBacked: boolean;
  readonly warnings: readonly string[];
}

interface C1Capture {
  readonly id: C1VariantId;
  readonly texturedMaterials: readonly C1TexturedMaterial[];
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __AURA3D_C1_RUNNER__?: {
      renderVariant(id: C1VariantId): Promise<C1Capture>;
    };
    __AURA3D_C1_ERROR__?: string;
  }
}

const variantIds: readonly C1VariantId[] = ["baseline", "textured", "uv1", "procedural", "fullmaps", "xform"];

void run().catch((error: unknown) => {
  window.__AURA3D_C1_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_C1_RUNNER__ = {
    renderVariant: async (id) => renderVariant(id)
  };
}

async function renderVariant(id: C1VariantId): Promise<C1Capture> {
  const stage = requiredElement("c1-stage");
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
    if (id === "textured" || id === "uv1" || id === "fullmaps" || id === "xform") {
      await waitForTextured(app);
    }
    if (id === "procedural") {
      await waitForWarning(app, "procedural texture");
    }
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the C1 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the C1 probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    return {
      id,
      texturedMaterials: [...(diagnostics.renderer?.runtime.texturedMaterials ?? [])],
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

function boxMaterial(id: C1VariantId) {
  if (id === "textured") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal
    });
  }
  if (id === "uv1") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal,
      texCoords: { baseColor: 1, normal: 1, metallicRoughness: 1 }
    });
  }
  if (id === "procedural") {
    return material.fabric({ color: "#d8dde6" });
  }
  if (id === "fullmaps") {
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
      emissiveIntensity: 1.6
    });
  }
  if (id === "xform") {
    return material.pbr({
      color: "#ffffff",
      roughness: 0.6,
      metallic: 0,
      texture: textures.checker,
      roughnessMap: textures.rough,
      normal: textures.normal,
      texTransforms: { baseColor: { scale: [0.5, 0.5] } }
    });
  }
  return material.pbr({ color: "#c96a1e", roughness: 0.6, metallic: 0 });
}

function sceneForVariant(id: C1VariantId) {
  return scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 1.6, 3.4], target: [0, 0.6, 0], fov: 42 }))
    .add(primitives.plane({
      name: "c1 floor",
      material: material.pbr({ color: "#3a4350", roughness: 0.9, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(primitives.box({
      name: "c1 subject box",
      material: boxMaterial(id)
    }).position(0, 0.6, 0).scale([1.2, 1.2, 1.2]))
    .add(lights.directional({ name: "c1 key", position: [2.6, 4.2, 2.4], intensity: 2.2 }));
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`C1 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForTextured(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    const materials = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
    if (materials.some((entry) => entry.nodeName === "c1 subject box" && entry.pixelBacked)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const materials = app.diagnostics().renderer?.runtime.texturedMaterials ?? [];
  const subject = materials.find((entry) => entry.nodeName === "c1 subject box");
  if (!subject || !subject.pixelBacked) {
    throw new Error(`C1 textured upgrade never landed: ${JSON.stringify(materials)} warnings=${JSON.stringify(app.diagnostics().warnings)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForWarning(app: ReturnType<typeof createAuraApp>, fragment: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().warnings.join(" ").includes(fragment)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`C1 procedural warning never surfaced: ${JSON.stringify(app.diagnostics().warnings)}`);
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`C1 harness is missing #${id}.`);
  return element;
}

export { variantIds };
