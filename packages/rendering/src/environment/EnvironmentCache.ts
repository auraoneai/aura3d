/**
 * EnvironmentCache (PRD-02 §6.2/§8.7): keyed by `(url|preset, tier)`,
 * ref-counted. Only requests with an explicitly reusable opaque identity stay
 * resident after release. Other network acquisitions are private and are
 * disposed as soon as their last owner releases them.
 *
 * Resident limits (PRD §2216 / test contract): 3 normally; **2 on Medium when
 * any resident probe is RGBA16F** (the default storage format — so Medium is
 * effectively 2) and **always 2 on Ultra**. Neutral probes bypass the limit:
 * they are the fallback floor and are never evicted.
 *
 * `acquire` is async (fetch + decode + prefilter). While it resolves, the
 * caller keeps the previous probe bound (PRD §4: never a black frame).
 */

import type { RenderDevice } from "../RenderDevice.js";
import { Texture } from "../Texture.js";
import { isEnvironmentProbeFactoryPending, type EnvironmentProbe, type EnvironmentProbeFactory } from "../contracts/environment.js";
import { QUALITY_TIERS, type AuraQualityTier } from "../contracts/quality.js";
import { decodeHdrEquirect, hdrImageToRgba32f } from "./HdrEquirect.js";
import { readRgb9e5Cube } from "./Rgb9e5Cube.js";
import { buildNeutralFloorProbe, buildProbeFromLevels } from "./probeBuild.js";
import { whenFirstFramePresented } from "./FirstFrameGate.js";

export interface EnvironmentCacheKey {
  readonly url?: string;
  readonly preset?: string;
  readonly tier: AuraQualityTier;
  /** Opaque transport identity and its permission to share an acquisition. */
  readonly identity?: { readonly key: string; readonly reusable: boolean };
}

/** What the cache needs to produce a probe for a key. Injected per call site. */
export type EnvironmentProbeLoader = (key: EnvironmentCacheKey, signal?: AbortSignal) => Promise<EnvironmentProbe>;

interface CacheEntry {
  readonly key: string;
  readonly probe: EnvironmentProbe;
  readonly reusable: boolean;
  readonly tier: AuraQualityTier;
  refs: number;
  /** Monotonic LRU stamp. */
  touched: number;
}

interface CacheFlight {
  readonly promise: Promise<EnvironmentProbe>;
  readonly resolve: (probe: EnvironmentProbe) => void;
  readonly reject: (error: unknown) => void;
  readonly controller?: AbortController;
  waiters: number;
  probe?: EnvironmentProbe;
}

const NEUTRAL_TAG = "__neutral__";

function keyId(key: EnvironmentCacheKey): string {
  const source = key.url !== undefined ? ["url", key.url] : ["preset", key.preset ?? NEUTRAL_TAG];
  const embeddedNeutral = key.url === undefined && key.preset === "neutral";
  return JSON.stringify([source, key.tier, embeddedNeutral ? null : key.identity?.key ?? null]);
}

/** Resident limit per PRD: Ultra → 2; Medium → 2 when an RGBA16F probe is resident; else 3. */
export function environmentCacheLimit(tier: AuraQualityTier, hasRgba16fResident: boolean): number {
  if (tier === "ultra") return 2;
  if (tier === "medium" && hasRgba16fResident) return 2;
  return 3;
}

