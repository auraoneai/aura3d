export type TextureMagFilter = "nearest" | "linear";
export type TextureMinFilter =
  | TextureMagFilter
  | "nearest-mipmap-nearest"
  | "linear-mipmap-nearest"
  | "nearest-mipmap-linear"
  | "linear-mipmap-linear";
export type TextureFilter = TextureMinFilter;
export type TextureAddressMode = "clamp-to-edge" | "repeat" | "mirror-repeat";

export interface SamplerDescriptor {
  readonly minFilter?: TextureMinFilter;
  readonly magFilter?: TextureMagFilter;
  readonly addressU?: TextureAddressMode;
  readonly addressV?: TextureAddressMode;
  readonly maxAnisotropy?: number;
}

export class Sampler {
  public readonly minFilter: TextureMinFilter;
  public readonly magFilter: TextureMagFilter;
  public readonly addressU: TextureAddressMode;
  public readonly addressV: TextureAddressMode;
  public readonly maxAnisotropy: number;

  constructor(descriptor: SamplerDescriptor = {}) {
    this.minFilter = descriptor.minFilter ?? "linear";
    this.magFilter = descriptor.magFilter ?? "linear";
    this.addressU = descriptor.addressU ?? "clamp-to-edge";
    this.addressV = descriptor.addressV ?? "clamp-to-edge";
    const maxAnisotropy = descriptor.maxAnisotropy ?? 1;
    if (!Number.isFinite(maxAnisotropy) || maxAnisotropy < 1) {
      throw new RangeError("Sampler maxAnisotropy must be finite and at least 1");
    }
    this.maxAnisotropy = maxAnisotropy;
  }
}
