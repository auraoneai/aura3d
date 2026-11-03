/**
 * R-26 — texture asset refs (`assets.x`) bound to `material.custom` / `material.node`
 * texture2d uniforms. `texture.*` handles and raw `Texture` values resolve
 * synchronously in `customMaterial.ts`; an asset ref only carries a url, so its
 * image loads here after mount (the same fire-and-forget pass the PBR texture
 * upgrade uses). Asset textures sample raw bytes (`linear`): a custom shader
 * owns its own colour management, as three's ShaderMaterial does.
 *
 * Limit: primitive nodes only. A `material.custom` on a `model(...)` node keeps
 * the white fallback for asset refs (named by `CUSTOM_TEXTURE_UNBOUND`).
 */

import { PortableShaderMaterial, Texture, TextureBinding } from "@aura3d/rendering";
import type { AssetRequestOptions } from "@aura3d/assets/browser";
import type { AuraAssetRef, AuraCustomMaterialSpec, AuraMaterialSpec, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource } from "../nodes/types.js";
import { sanitizeDiagnosticText } from "../sanitizeDiagnostics.js";
import { customTextureUniformNames, customUniformNameFor } from "./customMaterial.js";
import { matchesPreparedBitmapAssetLoad, prepareBitmapAssetLoad, startBitmapAssetLoad, type PreparedBitmapAssetLoad } from "./bitmapAsset.js";

// A resource can outlive its material. Track the installed material identity so
// a replacement is eligible for its own pass and an old abort cannot clear it.
const passed = new WeakMap<ProductionRuntimePrimitiveResource, ProductionRuntimePrimitiveResource["material"]>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isAssetTextureRef = (value: unknown): value is AuraAssetRef<"texture"> =>
  isRecord(value) && value.kind === "aura-asset-ref" && value.type === "texture";

type BitmapLoader = (url: string, signal?: AbortSignal) => Promise<ImageBitmap>;
type CustomTextureResource = Pick<ProductionRuntimePrimitiveResource, "name" | "material" | "materialSpec" | "textureWarnings" | "textureDisposer">;

export interface ModelCustomMaterialTextureWork {
  readonly ready: Promise<void>;
  readonly warnings: readonly string[];
  dispose(): void;
}

export interface ModelCustomMaterialTextureOptions {
  readonly request?: AssetRequestOptions;
  readonly signal?: AbortSignal;
  readonly maxDimension?: number;
}

export function hasCustomMaterialTextureAssets(materialSpec: AuraMaterialSpec | undefined): boolean {
  const spec = materialSpec?.kind === "custom" ? materialSpec.custom : undefined;
  return Object.values(spec?.uniforms ?? {}).some((uniform) =>
    isRecord(uniform) && isAssetTextureRef(uniform.value));
}

type PreparedCustomSlot = { readonly asset: AuraAssetRef<"texture">; readonly url: string | undefined } & (
  | { readonly kind: "missing-url" }
  | { readonly kind: "ready"; readonly plan: PreparedBitmapAssetLoad }
  | { readonly kind: "failed"; readonly error: unknown }
);

declare const preparedCustomTextureBrand: unique symbol;
/** Opaque per-material snapshot captured before the resource enters the queue. */
export interface PreparedCustomMaterialTextureWork { readonly [preparedCustomTextureBrand]: true }
const customTexturePlans = new WeakMap<PreparedCustomMaterialTextureWork, {
  readonly spec: AuraCustomMaterialSpec;
  readonly slots: ReadonlyMap<string, PreparedCustomSlot>;
}>();

