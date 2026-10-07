/**
 * TransmissionRenderTarget.ts — mipmapped scene-colour copy target for
 * KHR_materials_transmission (PRD-04 §7.3, P1-8). The transmission pass
 * reads this target's mip chain for rough refraction.
 *
 * The device allocates GPU mip storage when the pass binds the target;
 * `mipCount` here is the chain contract (`floor(log2(max(w,h))) + 1`, i.e.
 * a full chain down to 1×1). `resize` only reallocates when the dimensions
 * actually change — per-frame calls are free.
 */

import type { RenderDevice, RenderTarget } from "./RenderDevice";

export class TransmissionRenderTarget {
  private target: RenderTarget | undefined;
  private _mipCount = 0;
  private _width = 0;
  private _height = 0;

  constructor(
    private readonly device: RenderDevice,
    size: { readonly width: number; readonly height: number },
    private readonly options: { readonly format?: "rgba8" | "rgba16f" | "rgba32f" } = {}
  ) {
    this.allocate(size.width, size.height);
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get mipCount(): number {
    return this._mipCount;
  }

  get texture(): RenderTarget | undefined {
    return this.target;
  }

  resize(width: number, height: number): void {
    if (width === this._width && height === this._height) return;
    this.allocate(width, height);
  }

  dispose(): void {
    this.target?.dispose();
    this.target = undefined;
    this._mipCount = 0;
    this._width = 0;
    this._height = 0;
  }

  private allocate(width: number, height: number): void {
    this.target?.dispose();
    this._width = width;
    this._height = height;
    this._mipCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
    this.target = this.device.createRenderTarget({
      width,
      height,
      label: "prd04-transmission-scene-color",
      format: this.options.format ?? "rgba8",
      depth: "renderbuffer"
    });
  }
}
