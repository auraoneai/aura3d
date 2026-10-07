// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraMaterialSpec, AuraMaterialTextureInput, AuraPrimitiveNode, AuraProceduralTextureSpec, AuraTextureTransform, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource } from "../nodes/types.js";
import { AuraRuntimeError } from "./errors.js";
import { colorToLinearRgb } from "../colorUtils.js";
import { createProductionPrimitiveMaterial, resolveProductionPrimitiveScalars } from "../compiler/primitives.js";
import { primitive } from "../nodes/primitives.js";
import { rootSdfFontAtlas, text3D } from "../nodes/text3d.js";
import { clamp01 } from "../sceneMath.js";
import { Geometry, IndexBuffer, Sampler, Texture, TexturedPBRMaterial, VertexBuffer, VertexFormat, createSdfTextQuadMesh, generateProceduralMaterialTexture, layoutSdfText, rasterizeSdfTextLabelImage, resolveSamplerAnisotropy, type ProceduralMaterialTexture, type SdfTextOcclusionPolicy, type TextureAddressMode } from "@aura3d/rendering";
import type { AuraQualityTier, AuraTextureSampling, AuraTextureWrap } from "@aura3d/rendering/contracts";
import type { AuraMaterialTextureSlot } from "../../contracts/materials.js";
import { typedGLBActorQrFlags } from "../../production-runtime/actor/extensions.js";
import { material } from "../nodes/material.js";

/**
 * PRD-04 P2-7: sampler resolution context. The renderer (lane 15) supplies the C-27 quality
 * tier and the device anisotropy cap; absent values fall back to the spec/default request.
 */
export interface ProductionTextureSamplingContext {
  readonly tier?: AuraQualityTier;
  readonly deviceMax?: number;
}

const prd04WrapMode = (wrap: AuraTextureWrap | undefined): TextureAddressMode =>
  wrap === "clamp" ? "clamp-to-edge" : wrap === "mirror" ? "mirror-repeat" : "repeat";

/** PRD-04 P2-7 flag-on material sampler: trilinear + spec.wrap + tier/deviceMax-clamped anisotropy. */
function prd04MaterialSampler(spec: AuraMaterialSpec | undefined, sampling: AuraTextureSampling | undefined, context?: ProductionTextureSamplingContext): Sampler {
  return Sampler.trilinear({
    wrap: prd04WrapMode(sampling?.wrap ?? "repeat"),
    anisotropy: resolveSamplerAnisotropy({
      desired: sampling?.anisotropy ?? spec?.textureAnisotropy,
      tier: context?.tier,
      deviceMax: context?.deviceMax
    }).applied
  });
}

const PRD04_PROCEDURAL_FIELDS = ["normal", "roughnessMap", "metalnessMap", "occlusionMap", "emissiveMap"] as const;

function prd04ProceduralSpec(spec: AuraMaterialSpec | undefined, field: (typeof PRD04_PROCEDURAL_FIELDS)[number]): AuraProceduralTextureSpec | undefined {
  const input = spec?.[field];
  return input && typeof input === "object" && (input as { kind?: string }).kind === "aura-procedural-texture" ? (input as AuraProceduralTextureSpec) : undefined;
}

