import { mergeAssetRequestOptions, type AssetIntegrity, type AssetRequestOptions } from "@aura3d/assets/browser";
import type { NativeImageAsset } from "@aura3d/assets/importers";
import type { RenderDevice, Texture } from "@aura3d/rendering";
import { prepareNativeTextureLoad, startNativeTextureLoad } from "../nodes/loadNativeTexture.js";
import { texture, type TextureHandle } from "../nodes/texture.js";
import type { AuraAssetRef } from "../nodes/types.js";

// A single scene-owned, base-level image is deliberately narrower than the
// general texture API. These caps include decode and the integrity snapshot.
const MAX_DIMENSION = 2048;
const MAX_PIXELS = 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_DECODED_BYTES = 4 * 1024 * 1024;
const MAX_FRAME_LEASES = 128;

export interface ProjectedSpotFrameIdentity {
  readonly device: RenderDevice;
  readonly owner: object;
  readonly viewId: string | number;
  readonly frameIndex: number;
}

/** A successfully acquired lease must be finished after the device frame ends. */
export interface ProjectedSpotFrameLease {
  readonly texture: Texture;
  /** Recheck before submission using the texture revision and frame identity. */
  isCurrent(identity: ProjectedSpotFrameIdentity): boolean;
  /**
   * Returns false while any device frame is active; retry after endFrame.
   * True means retirement was scheduled, not that the GPU has completed it.
   */
  release(): boolean;
}

export interface ProjectedSpotResourceOptions {
  readonly device: RenderDevice;
  readonly owner: object;
  readonly request?: AssetRequestOptions;
  readonly signal?: AbortSignal;
  /** Caller/device limit; may only reduce the 2048-pixel hard limit. */
  readonly maxDimension?: number;
}

export interface ProjectedSpotResource {
  /** Resolves after the verified texture is available; rejects on acquisition failure. */
  readonly ready: Promise<void>;
  /** Resolves after acquisition and its underlying transport work have settled. */
  readonly settled: Promise<void>;
  readonly state: "pending" | "ready" | "failed" | "disposed";
  /** True only for the original asset reference with unchanged transport identity. */
  matchesAsset(asset: AuraAssetRef<"texture">): boolean;
  acquireFrame(identity: ProjectedSpotFrameIdentity): ProjectedSpotFrameLease | undefined;
  /** Stop admission and cancel loading. Existing frame leases retain the texture. */
  dispose(): void;
}

interface AssetSnapshot {
  readonly kind: AuraAssetRef<"texture">["kind"];
  readonly type: AuraAssetRef<"texture">["type"];
  readonly id: string;
  readonly url: string;
  readonly format: string;
  readonly hash?: string;
  readonly sha256?: string;
  readonly integrity?: AssetIntegrity;
  readonly request?: AssetRequestOptions;
}

function copyIntegrity(value: AssetIntegrity | undefined): AssetIntegrity | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (value.dependencies !== undefined && (!value.dependencies || typeof value.dependencies !== "object" || Array.isArray(value.dependencies)))) {
    throw new TypeError("Invalid projected spot asset integrity");
  }
  return {
    version: value.version,
    digest: value.digest,
    ...(value.requireDependencies === undefined ? {} : { requireDependencies: value.requireDependencies }),
    ...(value.dependencies === undefined ? {} : { dependencies: { ...value.dependencies } })
  };
}

function snapshotAsset(asset: AuraAssetRef<"texture">): AssetSnapshot {
  if (!asset || typeof asset !== "object") throw new TypeError("Projected spot requires a typed texture asset");
  // Validate before copying: spreading an invalid dependency array into an
  // object would otherwise accidentally turn a malformed policy into a valid one.
  const requestIntegrity = copyIntegrity(asset.request?.integrity);
  const request = asset.request === undefined ? undefined : mergeAssetRequestOptions({}, asset.request);
  return {
    kind: asset.kind, type: asset.type, id: asset.id, url: asset.url, format: asset.format,
    ...(asset.hash === undefined ? {} : { hash: asset.hash }),
    ...(asset.sha256 === undefined ? {} : { sha256: asset.sha256 }),
    ...(asset.integrity === undefined ? {} : { integrity: copyIntegrity(asset.integrity) }),
    ...(request === undefined ? {} : { request: { ...request, ...(requestIntegrity === undefined ? {} : { integrity: requestIntegrity }) } })
  };
}