/** Snapshot each typed bitmap's complete request without starting I/O. */
export function prepareCustomMaterialTextureWork(
  materialSpec: AuraMaterialSpec | undefined,
  request?: AssetRequestOptions,
  maxDimension?: number
): PreparedCustomMaterialTextureWork | undefined {
  const spec = materialSpec?.kind === "custom" ? materialSpec.custom : undefined;
  if (!spec) return undefined;
  const slots = new Map<string, PreparedCustomSlot>();
  for (const [name, uniform] of Object.entries(spec.uniforms ?? {})) {
    const asset = isRecord(uniform) ? uniform.value : undefined;
    if (!isAssetTextureRef(asset)) continue;
    const url = asset.url;
    if (!url) { slots.set(name, { asset, url, kind: "missing-url" }); continue; }
    try { slots.set(name, { asset, url, kind: "ready", plan: prepareBitmapAssetLoad(asset, request, maxDimension) }); }
    catch (error) { slots.set(name, { asset, url, kind: "failed", error }); }
  }
  const handle = Object.freeze({}) as PreparedCustomMaterialTextureWork;
  customTexturePlans.set(handle, { spec, slots });
  return handle;
}

async function bindResource(
  resource: CustomTextureResource,
  warn: (message: string) => void,
  loadBitmap: BitmapLoader | undefined,
  signal?: AbortSignal,
  onCommitted?: () => void,
  isCurrentGeneration?: () => boolean,
  prepared?: PreparedCustomMaterialTextureWork
): Promise<void> {
  const material = resource.material;
  const spec = resource.materialSpec?.kind === "custom" ? resource.materialSpec.custom : undefined;
  if (!spec || !(material instanceof PortableShaderMaterial)) return;
  const snapshot = loadBitmap ? undefined : prepared ?? prepareCustomMaterialTextureWork(resource.materialSpec);
  const preparedWork = snapshot === undefined ? undefined : customTexturePlans.get(snapshot);
  if (!loadBitmap && (!preparedWork || preparedWork.spec !== spec)) {
    const message = sanitizeDiagnosticText(`[CUSTOM_TEXTURE_ASSET_LOAD_FAILED] "${resource.name}": prepared material does not match; sampling the white fallback`);
    resource.textureWarnings.push(message);
    warn(message);
    return;
  }
  const ownedTextures: Texture[] = [];
  const ownedBitmaps: ImageBitmap[] = [];
  let cleanupUncertain = false;
  const disposeOwned = (): void => {
    const textures = ownedTextures.splice(0);
    const bitmaps = ownedBitmaps.splice(0);
    let failure: unknown;
    for (const texture of textures) { try { texture.dispose(); } catch (error) { cleanupUncertain = true; failure ??= error; } }
    for (const bitmap of bitmaps) { try { bitmap.close(); } catch (error) { cleanupUncertain = true; failure ??= error; } }
    if (failure !== undefined) throw failure;
  };
  const active = (): boolean => {
    try {
      return resource.material === material && resource.materialSpec?.custom === spec &&
        !material.disposed && !signal?.aborted && (isCurrentGeneration?.() ?? true);
    } catch { return false; }
  };
  let disposerAttached = false;
  const attachDisposer = (): void => {
    if (disposerAttached) return;
    const previous = resource.textureDisposer;
    resource.textureDisposer = () => { try { previous?.(); } finally { disposeOwned(); } };
    disposerAttached = true;
  };
  const discard = (texture: Texture | undefined, bitmap: ImageBitmap | undefined, retained: boolean): void => {
    if (retained) {
      const textureIndex = texture ? ownedTextures.indexOf(texture) : -1;
      const bitmapIndex = bitmap ? ownedBitmaps.indexOf(bitmap) : -1;
      // If disposal already drained the arrays, the resource was already freed.
      let failure: unknown;
      if (textureIndex >= 0) {
        ownedTextures.splice(textureIndex, 1);
        try { texture!.dispose(); } catch (error) { cleanupUncertain = true; failure ??= error; }
      }
      if (bitmapIndex >= 0) {
        ownedBitmaps.splice(bitmapIndex, 1);
        try { bitmap!.close(); } catch (error) { cleanupUncertain = true; failure ??= error; }
      }
      if (failure !== undefined) throw failure;
    } else {
      let failure: unknown;
      try { texture?.dispose(); } catch (error) { cleanupUncertain = true; failure ??= error; }
      try { bitmap?.close(); } catch (error) { cleanupUncertain = true; failure ??= error; }
      if (failure !== undefined) throw failure;
    }
  };
  const run = async (): Promise<void> => {
    for (const [publicName, uniform] of Object.entries(spec.uniforms ?? {})) {
      if (!active()) { disposeOwned(); return; }
      const value = isRecord(uniform) ? uniform.value : undefined;
      if (!isAssetTextureRef(value)) continue;
      const slot = preparedWork?.slots.get(publicName);
      const sameUniform = (): boolean => {
        try {
          const current = spec.uniforms?.[publicName];
          return isRecord(current) && current.value === value;
        } catch { return false; }
      };
      const planCurrent = (): boolean => !!loadBitmap ||
        (slot?.kind === "ready" && matchesPreparedBitmapAssetLoad(slot.plan, value));
      // A replaced uniform belongs to another material generation. Never use
      // this generation's captured plan or start a new fetch for it.
      if (!loadBitmap && (!slot || slot.asset !== value)) continue;
      if (loadBitmap ? !value.url : slot?.kind === "missing-url") {
        warn(sanitizeDiagnosticText(`[CUSTOM_TEXTURE_ASSET_URL_MISSING] "${resource.name}" uniform "${publicName}": asset "${value.id}" has no url; sampling the white fallback`));
        continue;
      }
      let bitmap: ImageBitmap | undefined;
      let texture: Texture | undefined;
      let retained = false;
      let settled: Promise<void> | undefined;
      try {
        if (loadBitmap) {
          // Preserve the legacy injected URL loader and its optional signal.
          bitmap = signal ? await loadBitmap(value.url, signal) : await loadBitmap(value.url);
        } else {
          if (slot?.kind === "failed") throw slot.error;
          if (!slot || slot.kind !== "ready") throw new Error("Custom texture plan is unavailable");
          if (!planCurrent()) throw new Error("Custom texture asset changed after preparation");
          const started = startBitmapAssetLoad(slot.plan, signal);
          settled = started.settled;
          bitmap = await started.result;
        }
        if (!active()) {
          const stale = bitmap; bitmap = undefined;
          discard(undefined, stale, false);
          disposeOwned();
          return;
        }
        if (!sameUniform()) {
          const stale = bitmap; bitmap = undefined;
          discard(undefined, stale, false);
          continue;
        }
        if (!planCurrent()) throw new Error("Custom texture asset changed after preparation");
        texture = new Texture({ width: bitmap.width, height: bitmap.height, source: bitmap, colorSpace: "linear", label: `${resource.name}-${publicName}` });
        if (!active()) {
          const staleTexture = texture, staleBitmap = bitmap; texture = undefined; bitmap = undefined;
          discard(staleTexture, staleBitmap, false);
          disposeOwned();
          return;
        }
        if (!sameUniform()) {
          const staleTexture = texture, staleBitmap = bitmap; texture = undefined; bitmap = undefined;
          discard(staleTexture, staleBitmap, false);
          continue;
        }
        if (!planCurrent()) throw new Error("Custom texture asset changed after preparation");
        ownedBitmaps.push(bitmap);
        ownedTextures.push(texture);
        retained = true;
        // Install ownership before publishing so reentrant disposal cannot
        // leave an already-bound texture without a cleanup path.
        attachDisposer();
        material.setParameter(customUniformNameFor(publicName), new TextureBinding({ name: publicName, texture, required: false }));
        if (!active()) { disposeOwned(); return; }
        try { onCommitted?.(); } catch { /* The installed binding remains valid. */ }
      } catch (error) {
        const failedTexture = texture, failedBitmap = bitmap; texture = undefined; bitmap = undefined;
        try { discard(failedTexture, failedBitmap, retained); } catch { /* Preserve the load/bind failure. */ }
        if (!active()) { disposeOwned(); return; }
        let detail = error instanceof Error ? error.message : String(error);
        for (const url of [slot?.url, value.url]) {
          if (typeof url === "string" && url) detail = detail.split(url).join("[asset URL redacted]");
        }
        const message = sanitizeDiagnosticText(`[CUSTOM_TEXTURE_ASSET_LOAD_FAILED] "${resource.name}" uniform "${publicName}": ${detail}; sampling the white fallback`);
        resource.textureWarnings.push(message);
        warn(message);
      } finally {
        // The subscriber can be cancelled before an uncooperative fetch or
        // decoder settles. Retain the renderer's queue slot until cleanup ends.
        if (settled) await settled;
      }
    }
    if (!active()) { disposeOwned(); return; }
    // Named once per resource: any texture2d uniform still without a texture samples the white fallback.
    for (const publicName of customTextureUniformNames(material)) {
      const binding = material.getParameter(customUniformNameFor(publicName));
      if (binding instanceof TextureBinding && !binding.texture) {
        const message = sanitizeDiagnosticText(`[CUSTOM_TEXTURE_UNBOUND] "${resource.name}" uniform "${publicName}" has no texture; the shader samples the white fallback`);
        resource.textureWarnings.push(message);
        warn(message);
      }
    }
  };
  try { await run(); }
  finally {
    // A thrown dispose/close leaves resource retirement unproven. The queue
    // must not reuse this slot as if the underlying work had fully settled.
    if (cleanupUncertain) await new Promise<void>(() => undefined);
  }
}

