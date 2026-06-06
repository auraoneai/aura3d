/**
 * @aura3d/asset-index
 *
 * Live federated search over the free GLB/glTF universe. Source adapters
 * normalize each library's native catalog into one {@link AuraCanonicalAsset}
 * shape; the {@link FederatedResolver} fans a natural-language query across them,
 * constraint-filters, ranks, and returns auto-pullable candidates.
 *
 * This package is the catalog. It is intentionally separate from `@aura3d/engine`
 * (which stays a pipeline): the engine's prompt-plan `subject.intent` seam calls
 * a resolver from here, and the CLI pulls a chosen candidate through the normal
 * `assets add` flow.
 */

export type {
  AuraCanonicalAsset,
  AuraAssetLicense,
  AuraAssetLicenseSpdx,
  AuraAssetFormat,
  AuraAssetAccess,
  AuraAssetBounds,
} from "./CanonicalAsset.js";
export { isAutoPullable, normalizeLicense } from "./CanonicalAsset.js";

export type {
  SourceAdapter,
  AdapterContext,
  AdapterRefreshResult,
  FetchJson,
  ResolveQuery,
  ResolveConstraints,
} from "./SourceAdapter.js";
export { defaultFetchJson } from "./SourceAdapter.js";

export { scoreAsset, matchesConstraints } from "./ranking.js";
export { evaluateGameAssetProfile } from "./game-profile.js";
export type { GameAssetProfile, GameAssetProfileEvaluation } from "./game-profile.js";

export type {
  ResolveCandidate,
  ResolveResult,
  FederatedResolverOptions,
} from "./federate.js";
export { FederatedResolver } from "./federate.js";

export { createKhronosAdapter } from "./adapters/khronos.js";
export { createOS3AAdapter } from "./adapters/os3a.js";
export { createPolyHavenAdapter } from "./adapters/poly-haven.js";
export { createPolyPizzaAdapter } from "./adapters/poly-pizza.js";
export type { PolyPizzaAdapterOptions } from "./adapters/poly-pizza.js";
export { createSketchfabAdapter } from "./adapters/sketchfab.js";
export type { SketchfabAdapterOptions } from "./adapters/sketchfab.js";
export { createMarketplaceDeepLinkAdapter } from "./adapters/marketplace.js";
export { createJsDelivrMirrorAdapter } from "./adapters/jsdelivr-mirror.js";
export type { JsDelivrMirrorOptions } from "./adapters/jsdelivr-mirror.js";
export { createAuraIndexAdapter } from "./adapters/aura-index.js";
export type { AuraIndexAdapterOptions } from "./adapters/aura-index.js";

export { IndexStore, INDEX_STORE_SCHEMA } from "./IndexStore.js";
export type { IndexStoreFile } from "./IndexStore.js";
export { refreshIndex } from "./refresh.js";
export type { RefreshResult, RefreshOptions, WritableAssetIndex } from "./refresh.js";

export {
  LocalHashEmbedding,
  cosineSimilarity,
  assetEmbeddingText,
  embeddingRanker,
  DEFAULT_EMBEDDING_DIMS,
} from "./embedding.js";
export type { EmbeddingProvider } from "./embedding.js";

import type { SourceAdapter } from "./SourceAdapter.js";
import { createKhronosAdapter } from "./adapters/khronos.js";
import { createOS3AAdapter } from "./adapters/os3a.js";
import { createPolyHavenAdapter } from "./adapters/poly-haven.js";
import { createJsDelivrMirrorAdapter } from "./adapters/jsdelivr-mirror.js";

/**
 * The zero-auth, verified source adapters available today.
 *
 * These are the no-key, redistributable-by-default sources safe to run in the
 * auto-pull federation pass. Key-gated sources (Sketchfab, Poly Pizza) and the
 * discovery-only marketplace deep-link adapter are intentionally excluded — they
 * are opt-in, not auto-pull sources.
 *
 * `createJsDelivrMirrorAdapter` surfaces CC0 GLBs that the extraction pipeline
 * mirrored from ZIP-pack sources (Kenney, Quaternius, curated OpenGameArt) into
 * the public mirror repo, served free via jsDelivr.
 */
export function defaultAdapters(): SourceAdapter[] {
  return [
    createKhronosAdapter(),
    createOS3AAdapter(),
    createPolyHavenAdapter(),
    createJsDelivrMirrorAdapter(),
  ];
}
