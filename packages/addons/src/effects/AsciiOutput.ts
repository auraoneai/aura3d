import type { CameraLike, RenderItem, RenderSource, RenderTarget, Renderer } from "@aura3d/rendering";
import type { Scene } from "@aura3d/scene";

export interface AsciiOutputOptions {
  /** Character columns and rows, not device pixels. */
  readonly width: number;
  readonly height: number;
  /** Characters ordered from darkest to brightest. Unicode code points are allowed. */
  readonly characters?: string;
  readonly invert?: boolean;
  /** Render resolution per character dimension, from 1 to 16 (default 2). */
  readonly sampleScale?: number;
  /** Supplied by and still owned by the caller. Child nodes and attributes are restored on disposal. */
  readonly element?: HTMLElement;
  readonly accessibleLabel?: string;
}
export interface AsciiPixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array | Uint8ClampedArray;
  readonly origin?: "top-left" | "bottom-left";
}
export interface AsciiOutputFrame { readonly width: number; readonly height: number; readonly text: string; }
export type AsciiSource = RenderSource | Iterable<RenderItem> | Scene;

const MAX_CELLS = 20_000;
const MAX_PIXELS = 4_194_304;

/**
 * A bounded luminance-to-text output. Pixels are interpreted as unpremultiplied
 * sRGB and composited over black before area averaging. Characters are inserted
 * as text, never HTML. Rendering captures a private target and requires exclusive
 * renderer access until the returned promise settles. Captured bytes use the
 * same straight-alpha interpretation; a renderer with transparent compositing
 * may have associated RGB, so use an opaque clear for consistent luminance.
 * The target and optional DOM mutations are released by dispose().
 */
export class AsciiOutput {
  private width: number;
  private height: number;
  private readonly characters: readonly string[];
  private readonly invert: boolean;
  private readonly scale: number;
  private readonly element?: HTMLElement;
  private readonly originalElement?: { children: readonly Node[]; role: string | null; label: string | null; whiteSpace: readonly [string, string] };
  private target: RenderTarget | null = null;
  private targetOwner: Pick<Renderer, "device" | "render" | "renderAsync"> | null = null;
  private busy = false;
  private disposed = false;

  constructor(options: AsciiOutputOptions) {
    validateCells(options.width, options.height);
    this.width = options.width;
    this.height = options.height;
    this.characters = [...(options.characters ?? " .:-=+*#%@")];
    if (this.characters.length < 2 || this.characters.length > 128 || this.characters.some((char) => /[\u0000-\u001f\u007f]/u.test(char))) throw new RangeError("ASCII character ramp must contain 2 to 128 printable characters");
    this.invert = options.invert ?? false;
    this.scale = options.sampleScale ?? 2;
    if (!Number.isInteger(this.scale) || this.scale < 1 || this.scale > 16) throw new RangeError("sampleScale must be an integer in [1, 16]");
    this.validateCaptureSize();
    this.element = options.element;
    if (this.element) {
      this.originalElement = {
        children: Array.from(this.element.childNodes),
        role: this.element.getAttribute("role"),
        label: this.element.getAttribute("aria-label"),
        whiteSpace: [this.element.style.getPropertyValue("white-space"), this.element.style.getPropertyPriority("white-space")]
      };
      this.element.style.whiteSpace = "pre";
      this.element.setAttribute("role", "img");
      this.element.setAttribute("aria-label", options.accessibleLabel ?? "ASCII rendering");
    }
  }

  setSize(width: number, height: number): void {
    this.assertUsable();
    if (this.busy) throw new Error("Cannot resize ASCII output during render");
    validateCells(width, height);
    if (width * height * this.scale * this.scale > MAX_PIXELS) throw new RangeError(`ASCII capture may not exceed ${MAX_PIXELS} pixels`);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.releaseTarget();
  }

