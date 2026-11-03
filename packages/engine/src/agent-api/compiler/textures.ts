// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraMaterialSpec, AuraMaterialTextureInput, AuraPrimitiveNode, AuraProceduralTextureSpec, AuraTextureRef, AuraTextureTransform, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource } from "../nodes/types.js";
import { auraTextureRefTexture, texture, type TextureHandle } from "../nodes/texture.js";
import { prepareNativeTextureLoad, startNativeTextureLoad, type PreparedNativeTextureLoad } from "../nodes/loadNativeTexture.js";
import {
  identifyPreparedBitmapAssetLoad,
  matchesPreparedBitmapAssetLoad,
  prepareBitmapAssetLoad,
  productionPrimitiveBitmapPixels,
  startBitmapAssetLoad,
  type PreparedBitmapAssetLoad
} from "./bitmapAsset.js";
export { productionPrimitiveBitmapPixels } from "./bitmapAsset.js";
import type { AssetRequestOptions } from "@aura3d/assets/browser";
import { AuraRuntimeError } from "./errors.js";
import { colorToLinearRgb, colorToLinearRgba } from "../colorUtils.js";
import { createProductionPrimitiveMaterial, productionPrimitiveCullMode, resolveProductionPrimitiveScalars } from "../compiler/primitives.js";
import { primitive } from "../nodes/primitives.js";
import { assertSdfTextMaterialSupported, rootSdfFontAtlas, text3D } from "../nodes/text3d.js";
import { compileSdfTextSnapshot } from "./text.js";
import { ownBuiltinGlyphResource, retireBuiltinGlyphResource, type BuiltinGlyphAtlasScope, type BuiltinGlyphLease } from "./BuiltinGlyphAtlas.js";
import { clamp01 } from "../sceneMath.js";
import { Geometry, IndexBuffer, Sampler, Texture, TexturedPBRMaterial, VertexBuffer, VertexFormat, createSdfTextQuadMesh, generateProceduralMaterialTexture, layoutSdfText, resolveSamplerAnisotropy, type ProceduralMaterialTexture, type SdfTextLayout, type SdfTextOcclusionPolicy, type SdfTextQuadMesh, type TextureAddressMode } from "@aura3d/rendering";
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

type NativeTextureSlot = "baseColor" | "normal" | "roughness" | "metalness" | "occlusion" | "emissive" | RootExtensionTextureSlot;
type NativeTexturePlans = Readonly<Partial<Record<NativeTextureSlot, PreparedNativeTextureLoad>>>;
type BitmapTexturePlans = Readonly<Partial<Record<NativeTextureSlot, PreparedBitmapAssetLoad>>>;
const primitiveBitmapInputs = new WeakMap<object, Readonly<Partial<Record<NativeTextureSlot, AuraAssetRef<"texture">>>>>();

const isNativePvrAsset = (input: unknown): boolean => {
  if (!input || typeof input !== "object") return false;
  const asset = input as Partial<AuraAssetRef<"texture">>;
  // Preserve malformed PVR references for the native validator too; sending
  // them through the bitmap path would bypass admitted-asset policy checks.
  return asset.kind === "aura-asset-ref" && typeof asset.format === "string" &&
    asset.format.trim().replace(/^\./, "").toLowerCase() === "pvr";
};

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
  // threejs-parity ST-01 (L4): live `texture.*` handles land here — material
  // texture slots typed `AuraMaterialTextureInput` carry `AuraTextureRef`
  // alongside asset refs; the extension-slot fields below keep the same
  // contract for the extension-only `AuraAssetRef` slots (refs pass runtime).
  readonly baseColorRef?: AuraTextureRef;
  readonly normalRef?: AuraTextureRef;
  readonly roughnessRef?: AuraTextureRef;
  readonly metalnessRef?: AuraTextureRef;
  readonly occlusionRef?: AuraTextureRef;
  readonly emissiveRef?: AuraTextureRef;
  readonly nativeAssets?: Readonly<Partial<Record<NativeTextureSlot, AuraAssetRef<"texture">>>>;
  readonly extensionRefs?: Readonly<Partial<Record<RootExtensionTextureSlot, AuraTextureRef>>>;
  readonly extensionMaps?: Readonly<Partial<Record<RootExtensionTextureSlot, {
    readonly url: string;
    readonly colorSpace: "srgb" | "linear";
    readonly texCoord: 0 | 1;
    readonly transform?: AuraTextureTransform;
  }>>>;
  readonly proceduralInputs: readonly string[];
} {
  const refUrl = (input: AuraMaterialTextureInput | AuraAssetRef<"texture"> | undefined): string | undefined =>
    input && typeof input === "object" && !isNativePvrAsset(input) && input.kind === "aura-asset-ref"
      ? input.url ?? undefined
      : undefined;
  const textureRef = (input: AuraMaterialTextureInput | AuraAssetRef<"texture"> | undefined): AuraTextureRef | undefined =>
    isAuraTextureRef(input) ? input : undefined;
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
  const nativeAssets: Partial<Record<NativeTextureSlot, AuraAssetRef<"texture">>> = {};
  const bitmapAssets: Partial<Record<NativeTextureSlot, AuraAssetRef<"texture">>> = {};
  const rememberNative = (slot: NativeTextureSlot, input: unknown): void => {
    if (isNativePvrAsset(input)) nativeAssets[slot] = input as AuraAssetRef<"texture">;
    else if (input && typeof input === "object" && (input as { kind?: string }).kind === "aura-asset-ref" &&
        typeof (input as { url?: unknown }).url === "string" && (input as { url: string }).url) {
      bitmapAssets[slot] = input as AuraAssetRef<"texture">;
    }
  };
  rememberNative("baseColor", materialSpec?.texture);
  rememberNative("normal", materialSpec?.normal);
  rememberNative("roughness", materialSpec?.roughnessMap);
  rememberNative("metalness", materialSpec?.metalnessMap);
  rememberNative("occlusion", materialSpec?.occlusionMap);
  rememberNative("emissive", materialSpec?.emissiveMap);
  const extensionRefs: Partial<Record<RootExtensionTextureSlot, AuraTextureRef>> = {};
  const extensionMaps: NonNullable<ReturnType<typeof createProductionPrimitiveTextureIntent>["extensionMaps"]> = Object.fromEntries(
    ROOT_EXTENSION_TEXTURE_SLOTS.flatMap((slot) => {
      const input = materialSpec?.[`${slot}Map`];
      if (input === undefined) return [];
      const texCoord = materialSpec?.texCoords?.[slot] ?? 0;
      if (texCoord !== 0 && texCoord !== 1) throw new RangeError(`${slot} texCoord must be 0 or 1`);
      const transform = materialSpec?.texTransforms?.[slot];
      if (transform && [...(transform.offset ?? [0, 0]), ...(transform.scale ?? [1, 1]), transform.rotation ?? 0].some((value) => !Number.isFinite(value))) {
        throw new RangeError(`${slot} texture transform must contain finite values`);
      }
      // threejs-parity ST-01 (L4): a live texture handle in an extension slot
      // binds its device texture directly — no fetchable URL needed.
      if (isAuraTextureRef(input)) {
        extensionRefs[slot] = input;
        return [];
      }
      if (isNativePvrAsset(input)) {
        nativeAssets[slot] = input as AuraAssetRef<"texture">;
        return [];
      }
      if (!input || typeof input !== "object" || input.kind !== "aura-asset-ref" || input.type !== "texture") {
        throw new AuraRuntimeError("unsupported-texture", `${slot}Map requires a typed texture asset reference`);
      }
      if (!["png", "jpg", "jpeg", "webp"].includes(input.format) || !input.url) {
        throw new AuraRuntimeError("unsupported-texture", `${slot}Map requires a fetchable png, jpg, jpeg or webp texture`);
      }
      bitmapAssets[slot] = input;
      return [[slot, { url: input.url, colorSpace: slot === "sheenColor" ? "srgb" : "linear", texCoord, ...(transform ? { transform } : {}) }]];
    })
  );
  const baseColorRef = textureRef(materialSpec?.texture);
  const normalRef = textureRef(materialSpec?.normal);
  const roughnessRef = textureRef(materialSpec?.roughnessMap);
  const metalnessRef = textureRef(materialSpec?.metalnessMap);
  const occlusionRef = textureRef(materialSpec?.occlusionMap);
  const emissiveRef = textureRef(materialSpec?.emissiveMap);
  const intent = {
    ...(baseColorUrl ? { baseColorUrl } : {}),
    ...(normalUrl ? { normalUrl } : {}),
    ...(roughnessUrl ? { roughnessUrl } : {}),
    ...(metalnessUrl ? { metalnessUrl } : {}),
    ...(occlusionUrl ? { occlusionUrl } : {}),
    ...(emissiveUrl ? { emissiveUrl } : {}),
    ...(baseColorRef ? { baseColorRef } : {}),
    ...(normalRef ? { normalRef } : {}),
    ...(roughnessRef ? { roughnessRef } : {}),
    ...(metalnessRef ? { metalnessRef } : {}),
    ...(occlusionRef ? { occlusionRef } : {}),
    ...(emissiveRef ? { emissiveRef } : {}),
    ...(Object.keys(nativeAssets).length ? { nativeAssets } : {}),
    ...(Object.keys(extensionRefs).length ? { extensionRefs } : {}),
    ...(Object.keys(extensionMaps).length ? { extensionMaps } : {}),
    proceduralInputs: procedurals
  };
  primitiveBitmapInputs.set(intent, bitmapAssets);
  return intent;
}

