import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuraCanonicalAsset } from "./CanonicalAsset.js";

/**
 * On-disk schema tag. Bump when the persisted shape changes incompatibly so a
 * stale file can be detected (and, in future, migrated) rather than misread.
 */
export const INDEX_STORE_SCHEMA = "aura3d-asset-index/1" as const;

/**
 * Persisted JSON shape of an {@link IndexStore}.
 *
 * - `watermarks` maps a source id to the opaque cursor returned by that
 *   adapter's `fetchSince`, so the next refresh resumes incrementally.
 * - `assets` is the flat, de-duplicated canonical catalog keyed (logically) by
 *   `id`; we store it as an array for stable, diff-friendly JSON.
 * - `updatedAt` is caller-supplied (never read from the wall clock here) to keep
 *   the store deterministic and testable.
 */
export interface IndexStoreFile {
  readonly schema: typeof INDEX_STORE_SCHEMA;
  readonly updatedAt: string | null;
  readonly watermarks: Record<string, string>;
  readonly assets: AuraCanonicalAsset[];
}

/**
 * A file-backed JSON store of {@link AuraCanonicalAsset} records keyed by
 * canonical id, plus a per-source watermark map.
 *
 * This is the durable catalog the "live" cron writes into (via
 * {@link refreshIndex}) and the resolver reads out of. It is intentionally
 * deterministic: it never reads wall-clock time or randomness internally. The
 * caller threads an `updatedAt` string into {@link save} when one is wanted.
 */
export class IndexStore {
  /** id -> canonical asset (last write wins on upsert). */
  private readonly assets = new Map<string, AuraCanonicalAsset>();
  private readonly watermarks = new Map<string, string>();
  private updatedAt: string | null = null;

  private constructor(private readonly path: string) {}

  /**
   * Load a store from `path`. A missing file is tolerated and yields an empty
   * store (the cron's first run). A present-but-corrupt file throws so the
   * problem is surfaced rather than silently discarded.
   */
  static async load(path: string): Promise<IndexStore> {
    const store = new IndexStore(path);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (err) {
      if (isNotFound(err)) return store;
      throw err;
    }
    const parsed = JSON.parse(text) as Partial<IndexStoreFile>;
    if (Array.isArray(parsed.assets)) {
      for (const asset of parsed.assets) {
        if (asset && typeof asset.id === "string") {
          store.assets.set(asset.id, asset);
        }
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

  /**
   * Insert or replace many records from one source, de-duping by canonical id
   * with last-write-wins semantics. The `source` argument is accepted for call
   * symmetry with the watermark API and to document provenance at the call
   * site; the canonical id already namespaces the source.
   */
  upsertMany(_source: string, assets: Iterable<AuraCanonicalAsset>): void {
    for (const asset of assets) {
      if (asset && typeof asset.id === "string") {
        this.assets.set(asset.id, asset);
      }
    }
  }

  /** The last watermark recorded for `source`, or `null` if never refreshed. */
  getWatermark(source: string): string | null {
    return this.watermarks.get(source) ?? null;
  }

  /** Record the next watermark for `source`. */
  setWatermark(source: string, watermark: string): void {
    this.watermarks.set(source, watermark);
  }

  /** All canonical assets currently held, in stable insertion order. */
  all(): AuraCanonicalAsset[] {
    return [...this.assets.values()];
  }

  /**
   * Atomically persist the store: serialize, write to a sibling temp file, then
   * `rename` over the real path so a reader never sees a half-written file.
   *
   * `updatedAt` is caller-supplied to keep the store deterministic; when
   * omitted the previously loaded/saved value is preserved.
   */
  async save(updatedAt?: string): Promise<void> {
    if (updatedAt !== undefined) this.updatedAt = updatedAt;
    const file: IndexStoreFile = {
      schema: INDEX_STORE_SCHEMA,
      updatedAt: this.updatedAt,
      watermarks: Object.fromEntries(this.watermarks),
      assets: this.all(),
    };
    const json = `${JSON.stringify(file, null, 2)}\n`;
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, json, "utf8");
    await rename(tmp, this.path);
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "ENOENT"
  );
}