export class EnvironmentCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly neutralEntries = new Map<AuraQualityTier, CacheEntry>();
  private readonly inFlight = new Map<string, CacheFlight>();
  private clock = 0;
  private unsharedSequence = 0;
  private disposed = false;

  constructor(
    private readonly device: RenderDevice,
    private readonly factory: EnvironmentProbeFactory,
    private readonly loader?: EnvironmentProbeLoader
  ) {}

  /**
   * Acquire a probe. The loader defaults to `loadEnvironmentProbeKey` — preset
   * names resolve to baked `aura-environments/<name>` manifests, `url` fetches
   * an equirect HDR.
   */
  async acquire(key: EnvironmentCacheKey, loader?: EnvironmentProbeLoader, signal?: AbortSignal): Promise<EnvironmentProbe> {
    if (this.disposed) throw new Error("ENVIRONMENT_CACHE_DISPOSED");
    if (signal?.aborted) throw signal.reason ?? new Error("ENVIRONMENT_LOAD_ABORTED");
    if (key.url !== undefined && key.preset !== undefined) throw new Error("ENVIRONMENT_KEY_AMBIGUOUS");
    if (key.identity && (typeof key.identity.key !== "string" || !key.identity.key || typeof key.identity.reusable !== "boolean")) {
      throw new Error("ENVIRONMENT_IDENTITY_INVALID");
    }
    const embeddedNeutral = key.url === undefined && key.preset === "neutral";
    const reusable = embeddedNeutral || key.identity?.reusable === true;
    const base = keyId(key);
    const id = reusable ? base : JSON.stringify([base, ++this.unsharedSequence]);
    const live = this.entries.get(id);
    if (live) {
      live.refs += 1;
      live.touched = ++this.clock;
      if (!signal) return live.probe;
      return new Promise<EnvironmentProbe>((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          this.release(live.probe);
          reject(signal.reason ?? new Error("ENVIRONMENT_LOAD_ABORTED"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        void Promise.resolve().then(() => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          if (this.disposed) reject(new Error("ENVIRONMENT_CACHE_DISPOSED"));
          else resolve(live.probe);
        });
      });
    }
    const pending = this.inFlight.get(id);
    if (pending) return this.subscribe(id, pending, signal);

    let resolve!: (probe: EnvironmentProbe) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<EnvironmentProbe>((accept, fail) => { resolve = accept; reject = fail; });
    const controller = typeof AbortController === "function" ? new AbortController() : undefined;
    const flight: CacheFlight = { promise, resolve, reject, controller, waiters: 0 };
    this.inFlight.set(id, flight);
    const subscription = this.subscribe(id, flight, signal);
    const load = loader ?? this.loader ?? defaultProbeLoader(this.factory);
    let result: Promise<EnvironmentProbe>;
    try { result = Promise.resolve(load(key, controller?.signal)); }
    catch (error) { result = Promise.reject(error); }
    void result.then((probe) => {
      if (this.inFlight.get(id) === flight) this.inFlight.delete(id);
      if (this.disposed || flight.waiters === 0) {
        probe.dispose();
        flight.reject(new Error(this.disposed ? "ENVIRONMENT_CACHE_DISPOSED" : "ENVIRONMENT_LOAD_ABORTED"));
        return;
      }
      flight.probe = probe;
      this.entries.set(id, { key: id, probe, refs: flight.waiters, touched: ++this.clock, reusable, tier: key.tier });
      this.evictOverLimit(key.tier);
      flight.resolve(probe);
    }, (error: unknown) => {
      if (this.inFlight.get(id) === flight) this.inFlight.delete(id);
      flight.reject(error);
    }).catch((error: unknown) => flight.reject(error));
    return subscription;
  }

  private subscribe(id: string, flight: CacheFlight, signal?: AbortSignal): Promise<EnvironmentProbe> {
    flight.waiters += 1;
    return new Promise<EnvironmentProbe>((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        flight.waiters -= 1;
        if (flight.probe) this.release(flight.probe);
        else if (flight.waiters === 0) {
          if (this.inFlight.get(id) === flight) this.inFlight.delete(id);
          const reason = signal?.reason ?? new Error("ENVIRONMENT_LOAD_ABORTED");
          flight.controller?.abort(reason);
          flight.reject(reason);
        }
        reject(signal?.reason ?? new Error("ENVIRONMENT_LOAD_ABORTED"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      flight.promise.then((probe) => {
        if (settled) return;
        settled = true;
        cleanup();
        flight.waiters -= 1;
        if (this.disposed) { reject(new Error("ENVIRONMENT_CACHE_DISPOSED")); return; }
        resolve(probe);
      }, (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        flight.waiters -= 1;
        reject(error);
      });
    });
  }

  /**
   * Synchronous neutral floor (T0-25): an analytic constant probe matching the
   * baked `neutral` preset's diffuse DC — never runs the CPU GGX prefilter on
   * the main thread. Specular detail arrives via `acquire({preset:"neutral"})`.
   */
  neutral(tier: AuraQualityTier): EnvironmentProbe {
    if (this.disposed) throw new Error("ENVIRONMENT_CACHE_DISPOSED");
    const existing = this.neutralEntries.get(tier);
    if (existing) {
      existing.refs += 1;
      return existing.probe;
    }
    const probe = buildNeutralFloorProbe(QUALITY_TIERS[tier].environmentSize);
    this.neutralEntries.set(tier, { key: NEUTRAL_TAG, probe, refs: 1, touched: ++this.clock, reusable: true, tier });
    return probe;
  }

  /** A private probe is disposed at zero; reusable probes become eviction candidates. */
  release(probe: EnvironmentProbe): void {
    for (const entry of [...this.entries.values(), ...this.neutralEntries.values()]) {
      if (entry.probe === probe) {
        entry.refs = Math.max(0, entry.refs - 1);
        if (!entry.reusable && entry.refs === 0) {
          this.entries.delete(entry.key);
          entry.probe.dispose();
        } else if (entry.reusable && entry.refs === 0 && entry.key !== NEUTRAL_TAG) {
          this.evictOverLimit(entry.tier);
        }
        return;
      }
    }
  }

  refCount(probe: EnvironmentProbe): number {
    for (const entry of [...this.entries.values(), ...this.neutralEntries.values()]) {
      if (entry.probe === probe) return entry.refs;
    }
    return 0;
  }

  get residentCount(): number {
    return this.entries.size;
  }

  /** Evict oldest zero-ref entries until within the tier limit. */
  private evictOverLimit(tier: AuraQualityTier): void {
    const hasRgba16f = [...this.entries.values()].some(
      (e) => (e.probe as { specularCube?: { format?: string } }).specularCube?.format === "rgba16f"
    );
    const limit = environmentCacheLimit(tier, hasRgba16f);
    const evictable = [...this.entries.values()]
      .filter((e) => e.refs === 0)
      .sort((a, b) => a.touched - b.touched);
    while (this.entries.size > limit && evictable.length > 0) {
      const victim = evictable.shift()!;
      this.entries.delete(victim.key);
      victim.probe.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error("ENVIRONMENT_CACHE_DISPOSED");
    for (const flight of this.inFlight.values()) {
      flight.controller?.abort(error);
      flight.reject(error);
    }
    for (const e of this.entries.values()) e.probe.dispose();
    for (const e of this.neutralEntries.values()) e.probe.dispose();
    this.entries.clear();
    this.neutralEntries.clear();
    this.inFlight.clear();
  }
}

export interface BakedEnvironmentManifest {
  readonly name: string;
  readonly faceSize: number;
  readonly mipCount: number;
  readonly specular: string;
  readonly sh9: string;
  /** Optional hashes of the declared asset bytes; this does not authenticate the manifest. */
  readonly sha256?: {
    readonly specular: string;
    readonly sh9: string;
  };
}

const MAX_PRESET_MANIFEST_BYTES = 1024 * 1024;
const MAX_PRESET_CONTAINER_OVERHEAD_BYTES = 4 * 1024 * 1024;
const MAX_PRESET_STREAM_CHUNKS = 65_536;
const PRESET_SH9_BYTES = 27 * 4;

/** Bound the supported uncompressed cube payload and its container metadata. */
function presetCubeByteLimit(manifest: BakedEnvironmentManifest): number {
  let size = manifest.faceSize;
  let payloadBytes = 0;
  for (let level = 0; level < manifest.mipCount; level += 1) {
    payloadBytes += 6 * size * size * 4;
    size = Math.max(1, size / 2);
  }
  return payloadBytes + MAX_PRESET_CONTAINER_OVERHEAD_BYTES;
}

/** Preset manifests and their assets are local names, never arbitrary paths. */
function parsePresetManifest(bytes: Uint8Array, preset: string): BakedEnvironmentManifest {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`ENV_PRESET_INVALID:${preset}: manifest is not valid JSON`);
  }
  if (!value || typeof value !== "object") throw new Error(`ENV_PRESET_INVALID:${preset}: manifest must be an object`);
  const manifest = value as Partial<BakedEnvironmentManifest>;
  const assetName = (name: unknown): name is string => typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) && !name.includes("..");
  if (manifest.name !== preset || ![128, 256, 512, 1024].includes(manifest.faceSize ?? 0) ||
      !Number.isInteger(manifest.mipCount) || (manifest.mipCount ?? 0) < 1 ||
      (manifest.mipCount ?? 0) > Math.log2(manifest.faceSize ?? 1) + 1 ||
      !assetName(manifest.specular) || !assetName(manifest.sh9)) {
    throw new Error(`ENV_PRESET_INVALID:${preset}: expected matching name, supported faceSize, mipCount and local asset names`);
  }
  if (manifest.sha256 !== undefined) {
    const hashes: unknown = manifest.sha256;
    const validDigest = (digest: unknown): digest is string =>
      typeof digest === "string" && /^(?:sha256-)?[a-f0-9]{64}$/i.test(digest);
    if (!hashes || typeof hashes !== "object" || Array.isArray(hashes) ||
        !validDigest((hashes as Record<string, unknown>).specular) ||
        !validDigest((hashes as Record<string, unknown>).sh9)) {
      throw new Error(`ENV_PRESET_INVALID:${preset}: sha256 must declare valid specular and sh9 digests`);
    }
  }
  return manifest as BakedEnvironmentManifest;
}

