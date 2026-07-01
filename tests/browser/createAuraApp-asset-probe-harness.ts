import {
  camera,
  createAuraApp,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

interface PixelEvidence {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly nonBackgroundPixels: number;
  readonly colorBuckets: number;
  readonly foregroundBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

interface AssetProbeEvidence {
  readonly imports: readonly string[];
  readonly renderer: string;
  readonly route: string;
  readonly asset: {
    readonly id: string;
    readonly typed: string;
    readonly url: string;
    readonly hash: string;
  };
  readonly diagnostics: {
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
    readonly renderSize: readonly number[];
  };
  readonly pixels: PixelEvidence;
  readonly pass: boolean;
}

declare global {
  interface Window {
    __AURA3D_ASSET_PROBE_CONTRACT__?: AssetProbeEvidence;
    __AURA3D_ASSET_PROBE_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  window.__AURA3D_ASSET_PROBE_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const appCamera = camera.frameAsset(assets.robotcand, {
    targetHeight: 2.2,
    padding: 1.4,
    fov: 34,
    azimuth: 0.62,
    elevation: 0.26
  });
  const app = createAuraApp(requiredElement("probe-stage"), {
    pixelRatio: 1,
    resize: true,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#04070c")
      .camera(appCamera)
      .add(model(assets.robotcand, { targetHeight: 2.2, name: "probe-robotcand" }).runtime({ id: "probe-robotcand" }))
      .add(lights.studio())
  });

  await waitForAppDraw(app);

  const diagnostics = app.diagnostics();
  const pixels = readVisiblePixelEvidence(app.canvas);
  window.__AURA3D_ASSET_PROBE_CONTRACT__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    renderer: "createAuraApp",
    route: "tests/browser/createAuraApp-asset-probe-harness",
    asset: {
      id: "robotcand",
      typed: "assets.robotcand",
      url: assets.robotcand.url,
      hash: assets.robotcand.hash
    },
    diagnostics: {
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize
    },
    pixels,
    pass: diagnostics.renderer?.runtime.backend === "production-runtime" &&
      diagnostics.drawCalls > 0 &&
      pixels.nonBackgroundPixels > 2500 &&
      pixels.colorBuckets > 5 &&
      pixels.foregroundBounds.width > 80 &&
      pixels.foregroundBounds.height > 120
  };
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
  throw new Error("Timed out waiting for Aura3D asset probe harness.");
}

function readVisiblePixelEvidence(canvas: HTMLCanvasElement | undefined): PixelEvidence {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for asset probe pixel proof.");

  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const background = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0] as const;
  const buckets = new Set<string>();
  let nonBackgroundPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      const backgroundDelta =
        Math.abs(red - background[0]) +
        Math.abs(green - background[1]) +
        Math.abs(blue - background[2]);
      if (alpha <= 0 || backgroundDelta <= 34) continue;
      nonBackgroundPixels += 1;
      buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    canvasWidth: width,
    canvasHeight: height,
    nonBackgroundPixels,
    colorBuckets: buckets.size,
    foregroundBounds: maxX >= minX && maxY >= minY
      ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : { x: 0, y: 0, width: 0, height: 0 }
  };
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