type PrimitiveTextureIntent = ReturnType<typeof createProductionPrimitiveTextureIntent>;
export type PreparedProductionPrimitiveTextureWork =
  | { readonly ok: true; readonly intent: PrimitiveTextureIntent; readonly plans: NativeTexturePlans; readonly bitmapPlans: BitmapTexturePlans }
  | { readonly ok: false; readonly error: unknown };

function prepareNativePlans(intent: PrimitiveTextureIntent, request: AssetRequestOptions | undefined, maxTextureSize: number): NativeTexturePlans {
  if (!Number.isSafeInteger(maxTextureSize) || maxTextureSize < 1) throw new RangeError("Native texture size limit must be a positive safe integer");
  const plans: Partial<Record<NativeTextureSlot, PreparedNativeTextureLoad>> = {};
  for (const [slot, asset] of Object.entries(intent.nativeAssets ?? {}) as [NativeTextureSlot, AuraAssetRef<"texture">][]) {
    plans[slot] = prepareNativeTextureLoad(asset, {
      ...(request ? { request } : {}),
      maxPixels: Math.min(32 * 1024 * 1024, maxTextureSize * maxTextureSize)
    });
  }
  return plans;
}

function prepareBitmapPlans(intent: PrimitiveTextureIntent, request: AssetRequestOptions | undefined, maxTextureSize: number): BitmapTexturePlans {
  const plans: Partial<Record<NativeTextureSlot, PreparedBitmapAssetLoad>> = {};
  for (const [slot, asset] of Object.entries(primitiveBitmapInputs.get(intent) ?? {}) as [NativeTextureSlot, AuraAssetRef<"texture">][]) {
    plans[slot] = prepareBitmapAssetLoad(asset, request, maxTextureSize);
  }
  return plans;
}

function bitmapInputFor(spec: AuraMaterialSpec | undefined, slot: NativeTextureSlot): unknown {
  switch (slot) {
    case "baseColor": return spec?.texture;
    case "normal": return spec?.normal;
    case "roughness": return spec?.roughnessMap;
    case "metalness": return spec?.metalnessMap;
    case "occlusion": return spec?.occlusionMap;
    case "emissive": return spec?.emissiveMap;
    default: return spec?.[`${slot}Map`];
  }
}

/** Reject same-object asset policy or URL mutation after the queue snapshot. */
export function isPreparedProductionPrimitiveTextureWorkCurrent(work: PreparedProductionPrimitiveTextureWork | undefined, spec: AuraMaterialSpec | undefined): boolean {
  if (!work?.ok) return true;
  for (const [slot, plan] of Object.entries(work.bitmapPlans) as [NativeTextureSlot, PreparedBitmapAssetLoad][]) {
    const asset = bitmapInputFor(spec, slot);
    if (!asset || typeof asset !== "object" || !matchesPreparedBitmapAssetLoad(plan, asset as AuraAssetRef<"texture">)) return false;
  }
  const slots: readonly NativeTextureSlot[] = ["baseColor", "normal", "roughness", "metalness", "occlusion", "emissive", ...ROOT_EXTENSION_TEXTURE_SLOTS];
  for (const slot of slots) {
    const asset = bitmapInputFor(spec, slot);
    if (asset && typeof asset === "object" && (asset as { kind?: string }).kind === "aura-asset-ref" &&
        !isNativePvrAsset(asset) && typeof (asset as { url?: unknown }).url === "string" &&
        (asset as { url: string }).url && !work.bitmapPlans[slot]) return false;
  }
  return true;
}

/** Snapshot typed texture requests before a generation can wait in the mount queue. */
export function prepareProductionPrimitiveTextureWork(
  spec: AuraMaterialSpec | undefined,
  request: AssetRequestOptions | undefined,
  maxTextureSize: number
): PreparedProductionPrimitiveTextureWork | undefined {
  try {
    const inputs = [spec?.texture, spec?.normal, spec?.roughnessMap, spec?.metalnessMap, spec?.occlusionMap, spec?.emissiveMap,
      ...ROOT_EXTENSION_TEXTURE_SLOTS.map((slot) => spec?.[`${slot}Map`])];
    if (!inputs.some((input) => input && typeof input === "object" && (input as { kind?: string }).kind === "aura-asset-ref")) return undefined;
    const intent = createProductionPrimitiveTextureIntent(spec);
    return { ok: true, intent, plans: prepareNativePlans(intent, request, maxTextureSize), bitmapPlans: prepareBitmapPlans(intent, request, maxTextureSize) };
  } catch (error) {
    // Preparation must not make a synchronous subtree publication fail; the
    // current generation reports this failure through its normal fallback.
    return { ok: false, error };
  }
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

export const ROOT_EXTENSION_TEXTURE_SLOTS = ["clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "iridescence", "iridescenceThickness", "anisotropy", "diffuseRoughness", "bump"] as const;

export type RootExtensionTextureSlot = typeof ROOT_EXTENSION_TEXTURE_SLOTS[number];

function throwIfTextureAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Aura3D texture loading was aborted.");
  error.name = "AbortError";
  throw error;
}

export async function loadProductionPrimitiveBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  return startBitmapAssetLoad(prepareBitmapAssetLoad(url), signal).result;
}

export function bitmapRgbaPixels(bitmap: ImageBitmap): { readonly width: number; readonly height: number; readonly data: Uint8Array } {
  const decoded = productionPrimitiveBitmapPixels.get(bitmap);
  if (decoded) return decoded;
  const context = textureReadbackContext(bitmap.width, bitmap.height);
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: new Uint8Array(image.data) };
}

