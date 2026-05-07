import { Texture } from "./Texture";

export interface ShadowMapOptions {
  readonly size?: number;
  readonly bias?: number;
  readonly label?: string;
}

export class ShadowMap {
  public readonly texture: Texture;
  public readonly bias: number;

  constructor(options: ShadowMapOptions = {}) {
    const size = options.size ?? 1024;
    if (!Number.isInteger(size) || size <= 0) {
      throw new RangeError("ShadowMap size must be a positive integer");
    }
    const bias = options.bias ?? 0.001;
    if (!Number.isFinite(bias) || bias < 0) {
      throw new RangeError("ShadowMap bias must be finite and non-negative");
    }
    this.bias = bias;
    this.texture = new Texture({ width: size, height: size, format: "depth24", label: options.label ?? "shadow-map" });
  }

  get size(): number {
    return this.texture.width;
  }

  resize(size: number): ShadowMap {
    this.dispose();
    return new ShadowMap({ size, bias: this.bias, label: this.texture.label });
  }

  dispose(): void {
    this.texture.dispose();
  }
}
