// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraMaterialSpec, AuraMaterialTextureInput, AuraPrimitiveNode, AuraProceduralTextureSpec, AuraTextureRef, AuraTextureTransform, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource } from "../nodes/types.js";
import { auraTextureRefTexture } from "../nodes/texture.js";
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
    input && typeof input === "object" && (input as { kind?: string }).kind === "aura-asset-ref"
      ? (input as AuraAssetRef<"texture">).url ?? undefined
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
  const extensionRefs: Partial<Record<RootExtensionTextureSlot, AuraTextureRef>> = {};
  const extensionMaps: NonNullable<ReturnType<typeof createProductionPrimitiveTextureIntent>["extensionMaps"]> = Object.fromEntries(
    ROOT_EXTENSION_TEXTURE_SLOTS.flatMap((slot) => {
      const input = materialSpec?.[`${slot}Map`];
      if (input === undefined) return [];
      // threejs-parity ST-01 (L4): a live texture handle in an extension slot
      // binds its device texture directly — no fetchable URL needed.
      if (isAuraTextureRef(input)) {
        extensionRefs[slot] = input;
        return [];
      }
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
  const baseColorRef = textureRef(materialSpec?.texture);
  const normalRef = textureRef(materialSpec?.normal);
  const roughnessRef = textureRef(materialSpec?.roughnessMap);
  const metalnessRef = textureRef(materialSpec?.metalnessMap);
  const occlusionRef = textureRef(materialSpec?.occlusionMap);
  const emissiveRef = textureRef(materialSpec?.emissiveMap);
  return {
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
    ...(Object.keys(extensionRefs).length ? { extensionRefs } : {}),
    ...(Object.keys(extensionMaps).length ? { extensionMaps } : {}),
    proceduralInputs: procedurals
  };
}

const textureClockMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * GU47 e6 (g09 handoff): the last step a textured upgrade reached, so a row stuck in `pending` names where it waits
 * (diagnostics `texturedMaterials[].stage` / `pendingMs`). Bookkeeping only; no draw state changes.
 */
export function markTextureStage(resource: { textureStage?: string }, stage: string): void {
  resource.textureStage = stage;
}

/** `pendingMs` for a diagnostics row: time since the upgrade started, only while it is still pending. */
export function texturePendingMs(resource: { textureStatus: string; texturePendingSince?: number }): number | undefined {
  if (resource.textureStatus !== "pending" || resource.texturePendingSince === undefined) return undefined;
  return Math.round(textureClockMs() - resource.texturePendingSince);
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
const ROOT_SCALAR_ATLAS_SLOTS: readonly RootExtensionTextureSlot[] = ["clearcoat", "clearcoatRoughness", "sheenRoughness", "iridescence", "iridescenceThickness"];

/**
 * GU47 e6 phase 7: a decoded map. Normally an `ImageBitmap`; when `createImageBitmap` does not settle within
 * `PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS`, a decoded `<img>` of the same blob (see `decodeProductionImageFallback`).
 * Both carry `width`, `height` and `close()`, and both are a `TexImageSource`.
 */
export type ProductionTextureImage = ImageBitmap | (HTMLImageElement & { close(): void });

export const productionPrimitiveBitmapPixels = new WeakMap<ProductionTextureImage, { readonly width: number; readonly height: number; readonly data: Uint8Array }>();

interface PendingProductionTexturePixels {
  readonly bytes: Uint8Array;
  promise?: Promise<void>;
}

// A shared image can be used first by a GPU-only slot and later by a scalar
// slot. Retain its encoded PNG until the first CPU request (or last release),
// rather than deciding from whichever user happened to acquire the URL first.
const pendingProductionTexturePixels = new WeakMap<ProductionTextureImage, PendingProductionTexturePixels>();
// Identity works for both the <img> fallback and bitmaps from another realm,
// including non-PNG / unsupported PNG sources that need canvas readback.
const productionTextureImageStates = new WeakMap<ProductionTextureImage, "live" | "released">();

function trackProductionTextureImage(bitmap: ProductionTextureImage): void {
  if (!productionTextureImageStates.has(bitmap)) productionTextureImageStates.set(bitmap, "live");
}

function isTrackedProductionTextureImage(source: TexImageSource): source is ProductionTextureImage {
  const bitmap = source as ProductionTextureImage;
  return productionTextureImageStates.has(bitmap) || productionPrimitiveBitmapPixels.has(bitmap);
}

function assertProductionTextureImageLive(bitmap: ProductionTextureImage): void {
  if (productionTextureImageStates.get(bitmap) === "released") throw new Error("shared texture image was released");
}

/**
 * Prepare a shared image's exact PNG pixels before synchronous readback with
 * `bitmapRgbaPixels` or `auraTextureRefPixels`. Direct loads already prepare
 * them; GPU-only shared loads do not. Keep the shared handle held through the
 * read. Failed preparation can be retried while the image is still held.
 */
export async function prepareProductionTexturePixels(bitmap: ProductionTextureImage): Promise<void> {
  assertProductionTextureImageLive(bitmap);
  const pending = pendingProductionTexturePixels.get(bitmap);
  if (!pending) return;
  if (!pending.promise) {
    const decode = (async (): Promise<void> => {
      const { decodePngTexturePixels } = await import("../PngTexturePixels.js");
      const pixels = await decodePngTexturePixels(pending.bytes);
      // The last holder may have released while the decode was in flight.
      if (pendingProductionTexturePixels.get(bitmap) !== pending) throw new Error("texture PNG was released while preparing pixels");
      if (pixels) productionPrimitiveBitmapPixels.set(bitmap, pixels);
      pendingProductionTexturePixels.delete(bitmap);
    })();
    pending.promise = decode;
    // Failed CPU reads remain retryable, including while a GPU-only holder is
    // still using the image. Every requesting consumer also observes the error.
    void decode.catch(() => {
      if (pending.promise === decode) delete pending.promise;
    });
  }
  await pending.promise;
}

function closeSharedProductionTextureImage(bitmap: ProductionTextureImage): void {
  productionTextureImageStates.set(bitmap, "released");
  pendingProductionTexturePixels.delete(bitmap);
  productionPrimitiveBitmapPixels.delete(bitmap);
  bitmap.close();
}

/**
 * GU47 e6 phase 7 (g09 texPending): how long a map waits for `createImageBitmap` before it decodes through an
 * `<img>` instead. On the loaded software-WebGL2 runner `createImageBitmap` was measured not settling for 20 s+ on a
 * 121 KB JPG and a 191-byte PNG while `<img>.decode()` of the same blob finished, so textured upgrades sat pending and
 * captures showed untextured surfaces. A healthy decode settles far inside this bound and keeps the bitmap path.
 */
export const PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS = 3000;

const DECODE_TIMED_OUT = Symbol("decode-timed-out");

/**
 * Decodes `blob` through an `<img>`. The upload is equivalent to the bitmap path: the WebGL2 upload sets
 * `UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`, `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE` and `UNPACK_FLIP_Y_WEBGL =
 * texture.flipY` (false here) before `texImage2D`; an `<img>` source honours those, an `ImageBitmap` source ignores them
 * and carries `premultiplyAlpha: "none"`, `colorSpaceConversion: "none"`, no flip instead (the same three settings).
 */
export async function decodeProductionImageFallback(blob: Blob): Promise<HTMLImageElement & { close(): void }> {
  if (typeof Image !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("texture decode fallback requires HTMLImageElement + URL.createObjectURL");
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image() as HTMLImageElement & { close(): void };
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  // `close()` mirrors ImageBitmap.close(): owners release the blob URL with the texture.
  image.close = () => URL.revokeObjectURL(objectUrl);
  return image;
}

async function decodeProductionTextureImage(blob: Blob, onFallback?: () => void): Promise<ProductionTextureImage> {
  const bitmapDecode = createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof DECODE_TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(DECODE_TIMED_OUT), PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS); });
  try {
    const first = await Promise.race([bitmapDecode, timeout]);
    if (first !== DECODE_TIMED_OUT) return first;
  } finally {
    clearTimeout(timer);
  }
  // The bitmap decode is stalled: decode through an <img>. Whichever finishes first is used; a late loser is released.
  onFallback?.();
  const fallback = decodeProductionImageFallback(blob);
  const winner = await new Promise<ProductionTextureImage>((resolve, reject) => {
    let failures = 0;
    const lose = (error: unknown): void => { failures += 1; if (failures === 2) reject(error); };
    bitmapDecode.then(resolve, lose);
    fallback.then(resolve, lose);
  });
  for (const decode of [bitmapDecode, fallback]) void decode.then((image) => { if (image !== winner) image.close(); }, () => undefined);
  return winner;
}

async function loadProductionPrimitiveBitmapImpl(
  url: string,
  onStep: ((step: ProductionTextureLoadStep) => void) | undefined,
  deferPixels: boolean
): Promise<ProductionTextureImage> {
  if (typeof fetch !== "function" || typeof createImageBitmap !== "function") {
    throw new Error("texture fetch requires fetch + createImageBitmap (browser production mount)");
  }
  onStep?.("fetch");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`texture fetch failed with status ${response.status} for ${url}`);
  onStep?.("body");
  // GU47 e6 phase 7: the body is read once. A Blob read (`response.blob()` then `blob.arrayBuffer()`) was measured at
  // tens of seconds per map on the loaded software runner; the decode blob is built from the bytes already in memory.
  const bytes = new Uint8Array(await response.arrayBuffer());
  const blob = new Blob([bytes], { type: response.headers.get("content-type") ?? "" });
  onStep?.("decode");
  const bitmap = await decodeProductionTextureImage(blob, () => onStep?.("decode-fallback"));
  trackProductionTextureImage(bitmap);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    pendingProductionTexturePixels.set(bitmap, { bytes });
  }
  if (deferPixels) return bitmap;
  try {
    onStep?.("pixels");
    await prepareProductionTexturePixels(bitmap);
    return bitmap;
  } catch (error) { closeSharedProductionTextureImage(bitmap); throw error; }
}

