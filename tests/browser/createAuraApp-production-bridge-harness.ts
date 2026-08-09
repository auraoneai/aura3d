import {
  camera,
  createAuraApp,
  lights,
  model,
  scene,
  unsafeModelUrl
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

type BridgeMode = "typed-glb" | "forced-fallback" | "quality-profile";

interface PixelStats {
  readonly width: number;
  readonly height: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly hash: string;
}

interface BridgeEvidence {
  readonly imports: readonly string[];
  readonly renderer: {
    readonly requestedMode?: string;
    readonly mode: string;
    readonly runtimeBackend: string | undefined;
    readonly fallbackUsed: boolean;
    readonly backend: string;
    readonly drawCalls: number;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
  readonly assets: {
    readonly primary: readonly string[];
    readonly importedEvidence?: unknown;
  };
  readonly pixels: {
    readonly typedModelVisible: boolean;
    readonly primitiveSubstitute: boolean;
    readonly stats: PixelStats;
  };
  readonly profiles?: {
    readonly safeBasic: {
      readonly runtimeBackend: string | undefined;
      readonly drawCalls: number;
      readonly hash: string;
      readonly diagnostics: { readonly qualityProfile: string };
    };
    readonly production: {
      readonly runtimeBackend: string | undefined;
      readonly drawCalls: number;
      readonly hash: string;
      readonly diagnostics: { readonly qualityProfile: string };
    };
  };
  readonly claims: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_PRODUCTION_BRIDGE_CONTRACT__?: BridgeEvidence;
    __AURA3D_PRODUCTION_BRIDGE_ERROR__?: string;
  }
}

const mode = readMode();

void run(mode).catch((error: unknown) => {
  window.__AURA3D_PRODUCTION_BRIDGE_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

function readMode(): BridgeMode {
  const value = new URL(window.location.href).searchParams.get("mode");
  if (value === "forced-fallback" || value === "quality-profile") return value;
  return "typed-glb";
}

async function run(nextMode: BridgeMode): Promise<void> {
  if (nextMode === "quality-profile") {
    window.__AURA3D_PRODUCTION_BRIDGE_CONTRACT__ = await runQualityProfileComparison();
    return;
  }
  const target = requiredElement("stage");
  const useUnsafeFallback = nextMode === "forced-fallback";
  const heroAsset = useUnsafeFallback
    ? unsafeModelUrl(assets.robotcand.url, {
        bounds: assets.robotcand.bounds,
        sizeBytes: assets.robotcand.sizeBytes,
        metadata: assets.robotcand.metadata
      })
    : assets.robotcand;
  const app = createAuraApp(target, {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#070b12")
      .camera(camera.product())
      .add(model(heroAsset, { name: "Production bridge hero", scale: 0.82 }).runtime({ id: "hero" }))
      .add(lights.studio())
  });
  if (useUnsafeFallback) {
    await app.ready();
    app.step(1 / 60);
  } else {
    await waitForAppDraw(app);
  }
  const diagnostics = app.diagnostics();
  const pixelStats = readCanvasPixels(app.canvas);
  const runtimeBackend = diagnostics.renderer?.runtime.backend;
  const fallbackUsed = !useUnsafeFallback && runtimeBackend !== "production-runtime";
  window.__AURA3D_PRODUCTION_BRIDGE_CONTRACT__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    renderer: {
      requestedMode: "production",
      mode: useUnsafeFallback ? "rejected" : fallbackUsed ? "safe-basic" : "production",
      runtimeBackend,
      fallbackUsed,
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls,
      warnings: diagnostics.renderer?.warnings ?? [],
      errors: diagnostics.errors
    },
    assets: {
      primary: useUnsafeFallback ? ["unsafeModelUrl(assets.robotcand.url)"] : ["assets.robotcand"],
      importedEvidence: app.nodes.require("hero").snapshot().importedAssetEvidence
    },
    pixels: {
      typedModelVisible: !useUnsafeFallback && pixelStats.nonBlackPixels > 1200 && diagnostics.drawCalls > 0,
      primitiveSubstitute: false,
      stats: pixelStats
    },
    claims: useUnsafeFallback || fallbackUsed ? [] : ["production-renderer-active", "typed-glb-production-bridge"]
  };
}

async function runQualityProfileComparison(): Promise<BridgeEvidence> {
  requiredElement("stage").hidden = true;
  requiredElement("comparison").hidden = false;
  const safeApp = createAuraApp(requiredElement("safe-stage"), {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "safe-basic", qualityProfile: "safe-basic" },
    scene: productionHeroScene()
  });
  const productionApp = createAuraApp(requiredElement("production-stage"), {
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production" },
    scene: productionHeroScene()
  });
  await waitForAppDraw(safeApp);
  await waitForAppDraw(productionApp);
  const safeDiagnostics = safeApp.diagnostics();
  const productionDiagnostics = productionApp.diagnostics();
  const safePixels = readCanvasPixels(safeApp.canvas);
  const productionPixels = readCanvasPixels(productionApp.canvas);
  return {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    renderer: {
      requestedMode: "production",
      mode: "production",
      runtimeBackend: productionDiagnostics.renderer?.runtime.backend,
      fallbackUsed: productionDiagnostics.renderer?.runtime.backend !== "production-runtime",
      backend: productionDiagnostics.backend,
      drawCalls: productionDiagnostics.drawCalls,
      warnings: productionDiagnostics.renderer?.warnings ?? [],
      errors: productionDiagnostics.errors
    },
    assets: {
      primary: ["assets.robotcand"],
      importedEvidence: productionApp.nodes.require("hero").snapshot().importedAssetEvidence
    },
    pixels: {
      typedModelVisible: productionPixels.nonBlackPixels > 1200,
      primitiveSubstitute: false,
      stats: productionPixels
    },
    profiles: {
      safeBasic: {
        runtimeBackend: safeDiagnostics.renderer?.runtime.backend,
        drawCalls: safeDiagnostics.drawCalls,
        hash: safePixels.hash,
        diagnostics: { qualityProfile: safeDiagnostics.renderer?.qualityProfile.id ?? "" }
      },
      production: {
        runtimeBackend: productionDiagnostics.renderer?.runtime.backend,
        drawCalls: productionDiagnostics.drawCalls,
        hash: productionPixels.hash,
        diagnostics: { qualityProfile: productionDiagnostics.renderer?.qualityProfile.id ?? "" }
      }
    },
    claims: productionDiagnostics.renderer?.runtime.backend === "production-runtime"
      ? ["production-renderer-active", "typed-glb-production-bridge"]
      : []
  };
}

function productionHeroScene() {
  return scene()
    .background("#070b12")
    .camera(camera.product())
    .add(model(assets.robotcand, { name: "Production bridge hero", scale: 0.82 }).runtime({ id: "hero" }))
    .add(lights.studio());
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 12_000);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Aura3D production bridge harness.");
}

function readCanvasPixels(canvas: HTMLCanvasElement | undefined): PixelStats {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for production bridge pixel proof.");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonBlackPixels = 0;
  const buckets = new Set<string>();
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    if (alpha > 0 && (red > 12 || green > 12 || blue > 12)) {
      nonBlackPixels += 1;
      buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
    hash ^= red + (green << 8) + (blue << 16) + alpha;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return {
    width,
    height,
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    hash: hash.toString(16).padStart(8, "0")
  };
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
