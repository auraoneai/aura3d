import type { AdapterContext, SourceAdapter } from "./SourceAdapter.js";
import type { AuraCanonicalAsset } from "./CanonicalAsset.js";

/**
 * The minimal write surface {@link refreshIndex} needs from a store. The
 * file-backed `IndexStore` satisfies this structurally, and so does a
 * storage-backed implementation (e.g. an R2-backed store in a Cloudflare
 * Worker) — so the cron logic is decoupled from `node:fs` and runs unchanged in
 * a serverless runtime.
 */
export interface WritableAssetIndex {
  getWatermark(source: string): string | null;
  setWatermark(source: string, watermark: string): void;
  upsertMany(source: string, assets: Iterable<AuraCanonicalAsset>): void;
  save(updatedAt?: string): Promise<void>;
}

/**
 * Outcome of a single {@link refreshIndex} pass.
 *
 * - `upserted` is the total number of canonical records written across sources.
 * - `perSource` breaks that down by adapter id (0 for an adapter that failed).
 * - `warnings` collects per-adapter failures so one flaky source cannot collapse
 *   the whole refresh; the store is still saved with whatever succeeded.
 */
export interface RefreshResult {
  readonly upserted: number;
  readonly perSource: Record<string, number>;
  readonly warnings: string[];
}

export interface RefreshOptions {
  /**
   * Caller-supplied timestamp threaded into {@link IndexStore.save} so the
   * refresh stays deterministic (no internal wall-clock read). Typically an
   * ISO-8601 string captured by the cron at the top of the run.
   */
  readonly updatedAt?: string;
}

/**
 * Refresh the durable asset index from every adapter, then persist it.
 *
 * This is the engine of the "live" catalog: a scheduled cron / CI job calls
 * {@link refreshIndex} on a cadence to pull new/changed assets into the
 * {@link IndexStore}, and the resolver reads candidates back out of that same
 * store at query time (decoupling user-facing latency from source fetches).
 *
 * For each adapter:
 *  - if it exposes `fetchSince`, call it with the source's stored watermark to
 *    pull only what changed, then advance the watermark;
 *  - otherwise fall back to a broad `search({ text: "" })` to (re)load its
 *    catalog.
 * Failures are caught per-adapter and recorded as warnings; surviving results
 * are upserted (last-write-wins by id) and the store is saved once at the end.
 */
export async function refreshIndex(
  adapters: readonly SourceAdapter[],
  store: WritableAssetIndex,
  ctx: AdapterContext,
  opts: RefreshOptions = {},
): Promise<RefreshResult> {
  const perSource: Record<string, number> = {};
  const warnings: string[] = [];
  let upserted = 0;

  for (const adapter of adapters) {
    perSource[adapter.id] = 0;
    try {
      if (adapter.fetchSince) {
        const { watermark, assets } = await adapter.fetchSince(
          store.getWatermark(adapter.id),
          ctx,
        );
        store.upsertMany(adapter.id, assets);
        store.setWatermark(adapter.id, watermark);
        perSource[adapter.id] = assets.length;
        upserted += assets.length;
      } else {
        const assets = await adapter.search({ text: "" }, ctx);
        store.upsertMany(adapter.id, assets);
        perSource[adapter.id] = assets.length;
        upserted += assets.length;
      }
    } catch (err) {
      warnings.push(`${adapter.id}: ${errorMessage(err)}`);
    }
  }

  await store.save(opts.updatedAt);
  return { upserted, perSource, warnings };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
