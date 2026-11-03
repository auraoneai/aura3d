import { Sampler } from "./Sampler";
import { Texture, type TextureColorSpace, type TextureDimension } from "./Texture";

const TEXTURE_BINDING_BRAND = Symbol.for("@aura3d/rendering/TextureBinding");

export interface TextureBindingDescriptor {
  readonly name: string;
  readonly texture?: Texture | null;
  readonly sampler?: Sampler;
  readonly required?: boolean;
  readonly ready?: boolean;
  readonly expectedColorSpace?: TextureColorSpace;
  readonly expectedDimension?: TextureDimension;
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

/** The fallback warning text per binding (name is fixed), so a fallback-bound draw does not rebuild it every frame. */
const fallbackWarnings = new WeakMap<object, string>();
const VALID_TEXTURE_BINDING: TextureBindingValidation = Object.freeze({ ok: true, diagnostics: Object.freeze([]) as readonly string[], warnings: Object.freeze([]) as readonly string[] });

export class TextureBinding {
  public readonly [TEXTURE_BINDING_BRAND] = true;
  public readonly name: string;
  public readonly texture: Texture | null;
  public readonly sampler: Sampler;
  public readonly required: boolean;
  public readonly ready: boolean;
  public readonly expectedColorSpace?: TextureColorSpace;
  public readonly expectedDimension?: TextureDimension;
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
    this.expectedDimension = descriptor.expectedDimension;
    this.offset = descriptor.transform?.offset ? [descriptor.transform.offset[0], descriptor.transform.offset[1]] : [0, 0];
    this.scale = descriptor.transform?.scale ? [descriptor.transform.scale[0], descriptor.transform.scale[1]] : [1, 1];
    this.rotation = descriptor.transform?.rotation ?? 0;
  }

  validate(): TextureBindingValidation {
    // Runs for every bound texture on every draw: report through shared empty lists when there is nothing to say.
    let diagnostics: string[] | undefined;
    let warnings: string[] | undefined;
    if (this.required && !this.texture) {
      (diagnostics ??= []).push(`Missing required texture: ${this.name}`);
    } else if (!this.required && !this.texture) {
      let warning = fallbackWarnings.get(this);
      if (warning === undefined) fallbackWarnings.set(this, warning = `Optional texture is not bound; using fallback texture: ${this.name}`);
      (warnings ??= []).push(warning);
    }
    if (this.texture?.disposed) {
      (diagnostics ??= []).push(`Texture is disposed: ${this.name}`);
    }
    if (this.texture && !this.ready) {
      (diagnostics ??= []).push(`Texture is not ready: ${this.name}`);
    }
    if (this.texture && this.expectedColorSpace && this.texture.colorSpace !== this.expectedColorSpace) {
      (diagnostics ??= []).push(`Texture ${this.name} colorSpace must be ${this.expectedColorSpace}, got ${this.texture.colorSpace}`);
    }
    if (this.texture && this.expectedDimension && this.texture.dimension !== this.expectedDimension) {
      (diagnostics ??= []).push(`Texture ${this.name} dimension must be ${this.expectedDimension}, got ${this.texture.dimension}`);
    }
    if (!(Number.isFinite(this.offset[0]) && Number.isFinite(this.offset[1]) && Number.isFinite(this.scale[0]) && Number.isFinite(this.scale[1]) && Number.isFinite(this.rotation))) {
      (diagnostics ??= []).push(`Texture transform must contain finite values: ${this.name}`);
    }
    if (!diagnostics && !warnings) return VALID_TEXTURE_BINDING;
    return { ok: diagnostics === undefined, diagnostics: diagnostics ?? [], warnings: warnings ?? [] };
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

/**
 * Recognizes texture bindings across duplicated package instances.
 *
 * The compatibility `@aura3d/engine` package contains a finalized copy of the
 * renderer, while modular consumers can create render resources through the
 * standalone `@aura3d/assets` package. `instanceof` is false across those two
 * module instances even though both objects implement the same public
 * contract. A global symbol keeps the public packages interoperable without
 * weakening validation to arbitrary duck typing.
 */
export function isTextureBinding(value: unknown): value is TextureBinding {
  return typeof value === "object"
    && value !== null
    && (value as Record<PropertyKey, unknown>)[TEXTURE_BINDING_BRAND] === true;
}
