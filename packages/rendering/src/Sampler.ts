export type TextureFilter = "nearest" | "linear";
export type TextureAddressMode = "clamp-to-edge" | "repeat" | "mirror-repeat";

export interface SamplerDescriptor {
  readonly minFilter?: TextureFilter;
  readonly magFilter?: TextureFilter;
  readonly addressU?: TextureAddressMode;
  readonly addressV?: TextureAddressMode;
}

export class Sampler {
  public readonly minFilter: TextureFilter;
  public readonly magFilter: TextureFilter;
  public readonly addressU: TextureAddressMode;
  public readonly addressV: TextureAddressMode;

  constructor(descriptor: SamplerDescriptor = {}) {
    this.minFilter = descriptor.minFilter ?? "linear";
    this.magFilter = descriptor.magFilter ?? "linear";
    this.addressU = descriptor.addressU ?? "clamp-to-edge";
    this.addressV = descriptor.addressV ?? "clamp-to-edge";
  }
}
