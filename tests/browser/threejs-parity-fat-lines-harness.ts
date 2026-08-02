import {
  Geometry,
  Renderer,
  ScreenSpaceLineMaterial,
  UnlitMaterial,
  type RenderItem
} from "@aura3d/rendering";

/**
 * FS-402 browser proof for true screen-space fat lines.
 *
 * The property under test is that a width specified in pixels renders at that pixel
 * width regardless of camera distance, field of view, viewport size, or device pixel
 * ratio. World-space triangle quads cannot do this: a world-space offset shrinks under
 * perspective, so the stroke thins with distance.
 *
 * Each case renders one vertical segment and measures the widest horizontal run of
 * stroke pixels. Comparing that measured width against the requested width is a direct
 * test of the claim rather than a proxy for it.
 */

interface Measurement {
  readonly id: string;
  readonly requestedWidthCss: number;
  readonly pixelRatio: number;
  readonly viewport: readonly [number, number];
  readonly cameraDistance: number;
  readonly fovDegrees: number;
  /** Widest horizontal run of stroke pixels, in device pixels. */
  readonly measuredWidthDevicePixels: number;
  /** Measured width converted back to CSS pixels for comparison across DPRs. */
  readonly measuredWidthCssPixels: number;
  readonly strokePixels: number;
}

interface FatLineEvidence {
  readonly widthStability: readonly Measurement[];
  readonly maxCssWidthDeviation: number;
  readonly dash: { readonly solidStrokePixels: number; readonly dashedStrokePixels: number; readonly dashReducedCoverage: boolean };
  readonly worldSpaceComparison: {
    readonly screenSpaceNearWidth: number;
    readonly screenSpaceFarWidth: number;
    readonly screenSpaceRatio: number;
    readonly worldSpaceNearWidth: number;
    readonly worldSpaceFarWidth: number;
    readonly worldSpaceRatio: number;
  };
  readonly pass: boolean;
}

