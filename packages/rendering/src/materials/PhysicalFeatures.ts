/**
 * materials/PhysicalFeatures.ts — descriptor → `ProgramFeatures` partial
 * (PRD-04 P3-1, C-03 real). Pure mapping; consumed by `PhysicalMaterial` and
 * the legacy material classes' `programFeatures()`.
 *
 * The returned object deliberately omits `lights`, `shadows`, `environment`,
 * `fog`, `pass`, `target` and `backgroundCoverage` (C-03 `ProgramFeatureSource`
 * contract): materials never express frame-level program fields — §8.10's
 * invariant that no material can cap or disable lights.
 */
import type { MaterialExtensionFeature, ProgramFeatures } from "../contracts/program";
import { QUALITY_TIERS } from "../contracts/quality";
import { materialLobes, type MaterialFeatureContext, type MaterialLobeInput } from "../contracts/materialLobes";
import { Texture } from "../Texture";
import type { PhysicalMapBinding, PhysicalMapSlot, PhysicalMaterialDescriptor, PhysicalFeatureSet } from "./PhysicalMaterial";

export type { PhysicalFeatureSet };

/** The five ProgramFeatures `maps` slots (C-02 names). */
const CORE_MAP_SLOTS = ["baseColor", "normal", "metallicRoughness", "occlusion", "emissive"] as const;

type CoreMapSlot = (typeof CORE_MAP_SLOTS)[number];

/**
 * Projects a descriptor into the `MaterialLobeInput` lobes read. Parameter
 * keys are the glTF factor names (`clearcoatFactor`, `iridescenceIor`, …);
 * texture keys are `PhysicalMapSlot` names.
 */
export function physicalMaterialLobeInput(descriptor: PhysicalMaterialDescriptor): MaterialLobeInput {
  const parameters: Record<string, unknown> = {
    baseColorFactor: descriptor.baseColorFactor,
    metallicFactor: descriptor.metallicFactor,
    roughnessFactor: descriptor.roughnessFactor,
    emissiveFactor: descriptor.emissiveFactor,
    emissiveStrength: descriptor.emissiveStrength,
    normalScale: descriptor.normalScale,
    occlusionStrength: descriptor.occlusionStrength,
    ior: descriptor.ior,
    alphaMode: descriptor.alphaMode,
    alphaCutoff: descriptor.alphaCutoff,
    alphaToCoverage: descriptor.alphaToCoverage,
    doubleSided: descriptor.doubleSided,
    unlit: descriptor.unlit
  };
  if (descriptor.specular) {
    parameters.specularFactor = descriptor.specular.factor;
    parameters.specularColorFactor = descriptor.specular.colorFactor;
  }
  if (descriptor.clearcoat) {
    parameters.clearcoatFactor = descriptor.clearcoat.factor;
    parameters.clearcoatRoughnessFactor = descriptor.clearcoat.roughnessFactor;
    parameters.clearcoatNormalScale = descriptor.clearcoat.normalScale;
  }
  if (descriptor.sheen) {
    parameters.sheenColorFactor = descriptor.sheen.colorFactor;
    parameters.sheenRoughnessFactor = descriptor.sheen.roughnessFactor;
  }
  if (descriptor.iridescence) {
    parameters.iridescenceFactor = descriptor.iridescence.factor;
    parameters.iridescenceIor = descriptor.iridescence.ior;
    parameters.iridescenceThicknessMinimum = descriptor.iridescence.thicknessMin;
    parameters.iridescenceThicknessMaximum = descriptor.iridescence.thicknessMax;
  }
  if (descriptor.anisotropy) {
    parameters.anisotropyStrength = descriptor.anisotropy.strength;
    parameters.anisotropyRotation = descriptor.anisotropy.rotation;
  }
  if (descriptor.transmission) parameters.transmissionFactor = descriptor.transmission.factor;
  if (descriptor.volume) {
    parameters.volumeThicknessFactor = descriptor.volume.thicknessFactor;
    parameters.volumeAttenuationDistance = descriptor.volume.attenuationDistance;
    parameters.volumeAttenuationColor = descriptor.volume.attenuationColor;
  }
  if (descriptor.dispersion !== undefined) parameters.dispersion = descriptor.dispersion;
  if (descriptor.diffuseTransmission) {
    parameters.diffuseTransmissionFactor = descriptor.diffuseTransmission.factor;
    parameters.diffuseTransmissionColorFactor = descriptor.diffuseTransmission.colorFactor;
  }
  const textures: Record<string, Texture | undefined> = {};
  for (const [slot, binding] of Object.entries(descriptor.textures) as [PhysicalMapSlot, PhysicalMapBinding | undefined][]) {
    textures[slot] = binding?.texture;
  }
  return { parameters, textures };
}

/**
 * `ProgramFeatures` for one physical material. `extensions` comes from the
 * C-03 lobe registry filtered by `ctx.flags`; the Low tier folds the
 * iridescence film bit to `false` (Schlick fallback, P3-2).
 */
