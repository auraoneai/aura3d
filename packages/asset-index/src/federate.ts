import type { AuraCanonicalAsset } from "./CanonicalAsset.js";
import type {
  AdapterContext,
  FetchJson,
  ResolveQuery,
  SourceAdapter,
} from "./SourceAdapter.js";
import { defaultFetchJson } from "./SourceAdapter.js";
import { matchesConstraints, scoreAsset } from "./ranking.js";

export interface ResolveCandidate {
  readonly asset: AuraCanonicalAsset;
  readonly score: number;
}

export interface ResolveResult {
  readonly query: ResolveQuery;
  readonly candidates: readonly ResolveCandidate[];
  /** Non-fatal per-source failures, so a dead source is visible, not silent. */
  readonly warnings: readonly string[];
}

/**
 * Optional ranking seam. When provided, it replaces the default keyword
 * `scoreAsset` ordering with a custom (e.g. semantic-embedding) ranker. It
 * receives the constraint-filtered candidate pool and returns each asset paired
 * with a score, already ordered best-first. The resolver consumes that order
 * directly. See `embeddingRanker` in `embedding.ts` for the default semantic
 * implementation (partially apply its `provider` to match this signature).
 */
export type Ranker = (
  query: string,
  assets: readonly AuraCanonicalAsset[],
) => Promise<{ asset: AuraCanonicalAsset; score: number }[]>;

export interface FederatedResolverOptions {
  readonly adapters: readonly SourceAdapter[];
  readonly fetchJson?: FetchJson;
  /** Max candidates returned after ranking. Default 10. */
  readonly limit?: number;
  /**
   * Optional ranking override. Defaults to the keyword `scoreAsset` path when
   * undefined, preserving existing behavior exactly.
   */
  readonly ranker?: Ranker;
}

/**
 * Federates a query across every configured source adapter in parallel,
 * normalizes + constraint-filters + ranks the merged pool, and returns the top
 * candidates. A source that throws contributes a warning instead of failing the
 * whole resolve — federation degrades, it does not collapse.
 */
export class FederatedResolver {
  private readonly adapters: readonly SourceAdapter[];
  private readonly ctx: AdapterContext;
  private readonly limit: number;
  private readonly ranker?: Ranker;

  constructor(options: FederatedResolverOptions) {
    this.adapters = options.adapters;
    this.ctx = { fetchJson: options.fetchJson ?? defaultFetchJson };
    this.limit = options.limit ?? 10;
    this.ranker = options.ranker;
  }

  async resolve(query: ResolveQuery): Promise<ResolveResult> {
    const warnings: string[] = [];

    const perAdapter = await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          return await adapter.search(query, this.ctx);
        } catch (err) {
          warnings.push(`${adapter.id}: ${(err as Error).message}`);
          return [] as readonly AuraCanonicalAsset[];
        }
      }),
    );

    // Dedupe by id and apply constraint filtering once; both the keyword and the
    // injected-ranker paths rank over this same filtered pool.
    const seen = new Set<string>();
    const pool: AuraCanonicalAsset[] = [];
    for (const asset of perAdapter.flat()) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      if (!matchesConstraints(asset, query.constraints)) continue;
      pool.push(asset);
    }

    const candidates = this.ranker
      ? await this.rankWith(this.ranker, query.text, pool)
      : rankByKeyword(query.text, pool);

    return {
      query,
      candidates: candidates.slice(0, this.limit),
      warnings,
    };
  }

  /**
   * Rank the filtered pool through an injected ranker, consuming its returned
   * order directly. Ties are re-broken by id so the ordering stays stable and
   * deterministic even if the ranker leaves equal scores unordered.
   */
  private async rankWith(
    ranker: Ranker,
    text: string,
    pool: readonly AuraCanonicalAsset[],
  ): Promise<ResolveCandidate[]> {
    const ranked = await ranker(text, pool);
    const candidates = ranked.map(({ asset, score }) => ({ asset, score }));
    candidates.sort(
      (a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id),
    );
    return candidates;
  }
}

/**
 * Default keyword ranking: score via `scoreAsset`, drop zero-score assets, and
 * order by score descending with an id tie-break for determinism. This preserves
 * the resolver's pre-seam behavior exactly.
 */
function rankByKeyword(
  text: string,
  pool: readonly AuraCanonicalAsset[],
): ResolveCandidate[] {
  const candidates: ResolveCandidate[] = [];
  for (const asset of pool) {
    const score = scoreAsset(asset, text);
    if (score <= 0) continue;
    candidates.push({ asset, score });
  }
  candidates.sort(
    (a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id),
  );
  return candidates;
}
