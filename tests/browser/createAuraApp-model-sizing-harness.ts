import {
  camera,
  createAuraApp,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

interface PixelBounds {
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly x: number;
  readonly y: number;
  readonly right: number;
  readonly bottom: number;
  readonly colorBuckets: number;
}

interface ModelSizingEvidence {
  readonly imports: readonly string[];
  readonly asset: string;
  readonly cases: readonly ModelSizingCaseEvidence[];
  readonly pass: boolean;
}

type ModelSizingOptionName = "targetHeight" | "targetMaxDimension" | "targetLength";

interface ModelSizingCaseEvidence {
  readonly option: ModelSizingOptionName;
  readonly requested: {
    readonly small: number;
    readonly large: number;
    readonly ratio: number;
  };
  readonly renderer: {
    readonly smallRuntimeBackend: string | undefined;
    readonly largeRuntimeBackend: string | undefined;
    readonly smallDrawCalls: number;
    readonly largeDrawCalls: number;
  };
  readonly pixels: {
    readonly small: PixelBounds;
    readonly large: PixelBounds;
    readonly heightRatio: number;
  };
  readonly pass: boolean;
}

declare global {
  interface Window {
    __AURA3D_MODEL_SIZING_CONTRACT__?: ModelSizingEvidence;
    __AURA3D_MODEL_SIZING_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  window.__AURA3D_MODEL_SIZING_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const cases = await Promise.all([
    runSizingCase("targetHeight", 0.55, 1.35),
    runSizingCase("targetMaxDimension", 0.85, 2.05),
    runSizingCase("targetLength", 0.85, 2.05)
  ]);

  window.__AURA3D_MODEL_SIZING_CONTRACT__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    asset: "assets.robotcand",
    cases,
    pass: cases.every((entry) => entry.pass)
  };
}

async function runSizingCase(option: ModelSizingOptionName, small: number, large: number): Promise<ModelSizingCaseEvidence> {
  const smallApp = createSizingApp(requiredElement(`${option}-small-stage`), option, small, `${option}-small`);
  const largeApp = createSizingApp(requiredElement(`${option}-large-stage`), option, large, `${option}-large`);

  await waitForAppDraw(smallApp);
  await waitForAppDraw(largeApp);

  const smallDiagnostics = smallApp.diagnostics();
  const largeDiagnostics = largeApp.diagnostics();
  const smallPixels = readVisiblePixelBounds(smallApp.canvas);
  const largePixels = readVisiblePixelBounds(largeApp.canvas);
  const requestedRatio = large / small;
  const heightRatio = largePixels.height / Math.max(1, smallPixels.height);
  return {
    option,
    requested: {
      small,
      large,
      ratio: requestedRatio
    },
    renderer: {
      smallRuntimeBackend: smallDiagnostics.renderer?.runtime.backend,
      largeRuntimeBackend: largeDiagnostics.renderer?.runtime.backend,
      smallDrawCalls: smallDiagnostics.drawCalls,
      largeDrawCalls: largeDiagnostics.drawCalls
    },
    pixels: {
      small: smallPixels,
      large: largePixels,
      heightRatio
    },
    pass: smallPixels.nonBackgroundPixels > 1000 &&
      largePixels.nonBackgroundPixels > smallPixels.nonBackgroundPixels &&
      heightRatio > 1.55
  };
}

function createSizingApp(
  target: HTMLElement,
  option: ModelSizingOptionName,
  targetSize: number,
  runtimeId: string
): ReturnType<typeof createAuraApp> {
  const sizingOptions =
    option === "targetHeight" ? { targetHeight: targetSize } :
    option === "targetMaxDimension" ? { targetMaxDimension: targetSize } :
    { targetLength: targetSize };

  return createAuraApp(target, {
    pixelRatio: 1,
    resize: true,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({
        position: [0, 0.85, 7],
        target: [0, 0.62, 0],
        fov: 34
      }))
      .add(model(assets.robotcand, { ...sizingOptions, name: runtimeId }).runtime({ id: runtimeId }))
      .add(lights.studio())
  });
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
  throw new Error("Timed out waiting for Aura3D model sizing harness.");
}

function readVisiblePixelBounds(canvas: HTMLCanvasElement | undefined): PixelBounds {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for model sizing pixel proof.");

  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const background = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0] as const;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let nonBackgroundPixels = 0;
  const buckets = new Set<string>();

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

  if (maxX < minX || maxY < minY) {
    return {
      width: 0,
      height: 0,
      nonBackgroundPixels,
      x: 0,
      y: 0,
      right: 0,
      bottom: 0,
      colorBuckets: buckets.size
    };
  }

  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    nonBackgroundPixels,
    x: minX,
    y: minY,
    right: maxX,
    bottom: maxY,
    colorBuckets: buckets.size
  };
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
