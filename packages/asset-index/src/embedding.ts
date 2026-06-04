import type { AuraCanonicalAsset } from "./CanonicalAsset.js";

/**
 * Semantic-search upgrade seam over the keyword baseline in `ranking.ts`.
 *
 * The federation layer scores assets through a single seam (`scoreAsset`); this
 * module provides the vector-embedding alternative the comment there promises.
 * Everything here is dependency-free and fully deterministic: the default
 * provider hashes tokens into a fixed-size vector, so the same text always
 * yields the same embedding with no network, keys, randomness, or wall-clock
 * time involved.
 */

/** Pluggable text embedder. Implementations must be deterministic per input. */
export interface EmbeddingProvider {
  /** Embed each input string into a numeric vector of uniform dimension. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** Default embedding dimensionality for {@link LocalHashEmbedding}. */
export const DEFAULT_EMBEDDING_DIMS = 256;

/**
 * Lowercase a string and split it into alphanumeric tokens, dropping single
 * characters (matching the keyword baseline's `queryTerms`).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/**
 * Deterministic 32-bit FNV-1a hash of a string. Pure function of its input;
 * no randomness or platform-dependent behavior.
 */
function fnv1a(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    // FNV prime multiply via shifts to stay in 32-bit unsigned range.
    hash = Math.imul(hash, 0x01000193);
  }
  // Coerce to unsigned 32-bit.
  return hash >>> 0;
}

/**
 * Deterministic, dependency-free bag-of-words embedding.
 *
 * Each token is hashed into one of `dims` buckets and summed (sign derived from
 * a second hash bit so unrelated tokens do not all push in the same direction),
 * then the vector is L2-normalized. Identical text -> identical vector; cosine
 * similarity of identical text is exactly 1.
 */
export class LocalHashEmbedding implements EmbeddingProvider {
  readonly dims: number;

  constructor(dims: number = DEFAULT_EMBEDDING_DIMS) {
    this.dims = dims > 0 ? Math.floor(dims) : DEFAULT_EMBEDDING_DIMS;
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dims).fill(0);
    for (const token of tokenize(text)) {
      const h = fnv1a(token);
      const bucket = h % this.dims;
      // Use a high bit as a stable sign so collisions are less likely to align.
      const sign = (h & 0x80000000) !== 0 ? -1 : 1;
      vec[bucket] += sign;
    }
    return l2Normalize(vec);
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }
}

/** L2-normalize a vector in place-safe fashion; zero vectors stay zero. */
function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Cosine similarity of two equal-length vectors. Returns 0 when either vector
 * is all zeros or lengths differ. For L2-normalized vectors this equals the dot
 * product, but we recompute norms so it is correct for any input.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Canonical text used to embed an asset: title, tags, then description. This is
 * the same field set the ranking baseline scores against, concatenated so a
 * bag-of-words embedding can capture all of them.
 */
export function assetEmbeddingText(asset: AuraCanonicalAsset): string {
  const parts = [asset.title, asset.tags.join(" ")];
  if (asset.description) parts.push(asset.description);
  return parts.join(" ");
}

/**
 * Rank assets against a query by cosine similarity of their embeddings.
 *
 * Embeds the query and every asset's {@link assetEmbeddingText} in one batched
 * call to the provider, then sorts descending by score. Ties break by asset id
 * so the ordering is stable and deterministic.
 */
export async function embeddingRanker(
  provider: EmbeddingProvider,
  query: string,
  assets: readonly AuraCanonicalAsset[],
): Promise<{ asset: AuraCanonicalAsset; score: number }[]> {
  if (assets.length === 0) return [];

  const texts = [query, ...assets.map((a) => assetEmbeddingText(a))];
  const vectors = await provider.embed(texts);
  const queryVec = vectors[0];

  const scored = assets.map((asset, i) => ({
    asset,
    score: cosineSimilarity(queryVec, vectors[i + 1]),
  }));

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    return x.asset.id < y.asset.id ? -1 : x.asset.id > y.asset.id ? 1 : 0;
  });
  return scored;
}