export function createProductionPrimitiveTextureIntent(materialSpec: AuraMaterialSpec | undefined): {
  readonly baseColorUrl?: string;
  readonly normalUrl?: string;
  readonly roughnessUrl?: string;
  readonly metalnessUrl?: string;
  readonly occlusionUrl?: string;
  readonly emissiveUrl?: string;
  readonly extensionMaps?: Readonly<Partial<Record<RootExtensionTextureSlot, {
    readonly url: string;
    readonly colorSpace: "srgb" | "linear";
    readonly texCoord: 0 | 1;
    readonly transform?: AuraTextureTransform;
  }>>>;
  readonly proceduralInputs: readonly string[];
} {
  const refUrl = (input: AuraMaterialTextureInput | AuraAssetRef<"texture"> | undefined): string | undefined =>
    input && typeof input === "object" && (input as { kind?: string }).kind === "aura-asset-ref"
      ? (input as AuraAssetRef<"texture">).url ?? undefined
      : undefined;
  const procedurals: string[] = [];
  const noteProcedural = (slot: string, input: AuraMaterialTextureInput | AuraAssetRef<"texture"> | undefined): void => {
    if (input && typeof input === "object" && (input as { kind?: string }).kind === "aura-procedural-texture") {
      procedurals.push(`${slot}:${(input as AuraProceduralTextureSpec).texture}`);
    }
  };
  noteProcedural("normal", materialSpec?.normal);
  noteProcedural("roughnessMap", materialSpec?.roughnessMap);
  noteProcedural("metalnessMap", materialSpec?.metalnessMap);
  noteProcedural("occlusionMap", materialSpec?.occlusionMap);
  noteProcedural("emissiveMap", materialSpec?.emissiveMap);
  const baseColorUrl = refUrl(materialSpec?.texture);
  const normalUrl = refUrl(materialSpec?.normal);
  const roughnessUrl = refUrl(materialSpec?.roughnessMap);
  const metalnessUrl = refUrl(materialSpec?.metalnessMap);
  const occlusionUrl = refUrl(materialSpec?.occlusionMap);
  const emissiveUrl = refUrl(materialSpec?.emissiveMap);
  const extensionMaps: NonNullable<ReturnType<typeof createProductionPrimitiveTextureIntent>["extensionMaps"]> = Object.fromEntries(
    ROOT_EXTENSION_TEXTURE_SLOTS.flatMap((slot) => {
      const input = materialSpec?.[`${slot}Map`];
      if (input === undefined) return [];
      if (!input || typeof input !== "object" || input.kind !== "aura-asset-ref" || input.type !== "texture") {
        throw new AuraRuntimeError("unsupported-texture", `${slot}Map requires a typed texture asset reference`);
      }
      if (!["png", "jpg", "jpeg", "webp"].includes(input.format) || !input.url) {
        throw new AuraRuntimeError("unsupported-texture", `${slot}Map requires a fetchable png, jpg, jpeg or webp texture`);
      }
      const texCoord = materialSpec?.texCoords?.[slot] ?? 0;
      if (texCoord !== 0 && texCoord !== 1) throw new RangeError(`${slot} texCoord must be 0 or 1`);
      const transform = materialSpec?.texTransforms?.[slot];
      if (transform && [...(transform.offset ?? [0, 0]), ...(transform.scale ?? [1, 1]), transform.rotation ?? 0].some((value) => !Number.isFinite(value))) {
        throw new RangeError(`${slot} texture transform must contain finite values`);
      }
      return [[slot, { url: input.url, colorSpace: slot === "sheenColor" ? "srgb" : "linear", texCoord, ...(transform ? { transform } : {}) }]];
    })
  );
  return {
    ...(baseColorUrl ? { baseColorUrl } : {}),
    ...(normalUrl ? { normalUrl } : {}),
    ...(roughnessUrl ? { roughnessUrl } : {}),
    ...(metalnessUrl ? { metalnessUrl } : {}),
    ...(occlusionUrl ? { occlusionUrl } : {}),
    ...(emissiveUrl ? { emissiveUrl } : {}),
    ...(Object.keys(extensionMaps).length ? { extensionMaps } : {}),
    proceduralInputs: procedurals
  };
}

export function blankProductionPrimitiveTextureState(): {
  texturedMaterial: TexturedPBRMaterial | null;
  textureStatus: "none" | "pending" | "textured" | "fallback";
  textureSlots: readonly string[];
  textureWarnings: string[];
  sdfText: ProductionRuntimePrimitiveResource["sdfText"];
  textureBytes: number;
  textureMipBytes: readonly number[];
} {
  return { texturedMaterial: null, textureStatus: "none", textureSlots: [], textureWarnings: [], sdfText: null, textureBytes: 0, textureMipBytes: [] };
}

export const ROOT_EXTENSION_TEXTURE_SLOTS = ["clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "iridescence", "iridescenceThickness", "anisotropy"] as const;

export type RootExtensionTextureSlot = typeof ROOT_EXTENSION_TEXTURE_SLOTS[number];

export const productionPrimitiveBitmapPixels = new WeakMap<ImageBitmap, { readonly width: number; readonly height: number; readonly data: Uint8Array }>();

export async function loadProductionPrimitiveBitmap(url: string): Promise<ImageBitmap> {
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function") {
    throw new Error("texture fetch requires fetch + createImageBitmap (browser production mount)");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`texture fetch failed with status ${response.status} for ${url}`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  try {
    const { decodePngTexturePixels } = await import("../PngTexturePixels.js");
    const pixels = await decodePngTexturePixels(new Uint8Array(await blob.arrayBuffer()));
    if (pixels) productionPrimitiveBitmapPixels.set(bitmap, pixels);
    return bitmap;
  } catch (error) { bitmap.close(); throw error; }
}

export function bitmapRgbaPixels(bitmap: ImageBitmap): { readonly width: number; readonly height: number; readonly data: Uint8Array } {
  const decoded = productionPrimitiveBitmapPixels.get(bitmap);
  if (decoded) return decoded;
  if (typeof document === "undefined") throw new Error("texture compositing requires a DOM canvas");
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2d canvas unavailable for texture compositing");
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(image.data) };
}

