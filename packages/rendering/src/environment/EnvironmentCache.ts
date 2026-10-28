/**
 * EnvironmentCache (PRD-02 §6.2/§8.7): keyed by `(url|preset, tier)`,
 * ref-counted. Probes released to 0 references stay resident for reuse until
 * the LRU limit forces eviction (`dispose()` then runs).
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
}

/** What the cache needs to produce a probe for a key. Injected per call site. */
export type EnvironmentProbeLoader = (key: EnvironmentCacheKey) => Promise<EnvironmentProbe>;

interface CacheEntry {
  readonly key: string;
  readonly probe: EnvironmentProbe;
  refs: number;
  /** Monotonic LRU stamp. */
  touched: number;
}

const NEUTRAL_TAG = "__neutral__";

function keyId(key: EnvironmentCacheKey): string {
  return `${key.url ?? `preset:${key.preset ?? NEUTRAL_TAG}`}@${key.tier}`;
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
  private readonly inFlight = new Map<string, Promise<EnvironmentProbe>>();
  private clock = 0;

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
  async acquire(key: EnvironmentCacheKey, loader?: EnvironmentProbeLoader): Promise<EnvironmentProbe> {
    const id = keyId(key);
    const live = this.entries.get(id);
    if (live) {
      live.refs += 1;
      live.touched = ++this.clock;
      return live.probe;
    }
    let promise = this.inFlight.get(id);
    if (!promise) {
      const load = loader ?? this.loader ?? defaultProbeLoader(this.factory);
      promise = load(key).then((probe) => {
        this.entries.set(id, { key: id, probe, refs: 1, touched: ++this.clock });
        this.inFlight.delete(id);
        this.evictOverLimit(key.tier);
        return probe;
      });
      this.inFlight.set(id, promise);
      // Avoid unhandled rejection on racing callers: a failed load removes itself.
      promise.catch(() => this.inFlight.delete(id));
    }
    return promise;
  }

  /**
   * Synchronous neutral floor (T0-25): an analytic constant probe matching the
   * baked `neutral` preset's diffuse DC — never runs the CPU GGX prefilter on
   * the main thread. Specular detail arrives via `acquire({preset:"neutral"})`.
   */
  neutral(tier: AuraQualityTier): EnvironmentProbe {
    const existing = this.neutralEntries.get(tier);
    if (existing) {
      existing.refs += 1;
      return existing.probe;
    }
    const probe = buildNeutralFloorProbe(QUALITY_TIERS[tier].environmentSize);
    this.neutralEntries.set(tier, { key: NEUTRAL_TAG, probe, refs: 1, touched: ++this.clock });
    return probe;
  }

  /** Decrement a probe's refcount; at 0 it becomes an eviction candidate. */
  release(probe: EnvironmentProbe): void {
    for (const entry of [...this.entries.values(), ...this.neutralEntries.values()]) {
      if (entry.probe === probe) {
        entry.refs = Math.max(0, entry.refs - 1);
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
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  // Dev servers with SPA fallback answer unknown asset paths with
  // `text/html` + 200 — a poisoned payload must count as a fetch failure so
  // the neutral-floor fallback engages instead of crashing on parse.
  const isHtmlPayload = (res: Response) =>
    (res.headers?.get("content-type") ?? "").includes("text/html");
  let res = await fetch(url);
  if ((!res.ok || isHtmlPayload(res)) && !url.startsWith("/") && !/^https?:\/\//.test(url)) {
    const rootRes = await fetch(`/${url}`);
    if (rootRes.ok && !isHtmlPayload(rootRes)) res = rootRes;
  }
  if (!res.ok || isHtmlPayload(res)) throw new Error(`ENV_FETCH_FAILED:${url}:${res.status}`);
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

export function defaultProbeLoader(factory: EnvironmentProbeFactory | (() => EnvironmentProbeFactory)): EnvironmentProbeLoader {
  const resolveFactory = (): EnvironmentProbeFactory => (typeof factory === "function" ? factory() : factory);
  return async (key) => {
    if (key.preset === "neutral") {
      // Default environment: embedded, so a published-package app needs no /aura-environments fetch or copied file.
      // The chunk is requested at once (network, no CPU), but decoding it is tens of ms of main-thread work that the first
      // frame does not need: that frame is lit by the synchronous analytic floor, and the baked cube is built after it.
      const loaderModule = import("./neutralEmbeddedLoader.js");
      await whenFirstFramePresented();
      const { loadEmbeddedNeutralProbe } = await loaderModule;
      return loadEmbeddedNeutralProbe();
    }
    if (key.preset) {
      const manifestBytes = await fetchBytes(`/aura-environments/${key.preset}.manifest.json`);
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BakedEnvironmentManifest;
      const [ktx2, sh9Bytes] = await Promise.all([
        fetchBytes(`/aura-environments/${manifest.specular}`),
        fetchBytes(`/aura-environments/${manifest.sh9}`)
      ]);
      const cube = readRgb9e5Cube(ktx2);
      const sh9 = new Float32Array(sh9Bytes.buffer.slice(sh9Bytes.byteOffset, sh9Bytes.byteOffset + sh9Bytes.byteLength));
      const levels = cube.levels.map((faces, i) => ({ faceSize: Math.max(1, cube.faceSize >> i), faces }));
      return buildProbeFromLevels(levels, manifest.faceSize as EnvironmentProbe["faceSize"], {
        source: "preset",
        sh9,
        label: `env-preset-${key.preset}`
      });
    }
    if (key.url) {
      if (isEnvironmentProbeFactoryPending(resolveFactory())) throw new Error("ENVIRONMENT_PROBE_PENDING:fromEquirect");
      const bytes = await fetchBytes(key.url);
      // The decode + CPU GGX prefilter run on the main thread: let the first
      // frames (drawn with the neutral floor) present before the work starts.
      await afterFirstFrames();
      const image = decodeHdrEquirect(bytes);
      // #1153: decode yields RGB; rgba32f needs 4 floats per texel.
      const src = new Texture({ width: image.width, height: image.height, format: "rgba32f", data: hdrImageToRgba32f(image), label: `env-src-${key.url}` });
      return resolveFactory().fromEquirect(src, { faceSize: hdriProbeFaceSize(image.width, key.tier) });
    }
    throw new Error("ENVIRONMENT_KEY_EMPTY: acquire() needs url or preset");
  };
}
