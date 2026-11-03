/**
 * TransmissionRenderTarget.ts — mipmapped scene-colour copy target for
 * KHR_materials_transmission (PRD-04 §7.3, P1-8). The transmission pass
 * reads this target's mip chain for rough refraction.
 *
 * A full chain is explicitly requested from the device. The wrapper reports
 * only levels the returned texture actually exposes; populating those levels
 * remains the capture pass's responsibility after each base-level copy.
 */

import { RenderDeviceError, type RenderDevice, type RenderTarget } from "./RenderDevice";

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
    if (width === this._width && height === this._height && this.target && !this.target.disposed && !this.target.colorTexture.disposed) return;
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
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
      throw new RenderDeviceError("Transmission target dimensions must be positive integers", "INVALID_RENDER_TARGET_SIZE", { width, height });
    }
    const mipCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
    const next = this.device.createRenderTarget({
      width,
      height,
      label: "prd04-transmission-scene-color",
      format: this.options.format ?? "rgba8",
      depth: false,
      sampleCount: 1,
      mipLevelCount: mipCount
    });
    if (next.disposed || next.colorTexture.disposed || next.width !== width || next.height !== height ||
        next.colorTexture.width !== width || next.colorTexture.height !== height ||
        next.colorTexture.format !== (this.options.format ?? "rgba8") || next.colorTexture.dimension !== "2d" ||
        !next.colorTexture.usage.includes("sampled") || !next.colorTexture.usage.includes("render-attachment") ||
        next.colorTexture.mipLevelCount !== mipCount) {
      next.dispose();
      throw new RenderDeviceError("Device did not allocate the requested transmission mip chain", "TRANSMISSION_MIP_ALLOCATION_UNAVAILABLE", { width, height, mipCount });
    }
    const previous = this.target;
    this.target = next;
    this._width = width;
    this._height = height;
    this._mipCount = next.colorTexture.mipLevelCount;
    previous?.dispose();
  }
}
