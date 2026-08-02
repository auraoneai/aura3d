/**
 * Diagnostic harness for the "hero vehicle wheels are not visibly readable" defect.
 *
 * ## Why this exists
 *
 * The retained release probe for `turboRaceCar` reports `drawCalls: 10` for a 5-primitive asset
 * (5 primitives x 2 passes), so every primitive *is* submitted and drawn. That measurement rules out
 * the whole "renderer drops secondary glTF mesh primitives" hypothesis, and it means a pass/fail on
 * "asset loaded" or "draw calls > 0" cannot detect the actual problem.
 *
 * The actual question is a *visual* one: from the angles a hero vehicle is presented at, is there a
 * readable wheel below the body silhouette? That cannot be answered from one camera azimuth, because
 * a dead-on front or rear view hides the wheels behind the bodywork by construction.
 *
 * So this harness renders one vehicle asset from several azimuths and, for each, measures the pixels
 * inside the *wheel band* -- the lower part of the subject silhouette where tyres must appear -- and
 * reports them separately from the body pixels. The output is per-angle evidence that a role-aware
 * admission check can consume, rather than a single global boolean.
 */
import {
  camera,
  createAuraApp,
  lights,
  model,
  scene,
  type AuraAssetRef
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/** One camera angle's measured wheel-band evidence. */
interface AngleEvidence {
  readonly azimuth: number;
  readonly elevation: number;
  /** Subject silhouette in canvas pixels. */
  readonly silhouette: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Non-background pixels inside the whole silhouette. */
  readonly subjectPixels: number;
  /**
   * Non-background pixels inside the lower `wheelBandFraction` of the silhouette, split by
   * horizontal third. A readable pair of wheels puts mass in the outer thirds; a body-only render
   * leaves the outer thirds empty or fills them uniformly with body colour.
   */
  readonly wheelBand: {
    readonly fraction: number;
    readonly pixels: number;
    readonly leftThird: number;
    readonly centerThird: number;
    readonly rightThird: number;
    /** Distinct quantised colours in the band; tyres add dark rubber values the body lacks. */
    readonly colorBuckets: number;
    /** Fraction of band pixels that are substantially darker than the silhouette median. */
    readonly darkFraction: number;
  };
  readonly drawCalls: number;
}

interface WheelVisibilityEvidence {
  readonly schema: "aura3d-vehicle-wheel-visibility/1.0";
  readonly asset: { readonly id: string; readonly url: string; readonly hash: string };
  readonly viewport: readonly [number, number];
  readonly runtimeBackend: string | undefined;
  readonly angles: readonly AngleEvidence[];
}

declare global {
  interface Window {
    __AURA3D_WHEEL_VISIBILITY__?: WheelVisibilityEvidence;
    __AURA3D_WHEEL_VISIBILITY_ERROR__?: string;
    /** Set by the spec between captures so each angle can be screenshotted. */
    __AURA3D_WHEEL_VISIBILITY_ANGLE_READY__?: number;
  }
}

/** Lower fraction of the silhouette a hero vehicle's wheels must occupy. */
const WHEEL_BAND_FRACTION = 0.3;

/**
 * Angles a hero vehicle is actually presented at. A dead-on front view (azimuth 0) is deliberately
 * excluded from the *pass* set but kept here as a measured control: it is the view where wheels are
 * legitimately hidden, so it proves the metric responds to angle rather than to the asset alone.
 */
const ANGLES: readonly { readonly azimuth: number; readonly elevation: number }[] = [
  { azimuth: 0, elevation: 0.18 },
  { azimuth: 0.55, elevation: 0.18 },
  { azimuth: 1.1, elevation: 0.16 },
  { azimuth: 1.5708, elevation: 0.14 },
  { azimuth: 2.2, elevation: 0.18 }
];

void run().catch((error: unknown) => {
  window.__AURA3D_WHEEL_VISIBILITY_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const assetId = params.get("asset");
  if (!assetId) throw new Error("vehicle-wheel-visibility harness requires ?asset=<id>");
  const catalog = assets as unknown as Record<string, AuraAssetRef<"model", string> | undefined>;
  const asset = catalog[assetId];
  if (!asset) throw new Error(`Unknown typed asset "${assetId}".`);

  const targetMaxDimension = Number(params.get("targetMaxDimension") ?? "1.1");
  const angles: AngleEvidence[] = [];

  for (const [index, angle] of ANGLES.entries()) {
    const stage = requiredElement("probe-stage");
    stage.replaceChildren();
    const appCamera = camera.frameAsset(asset, {
      targetMaxDimension,
      padding: 1.16,
      fov: 32,
      azimuth: angle.azimuth,
      elevation: angle.elevation
    });
    const app = createAuraApp(stage, {
      pixelRatio: 1,
      resize: true,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      scene: scene()
        .background("#04070c")
        .camera(appCamera)
        .add(model(asset, { targetMaxDimension, name: `wheel-probe-${assetId}` }).runtime({ id: `wheel-probe-${assetId}` }))
        .add(lights.studio())
        .add(lights.point({ name: "wheel probe fill", position: [1.8, 1.2, 2.4], intensity: 0.7, color: "#dff2ff" }))
    });
    await waitForAppDraw(app);
    const diagnostics = app.diagnostics();
    angles.push(measureAngle(app.canvas, angle, diagnostics.drawCalls));
    window.__AURA3D_WHEEL_VISIBILITY_ANGLE_READY__ = index;
    // Give the spec a chance to screenshot this angle before the next one replaces the canvas.
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (index === ANGLES.length - 1) {
      window.__AURA3D_WHEEL_VISIBILITY__ = {
        schema: "aura3d-vehicle-wheel-visibility/1.0",
        asset: { id: assetId, url: asset.url, hash: asset.hash ?? "" },
        viewport: [app.canvas?.width ?? 0, app.canvas?.height ?? 0],
        runtimeBackend: diagnostics.renderer?.runtime.backend,
        angles
      };
    } else {
      app.dispose();
    }
  }
}

function measureAngle(
  canvas: HTMLCanvasElement | undefined,
  angle: { readonly azimuth: number; readonly elevation: number },
  drawCalls: number
): AngleEvidence {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for wheel visibility measurement.");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // readPixels origin is bottom-left; flip to top-left so bands read as "lower part of the car".
  const at = (x: number, y: number): readonly [number, number, number, number] => {
    const index = ((height - 1 - y) * width + x) * 4;
    return [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0, pixels[index + 3] ?? 0];
  };
  const background = at(0, 0);
  const isSubject = (x: number, y: number): boolean => {
    const [r, g, b, a] = at(x, y);
    if (a <= 0) return false;
    return Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) > 34;
  };

  let minX = width; let minY = height; let maxX = -1; let maxY = -1; let subjectPixels = 0;
  const luminances: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isSubject(x, y)) continue;
      subjectPixels += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const [r, g, b] = at(x, y);
      luminances.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }
  const silhouette = maxX >= minX && maxY >= minY
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { x: 0, y: 0, width: 0, height: 0 };

  luminances.sort((a, b) => a - b);
  const medianLuminance = luminances.length > 0 ? luminances[Math.floor(luminances.length / 2)] ?? 0 : 0;

  const bandTop = silhouette.y + Math.floor(silhouette.height * (1 - WHEEL_BAND_FRACTION));
  const bandBottom = silhouette.y + silhouette.height - 1;
  const thirdWidth = Math.max(1, Math.floor(silhouette.width / 3));
  const buckets = new Set<string>();
  let bandPixels = 0; let leftThird = 0; let centerThird = 0; let rightThird = 0; let darkPixels = 0;
  for (let y = bandTop; y <= bandBottom; y += 1) {
    for (let x = silhouette.x; x < silhouette.x + silhouette.width; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (!isSubject(x, y)) continue;
      bandPixels += 1;
      const offset = x - silhouette.x;
      if (offset < thirdWidth) leftThird += 1;
      else if (offset < thirdWidth * 2) centerThird += 1;
      else rightThird += 1;
      const [r, g, b] = at(x, y);
      buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
      if (0.2126 * r + 0.7152 * g + 0.0722 * b < medianLuminance * 0.62) darkPixels += 1;
    }
  }

  return {
    azimuth: angle.azimuth,
    elevation: angle.elevation,
    silhouette,
    subjectPixels,
    wheelBand: {
      fraction: WHEEL_BAND_FRACTION,
      pixels: bandPixels,
      leftThird,
      centerThird,
      rightThird,
      colorBuckets: buckets.size,
      darkFraction: bandPixels > 0 ? Number((darkPixels / bandPixels).toFixed(4)) : 0
    },
    drawCalls
  };
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < 15_000) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the vehicle wheel visibility harness to draw.");
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