export function physicalFeatureSet(
  descriptor: PhysicalMaterialDescriptor,
  ctx: MaterialFeatureContext,
  overrides?: {
    readonly vertexColors?: boolean;
    readonly skinning?: ProgramFeatures["skinning"];
    readonly instancing?: ProgramFeatures["instancing"];
  }
): PhysicalFeatureSet {
  const input = physicalMaterialLobeInput(descriptor);
  const lowTier = ctx.tier.maxLightsPerPixel <= QUALITY_TIERS.low.maxLightsPerPixel;
  const extensions: MaterialExtensionFeature[] = [];
  for (const lobe of materialLobes(ctx.flags)) {
    const feature = lobe.feature(input);
    if (!feature) continue;
    extensions.push(
      lobe.id === "iridescence"
        ? { ...feature, bits: { ...feature.bits, film: !lowTier } }
        : feature
    );
  }
  const maps: { -readonly [K in CoreMapSlot]?: ProgramFeatures["maps"][K] } = {};
  for (const slot of CORE_MAP_SLOTS) {
    const binding = descriptor.textures[slot];
    if (binding) {
      maps[slot] = { uvSet: binding.texCoord, transform: binding.transform !== undefined };
    }
  }
  return {
    lighting: descriptor.unlit ? "unlit" : "lit",
    maps,
    extensions,
    alphaMode: descriptor.alphaMode,
    doubleSided: descriptor.doubleSided,
    vertexColors: overrides?.vertexColors ?? false,
    ...(overrides?.skinning ? { skinning: overrides.skinning } : {}),
    ...(overrides?.instancing ? { instancing: overrides.instancing } : {}),
    flatShading: false,
    diffuseModel: "lambert",
    specularAntialiasing: true,
    features: {}
  };
}

// ---------------------------------------------------------------------------
// Legacy option projection (P3-1): the five shipped material classes implement
// `programFeatures()` from a descriptor built out of their constructor
// options. Only fields the glTF descriptor knows are carried; renderState
// drives alphaMode/doubleSided. Descriptor-only — no legacy uniform changes.
// ---------------------------------------------------------------------------

import { Sampler } from "../Sampler";
import { TextureBinding } from "../TextureBinding";
import { uvTransformMatrix } from "./features";
import type { RenderState } from "../Material";

/** Structural view over the five legacy material option bags. */
export interface LegacyPhysicalMaterialOptions {
  readonly baseColor?: readonly [number, number, number, number];
  readonly color?: readonly [number, number, number, number];
  readonly metallic?: number;
  readonly roughness?: number;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly normalScale?: number;
  readonly occlusionStrength?: number;
  readonly ior?: number;
  readonly specularFactor?: number;
  readonly specularColorFactor?: readonly [number, number, number];
  readonly clearcoatFactor?: number;
  readonly clearcoatRoughnessFactor?: number;
  readonly clearcoatNormalScale?: number;
  readonly sheenColorFactor?: readonly [number, number, number];
  readonly sheenRoughnessFactor?: number;
  readonly iridescenceFactor?: number;
  readonly iridescenceIor?: number;
  readonly iridescenceThicknessMinimum?: number;
  readonly iridescenceThicknessMaximum?: number;
  readonly anisotropyStrength?: number;
  readonly anisotropyRotation?: number;
  readonly transmissionFactor?: number;
  readonly volumeThicknessFactor?: number;
  readonly volumeAttenuationDistance?: number;
  readonly volumeAttenuationColor?: readonly [number, number, number];
  readonly dispersion?: number;
  readonly diffuseTransmissionFactor?: number;
  readonly diffuseTransmissionColorFactor?: readonly [number, number, number];
  readonly renderState?: Partial<RenderState>;
  readonly textureTexCoords?: Readonly<Partial<Record<string, number>>>;
}

const IDENTITY_TRANSFORM = { offset: [0, 0] as const, rotation: 0, scale: [1, 1] as const };

type LegacyTransform = { readonly offset?: readonly [number, number]; readonly scale?: readonly [number, number]; readonly rotation?: number };

function resolveLegacyTexture(value: unknown): Texture | undefined {
  if (value instanceof Texture) return value;
  if (value instanceof TextureBinding) return value.texture ?? undefined;
  return undefined;
}

function resolveLegacySampler(value: unknown): Sampler {
  if (value instanceof Sampler) return value;
  if (value instanceof TextureBinding) return value.sampler;
  return Sampler.trilinear();
}

function resolveLegacyTransform(value: unknown): Float32Array | undefined {
  if (value instanceof TextureBinding) {
    value = { offset: value.offset, scale: value.scale, rotation: value.rotation };
  }
  const t = value as LegacyTransform | undefined;
  if (!t) return undefined;
  const offset = t.offset ?? IDENTITY_TRANSFORM.offset;
  const scale = t.scale ?? IDENTITY_TRANSFORM.scale;
  const rotation = t.rotation ?? 0;
  if (offset[0] === 0 && offset[1] === 0 && scale[0] === 1 && scale[1] === 1 && rotation === 0) return undefined;
  return uvTransformMatrix(offset, rotation, scale);
}