/** Keep policy values private; they are used for equality, never diagnostics. */
function snapshotKey(asset: AssetSnapshot): string {
  const request = asset.request;
  const headers: [string, string][] = [];
  if (request?.headers !== undefined) new Headers(request.headers).forEach((value, name) => { headers.push([name, value]); });
  headers.sort(([a], [b]) => a.localeCompare(b));
  const integrityKey = (value: AssetIntegrity | undefined) => value === undefined ? null : {
    version: value.version, digest: value.digest, requireDependencies: value.requireDependencies,
    dependencies: Object.entries(value.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))
  };
  return JSON.stringify({
    kind: asset.kind, type: asset.type, id: asset.id, url: asset.url, format: asset.format,
    hash: asset.hash, sha256: asset.sha256, integrity: integrityKey(asset.integrity),
    request: request === undefined ? null : {
      credentials: request.credentials, headers, cache: request.cache, priority: request.priority,
      mode: request.mode, redirect: request.redirect, referrerPolicy: request.referrerPolicy,
      allowedOrigins: request.allowedOrigins ? [...request.allowedOrigins].sort() : null,
      sourceOrigin: request.sourceOrigin, expectedUrl: request.expectedUrl, maxBytes: request.maxBytes,
      integrity: integrityKey(request.integrity)
    }
  });
}

function makeProjectedTexture(image: NativeImageAsset, maxDimension: number): TextureHandle {
  if (image.format !== "pvr" || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      image.width < 1 || image.height < 1 || image.width > maxDimension || image.height > maxDimension ||
      image.levels.length !== 1 || image.levels[0]?.encoding !== "rgba8") {
    throw new Error("Projected spot requires one bounded RGBA8 PVR image level");
  }
  // Native conversion rejects unknown orientation and normalizes supported
  // premultiplied pixels. Projection ignores alpha, so transparent source
  // colors (especially at alpha zero) cannot be recovered reliably.
  const handle = texture.fromNativeImage(image, { maxDecodedBytes: MAX_DECODED_BYTES });
  const pixelFormat = image.metadata.pixelFormat;
  const premultiplied = (typeof image.metadata.flags === "number" && (image.metadata.flags & 2) !== 0)
    || (Array.isArray(pixelFormat) && pixelFormat[1] === 0 && (pixelFormat[0] === 8 || pixelFormat[0] === 10));
  const pixels = handle.texture.mipLevels[0]?.data;
  if (premultiplied && (!(pixels instanceof Uint8Array) || pixels.some((value, index) => index % 4 === 3 && value !== 255))) {
    handle.dispose();
    throw new Error("Projected spot requires fully opaque premultiplied PVR pixels");
  }
  if (handle.texture.format !== "rgba8" || handle.texture.dimension !== "2d" ||
      handle.texture.mipLevelCount !== 1 || handle.texture.generateMipmaps || handle.texture.flipY ||
      handle.repeat[0] !== 1 || handle.repeat[1] !== 1 || handle.offset[0] !== 0 || handle.offset[1] !== 0) {
    handle.dispose();
    throw new Error("Projected spot PVR orientation or texture format is unsupported");
  }
  return handle;
}

interface FrameRecord {
  readonly identity: ProjectedSpotFrameIdentity;
  readonly token: object;
  readonly texture: Texture;
  phase: "active" | "fencing" | "released";
}

/**
 * Acquire one typed PVR texture for a renderer owner. This helper is internal:
 * it neither installs a projected-light shader nor admits a rendering path.
 * Replacing the asset, device generation, or size requires a new resource.
 */
