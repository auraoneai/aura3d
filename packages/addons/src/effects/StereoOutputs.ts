import { Scene, multiplyMat4, type Mat4 } from "@aura3d/scene";
import {
  createStereoCameraRig,
  type CameraLike,
  type RenderItem,
  type RenderSource,
  type RenderTarget,
  type Renderer
} from "@aura3d/rendering";

/** Pixel rectangles have a top-left origin, matching the returned image and 2D canvas. */
export interface StereoOutputView {
  readonly eye: "left" | "right";
  readonly viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly camera: CameraLike;
  readonly cameraPosition: readonly [number, number, number];
}
export type StereoOutputMode = "side-by-side" | "over-under" | "anaglyph" | "parallax-barrier";
export interface StereoOutputOptions {
  readonly width: number;
  readonly height: number;
  readonly mode?: StereoOutputMode;
  readonly eyeSeparation?: number;
  readonly convergenceDistance?: number;
  readonly barrierAxis?: "x" | "y";
  /** The period of a left and right strip, in output pixels. */
  readonly stripPitchPx?: number;
  readonly dutyCycle?: number;
  /** Optional 2D output surface; the caller owns it. */
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
}
export interface StereoOutputFrame {
  readonly width: number;
  readonly height: number;
  /** RGBA8 renderer readback, top row first; alpha association follows the source render. */
  readonly pixels: Uint8ClampedArray;
  readonly views: readonly [StereoOutputView, StereoOutputView];
}
export interface StereoPointer {
  readonly eye: "left" | "right";
  /** Coordinates relative to the eye viewport, in output pixels. */
  readonly x: number;
  readonly y: number;
  /** Normalized device coordinates, with positive Y pointing upwards. */
  readonly ndc: readonly [number, number];
}
export type StereoSource = RenderSource | Iterable<RenderItem> | Scene;
/** A column-major perspective frame; arrays, readonly tuples, and typed arrays are accepted. */
export interface StereoFrameCamera {
  readonly cameraPosition: readonly [number, number, number];
  readonly near: number;
  readonly viewMatrix: ArrayLike<number>;
  readonly projectionMatrix: ArrayLike<number>;
}

const MAX_PIXELS = 4_194_304;

/**
 * Opt-in CPU-composited stereo output. Each eye is rendered by the supplied
 * Aura renderer into a private RGBA8/depth target. Red/cyan selects red from
 * the left eye and green/blue from the right; the barrier starts with the
 * left eye at x=0 (or y=0). A top-left row order is returned in every mode.
 * Bytes are copied without alpha conversion; an optional 2D canvas interprets
 * them as straight alpha, so use an opaque clear when compositing into it.
 *
 * Await each render before using the renderer elsewhere. The output owns only
 * its targets, not the renderer, source or supplied canvas. Temporal post
 * effects such as TAA, motion blur, afterimage and auto-exposure are rejected
 * because one renderer history cannot represent two eyes. Custom passes must
 * likewise avoid shared temporal state.
 */
export class StereoOutput {
  private width: number;
  private height: number;
  private readonly mode: StereoOutputMode;
  private readonly eyeSeparation: number;
  private readonly convergenceDistance: number;
  private readonly axis: "x" | "y";
  private readonly pitch: number;
  private readonly duty: number;
  private readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  private targets: [RenderTarget, RenderTarget] | null = null;
  private busy = false;
  private disposed = false;

  constructor(private readonly renderer: Pick<Renderer, "device" | "render" | "renderAsync">, options: StereoOutputOptions) {
    validateSize(options.width, options.height);
    this.width = options.width;
    this.height = options.height;
    this.mode = options.mode ?? "side-by-side";
    if (!["side-by-side", "over-under", "anaglyph", "parallax-barrier"].includes(this.mode)) throw new RangeError("Invalid stereo output mode");
    this.eyeSeparation = options.eyeSeparation ?? 0.064;
    this.convergenceDistance = options.convergenceDistance ?? 10;
    this.axis = options.barrierAxis ?? "x";
    this.pitch = options.stripPitchPx ?? 2;
    this.duty = options.dutyCycle ?? 0.5;
    if (!Number.isFinite(this.eyeSeparation) || this.eyeSeparation <= 0 || this.eyeSeparation > 1) throw new RangeError("eyeSeparation must be in (0, 1]");
    if (!Number.isFinite(this.convergenceDistance) || this.convergenceDistance <= 0) throw new RangeError("convergenceDistance must be positive");
    if (this.axis !== "x" && this.axis !== "y") throw new RangeError("barrierAxis must be x or y");
    if (!Number.isFinite(this.pitch) || this.pitch < 1 || !Number.isFinite(this.duty) || this.duty <= 0 || this.duty >= 1) throw new RangeError("Barrier pitch must be at least one pixel and dutyCycle must be in (0, 1)");
    this.canvas = options.canvas;
    this.resizeCanvas();
  }