  /** Convert caller-supplied pixels. The same conversion is used by render(). */
  renderPixels(input: AsciiPixels): AsciiOutputFrame {
    this.assertUsable();
    validatePixels(input);
    // When a very narrow image is expanded into a wide character grid (or
    // vice versa), samples are intentionally reused. Bound this work as well
    // as the two independent input/output allocation sizes.
    if (Math.max(input.width, this.width) * Math.max(input.height, this.height) > MAX_PIXELS * 2) throw new RangeError("ASCII sampling work exceeds the pixel budget");
    const rows: string[] = [];
    for (let row = 0; row < this.height; row += 1) {
      let line = "";
      const y0 = row * input.height / this.height;
      const y1 = (row + 1) * input.height / this.height;
      for (let col = 0; col < this.width; col += 1) {
        const x0 = col * input.width / this.width;
        const x1 = (col + 1) * input.width / this.width;
        let sum = 0;
        let area = 0;
        // A boundary may split an input pixel between cells. Weight by the
        // actual overlap rather than assigning the whole pixel to one cell.
        for (let y = Math.floor(y0); y < Math.min(input.height, Math.ceil(y1)); y += 1) for (let x = Math.floor(x0); x < Math.min(input.width, Math.ceil(x1)); x += 1) {
          const sy = input.origin === "bottom-left" ? input.height - y - 1 : y;
          const offset = (sy * input.width + x) * 4;
          const alpha = input.pixels[offset + 3]! / 255;
          const weight = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0));
          sum += (0.2126 * input.pixels[offset]! + 0.7152 * input.pixels[offset + 1]! + 0.0722 * input.pixels[offset + 2]!) * alpha * weight;
          area += weight;
        }
        let brightness = Math.max(0, Math.min(1, sum / (area * 255)));
        if (this.invert) brightness = 1 - brightness;
        line += this.characters[Math.min(this.characters.length - 1, Math.floor(brightness * this.characters.length))]!;
      }
      rows.push(line);
    }
    const text = rows.join("\n");
    if (this.element) this.element.textContent = text;
    return { width: this.width, height: this.height, text };
  }

  async render(renderer: Pick<Renderer, "device" | "render" | "renderAsync">, source: AsciiSource, camera?: CameraLike): Promise<AsciiOutputFrame> {
    this.assertUsable();
    if (this.busy) throw new Error("An ASCII render is already in progress");
    const device = renderer.device;
    if (!device.getRenderTarget) throw new Error("ASCII output requires getRenderTarget for safe state restoration");
    const previous = device.getRenderTarget();
    this.busy = true;
    try {
      const target = this.ensureTarget(renderer);
      const input = { source, camera, target };
      if (device.kind === "webgpu") await renderer.renderAsync(input);
      else renderer.render(input);
      device.setRenderTarget(target);
      const pixels = device.kind === "webgpu" && device.readPixelsAsync
        ? await device.readPixelsAsync(0, 0, target.width, target.height)
        : device.readPixels(0, 0, target.width, target.height);
      if (this.disposed) throw new Error("ASCII output was disposed during render");
      return this.renderPixels({ width: target.width, height: target.height, pixels, origin: device.kind === "webgl2" ? "bottom-left" : "top-left" });
    } finally {
      try { device.setRenderTarget(previous); }
      finally {
        this.busy = false;
        if (this.disposed) this.releaseTarget();
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.busy) this.releaseTarget();
    if (this.element && this.originalElement) {
      this.element.replaceChildren();
      for (const child of this.originalElement.children) this.element.appendChild(child);
      restoreAttribute(this.element, "role", this.originalElement.role);
      restoreAttribute(this.element, "aria-label", this.originalElement.label);
      const [whiteSpace, priority] = this.originalElement.whiteSpace;
      if (whiteSpace) this.element.style.setProperty("white-space", whiteSpace, priority);
      else this.element.style.removeProperty("white-space");
    }
  }

  private ensureTarget(renderer: Pick<Renderer, "device" | "render" | "renderAsync">): RenderTarget {
    if (this.target && (this.target.disposed || this.targetOwner !== renderer)) this.releaseTarget();
    if (!this.target) {
      this.target = renderer.device.createRenderTarget({ width: this.width * this.scale, height: this.height * this.scale, format: "rgba8", depth: true, label: "a3d.ascii" });
      this.targetOwner = renderer;
    }
    return this.target;
  }
  private releaseTarget(): void { this.target?.dispose(); this.target = null; this.targetOwner = null; }
  private validateCaptureSize(): void { if (this.width * this.height * this.scale * this.scale > MAX_PIXELS) throw new RangeError(`ASCII capture may not exceed ${MAX_PIXELS} pixels`); }
  private assertUsable(): void { if (this.disposed) throw new Error("ASCII output is disposed"); }
}

function validateCells(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > MAX_CELLS) throw new RangeError(`ASCII output dimensions must be positive and at most ${MAX_CELLS} cells`);
}
function validatePixels(input: AsciiPixels): void {
  if (!(input.pixels instanceof Uint8Array || input.pixels instanceof Uint8ClampedArray) || !Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width <= 0 || input.height <= 0 || input.width * input.height > MAX_PIXELS || input.pixels.length !== input.width * input.height * 4) throw new RangeError("ASCII pixels must be a bounded, complete RGBA8 image");
  if (input.origin !== undefined && input.origin !== "top-left" && input.origin !== "bottom-left") throw new RangeError("Invalid pixel origin");
}
function restoreAttribute(element: HTMLElement, name: string, value: string | null): void { if (value === null) element.removeAttribute(name); else element.setAttribute(name, value); }