/** Direct consumers, including cube backgrounds, retain the eager CPU-pixel contract. */
export async function loadProductionPrimitiveBitmap(url: string, onStep?: (step: ProductionTextureLoadStep) => void): Promise<ProductionTextureImage> {
  return loadProductionPrimitiveBitmapImpl(url, onStep, false);
}

export type ProductionTextureLoadStep = "fetch" | "body" | "decode" | "decode-fallback" | "pixels";

/**
 * GU47 e6 phase 8 (shared decodes): one decoded image per map URL, shared by every material that references it.
 * Bunker Zero builds 188 textured materials over ~20 URLs; each material used to fetch and decode its own copy, so on the
 * loaded software runner the queue landed about one material every 30 s. Holders take a reference with
 * `acquireSharedProductionTextureImage` and give it back with `release()`. The image is closed when the last holder
 * releases, and the entry leaves the cache at that moment, so a later acquire decodes afresh and never receives a
 * closed image. A failed decode leaves the cache too (the next acquire retries). Only the CPU-side decoded image is
 * shared: every material still builds and disposes its own GPU `Texture`.
 * A `TextureHandle` wrapping the image does not retain a cache reference; keep an explicit shared handle until every
 * such use is finished. GPU-only acquisitions defer PNG pixels; await `prepareProductionTexturePixels` before readback.
 *
 * The key carries the decode options as well as the URL. Every map decodes with the same unpack settings today
 * (`premultiplyAlpha: "none"`, `colorSpaceConversion: "none"`, no flip; the sRGB/linear choice is made per GPU texture),
 * so the option suffix is constant, but a future option would get its own entry.
 */