export async function upgradeProductionPrimitiveTextures(
  entries: readonly ProductionRuntimePrimitiveEntry[],
  warn: (message: string) => void,
  maxTextureSize = 4096,
  samplingContext?: ProductionTextureSamplingContext
): Promise<void> {
  const qrMaterials = typedGLBActorQrFlags().on("A3D_QR_MATERIALS");
  for (const entry of entries) {
    for (const resource of entry.resources) {
      const spec = resource.materialSpec;
      const intent = createProductionPrimitiveTextureIntent(spec);
      for (const procedural of intent.proceduralInputs) {
        // Flag-on (PRD-04 P2-9): procedural kinds rasterize via generateProceduralMaterialTexture
        // inside upgradeProductionPrimitiveResource — no rasterizer warning.
        if (qrMaterials) continue;
        // Static channel (collectGeneratedCodeWarnings) already warns; record
        // per-resource without duplicating into runtime warnings.
        resource.textureWarnings.push(
          `procedural texture ${procedural} on "${resource.name}" has no rasterizer; recorded only, scalar material retained`
        );
      }
      const urls = [intent.baseColorUrl, intent.normalUrl, intent.roughnessUrl, intent.metalnessUrl, intent.occlusionUrl, intent.emissiveUrl, ...Object.values(intent.extensionMaps ?? {}).map((map) => map.url)].filter(
        (url): url is string => typeof url === "string" && url.length > 0
      );
      if (urls.length === 0) continue;
      if (resource.textureStatus !== "none") continue;
      resource.textureStatus = "pending";
      try {
        await upgradeProductionPrimitiveResource(resource, resource.sourceNode, spec, intent, maxTextureSize, samplingContext);
      } catch (error) {
        resource.textureStatus = "fallback";
        const message = `textured upgrade failed for "${resource.name}" (${error instanceof Error ? error.message : String(error)}); scalar material retained`;
        resource.textureWarnings.push(message);
        warn(message);
      }
    }
  }
}

