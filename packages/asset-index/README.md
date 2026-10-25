# @aura3d/asset-index

`@aura3d/asset-index` owns search, ranking, profiles and source adapters over
open, licence-clear model, texture and HDRI sources, plus verified auto-pull
candidate resolution for Aura3D. There is no hosted catalog: the CLI's
`aura3d assets resolve` uses these adapters as one rung of its build-time
ladder (project asset, open source, Meshy, primitives recipe).

## Public API

- `FederatedResolver`: fans a natural-language query across configured asset
  source adapters, filters constraints, ranks candidates, and returns a
  normalized result.
- `defaultAdapters`: zero-auth verified adapters used by the auto-pull
  federation pass.
- `AuraCanonicalAsset`: normalized asset record shape shared by the resolver
  and CLI.
- `scoreAsset`, `matchesConstraints`: deterministic ranking and constraint
  helpers.
- `gameAssetProfileDefinitions`, `evaluateGameAssetProfile`: profile scoring
  for game-oriented asset searches.
- `animationAssetProfiles`, `evaluateAnimationAssetProfile`: profile scoring
  for animation-oriented asset searches.

## Source Adapters

The package includes adapters for Khronos, OS3A, Poly Haven, Poly Pizza,
ambientCG, Sketchfab, marketplace deep links, the curated Aura library and a
jsDelivr CC0 mirror. The hosted index adapter was removed in 4.2.0.
Key-gated or marketplace sources are explicit opt-in adapters; they are not
treated as automatically pullable by default.

## Package Boundary

This package is the search and resolver layer. The CLI pulls selected
candidates through the typed asset pipeline, and public Aura3D routes should
still render generated `assets.name` references instead of raw URLs or guessed
model IDs.