const SHARED_DECODE_OPTIONS_KEY = "premultiplyAlpha=none;colorSpaceConversion=none;flipY=false";

interface SharedProductionTextureDecode {
  readonly key: string;
  readonly promise: Promise<ProductionTextureImage>;
  refs: number;
  image?: ProductionTextureImage;
  step?: ProductionTextureLoadStep;
  readonly listeners: Set<(step: ProductionTextureLoadStep) => void>;
  /** Set when the last holder released: the image is (or will be, when it lands) closed. */
  dead: boolean;
}

const sharedProductionTextureDecodes = new Map<string, SharedProductionTextureDecode>();

/** Distinct decodes started through the shared cache (diagnostics and tests). */
export const sharedProductionTextureDecodeStats = { decodes: 0, hits: 0 };

export interface SharedProductionTextureImageHandle {
  /** GPU-ready image; shared PNG CPU pixels may still need preparation. */
  readonly image: Promise<ProductionTextureImage>;
  /** Gives the reference back; idempotent. The last release closes the image. */
  release(): void;
}

export function acquireSharedProductionTextureImage(
  url: string,
  onStep?: (step: ProductionTextureLoadStep) => void,
  loader: (url: string, onStep: (step: ProductionTextureLoadStep) => void) => Promise<ProductionTextureImage> =
    (source, report) => loadProductionPrimitiveBitmapImpl(source, report, true)
): SharedProductionTextureImageHandle {
  const key = `${url}#${SHARED_DECODE_OPTIONS_KEY}`;
  let entry = sharedProductionTextureDecodes.get(key);
  if (entry) {
    sharedProductionTextureDecodeStats.hits += 1;
  } else {
    sharedProductionTextureDecodeStats.decodes += 1;
    const listeners = new Set<(step: ProductionTextureLoadStep) => void>();
    let created: SharedProductionTextureDecode | undefined;
    const promise = loader(url, (step) => {
      if (created) created.step = step;
      for (const listener of listeners) listener(step);
    }).then((image) => {
      trackProductionTextureImage(image);
      created!.image = image;
      listeners.clear();
      if (created!.dead) closeSharedProductionTextureImage(image);
      return image;
    }, (error: unknown) => {
      listeners.clear();
      if (sharedProductionTextureDecodes.get(key) === created) sharedProductionTextureDecodes.delete(key);
      throw error;
    });
    // Holders observe the promise; this keeps a decode whose holders all left from surfacing as unhandled.
    promise.catch(() => undefined);
    created = { key, promise, refs: 0, listeners, dead: false };
    entry = created;
    sharedProductionTextureDecodes.set(key, entry);
  }
  const held = entry;
  held.refs += 1;
  if (onStep && !held.image) {
    held.listeners.add(onStep);
    if (held.step) onStep(held.step);
  }
  let released = false;
  const image = held.promise.then((value) => {
    // Defensive: a holder's own reference keeps the entry alive, so its image cannot have been closed.
    if (held.dead) throw new Error(`shared texture decode for ${url} was released before it was read`);
    return value;
  });
  // A released holder may never observe its derived promise.
  void image.catch(() => undefined);
  return {
    image,
    release: () => {
      if (released) return;
      released = true;
      if (onStep) held.listeners.delete(onStep);
      held.refs -= 1;
      if (held.refs > 0) return;
      held.dead = true;
      if (sharedProductionTextureDecodes.get(held.key) === held) sharedProductionTextureDecodes.delete(held.key);
      if (held.image) closeSharedProductionTextureImage(held.image);
    }
  };
}