  setSize(width: number, height: number): void {
    this.assertUsable();
    if (this.busy) throw new Error("Cannot resize a stereo output during render");
    validateSize(width, height);
    if (this.width === width && this.height === height) return;
    this.releaseTargets();
    this.width = width;
    this.height = height;
    this.resizeCanvas();
  }

  async render(source: StereoSource, frame: StereoFrameCamera): Promise<StereoOutputFrame> {
    this.assertUsable();
    if (this.busy) throw new Error("A stereo render is already in progress");
    const device = this.renderer.device;
    if (!device.getRenderTarget) throw new Error("Stereo output requires getRenderTarget for safe state restoration");
    const normalized = normalizeSource(source);
    if (hasSharedTemporalPostprocess(normalized.postprocess)) {
      throw new Error("Stereo output does not support shared temporal postprocess history");
    }
    const views = this.createViews(frame);
    const previous = device.getRenderTarget();
    this.busy = true;
    try {
      const targets = this.ensureTargets(views);
      const eyes: Uint8Array[] = [];
      for (let index = 0; index < 2; index += 1) {
        if (this.disposed) throw new Error("Stereo output was disposed during render");
        const view = views[index]!;
        const target = targets[index]!;
        const eyeSource: RenderSource = { ...normalized, cameraPosition: view.cameraPosition, views: undefined };
        const input = { source: eyeSource, target, camera: view.camera };
        if (device.kind === "webgpu") await this.renderer.renderAsync(input);
        else this.renderer.render(input);
        device.setRenderTarget(target);
        const data = device.kind === "webgpu" && device.readPixelsAsync
          ? await device.readPixelsAsync(0, 0, target.width, target.height)
          : device.readPixels(0, 0, target.width, target.height);
        if (data.length !== target.width * target.height * 4) throw new Error("Stereo eye readback has an invalid size");
        eyes.push(device.kind === "webgl2" ? flipRows(data, target.width, target.height) : data);
      }
      if (this.disposed) throw new Error("Stereo output was disposed during render");
      const pixels = this.compose(views, eyes[0]!, eyes[1]!);
      this.paint(pixels);
      return { width: this.width, height: this.height, pixels, views };
    } finally {
      try { device.setRenderTarget(previous); }
      finally {
        this.busy = false;
        if (this.disposed) this.releaseTargets();
      }
    }
  }

  /**
   * Route top-left-origin output pixels to the correct eye and its NDC. In a
   * composite, a barrier chooses the displayed strip; an anaglyph defaults to
   * the left eye and may be overridden. Points outside the image return null.
   */
  mapPointer(x: number, y: number, eye?: "left" | "right"): StereoPointer | null {
    this.assertUsable();
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("Pointer coordinates must be finite");
    if (eye !== undefined && eye !== "left" && eye !== "right") throw new RangeError("Pointer eye must be left or right");
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const rects = this.viewRectangles();
    let index: 0 | 1;
    if (this.mode === "side-by-side") index = x < rects[0].width ? 0 : 1;
    else if (this.mode === "over-under") index = y < rects[0].height ? 0 : 1;
    else if (eye) index = eye === "left" ? 0 : 1;
    else if (this.mode === "parallax-barrier") index = (this.axis === "x" ? Math.floor(x) : Math.floor(y)) % this.pitch < this.pitch * this.duty ? 0 : 1;
    else index = 0;
    const rect = rects[index];
    const localX = x - rect.x;
    const localY = y - rect.y;
    return { eye: index === 0 ? "left" : "right", x: localX, y: localY, ndc: [2 * localX / rect.width - 1, 1 - 2 * localY / rect.height] };
  }