export function createProjectedSpotResource(
  asset: AuraAssetRef<"texture">,
  options: ProjectedSpotResourceOptions
): ProjectedSpotResource {
  const { device, owner } = options;
  if (!owner || (typeof owner !== "object" && typeof owner !== "function")) throw new TypeError("Projected spot requires a renderer owner");
  const generation = device?.generation;
  const completionDevice = device as RenderDevice & { supportsSubmittedWorkCompletion?: () => boolean };
  if (!device || device.kind !== "webgl2" || device.disposed || device.contextLost ||
      !Number.isSafeInteger(generation) || (generation as number) < 0 ||
      typeof device.onDeviceLost !== "function" || typeof device.waitForSubmittedWork !== "function" ||
      typeof completionDevice.supportsSubmittedWorkCompletion !== "function") {
    throw new Error("Projected spot requires a live WebGL2 device with frame completion support");
  }
  const maxDimension = options.maxDimension ?? MAX_DIMENSION;
  if (!Number.isSafeInteger(maxDimension) || maxDimension < 1 || maxDimension > MAX_DIMENSION) {
    throw new RangeError(`Projected spot maxDimension must be an integer from 1 to ${MAX_DIMENSION}`);
  }
  const capturedAsset = snapshotAsset(asset);
  const assetKey = snapshotKey(capturedAsset);
  // Compare the authentication generation separately so its raw value is
  // never incorporated into a serialized identity or diagnostic.
  const matchesSnapshot = (candidate: AssetSnapshot): boolean =>
    candidate.request?.securityContext === capturedAsset.request?.securityContext && snapshotKey(candidate) === assetKey;
  // The plan sees the same copied fields used for source-current checks.
  const plan = prepareNativeTextureLoad(capturedAsset as unknown as AuraAssetRef<"texture">, {
    ...(options.request === undefined ? {} : { request: options.request }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    maxFileBytes: MAX_FILE_BYTES,
    maxPixels: Math.min(MAX_PIXELS, maxDimension * maxDimension),
    maxDecodedBytes: MAX_DECODED_BYTES,
    maxMipLevels: 1
  });
  if (!matchesSnapshot(snapshotAsset(asset))) throw new Error("Projected spot asset changed while preparing its request");

  const controller = new AbortController();
  const records = new Set<FrameRecord>();
  let state: ProjectedSpotResource["state"] = "pending";
  let closed = false;
  let invalidated = false;
  let owned: TextureHandle | undefined;
  let pixelSnapshot: Uint8Array | undefined;
  let textureRevision = 0;
  let textureColorSpace: "srgb" | "linear" | undefined;
  let textureWidth = 0;
  let textureHeight = 0;
  let sourceLevel: object | undefined;
  let sourcePixels: Uint8Array | undefined;
  let unsubscribeLoss: (() => void) | undefined;

  function detachListeners(): void {
    options.signal?.removeEventListener("abort", abort);
    const unsubscribe = unsubscribeLoss;
    unsubscribeLoss = undefined;
    unsubscribe?.();
  }

  function retireIfUnused(): void {
    if (!closed || records.size) return;
    const handle = owned;
    owned = undefined;
    pixelSnapshot = undefined;
    sourceLevel = undefined;
    sourcePixels = undefined;
    try { handle?.dispose(); } finally { detachListeners(); }
  }

  function dispose(): void {
    if (!closed) {
      closed = true;
      state = "disposed";
      controller.abort();
    }
    retireIfUnused();
  }

  function invalidate(): void {
    if (invalidated) return;
    invalidated = true;
    closed = true;
    state = "disposed";
    controller.abort();
    for (const record of records) record.phase = "released";
    records.clear();
    retireIfUnused();
  }

  function abort(): void { dispose(); }

  function deviceCurrent(): boolean {
    try {
      if (invalidated || device.disposed || device.contextLost || device.generation !== generation) {
        invalidate();
        return false;
      }
      return true;
    } catch {
      // A failing device accessor is not evidence of context loss; retain any
      // in-flight texture rather than retiring it without a completion proof.
      return false;
    }
  }

  function matchesAsset(candidate: AuraAssetRef<"texture">): boolean {
    if (closed || candidate !== asset) return false;
    try { return matchesSnapshot(snapshotAsset(candidate)); } catch { return false; }
  }

  function textureCurrent(): boolean {
    try {
      if (closed || state !== "ready" || !owned || !pixelSnapshot || !sourcePixels || !deviceCurrent() || !matchesAsset(asset)) return false;
      const current = owned.texture;
      const level = current.getMipLevel(0);
      if (current.disposed || current.dimension !== "2d" || current.format !== "rgba8" ||
          current.width !== textureWidth || current.height !== textureHeight ||
          current.colorSpace !== textureColorSpace || current.revision !== textureRevision || current.flipY ||
          current.generateMipmaps || current.dynamic || current.mipLevelCount !== 1 || current.mipLevels.length !== 1 ||
          current.source !== null || !current.usage.includes("sampled") || !current.usage.includes("copy-dst") ||
          !level || level !== sourceLevel || level.data !== sourcePixels || level.width !== current.width || level.height !== current.height ||
          sourcePixels.length !== pixelSnapshot.length) return false;
      // Texture mutation must use its revisioned update API. Direct writes to
      // exposed raw arrays without the documented update signal are unsupported.
      return !closed && deviceCurrent() && matchesAsset(asset);
    } catch { return false; }
  }

  function finish(record: FrameRecord): void {
    if (record.phase === "released") return;
    record.phase = "released";
    records.delete(record);
    retireIfUnused();
  }

  function release(record: FrameRecord): boolean {
    if (record.phase !== "active") return true;
    if (!deviceCurrent()) return !records.has(record);
    // A later frame can already be active; only fence after it too has ended.
    try { if (device.activeFrameToken !== null) return false; } catch { return false; }
    record.phase = "fencing";
    try {
      const completion = device.waitForSubmittedWork?.();
      if (completion && typeof completion.then === "function") {
        void completion.then(() => { deviceCurrent(); finish(record); }, () => { deviceCurrent(); }).catch(() => undefined);
      }
      // A failed or absent fence is not evidence of completion. Keep this
      // lease and its loss listener until device loss/teardown.
    } catch { deviceCurrent(); }
    return true;
  }

  function acquireFrame(identity: ProjectedSpotFrameIdentity): ProjectedSpotFrameLease | undefined {
    try {
      if (!identity || identity.device !== device || identity.owner !== owner ||
          !(typeof identity.viewId === "string" || (typeof identity.viewId === "number" && Number.isFinite(identity.viewId))) ||
          !Number.isSafeInteger(identity.frameIndex) || identity.frameIndex < 0 || records.size >= MAX_FRAME_LEASES ||
          !textureCurrent()) return undefined;
      const token = device.activeFrameToken;
      if (!token || completionDevice.supportsSubmittedWorkCompletion?.() !== true ||
          device.activeFrameToken !== token || !textureCurrent() || !owned) return undefined;
      const record: FrameRecord = { identity: { ...identity }, token, texture: owned.texture, phase: "active" };
      records.add(record);
      return Object.freeze({
        texture: record.texture,
        isCurrent: (current: ProjectedSpotFrameIdentity): boolean => {
          try {
            return record.phase === "active" && current.device === device && current.owner === owner &&
              current.viewId === record.identity.viewId && current.frameIndex === record.identity.frameIndex &&
              device.activeFrameToken === token && textureCurrent() && record.phase === "active" && device.activeFrameToken === token;
          } catch { return false; }
        },
        release: (): boolean => release(record)
      });
    } catch { return undefined; }
  }

  const unsubscribe = device.onDeviceLost(invalidate);
  if (invalidated) unsubscribe();
  else unsubscribeLoss = unsubscribe;
  if (!closed) {
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
  }

  const started = startNativeTextureLoad(plan, controller.signal, (image) => makeProjectedTexture(image, maxDimension));
  const ready = started.result.then((handle) => {
    if (closed || !deviceCurrent() || !matchesAsset(asset)) {
      handle.dispose();
      throw new Error("Projected spot resource was retired or changed during acquisition");
    }
    const current = handle.texture;
    const level = current.getMipLevel(0);
    if (!level || !(level.data instanceof Uint8Array) || level.data.length !== current.width * current.height * 4) {
      handle.dispose();
      throw new Error("Projected spot texture has invalid RGBA8 bytes");
    }
    try {
      const pixels = level.data.slice();
      owned = handle;
      textureRevision = current.revision;
      textureColorSpace = current.colorSpace;
      textureWidth = current.width;
      textureHeight = current.height;
      sourceLevel = level;
      sourcePixels = level.data;
      pixelSnapshot = pixels;
      state = "ready";
    } catch (error) {
      handle.dispose();
      throw error;
    }
  }).catch((error: unknown) => {
    if (!closed) {
      state = "failed";
      detachListeners();
    }
    throw error;
  });
  // The scene can subscribe after construction without an unhandled rejection.
  void ready.catch(() => undefined);
  const settled = Promise.all([started.settled, ready.then(() => undefined, () => undefined)]).then(() => undefined);

  return Object.freeze({
    ready, settled,
    get state() { return state; },
    matchesAsset, acquireFrame, dispose
  });
}
