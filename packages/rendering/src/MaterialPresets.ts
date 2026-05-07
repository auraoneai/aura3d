import { Material } from "./Material";
import { PBRMaterial, type PBRMaterialOptions } from "./PBRMaterial";
import { UnlitMaterial, type UnlitMaterialOptions } from "./UnlitMaterial";

export type MaterialPresetKind = "unlit" | "pbr" | string;

export type MaterialPresetOptions = Readonly<Record<string, unknown>>;

export type MaterialFactory<TOptions extends MaterialPresetOptions = MaterialPresetOptions> = (options?: TOptions) => Material;

export interface MaterialPresetDescriptor<TOptions extends MaterialPresetOptions = MaterialPresetOptions> {
  readonly kind: MaterialPresetKind;
  readonly description?: string;
  readonly create: MaterialFactory<TOptions>;
}

export class MaterialPresetRegistry {
  private readonly presets = new Map<MaterialPresetKind, MaterialPresetDescriptor>();

  constructor(descriptors: readonly MaterialPresetDescriptor[] = defaultMaterialPresets()) {
    for (const descriptor of descriptors) {
      this.register(descriptor);
    }
  }

  register<TOptions extends MaterialPresetOptions>(descriptor: MaterialPresetDescriptor<TOptions>): void {
    if (!descriptor.kind.trim()) {
      throw new Error("Material preset kind is required.");
    }
    if (this.presets.has(descriptor.kind)) {
      throw new Error(`Material preset already exists: ${descriptor.kind}`);
    }
    this.presets.set(descriptor.kind, descriptor as MaterialPresetDescriptor);
  }

  create<TOptions extends MaterialPresetOptions = MaterialPresetOptions>(kind: MaterialPresetKind, options?: TOptions): Material {
    const descriptor = this.presets.get(kind);
    if (!descriptor) {
      throw new Error(`Unknown material preset: ${kind}`);
    }
    return descriptor.create(options);
  }

  has(kind: MaterialPresetKind): boolean {
    return this.presets.has(kind);
  }

  list(): readonly MaterialPresetDescriptor[] {
    return [...this.presets.values()];
  }
}

export function defaultMaterialPresets(): readonly MaterialPresetDescriptor[] {
  return [
    {
      kind: "unlit",
      description: "Constant color material for debug, UI, and non-lighting-dependent geometry.",
      create: (options?: MaterialPresetOptions) => new UnlitMaterial(options as UnlitMaterialOptions)
    },
    {
      kind: "pbr",
      description: "Direct-light physically based material with base color, metallic, roughness, and emissive controls.",
      create: (options?: MaterialPresetOptions) => new PBRMaterial(options as PBRMaterialOptions)
    }
  ];
}
