/**
 * PRD-13 §17.2 in-page helpers shared by the 13-SPECS harness pages.
 *
 * `settle` waits for the production mount and for the HDRI chain to leave
 * `pending` (the B3 upgrade is fire-and-forget after mount), so pixel and
 * diagnostics reads describe the frame a user sees, not the procedural first
 * frame. `measureFrame` renders one frame and reads it back in the same task
 * (the WebGL drawing buffer is valid until the frame is composited).
 */
import type { AuraApp } from "@aura3d/engine";

export interface FrameRegion {
  /** Fractions of the canvas, [x0, y0, x1, y1] with y down. */
  readonly box: readonly [number, number, number, number];
}

export interface FrameMetrics {
  readonly width: number;
  readonly height: number;
  /** Mean Rec.709 luma (sRGB 0..1) of the top 10 % band — the background. */
  readonly backgroundLuma: number;
  /** Luma standard deviation of the centre box (x 35–65 %, y 30–70 %) — the subject. */
  readonly centreLumaStdDev: number;
  /** Mean luma of the bottom 45 % band — the shadow receiver. */
  readonly groundLuma: number;
  /** Fraction of 4-px-grid samples with 0..255 luma > 48 (look-floor.mjs threshold). */
  readonly brightFraction: number;
  /** Distinct 4-bit-per-channel colour buckets on the 4-px grid (look-floor.mjs). */
  readonly uniqueBuckets: number;
  readonly dataUrl: string;
}

export type HdriStatus = "none" | "pending" | "ready" | "fallback" | "unknown";

function hdriStatusOf(app: AuraApp): HdriStatus {
  const renderer = app.diagnostics().renderer as { environment?: { hdriStatus?: HdriStatus } } | undefined;
  return renderer?.environment?.hdriStatus ?? "unknown";
}

const nextFrame = (): Promise<void> => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame()));

/** Await the mount, then up to `hdriTimeoutMs` for the HDRI chain to settle. */
export async function settle(app: AuraApp, hdriTimeoutMs = 45_000): Promise<HdriStatus> {
  await app.ready();
  const deadline = performance.now() + hdriTimeoutMs;
  let status = hdriStatusOf(app);
  while (status === "pending" && performance.now() < deadline) {
    await nextFrame();
    status = hdriStatusOf(app);
  }
  await nextFrame();
  return status;
}

function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Render one frame with `step` and read the canvas back in the same task. */
export function measureFrame(app: AuraApp, canvas: HTMLCanvasElement): FrameMetrics {
  app.step(1 / 60);
  const width = canvas.width;
  const height = canvas.height;
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const ctx = copy.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for frame readback");
  ctx.drawImage(canvas, 0, 0);
  const dataUrl = copy.toDataURL("image/png");
  const data = ctx.getImageData(0, 0, width, height).data;

  const at = (x: number, y: number): number => {
    const o = (y * width + x) * 4;
    return luma(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0);
  };
  const regionLumas = (x0: number, y0: number, x1: number, y1: number): number[] => {
    const out: number[] = [];
    for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y += 2) {
      for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x += 2) out.push(at(x, y));
    }
    return out;
  };
  const mean = (values: readonly number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

  const centre = regionLumas(0.35, 0.3, 0.65, 0.7);
  const centreMean = mean(centre);
  const centreVariance = mean(centre.map((value) => (value - centreMean) ** 2));

  let sampled = 0;
  let bright = 0;
  const buckets = new Set<number>();
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const o = (y * width + x) * 4;
      const r = data[o] ?? 0;
      const g = data[o + 1] ?? 0;
      const b = data[o + 2] ?? 0;
      sampled += 1;
      buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      if (0.2126 * r + 0.7152 * g + 0.0722 * b > 48) bright += 1;
    }
  }

  return {
    width,
    height,
    backgroundLuma: mean(regionLumas(0, 0, 1, 0.1)),
    centreLumaStdDev: Math.sqrt(centreVariance),
    groundLuma: mean(regionLumas(0, 0.55, 1, 1)),
    brightFraction: sampled === 0 ? 0 : bright / sampled,
    uniqueBuckets: buckets.size,
    dataUrl
  };
}

/** Publish a ready payload or an error string for the spec to read. */
export function publish(payload: unknown): void {
  (window as { __PRD13_READY__?: unknown }).__PRD13_READY__ = payload;
}

export function publishError(error: unknown): void {
  (window as { __PRD13_ERROR__?: string }).__PRD13_ERROR__ =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