/** Tests: forget every shared decode (does not close images still held). */
export function resetSharedProductionTextureDecodes(): void {
  sharedProductionTextureDecodes.clear();
  sharedProductionTextureDecodeStats.decodes = 0;
  sharedProductionTextureDecodeStats.hits = 0;
}

/** Synchronous readback: prepare a lazy shared PNG first and keep its cache handle held while reading. */
export function bitmapRgbaPixels(bitmap: ProductionTextureImage): { readonly width: number; readonly height: number; readonly data: Uint8Array } {
  assertProductionTextureImageLive(bitmap);
  const decoded = productionPrimitiveBitmapPixels.get(bitmap);
  if (decoded) return decoded;
  // Canvas readback can destroy RGB under low/zero alpha. Never silently use
  // it for a shared PNG whose exact decode was not awaited by the consumer.
  if (pendingProductionTexturePixels.has(bitmap)) throw new Error("texture PNG pixels must be prepared before synchronous readback; await prepareProductionTexturePixels(image)");
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

/**
 * GU47 e6 (g09 texPending handoff): textured upgrades in flight at once. The queue used to run one resource at a time,
 * so one slow map fetch (tens of seconds on a busy software-WebGL2 runner) held every later resource back, and only the
 * queue head ever read `pending` (the rest read `none`, like untextured materials), so `texPending` never exceeded 1.
 */
export const PRIMITIVE_TEXTURE_UPGRADE_CONCURRENCY = 4;

function primitiveTextureIntentFor(
  resource: ProductionRuntimePrimitiveResource,
  qrMaterials: boolean
): ReturnType<typeof createProductionPrimitiveTextureIntent> | null {
  const intent = createProductionPrimitiveTextureIntent(resource.materialSpec);
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
  return urls.length === 0 && !proceduralOnly && !hasTextureRef ? null : intent;
}

export async function upgradeProductionPrimitiveTextures(
  entries: readonly ProductionRuntimePrimitiveEntry[],
  warn: (message: string) => void,
  maxTextureSize = 4096,
  samplingContext?: ProductionTextureSamplingContext
): Promise<void> {
  const qrMaterials = typedGLBActorQrFlags().on("A3D_QR_MATERIALS");
  const seen = new Set<ProductionRuntimePrimitiveResource>();
  // Collect every resource that needs an upgrade and mark it pending ("queued") before any work starts, so the
  // diagnostics count the whole queue. Entries added while the queue runs are picked up by the next sweep.
  const sweep = (): ProductionRuntimePrimitiveResource[] => {
    const queued: ProductionRuntimePrimitiveResource[] = [];
    for (const entry of entries) {
      for (const resource of entry.resources) {
        if (seen.has(resource)) continue;
        seen.add(resource);
        const intent = createProductionPrimitiveTextureIntent(resource.materialSpec);
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
        if (!primitiveTextureIntentFor(resource, qrMaterials)) continue;
        if (resource.textureStatus !== "none") continue;
        resource.textureStatus = "pending";
        resource.texturePendingSince = textureClockMs();
        markTextureStage(resource, "queued");
        queued.push(resource);
      }
    }
    return queued;
  };
  const upgradeOne = async (resource: ProductionRuntimePrimitiveResource): Promise<void> => {
    markTextureStage(resource, "start");
    const spec = resource.materialSpec;
    const intent = createProductionPrimitiveTextureIntent(spec);
    try {
      await upgradeProductionPrimitiveResource(resource, resource.sourceNode, spec, intent, maxTextureSize, samplingContext);
    } catch (error) {
      resource.textureStatus = "fallback";
      markTextureStage(resource, "failed");
      const message = `textured upgrade failed for "${resource.name}" (${error instanceof Error ? error.message : String(error)}); scalar material retained`;
      resource.textureWarnings.push(message);
      warn(message);
    }
  };
  for (let queue = sweep(); queue.length > 0; queue = sweep()) {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < queue.length) await upgradeOne(queue[next++]!);
    };
    await Promise.all(Array.from({ length: Math.min(PRIMITIVE_TEXTURE_UPGRADE_CONCURRENCY, queue.length) }, worker));
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
  const pixelUrls = new Set<string>();
  if (intent.roughnessUrl) pixelUrls.add(intent.roughnessUrl);
  if (intent.metalnessUrl) pixelUrls.add(intent.metalnessUrl);
  if (needsScalarAtlas) {
    for (const [slot, map] of extensionEntries) if (ROOT_SCALAR_ATLAS_SLOTS.includes(slot)) pixelUrls.add(map.url);
  }
  if (extensionEntries.some(([, map]) => map.texCoord === 1) && !resource.geometry.vertexBuffer.format.hasAttribute("uv1")) {
    throw fail(`"${resource.name}" geometry carries no uv1 set requested by extension texture`);
  }
  const ownedTextures: Texture[] = [];
  const bitmapLoads = new Map<string, Promise<ProductionTextureImage>>();
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
  // GU47 e6: the stage lists every unsettled map load with its step (`fetch|body|decode|pixels <url>`).
  const loadSteps = new Map<string, string>();
  const showLoadSteps = (): void => {
    if (loadSteps.size > 0) markTextureStage(resource, [...loadSteps].map(([url, step]) => `${step} ${url}`).join("; "));
  };
  // GU47 e6 phase 8: maps come from the shared per-URL decode cache. Each URL is acquired once per resource and released
  // with the resource's textures (`disposeTextures`), so the image outlives every material that uploads from it.
  const releases: (() => void)[] = [];
  const load = (url: string): Promise<ProductionTextureImage> => {
    let pending = bitmapLoads.get(url);
    if (!pending) {
      loadSteps.set(url, "fetch");
      showLoadSteps();
      const handle = acquireSharedProductionTextureImage(url, (step) => { if (loadSteps.has(url)) { loadSteps.set(url, step); showLoadSteps(); } });
      releases.push(handle.release);
      pending = handle.image.then(async (bitmap) => {
        if (pixelUrls.has(url)) {
          loadSteps.set(url, "pixels");
          showLoadSteps();
          await prepareProductionTexturePixels(bitmap);
        }
        return bitmap;
      }).then((bitmap) => {
        loadSteps.delete(url);
        showLoadSteps();
        return bitmap;
      }, (error: unknown) => {
        loadSteps.delete(url);
        showLoadSteps();
        throw error;
      });
      bitmapLoads.set(url, pending);
    }
    return pending;
  };
  const own = (texture: Texture): Texture => { ownedTextures.push(texture); return texture; };
  const disposeTextures = (): void => {
    for (const texture of ownedTextures) texture.dispose();
    for (const release of releases) release();
    ownedTextures.length = 0;
    releases.length = 0;
  };
  try {
    // GU47 e6 phase 8: every map of the resource (base slots and extension slots) starts decoding at once.
    const extensionResults = Promise.allSettled(extensionEntries.map(([, map]) => load(map.url)));
    const baseResults = await Promise.allSettled([
      intent.baseColorUrl ? load(intent.baseColorUrl) : Promise.resolve(undefined),
      intent.normalUrl ? load(intent.normalUrl) : Promise.resolve(undefined),
      intent.roughnessUrl ? load(intent.roughnessUrl) : Promise.resolve(undefined),
      intent.metalnessUrl ? load(intent.metalnessUrl) : Promise.resolve(undefined),
      intent.occlusionUrl ? load(intent.occlusionUrl) : Promise.resolve(undefined),
      intent.emissiveUrl ? load(intent.emissiveUrl) : Promise.resolve(undefined)
    ]);
    const settledExtensions = await extensionResults;
    markTextureStage(resource, "decoded");
    const failure = [...baseResults, ...settledExtensions].find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const [baseColorSource, normalSource, roughnessSource, metalnessSource, occlusionSource, emissiveSource] = baseResults.map((result) => result.status === "fulfilled" ? result.value : undefined);
    // A texture handle can wrap an image already held by a GPU-only resource.
    // Its synchronous pixel reader needs the same exact PNG preparation.
    const pixelRefs = [intent.roughnessRef, intent.metalnessRef, ...Object.entries(intent.extensionRefs ?? {})
      .filter(([slot]) => needsScalarAtlas && ROOT_SCALAR_ATLAS_SLOTS.includes(slot as RootExtensionTextureSlot))
      .map(([, ref]) => ref)];
    for (const ref of pixelRefs) {
      if (!ref) continue;
      const source = auraTextureRefTexture(ref)?.source;
      if (source && isTrackedProductionTextureImage(source) && pendingProductionTexturePixels.has(source)) {
        markTextureStage(resource, `pixels texture:${ref.id}`);
        await prepareProductionTexturePixels(source);
      }
    }
    const slots: string[] = [];
    const extensionOptions: Record<string, unknown> = {};
    const extensionSources: ProductionTextureImage[] = [];
    const atlasPixels: Record<string, { readonly width: number; readonly height: number; readonly data: Uint8Array | Uint8ClampedArray }> = {};
    for (const [slot, map] of extensionEntries) {
      const source = await load(map.url);
      extensionSources.push(source);
      if (needsScalarAtlas && ROOT_SCALAR_ATLAS_SLOTS.includes(slot)) {
        Object.assign(atlasPixels, { [slot]: bitmapRgbaPixels(source) });
      }
      extensionOptions[`${slot}Texture`] = own(new Texture({ width: source.width, height: source.height, source, colorSpace: map.colorSpace, label: `${resource.name}-${slot}` }));
      if (map.transform) extensionOptions[`${slot}TextureTransform`] = { ...map.transform };
      slots.push(slot);
    }
    // threejs-parity ST-01 (L4): `texture.*` handles in extension slots bind
    // directly — handle-owned textures, handle sampler, handle transform.
    for (const [slot, ref] of Object.entries(intent.extensionRefs ?? {}) as [RootExtensionTextureSlot, AuraTextureRef][]) {
      const binding = refBindingFor(`ext:${slot}`, ref)!;
      if (needsScalarAtlas && ROOT_SCALAR_ATLAS_SLOTS.includes(slot)) {
        const pixels = auraTextureRefPixels(ref);
        if (!pixels) throw fail(`"${resource.name}" extension slot ${slot}Map texture handle has no CPU-readable pixels for the scalar atlas`);
        Object.assign(atlasPixels, { [slot]: pixels });
      }
      extensionOptions[`${slot}Texture`] = binding.texture;
      extensionOptions[`${slot}Sampler`] = binding.sampler;
      extensionOptions[`${slot}TextureTransform`] = { ...binding.transform };
      slots.push(slot);
    }
    if (needsScalarAtlas) {
      markTextureStage(resource, "scalar-atlas import");
      const { createExtensionScalarAtlas } = await import("@aura3d/rendering/extension-scalar-atlas");
      const atlas = createExtensionScalarAtlas(atlasPixels, maxTextureSize);
      own(atlas.texture);
      extensionOptions.extensionScalarAtlas = atlas;
    }
    const baseColorRefBinding = refBindingFor("baseColor", intent.baseColorRef);
    const baseColorTexture = baseColorRefBinding?.texture ?? (baseColorSource
      ? own(new Texture({ width: baseColorSource.width, height: baseColorSource.height, source: baseColorSource, colorSpace: "srgb", label: `${resource.name}-basecolor` }))
      : undefined);
    if (baseColorTexture) slots.push("baseColor");
    const normalRefBinding = refBindingFor("normal", intent.normalRef);
    let normalTexture = normalRefBinding?.texture ?? (normalSource
      ? own(new Texture({ width: normalSource.width, height: normalSource.height, source: normalSource, colorSpace: "linear", label: `${resource.name}-normal` }))
      : undefined);
    if (normalTexture) slots.push("normal");
    let metallicRoughnessTexture: Texture | undefined;
    const roughnessRefBinding = refBindingFor("roughnessMap", intent.roughnessRef);
    const metalnessRefBinding = refBindingFor("metalnessMap", intent.metalnessRef);
    const roughnessRefPixels = roughnessRefBinding ? auraTextureRefPixels(intent.roughnessRef!) : undefined;
    const metalnessRefPixels = metalnessRefBinding ? auraTextureRefPixels(intent.metalnessRef!) : undefined;
    if ((roughnessRefBinding && !roughnessRefPixels) || (metalnessRefBinding && !metalnessRefPixels)) {
      // Fail closed (threejs-parity ST-01): a G/B-composited metal-rough map
      // built from unreadable pixels would silently drop the authored channel.
      throw fail(`"${resource.name}" uses a texture handle for roughness/metalness whose pixels are not CPU-readable (needs data, ImageBitmap, or canvas source)`);
    }
    if (roughnessSource ?? metalnessSource ?? roughnessRefPixels ?? metalnessRefPixels) {
      const base = roughnessSource ?? metalnessSource;
      const refSize = roughnessRefPixels ?? metalnessRefPixels;
      const size = base ? { width: base.width, height: base.height } : { width: refSize!.width, height: refSize!.height };
      const readPixels = (bitmap: ProductionTextureImage | undefined): Uint8Array | undefined => {
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
    const occlusionRefBinding = refBindingFor("occlusion", intent.occlusionRef);
    let occlusionTexture = occlusionRefBinding?.texture ?? (occlusionSource
      ? own(new Texture({ width: occlusionSource.width, height: occlusionSource.height, source: occlusionSource, colorSpace: "linear", label: `${resource.name}-occlusion` }))
      : undefined);
    if (occlusionTexture) slots.push("occlusion");
    const emissiveRefBinding = refBindingFor("emissive", intent.emissiveRef);
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
      .filter((source): source is ProductionTextureImage => source !== undefined)
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
    markTextureStage(resource, "done");
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
  if (texture.source && productionTextureImageStates.get(texture.source as ProductionTextureImage) === "released") {
    throw new AuraRuntimeError("unsupported-texture", `texture handle "${ref.id}" references a released shared texture image`);
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
  if (!texture || texture.dimension !== "2d") return undefined;
  const data = texture.data;
  if (data instanceof Uint8ClampedArray) {
    // Uint8Clamped → Uint8 view (composite pixels expect the unclamped type).
    return { width: texture.width, height: texture.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  }
  if (data instanceof Uint8Array) return { width: texture.width, height: texture.height, data };
  const source = texture.source;
  if (!source) return undefined;
  if (isTrackedProductionTextureImage(source) || (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)) {
    return bitmapRgbaPixels(source);
  }
  // Canvas sources read back through a 2d canvas (browser path only).
  if (typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    const canvas = document.createElement("canvas");
    canvas.width = texture.width;
    canvas.height = texture.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
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
    return [[c * sx, s * sy], [-s * sx, c * sy]];
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
  const rotation = Math.atan2(-m10, m00);
  return { offset: [ox, oy], scale: [sx, sy], rotation };
}