/** Match bytes to the supplied manifest; a manifest itself still needs a trusted source. */
async function verifiedPresetBytes(bytes: Uint8Array, digest: string, preset: string, asset: "specular" | "sh9"): Promise<Uint8Array> {
  let subtle: SubtleCrypto | undefined;
  try { subtle = globalThis.crypto?.subtle; } catch { /* An unavailable crypto provider fails closed below. */ }
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error(`ENV_PRESET_INTEGRITY_UNAVAILABLE:${preset}: SHA-256 is required for ${asset}`);
  }
  // Decode the same private byte snapshot that was hashed, even if a custom
  // fetch provider retains and later mutates the original response buffer.
  const snapshot = new Uint8Array(bytes);
  let result: ArrayBuffer;
  try { result = await subtle.digest("SHA-256", snapshot.buffer); }
  catch { throw new Error(`ENV_PRESET_INTEGRITY_UNAVAILABLE:${preset}: SHA-256 failed for ${asset}`); }
  if (!result || result.byteLength !== 32) {
    throw new Error(`ENV_PRESET_INTEGRITY_UNAVAILABLE:${preset}: SHA-256 returned an invalid digest for ${asset}`);
  }
  const actual = Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== digest.replace(/^sha256-/i, "").toLowerCase()) {
    throw new Error(`ENV_PRESET_INTEGRITY:${preset}: ${asset} SHA-256 mismatch`);
  }
  return snapshot;
}

function presetAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("ENV_PRESET_REQUEST_ABORTED");
}

/** Stop waiting on a provider even if it ignores abort; dispose a late response. */
function awaitPresetOperation<T>(pending: Promise<T>, signal?: AbortSignal, onLateValue?: (value: T) => void): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(presetAbortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.then((value) => {
      if (settled) {
        try { onLateValue?.(value); } catch { /* Best-effort cleanup after abort. */ }
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}

function discardPresetResponse(res: Response): void {
  try { if (res.body && !res.body.locked) void res.body.cancel().catch(() => {}); } catch { /* Best-effort cleanup. */ }
}

/** Read a bounded response without waiting for an oversized stream to finish. */
async function readBoundedResponse(res: Response, url: string, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  const tooLarge = () => new Error(`ENV_FETCH_TOO_LARGE:${url}: limit ${maxBytes} bytes`);
  const body = res.body;
  if (signal?.aborted) {
    discardPresetResponse(res);
    throw presetAbortReason(signal);
  }
  const lengthHeader = res.headers?.get("content-length")?.trim();
  if (lengthHeader && /^\d+$/.test(lengthHeader)) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length > maxBytes) {
      try { if (body && !body.locked) void body.cancel().catch(() => {}); } catch { /* Preserve the size error. */ }
      throw tooLarge();
    }
  }
  if (!body || typeof body.getReader !== "function") {
    // Compatibility with non-stream providers: validate their returned body,
    // although arrayBuffer() itself may allocate it before this check.
    const bytes = new Uint8Array(await awaitPresetOperation(res.arrayBuffer(), signal));
    if (bytes.byteLength > maxBytes) throw tooLarge();
    return bytes;
  }
  const reader = body.getReader();
  let buffer = new Uint8Array(0);
  let total = 0;
  let chunkCount = 0;
  let cancelled = false;
  const cancelReader = (reason: unknown) => {
    if (cancelled) return;
    cancelled = true;
    try { void reader.cancel(reason).catch(() => {}); } catch { /* Preserve the original failure. */ }
  };
  const onAbort = () => cancelReader(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw presetAbortReason(signal);
      const { done, value } = await awaitPresetOperation(reader.read(), signal);
      if (signal?.aborted) throw presetAbortReason(signal);
      if (done) break;
      if (!value || !ArrayBuffer.isView(value) || Object.prototype.toString.call(value) !== "[object Uint8Array]") {
        throw new Error(`ENV_FETCH_INVALID_STREAM:${url}: expected byte chunks`);
      }
      chunkCount += 1;
      if (chunkCount > MAX_PRESET_STREAM_CHUNKS) {
        throw new Error(`ENV_FETCH_INVALID_STREAM:${url}: too many chunks`);
      }
      if (value.byteLength > maxBytes - total) throw tooLarge();
      const required = total + value.byteLength;
      if (required > buffer.byteLength) {
        const capacity = Math.min(maxBytes, Math.max(required, buffer.byteLength ? buffer.byteLength * 2 : 4096));
        const grown = new Uint8Array(capacity);
        grown.set(buffer.subarray(0, total));
        buffer = grown;
      }
      // A custom stream may reuse its backing buffer on the next read.
      buffer.set(value, total);
      total += value.byteLength;
    }
  } catch (error) {
    cancelReader(error);
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try { reader.releaseLock(); } catch { /* A nonconforming provider may retain a pending read. */ }
  }
  return buffer.subarray(0, total);
}

