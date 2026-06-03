import {
  INDEX_STORE_SCHEMA,
  type AuraCanonicalAsset,
  type IndexStoreFile,
  type WritableAssetIndex,
} from "@aura3d/asset-index";

/**
 * R2-backed implementation of {@link WritableAssetIndex}.
 *
 * Mirrors the file-backed `IndexStore` from `@aura3d/asset-index` (same
 * persisted {@link IndexStoreFile} shape and schema tag) but reads/writes a
 * single object in an R2 bucket instead of the local filesystem, so it runs in
 * the Cloudflare Workers runtime. `refreshIndex` consumes it through the shared
 * `WritableAssetIndex` structural interface — no `node:fs`.
 */
export class R2IndexStore implements WritableAssetIndex {
  private readonly assets = new Map<string, AuraCanonicalAsset>();
  private readonly watermarks = new Map<string, string>();
  private updatedAt: string | null = null;

  private constructor(
    private readonly bucket: R2Bucket,
    private readonly key: string,
  ) {}

  /** Load the current index object from R2; a missing object yields an empty store. */
  static async load(bucket: R2Bucket, key: string): Promise<R2IndexStore> {
    const store = new R2IndexStore(bucket, key);
    const object = await bucket.get(key);
    if (!object) return store;
    const parsed = JSON.parse(await object.text()) as Partial<IndexStoreFile>;
    if (Array.isArray(parsed.assets)) {
      for (const asset of parsed.assets) {
        if (asset && typeof asset.id === "string") store.assets.set(asset.id, asset);
      }
    }
    if (parsed.watermarks && typeof parsed.watermarks === "object") {
      for (const [source, w] of Object.entries(parsed.watermarks)) {
        if (typeof w === "string") store.watermarks.set(source, w);
      }
    }
    store.updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
    return store;
  }

  upsertMany(_source: string, assets: Iterable<AuraCanonicalAsset>): void {
    for (const asset of assets) {
      if (asset && typeof asset.id === "string") this.assets.set(asset.id, asset);
    }
  }

  getWatermark(source: string): string | null {
    return this.watermarks.get(source) ?? null;
  }

  setWatermark(source: string, watermark: string): void {
    this.watermarks.set(source, watermark);
  }

  all(): AuraCanonicalAsset[] {
    return [...this.assets.values()];
  }

  async save(updatedAt?: string): Promise<void> {
    if (updatedAt !== undefined) this.updatedAt = updatedAt;
    const file: IndexStoreFile = {
      schema: INDEX_STORE_SCHEMA,
      updatedAt: this.updatedAt,
      watermarks: Object.fromEntries(this.watermarks),
      assets: this.all(),
    };
    await this.bucket.put(this.key, `${JSON.stringify(file, null, 2)}\n`, {
      httpMetadata: { contentType: "application/json" },
    });
  }
}