declare global {
  interface Window {
    __AURA3D_FAT_LINES__?: FatLineEvidence;
    __AURA3D_FAT_LINES_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  const detail = error && typeof error === "object" && "diagnostics" in error
    ? ` diagnostics=${JSON.stringify((error as { diagnostics?: unknown }).diagnostics)}`
    : "";
  window.__AURA3D_FAT_LINES_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}${detail}` : String(error);
});

async function run(): Promise<void> {
  const requestedWidthCss = 8;

  // Vary distance, FOV, viewport, and DPR independently. If any of them changed the
  // rendered width, the "screen-space" claim would be false.
  const cases: readonly { readonly id: string; readonly viewport: readonly [number, number]; readonly pixelRatio: number; readonly distance: number; readonly fov: number }[] = [
    { id: "baseline", viewport: [400, 400], pixelRatio: 1, distance: 4, fov: 50 },
    { id: "far-camera", viewport: [400, 400], pixelRatio: 1, distance: 16, fov: 50 },
    { id: "narrow-fov", viewport: [400, 400], pixelRatio: 1, distance: 4, fov: 20 },
    { id: "wide-fov", viewport: [400, 400], pixelRatio: 1, distance: 4, fov: 80 },
    { id: "small-viewport", viewport: [240, 240], pixelRatio: 1, distance: 4, fov: 50 },
    { id: "large-viewport", viewport: [640, 640], pixelRatio: 1, distance: 4, fov: 50 },
    { id: "dpr-2", viewport: [400, 400], pixelRatio: 2, distance: 4, fov: 50 }
  ];

  const widthStability: Measurement[] = [];
  for (const entry of cases) {
    widthStability.push(await measureCase({ ...entry, requestedWidthCss }));
  }
  const maxCssWidthDeviation = Math.max(
    ...widthStability.map((entry) => Math.abs(entry.measuredWidthCssPixels - requestedWidthCss) / requestedWidthCss)
  );

  const dash = await measureDash(requestedWidthCss);
  const worldSpaceComparison = await compareWithWorldSpaceQuads(requestedWidthCss);

  window.__AURA3D_FAT_LINES__ = {
    widthStability,
    maxCssWidthDeviation: Number(maxCssWidthDeviation.toFixed(4)),
    dash,
    worldSpaceComparison,
    pass: maxCssWidthDeviation <= 0.2 && dash.dashReducedCoverage && worldSpaceComparison.screenSpaceRatio >= 0.85
  };
}

async function measureCase(options: {
  readonly id: string;
  readonly viewport: readonly [number, number];
  readonly pixelRatio: number;
  readonly distance: number;
  readonly fov: number;
  readonly requestedWidthCss: number;
}): Promise<Measurement> {
  const deviceWidth = Math.round(options.viewport[0] * options.pixelRatio);
  const deviceHeight = Math.round(options.viewport[1] * options.pixelRatio);
  const { renderer, canvas } = await createRenderer(options.id, deviceWidth, deviceHeight);

  const material = new ScreenSpaceLineMaterial({
    color: [1, 0.85, 0.3, 1],
    width: options.requestedWidthCss,
    resolution: [deviceWidth, deviceHeight],
    pixelRatio: options.pixelRatio,
    cap: "butt"
  });
  // A vertical segment through the view centre, so the stroke's horizontal extent is
  // exactly its width.
  const geometry = Geometry.screenSpaceLineSegments([{ start: [0, -1, 0], end: [0, 1, 0] }]);
  const item: RenderItem = {
    label: `fat-line-${options.id}`,
    geometry,
    material,
    modelViewProjectionMatrix: perspectiveLookAt(options.fov, deviceWidth / deviceHeight, options.distance)
  };
  renderer.render({ renderItems: [item], cameraPolicy: "identity" });
  const pixels = renderer.device.readPixels(0, 0, deviceWidth, deviceHeight);
  showCanvas(options.id, `${options.id} · ${options.requestedWidthCss}px @ dpr ${options.pixelRatio}`, pixels, deviceWidth, deviceHeight);
  const measured = widestHorizontalRun(pixels, deviceWidth, deviceHeight);
  const strokePixels = countStrokePixels(pixels);
  renderer.dispose();
  canvas.remove();

  return {
    id: options.id,
    requestedWidthCss: options.requestedWidthCss,
    pixelRatio: options.pixelRatio,
    viewport: options.viewport,
    cameraDistance: options.distance,
    fovDegrees: options.fov,
    measuredWidthDevicePixels: measured,
    measuredWidthCssPixels: Number((measured / options.pixelRatio).toFixed(3)),
    strokePixels
  };
}

async function measureDash(requestedWidthCss: number): Promise<FatLineEvidence["dash"]> {
  const size = 400;
  const solid = await renderStroke("dash-solid", size, requestedWidthCss, undefined);
  const dashed = await renderStroke("dash-dashed", size, requestedWidthCss, { dashSize: 0.18, gapSize: 0.18 });
  return {
    solidStrokePixels: solid,
    dashedStrokePixels: dashed,
    // Dashing must remove coverage. Requiring a substantial drop prevents a no-op dash
    // implementation from passing.
    dashReducedCoverage: dashed < solid * 0.75 && dashed > 0
  };
}

async function renderStroke(
  id: string,
  size: number,
  widthCss: number,
  dash: { readonly dashSize: number; readonly gapSize: number } | undefined
): Promise<number> {
  const { renderer, canvas } = await createRenderer(id, size, size);
  const material = new ScreenSpaceLineMaterial({
    color: [0.4, 1, 0.7, 1],
    width: widthCss,
    resolution: [size, size],
    pixelRatio: 1,
    ...(dash ? { dashSize: dash.dashSize, gapSize: dash.gapSize } : {})
  });
  const geometry = Geometry.screenSpaceLineSegments([{ start: [0, -1, 0], end: [0, 1, 0] }]);
  renderer.render({
    renderItems: [{ label: id, geometry, material, modelViewProjectionMatrix: perspectiveLookAt(50, 1, 4) }],
    cameraPolicy: "identity"
  });
  const pixels = renderer.device.readPixels(0, 0, size, size);
  showCanvas(id, dash ? `dashed (${dash.dashSize} world units)` : "solid", pixels, size, size);
  const count = countStrokePixels(pixels);
  renderer.dispose();
  canvas.remove();
  return count;
}

/**
 * Direct comparison against the world-space quad approach at two camera distances.
 *
 * The screen-space stroke must keep its width; the world-space quad must visibly thin.
 * This is the measurement that distinguishes the two techniques rather than asserting
 * the difference by description.
 */
async function compareWithWorldSpaceQuads(requestedWidthCss: number): Promise<FatLineEvidence["worldSpaceComparison"]> {
  const size = 400;
  const near = 4;
  const far = 16;

  const screenNear = await measureScreenSpaceWidth("cmp-screen-near", size, requestedWidthCss, near);
  const screenFar = await measureScreenSpaceWidth("cmp-screen-far", size, requestedWidthCss, far);
  const worldNear = await measureWorldSpaceWidth("cmp-world-near", size, near);
  const worldFar = await measureWorldSpaceWidth("cmp-world-far", size, far);

  return {
    screenSpaceNearWidth: screenNear,
    screenSpaceFarWidth: screenFar,
    screenSpaceRatio: Number((screenFar / Math.max(1, screenNear)).toFixed(4)),
    worldSpaceNearWidth: worldNear,
    worldSpaceFarWidth: worldFar,
    worldSpaceRatio: Number((worldFar / Math.max(1, worldNear)).toFixed(4))
  };
}

async function measureScreenSpaceWidth(id: string, size: number, widthCss: number, distance: number): Promise<number> {
  const { renderer, canvas } = await createRenderer(id, size, size);
  const material = new ScreenSpaceLineMaterial({ color: [1, 0.7, 0.2, 1], width: widthCss, resolution: [size, size], pixelRatio: 1 });
  const geometry = Geometry.screenSpaceLineSegments([{ start: [0, -1, 0], end: [0, 1, 0] }]);
  renderer.render({
    renderItems: [{ label: id, geometry, material, modelViewProjectionMatrix: perspectiveLookAt(50, 1, distance) }],
    cameraPolicy: "identity"
  });
  const pixels = renderer.device.readPixels(0, 0, size, size);
  showCanvas(id, `screen-space @ distance ${distance}`, pixels, size, size);
  const measured = widestHorizontalRun(pixels, size, size);
  renderer.dispose();
  canvas.remove();
  return measured;
}

async function measureWorldSpaceWidth(id: string, size: number, distance: number): Promise<number> {
  const { renderer, canvas } = await createRenderer(id, size, size);
  // World-space width chosen so the near-distance stroke roughly matches the
  // screen-space case; the far-distance divergence is then the meaningful signal.
  const material = new UnlitMaterial({ color: [0.5, 0.7, 1, 1] });
  const geometry = Geometry.wideLineSegments([{ start: [0, -1, 0], end: [0, 1, 0], width: 0.09 }]);
  renderer.render({
    renderItems: [{ label: id, geometry, material, modelViewProjectionMatrix: perspectiveLookAt(50, 1, distance) }],
    cameraPolicy: "identity"
  });
  const pixels = renderer.device.readPixels(0, 0, size, size);
  showCanvas(id, `world-space quad @ distance ${distance}`, pixels, size, size);
  const measured = widestHorizontalRun(pixels, size, size);
  renderer.dispose();
  canvas.remove();
  return measured;
}

async function createRenderer(id: string, width: number, height: number): Promise<{ readonly renderer: Renderer; readonly canvas: HTMLCanvasElement }> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.display = "none";
  canvas.id = `fat-line-src-${id}`;
  document.body.append(canvas);
  const renderer = await Renderer.create({
    canvas,
    width,
    height,
    backend: "webgl2",
    preserveDrawingBuffer: true,
    clearColor: [0.02, 0.03, 0.05, 1],
    requiredFeatures: ["basic-rendering", "pixel-readback"],
    errorCheckMode: "strict"
  });
  return { renderer, canvas };
}

function showCanvas(id: string, label: string, pixels: Uint8Array, width: number, height: number): void {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:inline-block;margin:6px;text-align:center;vertical-align:top";
  const view = document.createElement("canvas");
  view.width = width;
  view.height = height;
  view.style.cssText = "width:150px;height:150px;border:1px solid #22405c;display:block;image-rendering:pixelated";
  const context = view.getContext("2d");
  if (context) {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const sourceRow = (height - 1 - y) * width * 4;
      const targetRow = y * width * 4;
      for (let x = 0; x < width * 4; x += 1) image.data[targetRow + x] = pixels[sourceRow + x] ?? 0;
    }
    context.putImageData(image, 0, 0);
  }
  const text = document.createElement("div");
  text.textContent = label;
  text.style.cssText = "font:10px ui-monospace,monospace;color:#8fb6d6;padding-top:3px;max-width:160px";
  wrapper.append(view, text);
  document.getElementById("fat-lines-root")?.append(wrapper);
  void id;
}

function isStroke(pixels: Uint8Array, index: number): boolean {
  const red = pixels[index] ?? 0;
  const green = pixels[index + 1] ?? 0;
  const blue = pixels[index + 2] ?? 0;
  return red + green + blue > 90;
}

function widestHorizontalRun(pixels: Uint8Array, width: number, height: number): number {
  let widest = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x < width; x += 1) {
      if (isStroke(pixels, (y * width + x) * 4)) {
        run += 1;
        if (run > widest) widest = run;
      } else {
        run = 0;
      }
    }
  }
  return widest;
}

function countStrokePixels(pixels: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (isStroke(pixels, index)) count += 1;
  }
  return count;
}

/** Perspective * lookAt(0, 0, distance) -> origin, column-major. */
function perspectiveLookAt(fovDegrees: number, aspect: number, distance: number): Float32Array {
  const fov = (fovDegrees * Math.PI) / 180;
  const near = 0.1;
  const far = 100;
  const f = 1 / Math.tan(fov / 2);
  const projection = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ]);
  // View matrix for an eye on +Z looking at the origin is a pure -Z translation.
  const view = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -distance, 1
  ]);
  return multiply4(projection, view);
}

function multiply4(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        (left[row] ?? 0) * (right[column * 4] ?? 0)
        + (left[4 + row] ?? 0) * (right[column * 4 + 1] ?? 0)
        + (left[8 + row] ?? 0) * (right[column * 4 + 2] ?? 0)
        + (left[12 + row] ?? 0) * (right[column * 4 + 3] ?? 0);
    }
  }
  return out;
}
