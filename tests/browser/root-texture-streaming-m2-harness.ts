import {
  camera,
  createAuraApp,
  defineAuraAssets,
  lights,
  material,
  primitives,
  scene,
  text3D,
  type AuraSceneBuilder
} from "@aura3d/engine";

interface M2Capture {
  readonly id: string;
  readonly drawCalls: number;
  readonly textures: {
    readonly budgetBytes: number;
    readonly usedBytes: number;
    readonly requestedBytes: number;
    readonly overBudget: boolean;
    readonly overBudgetBytes: number;
    readonly residentEntries: number;
    readonly evictedEntries: readonly string[];
  };
  readonly texturedMaterials: readonly {
    readonly nodeName: string;
    readonly status: string;
    readonly pixelBacked: boolean;
  }[];
  readonly samplerAnisotropyUploads: number;
  readonly maxTextureAnisotropy: number;
  readonly warnings: readonly string[];
  readonly checksum: number;
  readonly nonDarkPixels: number;
}

interface M2Result {
  readonly status: "ready" | "error" | "waiting";
  readonly captures?: readonly M2Capture[];
  readonly checks?: Record<string, boolean | number | string>;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_M2_STREAMING__?: M2Result;
  }
}

window.__AURA3D_M2_STREAMING__ = { status: "waiting" };

const textures = defineAuraAssets({
  checker: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-checker.png", hash: "99496e5e0a5e216a" },
  rough: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-rough.png", hash: "c027b3ed2eda3e09" },
  normal: { type: "texture", format: "png", url: "/tests/browser/fixtures/c1-normal.png", hash: "2ac1b91fd6c3f927" }
});

const stage = document.querySelector<HTMLElement>("#mount");
const shoot = document.querySelector<HTMLButtonElement>("#shoot");
if (!stage || !shoot) {
  window.__AURA3D_M2_STREAMING__ = { status: "error", error: "Harness DOM is missing mount or shoot button." };
} else {
  shoot.addEventListener("click", () => {
    shoot.hidden = true;
    void runHarness().catch((error: unknown) => {
      window.__AURA3D_M2_STREAMING__ = {
        status: "error",
        error: error instanceof Error ? error.stack ?? error.message : String(error)
      };
    });
  }, { once: true });
}

function texturedScene(): AuraSceneBuilder {
  return scene()
    .background("#05070d")
    .camera(camera.perspective({ position: [0, 1.6, 3.4], target: [0, 0.6, 0], fov: 42 }))
    .add(primitives.plane({
      name: "m2 floor",
      material: material.pbr({ color: "#3a4350", roughness: 0.9, metallic: 0 })
    }).position(0, 0, 0).scale([9, 1, 9]))
    .add(primitives.box({
      name: "m2 subject box",
      material: material.pbr({
        color: "#ffffff",
        roughness: 0.6,
        metallic: 0,
        texture: textures.checker,
        roughnessMap: textures.rough,
        normal: textures.normal,
        textureAnisotropy: 16
      })
    }).position(0, 0.6, 0).scale([1.2, 1.2, 1.2]))
    .add(text3D("STOCK 12", { backend: "sdf", size: 0.4 }).position(-1.6, 0.7, 0.4))
    .add(lights.directional({ name: "m2 key", position: [2.6, 4.2, 2.4], intensity: 2.2 }));
}

async function runHarness(): Promise<void> {
  const captures: M2Capture[] = [
    await capture("funded", texturedScene(), undefined),
    // Starved: a 2 KiB budget cannot fund kilobyte texture tables.
    await capture("starved", texturedScene(), 2048)
  ];
  const byId = (id: string): M2Capture => captures.find((entry) => entry.id === id)!;
  const funded = byId("funded");
  const starved = byId("starved");
  window.__AURA3D_M2_STREAMING__ = {
    status: "ready",
    captures,
    checks: {
      fundedOverBudget: funded.textures.overBudget,
      fundedUsed: funded.textures.usedBytes,
      fundedRequested: funded.textures.requestedBytes,
      fundedResidents: funded.textures.residentEntries,
      fundedTextured: funded.texturedMaterials.some((entry) => entry.pixelBacked),
      fundedAnisoMax: funded.maxTextureAnisotropy,
      fundedAnisoUploads: funded.samplerAnisotropyUploads,
      starvedOverBudget: starved.textures.overBudget,
      starvedOverBytes: starved.textures.overBudgetBytes,
      starvedWarned: starved.warnings.some((warning) => warning.includes("over budget")),
      starvedBudget: starved.textures.budgetBytes
    }
  };
}

async function capture(id: string, appScene: AuraSceneBuilder, textureBudgetBytes: number | undefined): Promise<M2Capture> {
  stage!.style.minHeight = "0px";
  stage!.replaceChildren();
  const app = createAuraApp(stage!, {
    pixelRatio: 1,
    resize: false,
    renderer: {
      mode: "production",
      qualityProfile: "production",
      fallback: "safe-basic",
      ...(textureBudgetBytes === undefined ? {} : { textureBudgetBytes })
    },
    scene: appScene
  });
  try {
    await waitForAppDraw(app);
    await waitForTextureUpgrade(app);
    const canvas = app.canvas;
    if (!canvas) throw new Error("Aura app did not expose a canvas for the M2 probe.");
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 context unavailable for the M2 probe.");
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let checksum = 0;
    let nonDarkPixels = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (luma > 24) nonDarkPixels += 1;
      checksum = (checksum + Math.round(luma) * (index + 17)) % 1_000_003;
    }
    const diagnostics = app.diagnostics();
    const renderer = diagnostics.renderer;
    const runtime = renderer?.runtime as
      | { readonly texturedMaterials?: readonly { readonly nodeName: string; readonly status: string; readonly pixelBacked: boolean }[]; readonly samplerAnisotropyUploads?: number; readonly maxTextureAnisotropy?: number }
      | undefined;
    return {
      id,
      drawCalls: diagnostics.drawCalls,
      textures: {
        budgetBytes: renderer?.textures?.budgetBytes ?? -1,
        usedBytes: renderer?.textures?.usedBytes ?? -1,
        requestedBytes: renderer?.textures?.requestedBytes ?? -1,
        overBudget: renderer?.textures?.overBudget ?? false,
        overBudgetBytes: renderer?.textures?.overBudgetBytes ?? -1,
        residentEntries: renderer?.textures?.residentEntries ?? -1,
        evictedEntries: [...(renderer?.textures?.evictedEntries ?? [])]
      },
      texturedMaterials: [...(runtime?.texturedMaterials ?? [])],
      samplerAnisotropyUploads: runtime?.samplerAnisotropyUploads ?? 0,
      maxTextureAnisotropy: runtime?.maxTextureAnisotropy ?? 1,
      warnings: [...(renderer?.warnings ?? []), ...(diagnostics.warnings ?? [])],
      checksum,
      nonDarkPixels
    };
  } finally {
    app.dispose();
  }
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 30_000) {
    if (app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const diagnostics = app.diagnostics();
  if (!(diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0)) {
    throw new Error(`M2 variant never drew: drawCalls=${diagnostics.drawCalls} errors=${JSON.stringify(diagnostics.errors)}`);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForTextureUpgrade(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 120_000) {
    const runtime = app.diagnostics().renderer?.runtime as
      | { readonly texturedMaterials?: readonly { readonly status: string }[] }
      | undefined;
    const materials = runtime?.texturedMaterials ?? [];
    if (materials.some((entry) => entry.status === "textured" || entry.status === "fallback")) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(resolve));
}
