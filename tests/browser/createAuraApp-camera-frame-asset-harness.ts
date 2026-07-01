import {
  camera,
  createAuraApp,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

interface PixelBounds {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly x: number;
  readonly y: number;
  readonly right: number;
  readonly bottom: number;
  readonly colorBuckets: number;
  readonly clipped: boolean;
}

interface CameraFrameAssetEvidence {
  readonly imports: readonly string[];
  readonly asset: string;
  readonly cases: readonly FrameCaseEvidence[];
  readonly pass: boolean;
}

interface FrameCaseEvidence {
  readonly id: FrameCaseId;
  readonly renderer: {
    readonly runtimeBackend: string | undefined;
    readonly drawCalls: number;
  };
  readonly camera: {
    readonly mode: string;
    readonly distance: number | undefined;
    readonly fov: number | undefined;
    readonly target: readonly number[] | undefined;
  };
  readonly pixels: PixelBounds;
  readonly pass: boolean;
}

type FrameCaseId = "targetHeight" | "targetMaxDimension" | "targetLength" | "default";

interface FrameCase {
  readonly id: FrameCaseId;
  readonly targetId: string;
  readonly modelOptions: {
    readonly targetHeight?: number;
    readonly targetMaxDimension?: number;
    readonly targetLength?: number;
  };
}

declare global {
  interface Window {
    __AURA3D_CAMERA_FRAME_ASSET_CONTRACT__?: CameraFrameAssetEvidence;
    __AURA3D_CAMERA_FRAME_ASSET_ERROR__?: string;
  }
}

const CASES: readonly FrameCase[] = [
  { id: "targetHeight", targetId: "targetHeight-stage", modelOptions: { targetHeight: 1.35 } },
  { id: "targetMaxDimension", targetId: "targetMaxDimension-stage", modelOptions: { targetMaxDimension: 1.95 } },
  { id: "targetLength", targetId: "targetLength-stage", modelOptions: { targetLength: 1.5 } },
  { id: "default", targetId: "default-stage", modelOptions: {} }
];

void run().catch((error: unknown) => {
  window.__AURA3D_CAMERA_FRAME_ASSET_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const cases = await Promise.all(CASES.map(runFrameCase));
  window.__AURA3D_CAMERA_FRAME_ASSET_CONTRACT__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    asset: "assets.robotcand",
    cases,
    pass: cases.every((entry) => entry.pass)
  };
}

async function runFrameCase(frameCase: FrameCase): Promise<FrameCaseEvidence> {
  const appCamera = camera.frameAsset(assets.robotcand, {
    ...frameCase.modelOptions,
    padding: 1.34,
    fov: 34,
    azimuth: 0.56,
    elevation: 0.24
  });
  const app = createAuraApp(requiredElement(frameCase.targetId), {
    pixelRatio: 1,
    resize: true,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#04070c")
      .camera(appCamera)
      .add(model(assets.robotcand, { ...frameCase.modelOptions, name: `framed-${frameCase.id}` }).runtime({ id: `framed-${frameCase.id}` }))
      .add(lights.studio())
  });

  await waitForAppDraw(app);

  const diagnostics = app.diagnostics();
  const pixels = readVisiblePixelBounds(app.canvas);
  const heightCoverage = pixels.height / Math.max(1, pixels.canvasHeight);
  const widthCoverage = pixels.width / Math.max(1, pixels.canvasWidth);
  return {
    id: frameCase.id,
    renderer: {
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      drawCalls: diagnostics.drawCalls
    },
    camera: {
      mode: appCamera.mode,
      distance: appCamera.distance,
      fov: appCamera.fov,
      target: appCamera.target
    },
    pixels,
    pass: diagnostics.renderer?.runtime.backend === "production-runtime" &&
      diagnostics.drawCalls > 0 &&
      pixels.nonBackgroundPixels > 1200 &&
      pixels.colorBuckets > 5 &&
      !pixels.clipped &&
      heightCoverage > 0.18 &&
      heightCoverage < 0.86 &&
      widthCoverage > 0.12 &&
      widthCoverage < 0.78
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
  throw new Error("Timed out waiting for Aura3D camera frame asset harness.");
}

function readVisiblePixelBounds(canvas: HTMLCanvasElement | undefined): PixelBounds {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for camera frame pixel proof.");

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
      canvasWidth: width,
      canvasHeight: height,
      width: 0,
      height: 0,
      nonBackgroundPixels,
      x: 0,
      y: 0,
      right: 0,
      bottom: 0,
      colorBuckets: buckets.size,
      clipped: true
    };
  }

  const clipped = minX <= 6 || minY <= 6 || maxX >= width - 7 || maxY >= height - 7;
  return {
    canvasWidth: width,
    canvasHeight: height,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    nonBackgroundPixels,
    x: minX,
    y: minY,
    right: maxX,
    bottom: maxY,
    colorBuckets: buckets.size,
    clipped
  };
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
