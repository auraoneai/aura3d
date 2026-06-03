import type { AuraCanonicalAsset } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Aura3D prebuilt-index adapter.
 *
 * Reads the whole catalog the cron has already assembled (the Worker's
 * `/index.json`, backed by R2), rather than live-federating each upstream source
 * per query. This is the fast read path the resolver/CLI/prompt feature use:
 * one fetch returns the entire deduped, license-checked catalog, and the
 * federation layer ranks/filters it locally.
 *
 * Stored records are already {@link AuraCanonicalAsset}s, so no mapping is
 * needed — this adapter just surfaces them.
 */

const DEFAULT_INDEX_URL =
  "https://aura3d-asset-index-cron.newsroom.workers.dev/index.json";

interface IndexFile {
  readonly assets?: readonly AuraCanonicalAsset[];
}

export interface AuraIndexAdapterOptions {
  /** Index JSON URL. Defaults to the hosted Aura3D index. */
  readonly indexUrl?: string;
}

export function createAuraIndexAdapter(
  options: AuraIndexAdapterOptions = {},
): SourceAdapter {
  const indexUrl = options.indexUrl ?? DEFAULT_INDEX_URL;
  let cache: readonly AuraCanonicalAsset[] | null = null;

  return {
    id: "aura-index",
    label: "Aura3D prebuilt index",
    async search(_query: ResolveQuery, ctx: AdapterContext) {
      if (!cache) {
        const file = (await ctx.fetchJson(indexUrl)) as IndexFile;
        cache = Array.isArray(file.assets)
          ? file.assets.filter(
              (a): a is AuraCanonicalAsset => !!a && typeof a.id === "string",
            )
          : [];
      }
      return cache;
    },
  };
}