export async function upgradeProductionPrimitiveResource(
  resource: ProductionRuntimePrimitiveResource,
  node: AuraPrimitiveNode,
  spec: AuraMaterialSpec | undefined,
  intent: ReturnType<typeof createProductionPrimitiveTextureIntent>,
  maxTextureSize: number,
  samplingContext?: ProductionTextureSamplingContext
): Promise<void> {
  const qrMaterials = typedGLBActorQrFlags().on("A3D_QR_MATERIALS");
  const fail = (message: string): Error => new Error(message);
  if (!resource.geometry.vertexBuffer.format.hasAttribute("uv")) {
    throw fail(`"${resource.name}" geometry carries no uv set; textured upgrade needs generated uvs`);
  }
  const scalars = resolveProductionPrimitiveScalars(node);
  const extensionEntries = Object.entries(intent.extensionMaps ?? {}) as [RootExtensionTextureSlot, NonNullable<NonNullable<typeof intent.extensionMaps>[RootExtensionTextureSlot]>][];
  const needsScalarAtlas = extensionEntries.some(([slot]) => slot.startsWith("clearcoat"))
    && extensionEntries.some(([slot]) => slot.startsWith("sheen") || slot === "anisotropy")
    && extensionEntries.some(([slot]) => slot.startsWith("iridescence"));
  if (extensionEntries.some(([, map]) => map.texCoord === 1) && !resource.geometry.vertexBuffer.format.hasAttribute("uv1")) {
    throw fail(`"${resource.name}" geometry carries no uv1 set requested by extension texture`);
  }
  const ownedBitmaps: ImageBitmap[] = [];
  const ownedTextures: Texture[] = [];
  const bitmapLoads = new Map<string, Promise<ImageBitmap>>();
  const load = (url: string): Promise<ImageBitmap> => {
    let pending = bitmapLoads.get(url);
    if (!pending) {
      pending = loadProductionPrimitiveBitmap(url).then((bitmap) => {
        ownedBitmaps.push(bitmap);
        return bitmap;
      });
      bitmapLoads.set(url, pending);
    }
    return pending;
  };
  const own = (texture: Texture): Texture => { ownedTextures.push(texture); return texture; };
  const disposeTextures = (): void => {
    for (const texture of ownedTextures) texture.dispose();
    for (const bitmap of ownedBitmaps) bitmap.close();
    ownedTextures.length = 0;
    ownedBitmaps.length = 0;
  };
  try {
    const baseResults = await Promise.allSettled([
      intent.baseColorUrl ? load(intent.baseColorUrl) : Promise.resolve(undefined),
      intent.normalUrl ? load(intent.normalUrl) : Promise.resolve(undefined),
      intent.roughnessUrl ? load(intent.roughnessUrl) : Promise.resolve(undefined),
      intent.metalnessUrl ? load(intent.metalnessUrl) : Promise.resolve(undefined),
      intent.occlusionUrl ? load(intent.occlusionUrl) : Promise.resolve(undefined),
      intent.emissiveUrl ? load(intent.emissiveUrl) : Promise.resolve(undefined)
    ]);
    const failure = baseResults.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const [baseColorSource, normalSource, roughnessSource, metalnessSource, occlusionSource, emissiveSource] = baseResults.map((result) => result.status === "fulfilled" ? result.value : undefined);
    const slots: string[] = [];
    const extensionOptions: Record<string, unknown> = {};
    const extensionSources: ImageBitmap[] = [];
    const atlasPixels: Record<string, { readonly width: number; readonly height: number; readonly data: Uint8Array | Uint8ClampedArray }> = {};
    for (const [slot, map] of extensionEntries) {
      const source = await load(map.url);
      extensionSources.push(source);
      if (needsScalarAtlas && (["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"] as readonly string[]).includes(slot)) {
        Object.assign(atlasPixels, { [slot]: bitmapRgbaPixels(source) });
      }
      extensionOptions[`${slot}Texture`] = own(new Texture({ width: source.width, height: source.height, source, colorSpace: map.colorSpace, label: `${resource.name}-${slot}` }));
      if (map.transform) extensionOptions[`${slot}TextureTransform`] = { ...map.transform };
      slots.push(slot);
    }
    if (needsScalarAtlas) {
      const { createExtensionScalarAtlas } = await import("@aura3d/rendering/extension-scalar-atlas");
      const atlas = createExtensionScalarAtlas(atlasPixels, maxTextureSize);
      own(atlas.texture);
      extensionOptions.extensionScalarAtlas = atlas;
    }
    const baseColorTexture = baseColorSource
      ? own(new Texture({ width: baseColorSource.width, height: baseColorSource.height, source: baseColorSource, colorSpace: "srgb", label: `${resource.name}-basecolor` }))
      : undefined;
    if (baseColorTexture) slots.push("baseColor");
    let normalTexture = normalSource
      ? own(new Texture({ width: normalSource.width, height: normalSource.height, source: normalSource, colorSpace: "linear", label: `${resource.name}-normal` }))
      : undefined;
    if (normalTexture) slots.push("normal");
    let metallicRoughnessTexture: Texture | undefined;
    if (roughnessSource ?? metalnessSource) {
      const base = roughnessSource ?? metalnessSource!;
      const size = { width: base.width, height: base.height };
      const readPixels = (bitmap: ImageBitmap | undefined): Uint8Array | undefined => {
        if (!bitmap) return undefined;
        const decoded = bitmapRgbaPixels(bitmap);
        if (decoded.width !== size.width || decoded.height !== size.height) {
          const canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw fail("2d canvas unavailable for texture compositing");
          context.drawImage(bitmap, 0, 0, size.width, size.height);
          return new Uint8Array(context.getImageData(0, 0, size.width, size.height).data);
        }
        return decoded.data;
      };
      const composited = compositeMetallicRoughnessPixels(
        readPixels(roughnessSource),
        readPixels(metalnessSource),
        size.width * size.height,
        spec?.roughness ?? 0.58,
        spec?.metallic ?? spec?.metalness ?? 0
      );
      metallicRoughnessTexture = own(new Texture({ width: size.width, height: size.height, data: composited, colorSpace: "linear", label: `${resource.name}-metallicroughness` }));
      slots.push("metallicRoughness");
    }
    let occlusionTexture = occlusionSource
      ? own(new Texture({ width: occlusionSource.width, height: occlusionSource.height, source: occlusionSource, colorSpace: "linear", label: `${resource.name}-occlusion` }))
      : undefined;
    if (occlusionTexture) slots.push("occlusion");
    let emissiveTexture = emissiveSource
      ? own(new Texture({ width: emissiveSource.width, height: emissiveSource.height, source: emissiveSource, colorSpace: "srgb", label: `${resource.name}-emissive` }))
      : undefined;
    if (emissiveTexture) slots.push("emissive");
    // PRD-04 P2-9 (A3D_QR_MATERIALS on): authored procedural specs rasterize via
    // generateProceduralMaterialTexture and bind into their declared slots. Flag-off keeps the
    // "recorded only" warning path above — no rasterization.
    if (qrMaterials) {
      const proceduralApplied: string[] = [];
      const proceduralSources: Partial<Record<(typeof PRD04_PROCEDURAL_FIELDS)[number], ProceduralMaterialTexture>> = {};
      for (const field of PRD04_PROCEDURAL_FIELDS) {
        const procSpec = prd04ProceduralSpec(spec, field);
        if (!procSpec) continue;
        try {
          proceduralSources[field] = generateProceduralMaterialTexture(procSpec.texture, {
            scale: procSpec.scale,
            strength: procSpec.strength,
            ...(procSpec.contrast !== undefined ? { contrast: procSpec.contrast } : {}),
            ...(procSpec.direction !== undefined ? { direction: procSpec.direction } : {})
          });
        } catch (error) {
          resource.textureWarnings.push(
            `procedural texture ${field}:${procSpec.texture} on "${resource.name}" failed to rasterize (${error instanceof Error ? error.message : String(error)})`
          );
        }
      }
      const noteApplied = (field: string, slot: string): void => {
        proceduralApplied.push(`${field}->${slot}`);
      };
      const proceduralNormal = proceduralSources.normal;
      if (!normalTexture && proceduralNormal) {
        normalTexture = own(new Texture({ width: proceduralNormal.width, height: proceduralNormal.height, data: proceduralNormal.data, colorSpace: "linear", label: `${resource.name}-procedural-normal` }));
        slots.push("normal");
        noteApplied("normal", "normal");
      }
      const proceduralRoughness = proceduralSources.roughnessMap;
      const proceduralMetalness = proceduralSources.metalnessMap;
      if (!metallicRoughnessTexture && (proceduralRoughness ?? proceduralMetalness)) {
        const gen = proceduralRoughness ?? proceduralMetalness!;
        const composited = compositeMetallicRoughnessPixels(
          proceduralRoughness?.data,
          proceduralMetalness?.data,
          gen.width * gen.height,
          spec?.roughness ?? 0.58,
          spec?.metallic ?? spec?.metalness ?? 0
        );
        metallicRoughnessTexture = own(new Texture({ width: gen.width, height: gen.height, data: composited, colorSpace: "linear", label: `${resource.name}-procedural-metallicroughness` }));
        slots.push("metallicRoughness");
        if (proceduralRoughness) noteApplied("roughnessMap", "metallicRoughness");
        if (proceduralMetalness) noteApplied("metalnessMap", "metallicRoughness");
      }
      const proceduralOcclusion = proceduralSources.occlusionMap;
      if (!occlusionTexture && proceduralOcclusion) {
        occlusionTexture = own(new Texture({ width: proceduralOcclusion.width, height: proceduralOcclusion.height, data: proceduralOcclusion.data, colorSpace: "linear", label: `${resource.name}-procedural-occlusion` }));
        slots.push("occlusion");
        noteApplied("occlusionMap", "occlusion");
      }
      const proceduralEmissive = proceduralSources.emissiveMap;
      if (!emissiveTexture && proceduralEmissive) {
        emissiveTexture = own(new Texture({ width: proceduralEmissive.width, height: proceduralEmissive.height, data: proceduralEmissive.data, colorSpace: "linear", label: `${resource.name}-procedural-emissive` }));
        slots.push("emissive");
        noteApplied("emissiveMap", "emissive");
      }
      for (const applied of proceduralApplied) {
        resource.textureWarnings.push(`material-procedural-applied ${applied} on "${resource.name}"`);
      }
    }
    if (slots.length === 0) throw fail(`no texture resolved for "${resource.name}"`);
    // M2 streaming table: resident bytes from the decoded sources (base +
    // full mip-chain estimate) with the chain keyed off the largest source.
    const loadedDims = [baseColorSource, normalSource, roughnessSource, metalnessSource, occlusionSource, emissiveSource, ...extensionSources]
      .filter((source): source is ImageBitmap => source !== undefined)
      .map((source) => ({ width: source.width, height: source.height }));
    const loadedBaseBytes = loadedDims.reduce((total, dims) => total + dims.width * dims.height * 4, 0);
    const largestDims = loadedDims.reduce(
      (largest, dims) => (dims.width * dims.height > largest.width * largest.height ? dims : largest),
      { width: 1, height: 1 }
    );
    resource.textureBytes = Math.round(loadedBaseBytes * (4 / 3));
    resource.textureMipBytes = mipChainBytesCoarseToFine(largestDims.width, largestDims.height);
    const texCoords = spec?.texCoords;
    // C3: every root textured slot shares one capability-gated sampler request
    // (default 8x where supported; the renderer clamps to the device maximum).
    // PRD-04 P2-7 flag-on: trilinear samplers honour spec.sampling / spec.slotSampling
    // (wrap/filter/anisotropy) with the quality tier + device cap from the context.
    const textureSampler = qrMaterials
      ? prd04MaterialSampler(spec, spec?.sampling, samplingContext)
      : new Sampler({
        maxAnisotropy: resolveSamplerAnisotropy({ desired: spec?.textureAnisotropy }).applied
      });
    const slotSamplerFor = (slot: AuraMaterialTextureSlot): Sampler =>
      qrMaterials && spec?.slotSampling?.[slot]
        ? prd04MaterialSampler(spec, spec.slotSampling[slot], samplingContext)
        : textureSampler;
    for (const [slot] of extensionEntries) extensionOptions[`${slot}Sampler`] = qrMaterials ? slotSamplerFor(slot) : textureSampler;
    resource.texturedMaterial = new TexturedPBRMaterial({
      name: `a3d-production-textured-primitive-${resource.name}`,
      ...(qrMaterials ? { hardwareWrap: true } : {}),
      baseColor: [scalars.baseColor[0], scalars.baseColor[1], scalars.baseColor[2], scalars.opacity],
      metallic: clamp01(spec?.metallic ?? spec?.metalness ?? 0),
      roughness: clamp01(spec?.roughness ?? 0.58),
      emissiveColor: spec?.emissive
        ? [scalars.emissiveColor[0], scalars.emissiveColor[1], scalars.emissiveColor[2]]
        : emissiveTexture ? [1, 1, 1] : [scalars.emissiveColor[0], scalars.emissiveColor[1], scalars.emissiveColor[2]],
      emissiveStrength: Math.max(0, spec?.emissiveIntensity ?? (spec?.emissive || emissiveTexture ? 1.35 : 0)),
      occlusionStrength: clamp01(spec?.occlusionStrength ?? 1),
      clearcoatFactor: scalars.clearcoat,
      clearcoatRoughnessFactor: clamp01(spec?.clearcoatRoughness ?? 0.34),
      clearcoatNormalScale: Math.max(0, spec?.clearcoatNormalScale ?? 1),
      ...extensionOptions,
      sheenColorFactor: [scalars.sheenColor[0], scalars.sheenColor[1], scalars.sheenColor[2]],
      sheenRoughnessFactor: clamp01(spec?.sheenRoughness ?? 0.3),
      anisotropyStrength: scalars.anisotropy,
      anisotropyRotation: spec?.anisotropyRotation ?? 0,
      iridescenceFactor: scalars.iridescence,
      iridescenceIor: Math.max(1, spec?.iridescenceIOR ?? 1.3),
      ...(scalars.thicknessRange ? { iridescenceThicknessMinimum: scalars.thicknessRange[0], iridescenceThicknessMaximum: scalars.thicknessRange[1] } : {}),
      transmissionFactor: scalars.transmission,
      ...(spec?.thickness === undefined ? {} : { volumeThicknessFactor: Math.max(0, spec.thickness) }),
      ...(spec?.ior === undefined ? {} : { ior: Math.max(1, spec.ior) }),
      ...(spec?.attenuationColor ? { volumeAttenuationColor: colorToLinearRgb(spec.attenuationColor) } : {}),
      ...(spec?.attenuationDistance === undefined ? {} : { volumeAttenuationDistance: Math.max(0, spec.attenuationDistance) }),
      environmentIntensity: scalars.environmentIntensity,
      envMapIntensity: scalars.envMapIntensity,
      renderState: {
        blend: scalars.opacity < 0.999,
        depthWrite: scalars.opacity >= 0.999,
        cullMode: node.primitive === "plane" || scalars.opacity < 0.999 ? "none" : "back"
      },
      ...(baseColorTexture ? { baseColorTexture, baseColorSampler: slotSamplerFor("baseColor") } : {}),
      ...(normalTexture ? { normalTexture, normalSampler: slotSamplerFor("normal"), normalScale: spec?.normalScale ?? 1 } : {}),
      ...(metallicRoughnessTexture ? { metallicRoughnessTexture, metallicRoughnessSampler: slotSamplerFor("metallicRoughness") } : {}),
      ...(occlusionTexture ? { occlusionTexture, occlusionSampler: slotSamplerFor("occlusion") } : {}),
      ...(emissiveTexture ? { emissiveTexture, emissiveSampler: slotSamplerFor("emissive") } : {}),
      ...(spec?.texTransforms?.baseColor ? { baseColorTextureTransform: { ...spec.texTransforms.baseColor } } : {}),
      ...(spec?.texTransforms?.normal ? { normalTextureTransform: { ...spec.texTransforms.normal } } : {}),
      ...(spec?.texTransforms?.metallicRoughness ? { metallicRoughnessTextureTransform: { ...spec.texTransforms.metallicRoughness } } : {}),
      ...(spec?.texTransforms?.occlusion ? { occlusionTextureTransform: { ...spec.texTransforms.occlusion } } : {}),
      ...(spec?.texTransforms?.emissive ? { emissiveTextureTransform: { ...spec.texTransforms.emissive } } : {}),
      ...((texCoords?.baseColor ?? 0) > 0 || (texCoords?.normal ?? 0) > 0 || (texCoords?.metallicRoughness ?? 0) > 0 || (texCoords?.occlusion ?? 0) > 0 || (texCoords?.emissive ?? 0) > 0 || extensionEntries.length > 0
        ? {
          textureTexCoords: {
            ...Object.fromEntries(extensionEntries.map(([slot, map]) => [slot, map.texCoord])),
            ...(baseColorTexture && (texCoords?.baseColor ?? 0) > 0 ? { baseColor: 1 as const } : {}),
            ...(normalTexture && (texCoords?.normal ?? 0) > 0 ? { normal: 1 as const } : {}),
            ...(metallicRoughnessTexture && (texCoords?.metallicRoughness ?? 0) > 0 ? { metallicRoughness: 1 as const } : {}),
            ...(occlusionTexture && (texCoords?.occlusion ?? 0) > 0 ? { occlusion: 1 as const } : {}),
            ...(emissiveTexture && (texCoords?.emissive ?? 0) > 0 ? { emissive: 1 as const } : {})
          }
        }
        : {})
    });
    if (resource.material.disposed) {
      resource.texturedMaterial.dispose();
      resource.texturedMaterial = null;
      throw fail("primitive disposed while texture upgrade was pending");
    }
    resource.textureDisposer = disposeTextures;
    resource.textureStatus = "textured";
    resource.textureSlots = slots;
  } catch (error) {
    disposeTextures();
    throw error;
  }
}