export function createModelCustomMaterialTextureWork(
  name: string,
  material: PortableShaderMaterial,
  materialSpec: AuraMaterialSpec,
  options: ModelCustomMaterialTextureOptions = {}
): ModelCustomMaterialTextureWork {
  const resource: CustomTextureResource = { name, material, materialSpec, textureWarnings: [] };
  const prepared = prepareCustomMaterialTextureWork(materialSpec, options.request, options.maxDimension);
  const warnings: string[] = [];
  const controller = new AbortController();
  let disposed = false;
  let cleanupFailed = false;
  let cleanupFailure: unknown;
  const dispose = (): void => {
    if (disposed) {
      if (cleanupFailed) throw cleanupFailure;
      return;
    }
    disposed = true;
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
    const release = resource.textureDisposer;
    resource.textureDisposer = undefined;
    try { release?.(); }
    catch (error) { cleanupFailed = true; cleanupFailure = error; throw error; }
  };
  const abort = (): void => {
    try { dispose(); }
    catch { warnings.push(sanitizeDiagnosticText(`[CUSTOM_TEXTURE_CLEANUP_FAILED] "${name}": texture cleanup failed`)); }
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const ready = disposed ? Promise.resolve() : bindResource(
    resource,
    (message) => { warnings.push(message); },
    undefined,
    controller.signal,
    undefined,
    () => !disposed,
    prepared
  );
  return { ready, warnings, dispose };
}

/** Loads and binds asset-ref textures for every primitive custom material (once per resource). */
export async function upgradeCustomMaterialTextures(
  entries: readonly ProductionRuntimePrimitiveEntry[],
  warn: (message: string) => void,
  loadBitmap?: BitmapLoader,
  signal?: AbortSignal,
  onCommitted?: () => void,
  isCurrentGeneration?: () => boolean,
  prepared?: PreparedCustomMaterialTextureWork
): Promise<void> {
  for (const entry of entries) {
    for (const resource of entry.resources) {
      if (signal?.aborted) return;
      const material = resource.material;
      if (passed.get(resource) === material) continue;
      passed.set(resource, material);
      await bindResource(resource, warn, loadBitmap, signal, onCommitted, isCurrentGeneration, prepared);
      if (signal?.aborted) {
        if (passed.get(resource) === material) passed.delete(resource);
        return;
      }
    }
  }
}