function textureReadbackContext(width: number, height: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas")
    : typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : undefined;
  if (!canvas) throw new Error("texture compositing requires a DOM canvas or OffscreenCanvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error("2d canvas unavailable for texture compositing");
  return context;
}

export async function upgradeProductionPrimitiveTextures(
  entries: readonly ProductionRuntimePrimitiveEntry[],
  warn: (message: string) => void,
  maxTextureSize = 4096,
  samplingContext?: ProductionTextureSamplingContext,
  signal?: AbortSignal,
  onCommitted?: () => void,
  isCurrentGeneration?: () => boolean,
  preparedWork?: PreparedProductionPrimitiveTextureWork,
  nativeMaxTextureSize = maxTextureSize
): Promise<void> {
  throwIfTextureAborted(signal);
  const qrMaterials = typedGLBActorQrFlags().on("A3D_QR_MATERIALS");
  for (const entry of entries) {
    for (const resource of entry.resources) {
      throwIfTextureAborted(signal);
      const spec = resource.materialSpec;
      const expectedMaterial = resource.material;
      const expectedSpec = resource.materialSpec;
      const isCurrent = (): boolean => {
        try { return resource.material === expectedMaterial && resource.materialSpec === expectedSpec &&
          isPreparedProductionPrimitiveTextureWorkCurrent(preparedWork, resource.materialSpec) && (isCurrentGeneration?.() ?? true); }
        catch { return false; }
      };
      if (!isCurrent()) continue;
      if (resource.textureStatus !== "none") continue;
      let intent: PrimitiveTextureIntent;
      try {
        if (preparedWork && !preparedWork.ok) throw preparedWork.error;
        intent = preparedWork?.ok ? preparedWork.intent : createProductionPrimitiveTextureIntent(spec);
      } catch (error) {
        if (!isCurrent()) continue;
        if (signal?.aborted) throwIfTextureAborted(signal);
        resource.textureStatus = "fallback";
        const message = `textured upgrade failed for "${resource.name}" (${error instanceof Error ? error.message : String(error)}); scalar material retained`;
        resource.textureWarnings.push(message);
        warn(message);
        continue;
      }
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
      // S7 (main GPU run 38144924567): a procedural-only spec (material.fabric,
      // brushedMetal, blackRubber, frostedGlass: no URL maps) was skipped here, so
      // flag-on never rasterized it and the frame equalled flag-off bit for bit.
      // Flag-on, a procedural input alone is enough to run the textured upgrade.
      const proceduralOnly = qrMaterials && intent.proceduralInputs.length > 0;
      // threejs-parity ST-01 (L4): live `texture.*` handles carry no URL.
      const hasTextureRef = Boolean(
        intent.baseColorRef ?? intent.normalRef ?? intent.roughnessRef ?? intent.metalnessRef ?? intent.occlusionRef ?? intent.emissiveRef
      ) || Object.keys(intent.extensionRefs ?? {}).length > 0;
      const hasNativeAsset = Object.keys(intent.nativeAssets ?? {}).length > 0;
      if (urls.length === 0 && !proceduralOnly && !hasTextureRef && !hasNativeAsset) continue;
      if (!isCurrent()) continue;
      resource.textureStatus = "pending";
      let committed = false;
      try {
        await upgradeProductionPrimitiveResource(resource, resource.sourceNode, spec, intent, maxTextureSize, samplingContext, signal, isCurrent,
          preparedWork?.ok ? preparedWork.plans : undefined, nativeMaxTextureSize, preparedWork?.ok ? preparedWork.bitmapPlans : undefined);
        committed = resource.texturedMaterial !== null;
      } catch (error) {
        // A superseded job must not change the status or diagnostics of the
        // replacement resource, whose own load may already be in flight.
        if (!isCurrent()) continue;
        if (signal?.aborted) { resource.textureStatus = "none"; throw error; }
        resource.textureStatus = "fallback";
        const message = `textured upgrade failed for "${resource.name}" (${error instanceof Error ? error.message : String(error)}); scalar material retained`;
        resource.textureWarnings.push(message);
        warn(message);
      }
      // A notification is advisory: it must not turn a completed texture swap
      // into a failed upgrade if a subscriber misbehaves.
      if (committed && isCurrent() && !signal?.aborted) {
        try { onCommitted?.(); } catch { /* The installed material remains valid. */ }
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
  samplingContext?: ProductionTextureSamplingContext,
  signal?: AbortSignal,
  isCurrentGeneration?: () => boolean,
  preparedNativePlans?: NativeTexturePlans,
  nativeMaxTextureSize = maxTextureSize,
  preparedBitmapPlans?: BitmapTexturePlans
): Promise<void> {
  throwIfTextureAborted(signal);
  const expectedMaterial = resource.material;
  const qrMaterials = typedGLBActorQrFlags().on("A3D_QR_MATERIALS");
  const fail = (message: string): Error => new Error(message);
  const ensureCurrent = (): void => {
    throwIfTextureAborted(signal);
    let current = true;
    try { current = isCurrentGeneration?.() ?? true; } catch { current = false; }
    if (!current || resource.material !== expectedMaterial || resource.materialSpec !== spec || expectedMaterial.disposed) {
      throw fail("primitive material changed or was disposed while texture upgrade was pending");
    }
  };
  if (!resource.geometry.vertexBuffer.format.hasAttribute("uv")) {
    throw fail(`"${resource.name}" geometry carries no uv set; textured upgrade needs generated uvs`);
  }
  const scalars = resolveProductionPrimitiveScalars(node);
  const extensionEntries = Object.entries(intent.extensionMaps ?? {}) as [RootExtensionTextureSlot, NonNullable<NonNullable<typeof intent.extensionMaps>[RootExtensionTextureSlot]>][];
  const nativeExtensionSlots = ROOT_EXTENSION_TEXTURE_SLOTS.filter((slot) => intent.nativeAssets?.[slot] !== undefined);
  const extensionRefs = [...new Set([...(Object.keys(intent.extensionRefs ?? {}) as RootExtensionTextureSlot[]), ...nativeExtensionSlots])];
  const extensionSlots = [...extensionEntries.map(([slot]) => slot), ...extensionRefs];
  const needsScalarAtlas = extensionSlots.some((slot) => slot.startsWith("clearcoat"))
    && extensionSlots.some((slot) => slot.startsWith("sheen") || slot === "anisotropy")
    && extensionSlots.some((slot) => slot.startsWith("iridescence"));
  if ((extensionEntries.some(([, map]) => map.texCoord === 1) || extensionRefs.some((slot) => spec?.texCoords?.[slot] === 1)) && !resource.geometry.vertexBuffer.format.hasAttribute("uv1")) {
    throw fail(`"${resource.name}" geometry carries no uv1 set requested by extension texture`);
  }
  const ownedBitmaps: ImageBitmap[] = [];
  const ownedTextures: Texture[] = [];
  const ownedNativeHandles = new Set<TextureHandle>();
  let retired = false;
  const bitmapLoads = new Map<string, Promise<ImageBitmap>>();
  const bitmapSettlements: Promise<void>[] = [];
  const bitmapPlans = preparedBitmapPlans ?? prepareBitmapPlans(intent, undefined, nativeMaxTextureSize);
  // threejs-parity ST-01 (L4): resolved `texture.*` handles per slot — their
  // textures are handle-owned (NOT pushed into ownedTextures; dispose comes
  // from `handle.dispose()`), and their sampler/transform come from the
  // handle's own three-`Texture` fields.
  const refBindings = new Map<string, AuraTextureRefBinding>();
  const refBindingFor = (slot: string, ref: AuraTextureRef | undefined): AuraTextureRefBinding | undefined => {
    if (!ref) return undefined;
    let binding = refBindings.get(slot);
    if (!binding) {
      binding = resolveAuraTextureRef(ref);
      refBindings.set(slot, binding);
    }
    return binding;
  };
  const slotWarn = (w: string): void => { resource.textureWarnings.push(w); };
  const load = async (slot: NativeTextureSlot, url: string): Promise<ImageBitmap> => {
    const plan = bitmapPlans[slot] ?? prepareBitmapAssetLoad(url, undefined, nativeMaxTextureSize);
    // Waiting for identity hashing is part of this resource job. Even if it
    // ignores cancellation, the queue retains the slot until it settles.
    const identity = await identifyPreparedBitmapAssetLoad(plan);
    throwIfTextureAborted(signal);
    ensureCurrent();
    let pending = identity.reusable ? bitmapLoads.get(identity.key) : undefined;
    if (!pending) {
      const started = startBitmapAssetLoad(plan, signal);
      bitmapSettlements.push(started.settled);
      pending = started.result.then((bitmap) => {
        if (retired || signal?.aborted) {
          try { bitmap.close(); }
          catch (error) {
            bitmapSettlements.push(new Promise<void>(() => {}));
            throw error;
          }
          throwIfTextureAborted(signal);
          throw fail("texture work was retired before bitmap acquisition completed");
        }
        ownedBitmaps.push(bitmap);
        return bitmap;
      });
      if (identity.reusable) bitmapLoads.set(identity.key, pending);
    }
    return pending;
  };
  const own = (texture: Texture): Texture => {
    if (retired || signal?.aborted) { texture.dispose(); throwIfTextureAborted(signal); throw fail("texture work was retired"); }
    ownedTextures.push(texture);
    return texture;
  };
  const disposeTextures = (): void => {
    if (retired) return;
    retired = true;
    const failures: unknown[] = [];
    const cleanup = (action: () => void): void => { try { action(); } catch (error) { failures.push(error); } };
    for (const texture of ownedTextures.splice(0)) cleanup(() => texture.dispose());
    for (const bitmap of ownedBitmaps.splice(0)) {
      try { bitmap.close(); }
      catch (error) {
        // A failed close cannot prove physical release. Retain the resource
        // admission slot rather than reporting an unsafe settlement.
        bitmapSettlements.push(new Promise<void>(() => {}));
        failures.push(error);
      }
    }
    const handles = [...ownedNativeHandles];
    ownedNativeHandles.clear();
    for (const handle of handles) cleanup(() => handle.dispose());
    if (failures.length) throw new AggregateError(failures, "Primitive texture cleanup failed");
  };
  const abortOwned = (): void => { try { disposeTextures(); } catch { /* Abort must finish retiring all owned resources. */ } };
  signal?.addEventListener("abort", abortOwned, { once: true });
  if (signal?.aborted) abortOwned();
  const nativeSettlements: Promise<void>[] = [];
  try {
    throwIfTextureAborted(signal);
    const nativePlans = preparedNativePlans ?? (Object.keys(intent.nativeAssets ?? {}).length > 0
      ? prepareNativePlans(intent, undefined, nativeMaxTextureSize) : {});
    const nativeEntries = Object.entries(nativePlans) as [NativeTextureSlot, PreparedNativeTextureLoad][];
    const nativeLoads = nativeEntries.map(([, plan]) => {
      try {
        const started = startNativeTextureLoad(plan, signal, texture.fromNativeImage);
        nativeSettlements.push(started.settled);
        return started.result.then((handle) => {
          if (retired || signal?.aborted) {
            handle.dispose();
            throwIfTextureAborted(signal);
            throw fail("texture work was retired before native acquisition completed");
          }
          ownedNativeHandles.add(handle);
          if (handle.texture.width > nativeMaxTextureSize || handle.texture.height > nativeMaxTextureSize) {
            throw fail(`"${resource.name}" native texture exceeds the ${nativeMaxTextureSize} device texture size limit`);
          }
          return handle;
        });
      } catch (error) { return Promise.reject(error); }
    });
    const [baseResults, nativeResults] = await Promise.all([Promise.allSettled([
      intent.baseColorUrl ? load("baseColor", intent.baseColorUrl) : Promise.resolve(undefined),
      intent.normalUrl ? load("normal", intent.normalUrl) : Promise.resolve(undefined),
      intent.roughnessUrl ? load("roughness", intent.roughnessUrl) : Promise.resolve(undefined),
      intent.metalnessUrl ? load("metalness", intent.metalnessUrl) : Promise.resolve(undefined),
      intent.occlusionUrl ? load("occlusion", intent.occlusionUrl) : Promise.resolve(undefined),
      intent.emissiveUrl ? load("emissive", intent.emissiveUrl) : Promise.resolve(undefined)
    ]), Promise.allSettled(nativeLoads)]);
    const failure = [...baseResults, ...nativeResults].find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    ensureCurrent();
    const [baseColorSource, normalSource, roughnessSource, metalnessSource, occlusionSource, emissiveSource] = baseResults.map((result) => result.status === "fulfilled" ? result.value : undefined);
    const nativeHandles: Partial<Record<NativeTextureSlot, TextureHandle>> = {};
    for (const [index, result] of nativeResults.entries()) {
      if (result.status === "fulfilled") nativeHandles[nativeEntries[index]![0]] = result.value;
    }
    const slots: string[] = [];
    const extensionOptions: Record<string, unknown> = {};
    const extensionSources: ImageBitmap[] = [];
    let nativeScalarAtlasTexture: Texture | undefined;
    const atlasPixels: Record<string, { readonly width: number; readonly height: number; readonly data: Uint8Array | Uint8ClampedArray }> = {};
    for (const [slot, map] of extensionEntries) {
      const source = await load(slot, map.url);
      ensureCurrent();
      extensionSources.push(source);
      if (needsScalarAtlas && (["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"] as readonly string[]).includes(slot)) {
        Object.assign(atlasPixels, { [slot]: bitmapRgbaPixels(source) });
      }
      extensionOptions[`${slot}Texture`] = own(new Texture({ width: source.width, height: source.height, source, colorSpace: map.colorSpace, label: `${resource.name}-${slot}` }));
      if (map.transform) extensionOptions[`${slot}TextureTransform`] = { ...map.transform };
      slots.push(slot);
    }
    // threejs-parity ST-01 (L4): `texture.*` handles in extension slots bind
    // directly — handle-owned textures, handle sampler, handle transform.
    const resolvedExtensionRefs: Partial<Record<RootExtensionTextureSlot, AuraTextureRef>> = { ...intent.extensionRefs };
    for (const slot of nativeExtensionSlots) resolvedExtensionRefs[slot] = nativeHandles[slot];
    for (const [slot, ref] of Object.entries(resolvedExtensionRefs) as [RootExtensionTextureSlot, AuraTextureRef][]) {
      const binding = refBindingFor(`ext:${slot}`, ref)!;
      if (needsScalarAtlas && (["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"] as readonly string[]).includes(slot)) {
        const pixels = auraTextureRefPixels(ref);
        if (!pixels) throw fail(`"${resource.name}" extension slot ${slot}Map texture handle has no CPU-readable pixels for the scalar atlas`);
        Object.assign(atlasPixels, { [slot]: pixels });
      }
      extensionOptions[`${slot}Texture`] = binding.texture;
      extensionOptions[`${slot}Sampler`] = binding.sampler;
      extensionOptions[`${slot}TextureTransform`] = mergedTransform(slotWarn, slot, spec?.texTransforms?.[slot], binding.transform);
      slots.push(slot);
    }
    if (needsScalarAtlas) {
      const { createExtensionScalarAtlas } = await import("@aura3d/rendering/extension-scalar-atlas");
      ensureCurrent();
      const atlas = createExtensionScalarAtlas(atlasPixels, maxTextureSize);
      own(atlas.texture);
      if (nativeExtensionSlots.length > 0) nativeScalarAtlasTexture = atlas.texture;
      extensionOptions.extensionScalarAtlas = atlas;
    }
    const baseColorRefBinding = refBindingFor("baseColor", intent.baseColorRef ?? nativeHandles.baseColor);
    const baseColorTexture = baseColorRefBinding?.texture ?? (baseColorSource
      ? own(new Texture({ width: baseColorSource.width, height: baseColorSource.height, source: baseColorSource, colorSpace: "srgb", label: `${resource.name}-basecolor` }))
      : undefined);
    if (baseColorTexture) slots.push("baseColor");
    const normalRefBinding = refBindingFor("normal", intent.normalRef ?? nativeHandles.normal);
    let normalTexture = normalRefBinding?.texture ?? (normalSource
      ? own(new Texture({ width: normalSource.width, height: normalSource.height, source: normalSource, colorSpace: "linear", label: `${resource.name}-normal` }))
      : undefined);
    if (normalTexture) slots.push("normal");
    let metallicRoughnessTexture: Texture | undefined;
    const roughnessRef = intent.roughnessRef ?? nativeHandles.roughness;
    const metalnessRef = intent.metalnessRef ?? nativeHandles.metalness;
    const roughnessRefBinding = refBindingFor("roughnessMap", roughnessRef);
    const metalnessRefBinding = refBindingFor("metalnessMap", metalnessRef);
    const roughnessRefPixels = roughnessRefBinding ? auraTextureRefPixels(roughnessRef!) : undefined;
    const metalnessRefPixels = metalnessRefBinding ? auraTextureRefPixels(metalnessRef!) : undefined;
    if ((roughnessRefBinding && !roughnessRefPixels) || (metalnessRefBinding && !metalnessRefPixels)) {
      // Fail closed (threejs-parity ST-01): a G/B-composited metal-rough map
      // built from unreadable pixels would silently drop the authored channel.
      throw fail(`"${resource.name}" uses a texture handle for roughness/metalness whose pixels are not CPU-readable (needs data, ImageBitmap, or canvas source)`);
    }
    if (roughnessSource ?? metalnessSource ?? roughnessRefPixels ?? metalnessRefPixels) {
      const base = roughnessSource ?? metalnessSource;
      const refSize = roughnessRefPixels ?? metalnessRefPixels;
      const size = base ? { width: base.width, height: base.height } : { width: refSize!.width, height: refSize!.height };
      const readPixels = (bitmap: ImageBitmap | undefined): Uint8Array | undefined => {
        if (!bitmap) return undefined;
        const decoded = bitmapRgbaPixels(bitmap);
        if (decoded.width !== size.width || decoded.height !== size.height) {
          const context = textureReadbackContext(size.width, size.height);
          context.drawImage(bitmap, 0, 0, size.width, size.height);
          return new Uint8Array(context.getImageData(0, 0, size.width, size.height).data);
        }
        return decoded.data;
      };
      const readRefPixels = (pixels: typeof roughnessRefPixels): Uint8Array | undefined => {
        if (!pixels) return undefined;
        if (pixels.width !== size.width || pixels.height !== size.height) {
          throw fail(`"${resource.name}" roughness/metalness texture handles must match the composite size ${size.width}x${size.height} (got ${pixels.width}x${pixels.height})`);
        }
        return pixels.data instanceof Uint8Array ? pixels.data : new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength);
      };
      const composited = compositeMetallicRoughnessPixels(
        readPixels(roughnessSource) ?? readRefPixels(roughnessRefPixels),
        readPixels(metalnessSource) ?? readRefPixels(metalnessRefPixels),
        size.width * size.height,
        spec?.roughness ?? 0.58,
        spec?.metallic ?? spec?.metalness ?? 0
      );
      metallicRoughnessTexture = own(new Texture({ width: size.width, height: size.height, data: composited, colorSpace: "linear", label: `${resource.name}-metallicroughness` }));
      slots.push("metallicRoughness");
    }
    const occlusionRefBinding = refBindingFor("occlusion", intent.occlusionRef ?? nativeHandles.occlusion);
    let occlusionTexture = occlusionRefBinding?.texture ?? (occlusionSource
      ? own(new Texture({ width: occlusionSource.width, height: occlusionSource.height, source: occlusionSource, colorSpace: "linear", label: `${resource.name}-occlusion` }))
      : undefined);
    if (occlusionTexture) slots.push("occlusion");
    const emissiveRefBinding = refBindingFor("emissive", intent.emissiveRef ?? nativeHandles.emissive);
    let emissiveTexture = emissiveRefBinding?.texture ?? (emissiveSource
      ? own(new Texture({ width: emissiveSource.width, height: emissiveSource.height, source: emissiveSource, colorSpace: "srgb", label: `${resource.name}-emissive` }))
      : undefined);
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
    const nativeBoundTextures = new Set<Texture>();
    for (const slot of ["baseColor", "normal", "occlusion", "emissive", ...nativeExtensionSlots] as NativeTextureSlot[]) {
      const nativeTexture = nativeHandles[slot]?.texture;
      if (nativeTexture) nativeBoundTextures.add(nativeTexture);
    }
    if ((nativeHandles.roughness || nativeHandles.metalness) && metallicRoughnessTexture) nativeBoundTextures.add(metallicRoughnessTexture);
    if (nativeScalarAtlasTexture) nativeBoundTextures.add(nativeScalarAtlasTexture);
    const nativeChains = [...nativeBoundTextures].map((nativeTexture) => nativeTexture.generateMipmaps && nativeTexture.mipLevels.length < 2
      ? mipChainBytesCoarseToFine(nativeTexture.width, nativeTexture.height)
      : nativeTexture.textureLevels.map((level) => level.data.byteLength).reverse());
    const bitmapChain = loadedDims.length ? mipChainBytesCoarseToFine(largestDims.width, largestDims.height) : [];
    const chains = [bitmapChain, ...nativeChains].filter((chain) => chain.length > 0);
    const longestChain = Math.max(0, ...chains.map((chain) => chain.length));
    const textureMipBytes = Array.from({ length: longestChain }, (_, index) => chains.reduce((sum, chain) =>
      sum + (chain[index - (longestChain - chain.length)] ?? 0), 0));
    const textureBytes = Math.round(loadedBaseBytes * (4 / 3)) + nativeChains.reduce((sum, chain) => sum + chain.reduce((a, b) => a + b, 0), 0);
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
    const upgradedMaterial = new TexturedPBRMaterial({
      name: `a3d-production-textured-primitive-${resource.name}`,
      ...(qrMaterials ? { hardwareWrap: true } : {}),
      baseColor: [scalars.baseColor[0], scalars.baseColor[1], scalars.baseColor[2], scalars.opacity],
      metallic: clamp01(spec?.metallic ?? spec?.metalness ?? 0),
      roughness: clamp01(spec?.roughness ?? 0.58),
      diffuseRoughness: spec?.diffuseRoughness,
      retroreflection: spec?.retroreflection,
      bumpFactor: spec?.bumpFactor ?? (spec?.bumpMap ? 1 : 0),
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
      iridescenceIor: spec?.iridescenceIOR ?? 1.3,
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
        cullMode: productionPrimitiveCullMode(node, scalars.opacity)
      },
      // threejs-parity ST-01 (L4): a live handle's sampler/transform wins over the
      // declarative default — three binds each `Texture`'s own sampling state, so
      // `handle.wrapS`/`minFilter`/`repeat`/`offset`/`rotation`/`center` carry the
      // per-slot params. An explicit `spec.texTransforms.<slot>` composes over the
      // handle transform like glTF's KHR_texture_transform over `texture.matrix`.
      ...(baseColorTexture ? {
        baseColorTexture,
        baseColorSampler: baseColorRefBinding?.sampler ?? slotSamplerFor("baseColor"),
        ...(mergedTransform(slotWarn, "baseColor", spec?.texTransforms?.baseColor, baseColorRefBinding?.transform)
          ? { baseColorTextureTransform: mergedTransform(slotWarn, "baseColor", spec?.texTransforms?.baseColor, baseColorRefBinding?.transform)! } : {})
      } : {}),
      ...(normalTexture ? {
        normalTexture,
        normalSampler: normalRefBinding?.sampler ?? slotSamplerFor("normal"),
        normalScale: spec?.normalScale ?? 1,
        ...(mergedTransform(slotWarn, "normal", spec?.texTransforms?.normal, normalRefBinding?.transform)
          ? { normalTextureTransform: mergedTransform(slotWarn, "normal", spec?.texTransforms?.normal, normalRefBinding?.transform)! } : {})
      } : {}),
      ...(metallicRoughnessTexture ? { metallicRoughnessTexture, metallicRoughnessSampler: slotSamplerFor("metallicRoughness") } : {}),
      ...(occlusionTexture ? {
        occlusionTexture,
        occlusionSampler: occlusionRefBinding?.sampler ?? slotSamplerFor("occlusion"),
        ...(mergedTransform(slotWarn, "occlusion", spec?.texTransforms?.occlusion, occlusionRefBinding?.transform)
          ? { occlusionTextureTransform: mergedTransform(slotWarn, "occlusion", spec?.texTransforms?.occlusion, occlusionRefBinding?.transform)! } : {})
      } : {}),
      ...(emissiveTexture ? {
        emissiveTexture,
        emissiveSampler: emissiveRefBinding?.sampler ?? slotSamplerFor("emissive"),
        ...(mergedTransform(slotWarn, "emissive", spec?.texTransforms?.emissive, emissiveRefBinding?.transform)
          ? { emissiveTextureTransform: mergedTransform(slotWarn, "emissive", spec?.texTransforms?.emissive, emissiveRefBinding?.transform)! } : {})
      } : {}),
      ...((texCoords?.baseColor ?? 0) > 0 || (texCoords?.normal ?? 0) > 0 || (texCoords?.metallicRoughness ?? 0) > 0 || (texCoords?.occlusion ?? 0) > 0 || (texCoords?.emissive ?? 0) > 0 || extensionEntries.length > 0 || extensionRefs.length > 0
        ? {
          textureTexCoords: {
            ...Object.fromEntries(extensionEntries.map(([slot, map]) => [slot, map.texCoord])),
            ...Object.fromEntries(extensionRefs.map((slot) => [slot, texCoords?.[slot] ?? 0])),
            ...(baseColorTexture && (texCoords?.baseColor ?? 0) > 0 ? { baseColor: 1 as const } : {}),
            ...(normalTexture && (texCoords?.normal ?? 0) > 0 ? { normal: 1 as const } : {}),
            ...(metallicRoughnessTexture && (texCoords?.metallicRoughness ?? 0) > 0 ? { metallicRoughness: 1 as const } : {}),
            ...(occlusionTexture && (texCoords?.occlusion ?? 0) > 0 ? { occlusion: 1 as const } : {}),
            ...(emissiveTexture && (texCoords?.emissive ?? 0) > 0 ? { emissive: 1 as const } : {})
          }
        }
        : {})
    });
    let currentGeneration = true;
    try { currentGeneration = isCurrentGeneration?.() ?? true; } catch { currentGeneration = false; }
    if (resource.material !== expectedMaterial || resource.materialSpec !== spec || expectedMaterial.disposed || signal?.aborted || !currentGeneration) {
      upgradedMaterial.dispose();
      throwIfTextureAborted(signal);
      throw fail("primitive material changed or was disposed while texture upgrade was pending");
    }
    resource.texturedMaterial = upgradedMaterial;
    resource.textureDisposer = disposeTextures;
    resource.textureStatus = "textured";
    resource.textureSlots = slots;
    resource.textureBytes = textureBytes;
    resource.textureMipBytes = textureMipBytes;
  } catch (error) {
    try { disposeTextures(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Primitive texture upgrade and cleanup failed"); }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortOwned);
    // A canceled subscriber can reject before a transport that ignores abort
    // actually settles. Keep the resource job's physical slot until both do.
    await Promise.allSettled([...nativeSettlements, ...bitmapSettlements]);
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

class OwnedSdfTextMaterial extends TexturedPBRMaterial {
  constructor(options: ConstructorParameters<typeof TexturedPBRMaterial>[0], private readonly ownedTexture: Texture) { super(options); }
  override dispose(): void {
    if (this.disposed && this.ownedTexture.disposed) return;
    const failures: unknown[] = [];
    try { if (!this.disposed) super.dispose(); } catch (error) { failures.push(error); }
    try { if (!this.ownedTexture.disposed) this.ownedTexture.dispose(); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "SDF text material disposal failed");
  }
}

/** Build quads against the individual glyph rectangles, rather than a baked label. */
function createBuiltinGlyphTextMesh(layout: SdfTextLayout, scope: BuiltinGlyphAtlasScope, leases: BuiltinGlyphLease[]): SdfTextQuadMesh {
  const byGlyph = new Map<string, BuiltinGlyphLease>();
  const positions = new Float32Array(layout.quads.length * 12);
  const normals = new Float32Array(layout.quads.length * 12);
  const tangents = new Float32Array(layout.quads.length * 16);
  const uvs = new Float32Array(layout.quads.length * 8);
  const indices: number[] = [];
  layout.quads.forEach((quad, index) => {
    let lease = byGlyph.get(quad.glyph);
    if (!lease) {
      lease = scope.acquire(quad.glyph);
      byGlyph.set(quad.glyph, lease);
      leases.push(lease);
    }
    const [x0, y0, x1, , , y1] = quad.corners;
    const [u0, v0, u1, v1] = lease.uv;
    const corners = [[x0, y0, u0, v0], [x1, y0, u1, v0], [x1, y1, u1, v1], [x0, y1, u0, v1]] as const;
    corners.forEach(([x, y, u, v], corner) => {
      const vertex = index * 4 + corner;
      positions.set([x, y, 0], vertex * 3);
      normals.set([0, 0, 1], vertex * 3);
      tangents.set([1, 0, 0, 1], vertex * 4);
      uvs.set([u, v], vertex * 2);
    });
    const base = index * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    kind: "aura-sdf-text-quad-mesh", positions, normals, tangents, uvs, indices,
    vertexCount: layout.quads.length * 4, quadCount: layout.quads.length,
    min: [0, 0, 0], max: [layout.widthWorld, layout.heightWorld, 0]
  };
}

/** Keep the existing whole-label raster's bounded pixel and sampling contract. */
function assertBuiltinGlyphTextBudget(layout: SdfTextLayout): void {
  const width = Math.max(1, Math.ceil(layout.widthWorld * 64));
  const height = Math.max(1, Math.ceil(layout.heightWorld * 64));
  if (width > 4096 || height > 4096 || width * height > 4_194_304 || width * height * layout.quads.length > 16_777_216) {
    throw new RangeError("Aura3D SDF raster exceeds the bounded pixel or sampling budget.");
  }
}

export function createSdfTextPrimitiveResource(
  node: AuraPrimitiveNode,
  warn: (message: string) => void,
  scope?: BuiltinGlyphAtlasScope
): ProductionRuntimePrimitiveResource | null {
  const text = node.text3D;
  const atlasOption = (text as (typeof text & { readonly sdfGlyphAtlas?: unknown }))?.sdfGlyphAtlas;
  if (atlasOption !== undefined && (atlasOption !== "shared" || text?.backend !== "sdf")) {
    throw new Error("Aura3D sdfGlyphAtlas must be shared and requires the sdf text backend.");
  }
  if (!text || text.backend !== "sdf") return null;
  assertSdfTextMaterialSupported(node.material);
  const requestedAtlas = atlasOption === "shared";
  const authoredStyle = text.sdfStyle;
  const sharedSampler = node.material?.textureAnisotropy === undefined || node.material.textureAnisotropy === 1;
  let useAtlas = requestedAtlas && Boolean(scope) && !text.sdfDynamic && (text.sdfSize ?? 1) === 1 &&
    (authoredStyle?.outlineWidthEm ?? 0) === 0 && (authoredStyle?.glowRadiusEm ?? 0) === 0 &&
    authoredStyle?.shadowOffsetEm === undefined && (authoredStyle?.smoothingEm ?? 0.02) === 0.02 &&
    sharedSampler;
  let allocatedVertices: VertexBuffer | undefined;
  let allocatedIndices: IndexBuffer | undefined;
  let allocatedGeometry: Geometry | undefined;
  let allocatedTexture: Texture | undefined;
  let allocatedMaterial: TexturedPBRMaterial | undefined;
  let allocatedBaseMaterial: ProductionRuntimePrimitiveResource["material"] | undefined;
  let scopeHold: (() => void) | undefined;
  const allocatedGlyphs: BuiltinGlyphLease[] = [];
  try {
    let layout: SdfTextLayout;
    let mesh: SdfTextQuadMesh;
    let imageWidth = 0;
    let imageHeight = 0;
    let imageData: Uint8Array | undefined;
    if (useAtlas) {
      layout = layoutSdfText(text.text, rootSdfFontAtlas(), {
        size: 1,
        ...(text.sdfLetterSpacing === undefined ? {} : { letterSpacing: text.sdfLetterSpacing }),
        ...(text.sdfStyle === undefined ? {} : { style: text.sdfStyle })
      });
      assertBuiltinGlyphTextBudget(layout);
      try {
        mesh = createBuiltinGlyphTextMesh(layout, scope!, allocatedGlyphs);
      } catch (error) {
        if (!(error instanceof RangeError) || error.message !== "Aura3D glyph atlas is full; release retained glyphs before allocating more.") throw error;
        // Shaped labels and built-in glyphs share capacity. If retained labels
        // occupy it, preserve built-in text through the whole-label path.
        for (const lease of allocatedGlyphs) lease.release();
        allocatedGlyphs.length = 0;
        const snapshot = compileSdfTextSnapshot(text);
        layout = snapshot.layout;
        imageWidth = snapshot.image.width;
        imageHeight = snapshot.image.height;
        imageData = snapshot.image.data;
        mesh = createSdfTextQuadMesh(layout, snapshot.image);
        useAtlas = false;
      }
    } else {
      const snapshot = compileSdfTextSnapshot(text);
      layout = snapshot.layout;
      imageWidth = snapshot.image.width;
      imageHeight = snapshot.image.height;
      imageData = snapshot.image.data;
      mesh = createSdfTextQuadMesh(layout, snapshot.image);
      if (text.sdfDynamic && requestedAtlas && sharedSampler && scope?.tryAcquireLabel) {
        const lease = scope.tryAcquireLabel(snapshot.image);
        if (lease) {
          allocatedGlyphs.push(lease);
          const [u0, v0, u1, v1] = lease.uv;
          for (let index = 0; index < mesh.uvs.length; index += 2) {
            mesh.uvs[index] = u0 + mesh.uvs[index]! * (u1 - u0);
            mesh.uvs[index + 1] = v0 + mesh.uvs[index + 1]! * (v1 - v0);
          }
          useAtlas = true;
        }
      }
    }
    const fallbackWarning = requestedAtlas && !useAtlas
      ? "SDF_GLYPH_ATLAS_FALLBACK: shared text atlas unavailable for this text; whole-label SDF retained."
      : undefined;
    const style = layout.style;
    const vertexCount = mesh.vertexCount;
    const vertices = allocatedVertices = new VertexBuffer(VertexFormat.P3N3T4T2T2, vertexCount);
    for (let index = 0; index < vertexCount; index += 1) {
      vertices.setAttribute(index, "position", [mesh.positions[index * 3] ?? 0, mesh.positions[index * 3 + 1] ?? 0, 0]);
      vertices.setAttribute(index, "normal", [0, 0, 1]);
      vertices.setAttribute(index, "tangent", [1, 0, 0, 1]);
      vertices.setAttribute(index, "uv", [mesh.uvs[index * 2] ?? 0, mesh.uvs[index * 2 + 1] ?? 0]);
      vertices.setAttribute(index, "uv1", [mesh.uvs[index * 2] ?? 0, mesh.uvs[index * 2 + 1] ?? 0]);
    }
    const indices = allocatedIndices = new IndexBuffer(mesh.indices, vertexCount);
    const geometry = allocatedGeometry = new Geometry(
      vertices,
      indices,
      "triangles",
      { min: [mesh.min[0], mesh.min[1], mesh.min[2]], max: [mesh.max[0], mesh.max[1], mesh.max[2]] }
    );
    // Geometry has retained both newly created buffers; it owns their cleanup.
    allocatedVertices = undefined;
    allocatedIndices = undefined;
    const [red, green, blue, colorAlpha] = colorToLinearRgba(node.material?.color ?? "#ffffff");
    const opacity = clamp01((node.material?.opacity ?? 1) * colorAlpha);
    const emissive = node.material?.emissive === undefined
      ? [red * 0.92, green * 0.92, blue * 0.92] as const
      : colorToLinearRgb(node.material.emissive);
    const labelTexture = useAtlas ? scope!.texture : allocatedTexture = new Texture({
      width: imageWidth,
      height: imageHeight,
      data: imageData,
      colorSpace: "srgb",
      label: `${node.name ?? "sdf-text"}-sdf-label`
    });
    const sampler = useAtlas ? scope!.sampler : typedGLBActorQrFlags().on("A3D_QR_MATERIALS")
      // P2-7: SDF label textures clamp (no repeat-tiled glyphs).
      ? Sampler.trilinear({ wrap: "clamp", anisotropy: resolveSamplerAnisotropy({ desired: node.material?.textureAnisotropy }).applied })
      : new Sampler({ maxAnisotropy: resolveSamplerAnisotropy({ desired: node.material?.textureAnisotropy }).applied });
    const materialOptions: ConstructorParameters<typeof TexturedPBRMaterial>[0] = {
      name: `a3d-production-sdf-text-${node.name ?? "label"}`,
      ...(typedGLBActorQrFlags().on("A3D_QR_MATERIALS") ? { hardwareWrap: true } : {}),
      baseColor: [red, green, blue, opacity],
      metallic: clamp01(node.material?.metallic ?? node.material?.metalness ?? 0),
      roughness: clamp01(node.material?.roughness ?? 0.9),
      emissiveColor: emissive,
      emissiveStrength: node.material?.emissiveIntensity ?? 0.9,
      occlusionStrength: 0,
      environmentIntensity: 0,
      renderState: { blend: true, depthWrite: false, cullMode: "none" },
      baseColorTexture: labelTexture,
      baseColorSampler: sampler,
      emissiveTexture: labelTexture,
      emissiveSampler: sampler
    };
    const texturedMaterial = allocatedMaterial = useAtlas
      ? new TexturedPBRMaterial(materialOptions)
      : new OwnedSdfTextMaterial(materialOptions, labelTexture);
    const mipBytes = useAtlas ? [] : mipChainBytesCoarseToFine(imageWidth, imageHeight);
    const baseMaterial = allocatedBaseMaterial = createProductionPrimitiveMaterial(node);
    const resource: ProductionRuntimePrimitiveResource = {
      geometry,
      material: baseMaterial,
      bounds: { min: [mesh.min[0], mesh.min[1], mesh.min[2]], max: [mesh.max[0], mesh.max[1], mesh.max[2]] },
      name: node.name ?? "sdf-text",
      materialSpec: node.material,
      sourceNode: node,
      ...blankProductionPrimitiveTextureState(),
      texturedMaterial,
      textureStatus: "textured",
      textureSlots: ["baseColor", "emissive"],
      textureWarnings: fallbackWarning ? [fallbackWarning] : [],
      sdfText: {
        quadCount: mesh.quadCount,
        // The atlas is owned and accounted for by the mount, not each label.
        imageBytes: useAtlas ? 0 : imageWidth * imageHeight * 4,
        ...(style.lodFadeNear === undefined ? {} : { lodFadeNear: style.lodFadeNear }),
        ...(style.lodFadeFar === undefined ? {} : { lodFadeFar: style.lodFadeFar }),
        occlusionPolicy: (text.sdfOcclusion ?? "dim") as SdfTextOcclusionPolicy,
        lastOpacity: opacity,
        lastVisible: true,
        lastSubmitted: false
      },
      textureBytes: useAtlas ? 0 : Math.round(imageWidth * imageHeight * 4 * (4 / 3)),
      textureMipBytes: mipBytes
    };
    // The primitive updater uses this marker to detect a later geometry edit.
    // Without it the first frame replaces text quads with the fallback mesh.
    (resource as ProductionRuntimePrimitiveResource & { __parityL2AppliedGeometry?: AuraPrimitiveNode["geometry"] }).__parityL2AppliedGeometry = node.geometry;
    if (useAtlas) {
      // No resource is published until every acquired glyph has been staged.
      scope!.flush();
      if (!scope!.isOpen()) throw new Error("Aura3D built-in glyph atlas closed during text construction.");
    } else if (requestedAtlas && scope?.hold) {
      // The fallback's separate texture also needs to survive a pending frame
      // and keep the mount alive until that frame releases its resource.
      scopeHold = scope.hold();
    }
    if (useAtlas || scopeHold) {
      const ownedGlyphs = [...allocatedGlyphs];
      const releaseScope = scopeHold;
      ownBuiltinGlyphResource(resource, (current) => {
        const failures: unknown[] = [];
        try { disposeSdfTextResourceParts(current); } catch (error) { failures.push(error); }
        for (const lease of ownedGlyphs) try { lease.release(); } catch (error) { failures.push(error); }
        try { releaseScope?.(); } catch (error) { failures.push(error); }
        if (failures.length) throw new AggregateError(failures, "Built-in glyph resource disposal failed");
      });
      allocatedGlyphs.length = 0;
      scopeHold = undefined;
    }
    return resource;
  } catch (error) {
    const failures: unknown[] = [];
    const cleanup = (work: () => void): void => { try { work(); } catch (failure) { failures.push(failure); } };
    cleanup(() => allocatedGeometry?.dispose());
    cleanup(() => allocatedIndices?.dispose());
    cleanup(() => allocatedVertices?.dispose());
    cleanup(() => allocatedBaseMaterial?.dispose());
    cleanup(() => allocatedMaterial?.dispose());
    cleanup(() => { if (allocatedTexture && !allocatedTexture.disposed) allocatedTexture.dispose(); });
    for (const lease of allocatedGlyphs) cleanup(() => lease.release());
    cleanup(() => scopeHold?.());
    if (failures.length) throw new AggregateError([error, ...failures], "SDF text construction and rollback failed", { cause: error });
    if (text.sdfDynamic) throw error;
    warn(`SDF text sampler failed for "${node.name ?? "sdf-text"}" (${error instanceof Error ? error.message : String(error)}); extruded mesh fallback retained`);
    return null;
  }
}

/** Retire all parts even if one disposer reports an error. */
export function retireSdfTextPrimitiveResource(resource: ProductionRuntimePrimitiveResource): void {
  if (retireBuiltinGlyphResource(resource)) return;
  disposeSdfTextResourceParts(resource);
}

function disposeSdfTextResourceParts(resource: ProductionRuntimePrimitiveResource): void {
  const failures: unknown[] = [];
  const cleanup = (work: () => void): void => { try { work(); } catch (error) { failures.push(error); } };
  cleanup(() => resource.textureDisposer?.());
  cleanup(() => resource.geometry.dispose());
  if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) cleanup(() => resource.shadowGeometry!.dispose());
  cleanup(() => resource.material.dispose());
  if (resource.texturedMaterial && !Object.is(resource.texturedMaterial, resource.material)) cleanup(() => resource.texturedMaterial!.dispose());
  if (failures.length) throw new AggregateError(failures, "SDF text resource disposal failed");
}

/** Compile a replacement before retiring the previous text resources. */
export function replaceSdfTextPrimitiveResource(
  previous: ProductionRuntimePrimitiveResource,
  node: AuraPrimitiveNode
): ProductionRuntimePrimitiveResource {
  if (!previous.sdfText || node.text3D?.backend !== "sdf") throw new Error("Aura3D live text refresh requires an SDF text resource.");
  const replacement = createSdfTextPrimitiveResource(node, (message) => { throw new Error(message); });
  if (!replacement) throw new Error("Aura3D live text refresh did not create a text resource.");
  try {
    retireSdfTextPrimitiveResource(previous);
  } catch (error) {
    // The standalone caller never receives the replacement when retirement
    // fails, so release it here. The previous resource may already be dead.
    try { retireSdfTextPrimitiveResource(replacement); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "SDF text replacement and rollback failed", { cause: error }); }
    throw error;
  }
  return replacement;
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

// ── threejs-parity (§6 lane L4, ST-01/ST-02) ────────────────────────────────
// AuraTextureRef (the live `texture.*` handle contract, nodes/types.ts) →
// device bindings. The handle's mutable three-`Texture` fields — wrapS/wrapT,
// minFilter/magFilter, anisotropy, repeat/offset/rotation/center — are the
// authored sampling + transform state for every slot the handle binds into.

export interface AuraTextureRefBinding {
  readonly texture: Texture;
  readonly sampler: Sampler;
  readonly transform: AuraTextureTransform;
}

export function isAuraTextureRef(input: unknown): input is AuraTextureRef {
  return typeof input === "object" && input !== null && (input as { kind?: string }).kind === "aura-texture-ref";
}

/**
 * ST-02: three's per-texture sampler fields → `Sampler`. Wrap S/T stay
 * separate (no single-wrap collapse), min/mag map through
 * `Sampler.fromThree`, anisotropy is preserved. `generateMipmaps` is a
 * texture-storage property (it decides whether mip storage exists) and is
 * applied at Texture construction in `nodes/texture.ts`, not here.
 */
export function auraTextureRefSampler(ref: AuraTextureRef): Sampler {
  return Sampler.fromThree({
    wrapS: ref.wrapS,
    wrapT: ref.wrapT,
    minFilter: ref.minFilter,
    magFilter: ref.magFilter,
    anisotropy: ref.anisotropy
  });
}

/**
 * ST-02: three `texture.matrix` semantics → engine `AuraTextureTransform`.
 *
 * three applies `uv' = offset + center + L·(uv − center)` where
 * `L = R_three(rotation)·S(repeat)` and `R_three = [[c, −s],[s, c]]` in
 * bottom-left UV space. The engine applies `uv' = offset' + L'·uv` with
 * `L' = R_gltf(rot')·S` where `R_gltf(φ) = [[cosφ, sinφ],[−sinφ, cosφ]]` in
 * glTF's top-left UV space (materials/features.ts `uvTransformMatrix`) —
 * numerically `R_gltf(φ) = R_three(−φ)`, so the authored rotation negates.
 * Folding the center anchor into the offset:
 *   offset' = offset + center − L·center
 */
export function auraTextureRefTransform(ref: AuraTextureRef): AuraTextureTransform {
  const [sx, sy] = ref.repeat;
  const [cx, cy] = ref.center;
  const [ox, oy] = ref.offset;
  const c = Math.cos(ref.rotation);
  const s = Math.sin(ref.rotation);
  // L·center with three's matrix (L = [[c·sx, −s·sy],[s·sx, c·sy]]):
  const lcx = c * sx * cx - s * sy * cy;
  const lcy = s * sx * cx + c * sy * cy;
  return {
    offset: [ox + cx - lcx, oy + cy - lcy],
    scale: [sx, sy],
    rotation: -ref.rotation
  };
}

/**
 * Resolve a live handle to its device binding. Throws `unsupported-texture`
 * (fail-closed — a dropped handle would silently render magenta/white rather
 * than the authored image) when the handle has no backing texture, e.g. after
 * `dispose()`.
 */
export function resolveAuraTextureRef(ref: AuraTextureRef): AuraTextureRefBinding {
  const texture = auraTextureRefTexture(ref);
  if (!texture) {
    throw new AuraRuntimeError(
      "unsupported-texture",
      `texture handle "${ref.id}" has no backing device texture (disposed or never uploaded)`
    );
  }
  return { texture, sampler: auraTextureRefSampler(ref), transform: auraTextureRefTransform(ref) };
}

/**
 * CPU-readable RGBA pixels for a handle's texture — needed where the compiler
 * packs authored channels into a composite (metallicRoughness G/B, extension
 * scalar atlas). Returns undefined for float/half data textures, video
 * sources, and cube/array textures; the caller fails closed.
 */
export function auraTextureRefPixels(
  ref: AuraTextureRef
): { readonly width: number; readonly height: number; readonly data: Uint8Array | Uint8ClampedArray } | undefined {
  const texture = auraTextureRefTexture(ref);
  if (!texture || texture.dimension !== "2d" || texture.format !== "rgba8") return undefined;
  const data = texture.getMipLevel(0)?.data ?? texture.data;
  if (data instanceof Uint8ClampedArray) {
    if (data.byteLength !== texture.width * texture.height * 4) return undefined;
    // Uint8Clamped → Uint8 view (composite pixels expect the unclamped type).
    return { width: texture.width, height: texture.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  }
  if (data instanceof Uint8Array) {
    if (data.byteLength !== texture.width * texture.height * 4) return undefined;
    return { width: texture.width, height: texture.height, data };
  }
  const source = texture.source;
  if (!source) return undefined;
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return bitmapRgbaPixels(source);
  }
  // Canvas sources can belong to either the DOM or a worker.
  if ((typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
      (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas)) {
    const context = textureReadbackContext(texture.width, texture.height);
    context.drawImage(source, 0, 0);
    return { width: texture.width, height: texture.height, data: context.getImageData(0, 0, texture.width, texture.height).data };
  }
  return undefined;
}

/**
 * Compose an authored `texTransforms.<slot>` over a handle transform
 * (`spec · ref`, spec applied last — the KHR_texture_transform-over-
 * `texture.matrix` ordering). Both are engine-convention
 * `{offset, scale, rotation}`; the composition is exact when the combined
 * linear part stays in the `R(φ)·S` family (orthogonal columns, positive
 * determinant). A sheared result can't be expressed losslessly — the caller
 * surfaces a textureWarning and the authored spec transform wins.
 */
export function mergedTransform(
  warn: (warning: string) => void,
  slot: string,
  authored: AuraTextureTransform | undefined,
  handleTransform: AuraTextureTransform | undefined
): AuraTextureTransform | undefined {
  if (!handleTransform) return authored;
  if (!authored) return handleTransform;
  const linear = (t: AuraTextureTransform): [[number, number], [number, number]] => {
    const [sx, sy] = t.scale ?? [1, 1];
    const rot = t.rotation ?? 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return [[c * sx, -s * sy], [s * sx, c * sy]];
  };
  const A = linear(authored);
  const B = linear(handleTransform);
  const m00 = A[0][0] * B[0][0] + A[0][1] * B[1][0];
  const m01 = A[0][0] * B[0][1] + A[0][1] * B[1][1];
  const m10 = A[1][0] * B[0][0] + A[1][1] * B[1][0];
  const m11 = A[1][0] * B[0][1] + A[1][1] * B[1][1];
  const tB = handleTransform.offset ?? [0, 0];
  const tA = authored.offset ?? [0, 0];
  const ox = A[0][0] * tB[0] + A[0][1] * tB[1] + tA[0];
  const oy = A[1][0] * tB[0] + A[1][1] * tB[1] + tA[1];
  // Orthogonality + positive determinant ⇔ composed map stays R(φ)·S.
  const cross = m00 * m01 + m10 * m11;
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(cross) > 1e-9 || det <= 0) {
    warn(`texTransforms.${slot} does not compose with the texture handle transform (shear/negative scale); the authored slot transform wins`);
    return authored;
  }
  const sx = Math.hypot(m00, m10);
  const sy = Math.hypot(m01, m11);
  const rotation = Math.atan2(m10, m00);
  return { offset: [ox, oy], scale: [sx, sy], rotation };
}