  /** Convert client/CSS coordinates using the displayed canvas rectangle. */
  mapClientPointer(clientX: number, clientY: number, rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }, eye?: "left" | "right"): StereoPointer | null {
    if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw new RangeError("Pointer rectangle must be finite with positive dimensions");
    return this.mapPointer((clientX - rect.left) * this.width / rect.width, (clientY - rect.top) * this.height / rect.height, eye);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.busy) this.releaseTargets();
  }

  private createViews(frame: StereoFrameCamera): [StereoOutputView, StereoOutputView] {
    if (!Number.isFinite(frame.near) || frame.near <= 0 || this.convergenceDistance <= frame.near) throw new RangeError("Stereo convergenceDistance must exceed a positive near plane");
    if (frame.viewMatrix.length !== 16 || frame.projectionMatrix.length !== 16 || frame.cameraPosition.length !== 3 || [...Array.from(frame.viewMatrix), ...Array.from(frame.projectionMatrix), ...frame.cameraPosition].some((value) => !Number.isFinite(value))) throw new RangeError("Stereo frame must contain finite camera matrices and position");
    const rigFrame = {
      cameraPosition: [...frame.cameraPosition] as [number, number, number],
      near: frame.near,
      viewMatrix: Array.from(frame.viewMatrix) as Mat4,
      projectionMatrix: Array.from(frame.projectionMatrix) as Mat4
    };
    const rig = createStereoCameraRig({ frame: rigFrame, viewport: { x: 0, y: 0, width: this.width, height: this.height }, eyeSeparation: this.eyeSeparation, convergenceDistance: this.convergenceDistance });
    const rectangles = this.viewRectangles();
    const views = rig.views.map((eye, index) => {
      const viewport = rectangles[index]!;
      const projection = Array.from(frame.projectionMatrix) as Mat4;
      // The supplied projection describes the whole output; compensate for the
      // eye viewport aspect and shift the frustum so its convergence plane aligns.
      projection[0] *= (this.width / this.height) / (viewport.width / viewport.height);
      projection[8] -= projection[0] * eye.eyeOffset / this.convergenceDistance;
      const vp = multiplyMat4(projection, eye.viewMatrix);
      return { eye: eye.eye, viewport, cameraPosition: eye.cameraPosition, camera: { viewMatrix: eye.viewMatrix, projectionMatrix: projection, viewProjectionMatrix: vp } };
    });
    return [views[0]!, views[1]!];
  }

  private viewRectangles(): [StereoOutputView["viewport"], StereoOutputView["viewport"]] {
    const leftWidth = Math.floor(this.width / 2);
    const topHeight = Math.floor(this.height / 2);
    return this.mode === "side-by-side"
      ? [{ x: 0, y: 0, width: leftWidth, height: this.height }, { x: leftWidth, y: 0, width: this.width - leftWidth, height: this.height }]
      : this.mode === "over-under"
        ? [{ x: 0, y: 0, width: this.width, height: topHeight }, { x: 0, y: topHeight, width: this.width, height: this.height - topHeight }]
        : [{ x: 0, y: 0, width: this.width, height: this.height }, { x: 0, y: 0, width: this.width, height: this.height }];
  }

  private ensureTargets(views: readonly [StereoOutputView, StereoOutputView]): [RenderTarget, RenderTarget] {
    if (this.targets && !this.targets.some((target) => target.disposed)) return this.targets;
    this.releaseTargets();
    const created: RenderTarget[] = [];
    try {
      for (const view of views) created.push(this.renderer.device.createRenderTarget({ width: view.viewport.width, height: view.viewport.height, format: "rgba8", depth: true, label: `a3d.stereo.${view.eye}` }));
    } catch (error) {
      for (const target of created) target.dispose();
      throw error;
    }
    this.targets = [created[0]!, created[1]!];
    return this.targets;
  }

  private compose(views: readonly [StereoOutputView, StereoOutputView], left: Uint8Array, right: Uint8Array): Uint8ClampedArray {
    const result = new Uint8ClampedArray(this.width * this.height * 4);
    if (this.mode === "side-by-side" || this.mode === "over-under") {
      for (const [index, pixels] of [left, right].entries()) {
        const rect = views[index]!.viewport;
        for (let y = 0; y < rect.height; y += 1) {
          const src = y * rect.width * 4;
          result.set(pixels.subarray(src, src + rect.width * 4), ((rect.y + y) * this.width + rect.x) * 4);
        }
      }
      return result;
    }
    for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) {
      const offset = (y * this.width + x) * 4;
      if (this.mode === "anaglyph") {
        result[offset] = left[offset]!;
        result[offset + 1] = right[offset + 1]!;
        result[offset + 2] = right[offset + 2]!;
        result[offset + 3] = Math.max(left[offset + 3]!, right[offset + 3]!);
      } else {
        const coord = this.axis === "x" ? x : y;
        const eye = coord % this.pitch < this.pitch * this.duty ? left : right;
        result.set(eye.subarray(offset, offset + 4), offset);
      }
    }
    return result;
  }

  private paint(pixels: Uint8ClampedArray): void {
    if (!this.canvas) return;
    const context = this.canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new Error("Stereo output canvas has no 2D context");
    const image = context.createImageData(this.width, this.height);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
  }
  private resizeCanvas(): void { if (this.canvas) { this.canvas.width = this.width; this.canvas.height = this.height; } }
  private releaseTargets(): void { this.targets?.forEach((target) => target.dispose()); this.targets = null; }
  private assertUsable(): void { if (this.disposed) throw new Error("Stereo output is disposed"); }
}

