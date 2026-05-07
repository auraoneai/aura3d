import { Sampler } from "./Sampler";
import { Texture, type TextureColorSpace } from "./Texture";

export interface TextureBindingDescriptor {
  readonly name: string;
  readonly texture?: Texture | null;
  readonly sampler?: Sampler;
  readonly required?: boolean;
  readonly ready?: boolean;
  readonly expectedColorSpace?: TextureColorSpace;
  readonly transform?: TextureTransformDescriptor;
}

export interface TextureTransformDescriptor {
  readonly offset?: readonly [number, number];
  readonly scale?: readonly [number, number];
  readonly rotation?: number;
}

export interface TextureBindingValidation {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
  readonly warnings: readonly string[];
}

export class TextureBinding {
  public readonly name: string;
  public readonly texture: Texture | null;
  public readonly sampler: Sampler;
  public readonly required: boolean;
  public readonly ready: boolean;
  public readonly expectedColorSpace?: TextureColorSpace;
  public readonly offset: readonly [number, number];
  public readonly scale: readonly [number, number];
  public readonly rotation: number;

  constructor(descriptor: TextureBindingDescriptor) {
    if (!descriptor.name.trim()) {
      throw new Error("Texture binding name is required");
    }
    this.name = descriptor.name;
    this.texture = descriptor.texture ?? null;
    this.sampler = descriptor.sampler ?? new Sampler();
    this.required = descriptor.required ?? false;
    this.ready = descriptor.ready ?? true;
    this.expectedColorSpace = descriptor.expectedColorSpace;
    this.offset = descriptor.transform?.offset ? [descriptor.transform.offset[0], descriptor.transform.offset[1]] : [0, 0];
    this.scale = descriptor.transform?.scale ? [descriptor.transform.scale[0], descriptor.transform.scale[1]] : [1, 1];
    this.rotation = descriptor.transform?.rotation ?? 0;
  }

  validate(): TextureBindingValidation {
    const diagnostics: string[] = [];
    const warnings: string[] = [];
    if (this.required && !this.texture) {
      diagnostics.push(`Missing required texture: ${this.name}`);
    } else if (!this.required && !this.texture) {
      warnings.push(`Optional texture is not bound; using fallback texture: ${this.name}`);
    }
    if (this.texture?.disposed) {
      diagnostics.push(`Texture is disposed: ${this.name}`);
    }
    if (this.texture && !this.ready) {
      diagnostics.push(`Texture is not ready: ${this.name}`);
    }
    if (this.texture && this.expectedColorSpace && this.texture.colorSpace !== this.expectedColorSpace) {
      diagnostics.push(`Texture ${this.name} colorSpace must be ${this.expectedColorSpace}, got ${this.texture.colorSpace}`);
    }
    if (![...this.offset, ...this.scale, this.rotation].every(Number.isFinite)) {
      diagnostics.push(`Texture transform must contain finite values: ${this.name}`);
    }
    return { ok: diagnostics.length === 0, diagnostics, warnings };
  }

  transformUV(uv: readonly [number, number]): readonly [number, number] {
    const scaledX = uv[0] * this.scale[0];
    const scaledY = uv[1] * this.scale[1];
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return [
      scaledX * cos - scaledY * sin + this.offset[0],
      scaledX * sin + scaledY * cos + this.offset[1]
    ];
  }
}