export function compositeMetallicRoughnessPixels(
  rough: Uint8Array | undefined,
  metal: Uint8Array | undefined,
  pixelCount: number,
  roughnessScalar: number,
  metalnessScalar: number
): Uint8Array {
  const out = new Uint8Array(pixelCount * 4);
  const fallbackG = Math.round(clamp01(roughnessScalar) * 255);
  const fallbackB = Math.round(clamp01(metalnessScalar) * 255);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const base = pixel * 4;
    out[base] = 255;
    out[base + 1] = rough ? rough[base + 1] ?? fallbackG : fallbackG;
    out[base + 2] = metal ? metal[base + 2] ?? fallbackB : fallbackB;
    out[base + 3] = 255;
  }
  return out;
}

export function createSdfTextPrimitiveResource(
  node: AuraPrimitiveNode,
  warn: (message: string) => void
): ProductionRuntimePrimitiveResource | null {
  const text = node.text3D;
  if (!text || text.backend !== "sdf") return null;
  try {
    const layout = layoutSdfText(text.text, rootSdfFontAtlas(), {
      size: text.sdfSize ?? 1,
      ...(text.sdfLetterSpacing === undefined ? {} : { letterSpacing: text.sdfLetterSpacing }),
      ...(text.sdfStyle === undefined ? {} : { style: text.sdfStyle })
    });
    const style = layout.style;
    const styled = text.sdfStyle !== undefined && (
      style.outlineWidthEm > 0 || style.glowRadiusEm > 0 || style.shadowOffsetEm !== undefined
    );
    const image = rasterizeSdfTextLabelImage(layout, rootSdfFontAtlas(), {
      texelsPerWorldUnit: 64,
      ...(styled
        ? {
          outline: [1, 0.85, 0.6, 1] as const,
          glow: [0.5, 0.8, 1, 1] as const,
          shadow: [0, 0, 0, 1] as const
        }
        : {})
    });
    const mesh = createSdfTextQuadMesh(layout, image);
    const vertexCount = mesh.vertexCount;
    const vertices = new VertexBuffer(VertexFormat.P3N3T4T2T2, vertexCount);
    for (let index = 0; index < vertexCount; index += 1) {
      vertices.setAttribute(index, "position", [mesh.positions[index * 3] ?? 0, mesh.positions[index * 3 + 1] ?? 0, 0]);
      vertices.setAttribute(index, "normal", [0, 0, 1]);
      vertices.setAttribute(index, "tangent", [1, 0, 0, 1]);
      vertices.setAttribute(index, "uv", [mesh.uvs[index * 2] ?? 0, mesh.uvs[index * 2 + 1] ?? 0]);
      vertices.setAttribute(index, "uv1", [mesh.uvs[index * 2] ?? 0, mesh.uvs[index * 2 + 1] ?? 0]);
    }
    const geometry = new Geometry(
      vertices,
      new IndexBuffer(mesh.indices, vertexCount),
      "triangles",
      { min: [mesh.min[0], mesh.min[1], mesh.min[2]], max: [mesh.max[0], mesh.max[1], mesh.max[2]] }
    );
    const opacity = clamp01(node.material?.opacity ?? 1);
    const labelTexture = new Texture({
      width: image.width,
      height: image.height,
      data: image.data,
      colorSpace: "srgb",
      label: `${node.name ?? "sdf-text"}-sdf-label`
    });
    const sampler = typedGLBActorQrFlags().on("A3D_QR_MATERIALS")
      // P2-7: SDF label textures clamp (no repeat-tiled glyphs).
      ? Sampler.trilinear({ wrap: "clamp", anisotropy: resolveSamplerAnisotropy({ desired: node.material?.textureAnisotropy }).applied })
      : new Sampler({ maxAnisotropy: resolveSamplerAnisotropy({ desired: node.material?.textureAnisotropy }).applied });
    const texturedMaterial = new TexturedPBRMaterial({
      name: `a3d-production-sdf-text-${node.name ?? "label"}`,
      ...(typedGLBActorQrFlags().on("A3D_QR_MATERIALS") ? { hardwareWrap: true } : {}),
      baseColor: [1, 1, 1, opacity],
      metallic: 0,
      roughness: 0.9,
      emissiveColor: [0.92, 0.92, 0.92],
      emissiveStrength: 0.9,
      occlusionStrength: 0,
      environmentIntensity: 0,
      renderState: { blend: true, depthWrite: false, cullMode: "none" },
      baseColorTexture: labelTexture,
      baseColorSampler: sampler,
      emissiveTexture: labelTexture,
      emissiveSampler: sampler
    });
    const mipBytes = mipChainBytesCoarseToFine(image.width, image.height);
    return {
      geometry,
      material: createProductionPrimitiveMaterial(node),
      bounds: { min: [mesh.min[0], mesh.min[1], mesh.min[2]], max: [mesh.max[0], mesh.max[1], mesh.max[2]] },
      name: node.name ?? "sdf-text",
      materialSpec: node.material,
      sourceNode: node,
      ...blankProductionPrimitiveTextureState(),
      texturedMaterial,
      textureStatus: "textured",
      textureSlots: ["baseColor", "emissive"],
      textureWarnings: [],
      sdfText: {
        quadCount: mesh.quadCount,
        imageBytes: image.width * image.height * 4,
        ...(style.lodFadeNear === undefined ? {} : { lodFadeNear: style.lodFadeNear }),
        ...(style.lodFadeFar === undefined ? {} : { lodFadeFar: style.lodFadeFar }),
        occlusionPolicy: (text.sdfOcclusion ?? "dim") as SdfTextOcclusionPolicy,
        lastOpacity: opacity,
        lastVisible: true,
        lastSubmitted: false
      },
      textureBytes: Math.round(image.width * image.height * 4 * (4 / 3)),
      textureMipBytes: mipBytes
    };
  } catch (error) {
    warn(`SDF text sampler failed for "${node.name ?? "sdf-text"}" (${error instanceof Error ? error.message : String(error)}); extruded mesh fallback retained`);
    return null;
  }
}

export function mipChainBytesCoarseToFine(width: number, height: number): readonly number[] {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Mip-chain bytes require positive integer dimensions.");
  }
  const levels: number[] = [];
  let w = width;
  let h = height;
  while (true) {
    levels.unshift(w * h * 4);
    if (w === 1 && h === 1) break;
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
  }
  return levels;
}