function hasSharedTemporalPostprocess(postprocess: RenderSource["postprocess"]): boolean {
  if (!postprocess || typeof postprocess !== "object") return false;
  if (postprocess.taa || postprocess.motionBlur) return true;
  const pipeline = postprocess.pipeline;
  if (!pipeline || typeof pipeline !== "object") return false;
  const options = pipeline as {
    readonly antiAliasing?: unknown;
    readonly taa?: unknown;
    readonly motionBlur?: unknown;
    readonly autoExposure?: unknown;
    readonly nativeEffects?: unknown;
  };
  if (options.antiAliasing === "taa" || options.taa || options.motionBlur || (options.autoExposure !== undefined && options.autoExposure !== false)) return true;
  if (!Array.isArray(options.nativeEffects)) return false;
  if (options.nativeEffects.length > 1024) throw new RangeError("Stereo native effect budget exceeded");
  return options.nativeEffects.some((effect: unknown) => typeof effect === "object" && effect !== null && "kind" in effect && effect.kind === "afterimage");
}

function normalizeSource(source: StereoSource): RenderSource {
  if (source instanceof Scene) return { scene: source };
  if (Symbol.iterator in Object(source)) return { renderItems: boundedArray(source as Iterable<RenderItem>, 100_000, "render items") };
  const base = source as RenderSource;
  // Snapshot explicit iterables once so one-shot generators and collectors do
  // not produce a different scene for each eye.
  const renderItems = boundedArray(base.collectRenderItems?.() ?? [], 100_000, "render items");
  for (const item of base.renderItems ?? []) {
    if (renderItems.length >= 100_000) throw new RangeError("Stereo render item budget exceeded");
    renderItems.push(item);
  }
  return { ...base, collectRenderItems: undefined, renderItems, ...(base.collectedLights ? { collectedLights: boundedArray(base.collectedLights, 4096, "lights") } : {}) };
}
function boundedArray<T>(source: Iterable<T>, max: number, label: string): T[] {
  const result: T[] = [];
  for (const item of source) {
    if (result.length >= max) throw new RangeError(`Stereo ${label} budget exceeded`);
    result.push(item);
  }
  return result;
}
function flipRows(data: Uint8Array, width: number, height: number): Uint8Array {
  const row = width * 4;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y += 1) out.set(data.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return out;
}
function validateSize(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2 || width * height > MAX_PIXELS) throw new RangeError(`Stereo output dimensions must be at least 2x2 and at most ${MAX_PIXELS} pixels`);
}