const LEGACY_TEXTURE_SLOTS: readonly PhysicalMapSlot[] = [
  "baseColor", "normal", "metallicRoughness", "occlusion", "emissive",
  "clearcoat", "clearcoatRoughness", "clearcoatNormal",
  "transmission", "diffuseTransmission", "diffuseTransmissionColor",
  "volumeThickness", "specular", "specularColor",
  "sheenColor", "sheenRoughness", "anisotropy",
  "iridescence", "iridescenceThickness"
];

/** Builds the C-03 descriptor from a legacy material option bag. Pure. */
export function legacyPhysicalDescriptor(options: LegacyPhysicalMaterialOptions): PhysicalMaterialDescriptor {
  const dynamic = options as unknown as Readonly<Record<string, unknown>>;
  const textures: Partial<Record<PhysicalMapSlot, PhysicalMapBinding>> = {};
  for (const slot of LEGACY_TEXTURE_SLOTS) {
    const bound = dynamic[`${slot}Texture`];
    const texture = resolveLegacyTexture(bound);
    if (!texture) continue;
    const transform = resolveLegacyTransform(
      dynamic[`${slot}TextureTransform`] ??
      (dynamic[`${slot}TextureOffset`] !== undefined || dynamic[`${slot}TextureScale`] !== undefined || dynamic[`${slot}TextureRotation`] !== undefined
        ? {
            offset: dynamic[`${slot}TextureOffset`] as readonly [number, number] | undefined,
            scale: dynamic[`${slot}TextureScale`] as readonly [number, number] | undefined,
            rotation: dynamic[`${slot}TextureRotation`] as number | undefined
          }
        : bound)
    );
    const coord = options.textureTexCoords?.[slot];
    textures[slot] = {
      texture,
      sampler: resolveLegacySampler(dynamic[`${slot}Sampler`] ?? bound),
      texCoord: coord === 1 ? 1 : 0,
      ...(transform ? { transform } : {})
    };
  }
  return {
    baseColorFactor: options.baseColor ?? options.color ?? [1, 1, 1, 1],
    metallicFactor: options.metallic ?? 0,
    roughnessFactor: options.roughness ?? 0.5,
    emissiveFactor: options.emissiveColor ?? [0, 0, 0],
    emissiveStrength: options.emissiveStrength ?? 1,
    normalScale: options.normalScale ?? 1,
    occlusionStrength: options.occlusionStrength ?? 1,
    ior: options.ior ?? 1.5,
    ...(options.specularFactor !== undefined || options.specularColorFactor !== undefined
      ? { specular: { factor: options.specularFactor ?? 1, colorFactor: options.specularColorFactor ?? [1, 1, 1] as const } }
      : {}),
    ...(options.clearcoatFactor !== undefined || options.clearcoatRoughnessFactor !== undefined || textures.clearcoat
      ? { clearcoat: { factor: options.clearcoatFactor ?? 0, roughnessFactor: options.clearcoatRoughnessFactor ?? 0, normalScale: options.clearcoatNormalScale ?? 1 } }
      : {}),
    ...(options.sheenColorFactor !== undefined || options.sheenRoughnessFactor !== undefined || textures.sheenColor
      ? { sheen: { colorFactor: options.sheenColorFactor ?? [0, 0, 0] as const, roughnessFactor: options.sheenRoughnessFactor ?? 0 } }
      : {}),
    ...(options.iridescenceFactor !== undefined || textures.iridescence
      ? { iridescence: { factor: options.iridescenceFactor ?? 0, ior: options.iridescenceIor ?? 1.3, thicknessMin: options.iridescenceThicknessMinimum ?? 100, thicknessMax: options.iridescenceThicknessMaximum ?? 400 } }
      : {}),
    ...(options.anisotropyStrength !== undefined || textures.anisotropy
      ? { anisotropy: { strength: options.anisotropyStrength ?? 0, rotation: options.anisotropyRotation ?? 0 } }
      : {}),
    ...(options.transmissionFactor !== undefined || textures.transmission
      ? { transmission: { factor: options.transmissionFactor ?? 0 } }
      : {}),
    ...(options.volumeThicknessFactor !== undefined || textures.volumeThickness
      ? { volume: { thicknessFactor: options.volumeThicknessFactor ?? 0, attenuationDistance: options.volumeAttenuationDistance ?? 1_000_000, attenuationColor: options.volumeAttenuationColor ?? [1, 1, 1] as const } }
      : {}),
    ...(options.dispersion !== undefined ? { dispersion: options.dispersion } : {}),
    ...(options.diffuseTransmissionFactor !== undefined || options.diffuseTransmissionColorFactor !== undefined
      ? { diffuseTransmission: { factor: options.diffuseTransmissionFactor ?? 0, colorFactor: options.diffuseTransmissionColorFactor ?? [1, 1, 1] as const } }
      : {}),
    alphaMode: options.renderState?.blend ? "blend" : "opaque",
    alphaCutoff: 0.5,
    alphaToCoverage: false,
    doubleSided: options.renderState?.cullMode === "none",
    unlit: false,
    textures
  };
}
