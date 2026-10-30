import { GLTFSharedTextureCache } from "@aura3d/assets/browser";
import { valueToken } from "../GlbResourceCache.js";

/**
 * Ref-counted registry of one `GLTFSharedTextureCache` per (asset, decode options), so repeated
 * `model()` nodes of the same GLB decode and upload each glTF image once instead of once per node.
 * The cache's own lease count frees the textures when the last actor disposes; this registry only
 * decides which actors share a cache and forgets the entry when its last holder releases it.
 */
export interface ModelTextureShareHandle {
  readonly cache: GLTFSharedTextureCache;
  /** Number of actors currently holding this cache (diagnostics/tests). */
  readonly holders: number;
  release(): void;
}

interface Entry {
  readonly cache: GLTFSharedTextureCache;
  holders: number;
}

export class ModelTextureShareRegistry {
  private readonly entries = new Map<string, Entry>();

  acquire(key: string): ModelTextureShareHandle {
    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = { cache: new GLTFSharedTextureCache(), holders: 0 };
      this.entries.set(key, entry);
    }
    entry.holders += 1;
    const held = entry;
    let released = false;
    return {
      cache: held.cache,
      get holders() {
        return held.holders;
      },
      release: () => {
        if (released) return;
        released = true;
        held.holders -= 1;
        if (held.holders <= 0 && this.entries.get(key) === held) this.entries.delete(key);
      }
    };
  }

  /** Distinct (asset, decode options) caches currently alive (diagnostics/tests). */
  get size(): number {
    return this.entries.size;
  }
}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
function identityOf(value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (typeof value !== "object" && typeof value !== "function") return String(value);
  let id = objectIds.get(value as object);
  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(value as object, id);
  }
  return `#${id}`;
}

/**
 * Cache key: textures are identical only for the same asset bytes and the same decode inputs
 * (size caps, budget, decoder/transcoder capabilities). Anything that changes a decoded image changes the key.
 */
export function modelTextureShareKey(options: {
  readonly asset: { readonly url: string; readonly id?: string; readonly sha256?: string };
  readonly maxTextureSize?: number;
  readonly textureBudget?: number;
  readonly imageDecoder?: unknown;
  readonly decoders?: unknown;
  readonly compressedTextureCapabilities?: unknown;
}): string {
  return [
    options.asset.url,
    options.asset.id ?? "-",
    options.asset.sha256 ?? "-",
    identityOf(options.maxTextureSize),
    identityOf(options.textureBudget),
    identityOf(options.imageDecoder),
    // GU47 E-H handoff: plain-data decoder / transcoder options by value, like `glbResourceCacheKey`
    // (`typedGLBActorDecoderOptions` builds a fresh `decoders: {}` per mount, so identity never matched across setScene).
    valueToken(options.decoders),
    valueToken(options.compressedTextureCapabilities)
  ].join("|");
}

/** The process-wide registry used by `createTypedGLBActor` for model() nodes. */
export const sharedModelTextures = new ModelTextureShareRegistry();