async function fetchBytes(url: string, maxBytes?: number, signal?: AbortSignal): Promise<Uint8Array> {
  // Dev servers with SPA fallback answer unknown asset paths with
  // `text/html` + 200 — a poisoned payload must count as a fetch failure so
  // the neutral-floor fallback engages instead of crashing on parse.
  const isHtmlPayload = (res: Response) =>
    (res.headers?.get("content-type") ?? "").includes("text/html");
  let res = await awaitPresetOperation(signal ? fetch(url, { signal }) : fetch(url), signal, discardPresetResponse);
  if ((!res.ok || isHtmlPayload(res)) && !url.startsWith("/") && !/^https?:\/\//.test(url)) {
    const rootRes = await awaitPresetOperation(signal ? fetch(`/${url}`, { signal }) : fetch(`/${url}`), signal, discardPresetResponse);
    if (rootRes.ok && !isHtmlPayload(rootRes)) res = rootRes;
  }
  if (signal?.aborted) { discardPresetResponse(res); throw presetAbortReason(signal); }
  if (!res.ok || isHtmlPayload(res)) {
    if (signal) discardPresetResponse(res);
    throw new Error(`ENV_FETCH_FAILED:${url}:${res.status}`);
  }
  if (maxBytes !== undefined) return readBoundedResponse(res, url, maxBytes, signal);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Default key → probe loader. `preset` reads the day-0 baked bundles under
 * `aura-environments/<name>/` (manifest + RGB9E5 specular cube + baked SH9 —
 * already prefiltered, uploaded as RGBA16F until Q-06-1 native RGB9_E5 lands);
 * `url` fetches an equirect .hdr and runs `factory.fromEquirect`.
 *
 * `factory` may be a getter, resolved when a load runs rather than when the
 * loader is built, so a C-09 provider that registers after the scene compiles
 * is still used. While the factory is the pending stub, an HDRI load rejects
 * with `ENVIRONMENT_PROBE_PENDING:fromEquirect` before fetching anything; the
 * caller keeps the neutral floor bound (see `bindPrd02EnvironmentProbe`).
 */
/**
 * Face size for an HDRI probe: three r185's PMREM sizing (cube = equirect
 * width / 4, so 256 for a 1k HDRI), capped by the tier's environment size and
 * by 256 while the GGX prefilter is CPU-only on the main thread. A 1024 face
 * at Ultra took seconds and delayed the first draw of HDRI scenes
 * (lighting+compiler games: ~3 s → 8-9 s, run 38182457655).
 */
export function hdriProbeFaceSize(equirectWidth: number, tier: AuraQualityTier): EnvironmentProbe["faceSize"] {
  const target = Math.min(equirectWidth / 4, QUALITY_TIERS[tier]?.environmentSize ?? 256, 256);
  return (target >= 256 ? 256 : 128) as EnvironmentProbe["faceSize"];
}

/** Resolve after two animation frames (immediately where there is no rAF, e.g. Node tests). */
function afterFirstFrames(): Promise<void> {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
  if (typeof raf !== "function") return Promise.resolve();
  return new Promise((resolve) => raf(() => raf(() => resolve())));
}

export interface EnvironmentProbeLoaderOptions {
  /** Request-aware transport; the loader retains its own per-file byte bounds. */
  readonly fetchBytes?: (url: string, maxBytes?: number, signal?: AbortSignal) => Promise<Uint8Array>;
}

export function defaultProbeLoader(
  factory: EnvironmentProbeFactory | (() => EnvironmentProbeFactory),
  options: EnvironmentProbeLoaderOptions = {}
): EnvironmentProbeLoader {
  const resolveFactory = (): EnvironmentProbeFactory => (typeof factory === "function" ? factory() : factory);
  const readBytes = options.fetchBytes ?? fetchBytes;
  return async (key, signal) => {
    if (signal?.aborted) throw presetAbortReason(signal);
    if (key.preset === "neutral") {
      // Default environment: embedded, so a published-package app needs no /aura-environments fetch or copied file.
      // The chunk is requested at once (network, no CPU), but decoding it is tens of ms of main-thread work that the first
      // frame does not need: that frame is lit by the synchronous analytic floor, and the baked cube is built after it.
      const loaderModule = import("./neutralEmbeddedLoader.js");
      await awaitPresetOperation(whenFirstFramePresented(), signal);
      const { loadEmbeddedNeutralProbe } = await awaitPresetOperation(loaderModule, signal);
      if (signal?.aborted) throw presetAbortReason(signal);
      return loadEmbeddedNeutralProbe();
    }
    if (key.preset) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key.preset)) {
        throw new Error(`ENV_PRESET_INVALID:${key.preset}: use a local preset name`);
      }
      let manifestBytes: Uint8Array;
      try {
        manifestBytes = await readBytes(`/aura-environments/${key.preset}.manifest.json`, MAX_PRESET_MANIFEST_BYTES, signal);
      } catch (error) {
        if (signal?.aborted) throw presetAbortReason(signal);
        throw new Error(`ENV_PRESET_UNAVAILABLE:${key.preset}: install the preset manifest and assets under /aura-environments, or use neutral. ${error instanceof Error ? error.message : "fetch failed"}`);
      }
      const manifest = parsePresetManifest(manifestBytes, key.preset);
      let ktx2: Uint8Array;
      let sh9Bytes: Uint8Array;
      // Preset assets are independent, but a failed sibling should stop
      // outstanding fetches and reads. Older hosts without AbortController
      // retain the previous loading behavior.
      const abort = typeof AbortController === "function" ? new AbortController() : undefined;
      const onAbort = () => abort?.abort(signal?.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      try {
        [ktx2, sh9Bytes] = await Promise.all([
          readBytes(`/aura-environments/${manifest.specular}`, presetCubeByteLimit(manifest), abort?.signal ?? signal),
          readBytes(`/aura-environments/${manifest.sh9}`, PRESET_SH9_BYTES, abort?.signal ?? signal)
        ]);
      } catch (error) {
        abort?.abort(error);
        if (signal?.aborted) throw presetAbortReason(signal);
        throw new Error(`ENV_PRESET_UNAVAILABLE:${key.preset}: install both assets named by the manifest under /aura-environments, or use neutral. ${error instanceof Error ? error.message : "fetch failed"}`);
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
      if (signal?.aborted) throw presetAbortReason(signal);
      if (manifest.sha256) {
        [ktx2, sh9Bytes] = await Promise.all([
          verifiedPresetBytes(ktx2, manifest.sha256.specular, key.preset, "specular"),
          verifiedPresetBytes(sh9Bytes, manifest.sha256.sh9, key.preset, "sh9")
        ]);
      }
      if (signal?.aborted) throw presetAbortReason(signal);
      const cube = readRgb9e5Cube(ktx2);
      if (cube.faceSize !== manifest.faceSize || cube.mipCount !== manifest.mipCount) {
        throw new Error(`ENV_PRESET_INVALID:${key.preset}: cube dimensions do not match the manifest`);
      }
      if (sh9Bytes.byteLength !== PRESET_SH9_BYTES) throw new Error(`ENV_PRESET_INVALID:${key.preset}: SH9 must contain 27 float32 values`);
      const shView = new DataView(sh9Bytes.buffer, sh9Bytes.byteOffset, sh9Bytes.byteLength);
      const sh9 = Float32Array.from({ length: 27 }, (_, i) => shView.getFloat32(i * 4, true));
      if (!sh9.every(Number.isFinite)) throw new Error(`ENV_PRESET_INVALID:${key.preset}: SH9 values must be finite`);
      const levels = cube.levels.map((faces, i) => ({ faceSize: Math.max(1, cube.faceSize >> i), faces }));
      return buildProbeFromLevels(levels, manifest.faceSize as EnvironmentProbe["faceSize"], {
        source: "preset",
        sh9,
        label: `env-preset-${key.preset}`
      });
    }
    if (key.url) {
      if (isEnvironmentProbeFactoryPending(resolveFactory())) throw new Error("ENVIRONMENT_PROBE_PENDING:fromEquirect");
      const bytes = await readBytes(key.url, undefined, signal);
      // The decode + CPU GGX prefilter run on the main thread: let the first
      // frames (drawn with the neutral floor) present before the work starts.
      await awaitPresetOperation(afterFirstFrames(), signal);
      const image = decodeHdrEquirect(bytes);
      // #1153: decode yields RGB; rgba32f needs 4 floats per texel.
      const src = new Texture({ width: image.width, height: image.height, format: "rgba32f", data: hdrImageToRgba32f(image), label: `env-src-${key.url}` });
      try {
        const probe = resolveFactory().fromEquirect(src, { faceSize: hdriProbeFaceSize(image.width, key.tier) });
        if (probe.background !== src) src.dispose();
        return probe;
      } catch (error) {
        src.dispose();
        throw error;
      }
    }
    throw new Error("ENVIRONMENT_KEY_EMPTY: acquire() needs url or preset");
  };
}
