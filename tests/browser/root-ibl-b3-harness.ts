import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

/**
 * B3 root HDRI probe (muse3jsparity-PRD Phase 1).
 *
 * Variants share one scene body: a chrome sphere subject (IBL-dominant),
 * floor, fixed lighting and camera. The ONLY difference is the environment:
 * studio procedural baseline, an authored Radiance `.hdr` asset resolved
 * post-mount through the HDR→cubemap→GGX→BRDF-LUT chain, and a bad HDRI url
 * (procedural fallback retained + warning). The harness polls
 * `environment.iblPixelBacked` until the swap lands instead of capturing the
 * procedural first frame.
 */

const hdriAssets = defineAuraAssets({
  studioSmall: { type: "texture", format: "hdr", url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", hash: "f6a989f89432eb4e" },
  kloppenheim: { type: "texture", format: "hdr", url: "/fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr", hash: "206c67e3a1b99228" },
  missing: { type: "texture", format: "hdr", url: "/fixtures/environment-corpus/hdri/b3-does-not-exist.hdr", hash: "b3missing00000000" }
});

type B3VariantId = "baseline" | "hdri" | "hdriFallback" | "dualProbe" | "envDim";

interface B3Environment {
  readonly preset: string | undefined;
  readonly iblPixelBacked: boolean;
  readonly hdriStatus: string;
  readonly dualProbe?: boolean;
}

interface B3Capture {
  readonly id: B3VariantId;
  readonly environment: B3Environment;
  readonly warnings: readonly string[];
  readonly drawCalls: number;
  readonly pixels: readonly number[];
  readonly width: number;
  readonly height: number;
}

declare global {
  interface Window {
    __AURA3D_B3_RUNNER__?: {
      renderVariant(id: B3VariantId): Promise<B3Capture>;
    };
    __AURA3D_B3_ERROR__?: string;
  }
}

const variantIds: readonly B3VariantId[] = ["baseline", "hdri", "hdriFallback", "dualProbe", "envDim"];

void run().catch((error: unknown) => {
  window.__AURA3D_B3_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  window.__AURA3D_B3_RUNNER__ = {
    renderVariant: async (id) => renderVariant(id)
  };
}

async function renderVariant(id: B3VariantId): Promise<B3Capture> {
  const stage = requiredElement("b3-stage");
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
    if (id === "hdri" || id === "dualProbe" || id === "envDim") {
      await waitForIblPixelBacked(app);
    }
    if (id === "hdriFallback") {
      await waitForWarning(app, "HDRI upgrade failed");
    }
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the B3 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the B3 probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const diagnostics = app.diagnostics();
    const environment = diagnostics.renderer?.environment;
    return {
      id,
      environment: {
        preset: environment?.preset,
        iblPixelBacked: environment?.iblPixelBacked ?? false,
        hdriStatus: environment?.hdriStatus ?? "unknown",
        ...(environment?.dualProbe === undefined ? {} : { dualProbe: environment.dualProbe })
      },
      // B3: runtime upgrade warnings live in the renderer report, not the
      // app-level static warnings.
      warnings: [...(diagnostics.renderer?.warnings ?? [])],
      drawCalls: diagnostics.drawCalls,
      pixels: Array.from(pixels),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    app.dispose();
  }
}

function environmentForVariant(id: B3VariantId) {
  if (id === "hdri" || id === "envDim") {
    return environments.hdri({ texture: hdriAssets.studioSmall, intensity: 1 });
  }
  if (id === "dualProbe") {
    return environments.hdri({ texture: hdriAssets.studioSmall, reflectionTexture: hdriAssets.kloppenheim, intensity: 1 });
  }
  if (id === "hdriFallback") {
    return environments.hdri({ texture: hdriAssets.missing, intensity: 1 });
  }
  return environments.studio();
}

function subjectMaterial(id: B3VariantId) {
  // envDim proves per-material envMapIntensity is root-wired: same HDRI,
  // zero environment response on the subject.
  if (id === "envDim") {
    return material.pbr({ color: "#ffffff", roughness: 0.12, metallic: 1, envMapIntensity: 0 });
  }
  return material.pbr({ color: "#ffffff", roughness: 0.12, metallic: 1, envMapIntensity: 2 });
}

function sceneForVariant(id: B3VariantId) {
  return scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 1.6, 3.4], target: [0, 0.6, 0], fov: 42 }))
    .add(environmentForVariant(id))
    .add(primitives.plane({
      name: "b3 floor",
      material: material.pbr({ color: "#3a4350", roughness: 0.9, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(primitives.sphere({
      name: "b3 subject sphere",
      material: subjectMaterial(id)
    }).position(0, 0.6, 0).scale([0.7, 0.7, 0.7]))
    .add(lights.directional({ name: "b3 key", position: [2.6, 4.2, 2.4], intensity: 1.2 }));
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`B3 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForIblPixelBacked(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 240_000) {
    if (app.diagnostics().renderer?.environment?.iblPixelBacked) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const environment = app.diagnostics().renderer?.environment;
  if (!environment?.iblPixelBacked) {
    throw new Error(`B3 HDRI upgrade never landed: ${JSON.stringify(environment)} warnings=${JSON.stringify(app.diagnostics().warnings)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForWarning(app: ReturnType<typeof createAuraApp>, fragment: string): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if ((app.diagnostics().renderer?.warnings ?? []).join(" ").includes(fragment)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`B3 HDRI fallback warning never surfaced: ${JSON.stringify(app.diagnostics().renderer?.warnings)}`);
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`B3 harness is missing #${id}.`);
  return element;
}

export { variantIds };
