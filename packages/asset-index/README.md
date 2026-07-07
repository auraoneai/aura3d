# @aura3d/asset-index

`@aura3d/asset-index` owns federated GLB/glTF asset catalog search, ranking,
profiles, adapters, and verified auto-pull candidate resolution for Aura3D.

## Public API

- `FederatedResolver`: fans a natural-language query across configured asset
  source adapters, filters constraints, ranks candidates, and returns a
  normalized result.
- `defaultAdapters`: zero-auth verified adapters used by the auto-pull
  federation pass.
- `AuraCanonicalAsset`: normalized catalog asset shape shared by the resolver
  and CLI.
- `scoreAsset`, `matchesConstraints`: deterministic ranking and constraint
  helpers.
- `gameAssetProfileDefinitions`, `evaluateGameAssetProfile`: profile scoring
  for game-oriented asset searches.
- `animationAssetProfiles`, `evaluateAnimationAssetProfile`: profile scoring
  for animation-oriented asset searches.
- `IndexStore`, `refreshIndex`: local index storage and refresh helpers.

## Source Adapters

The package includes adapters for Khronos, OS3A, Poly Haven, Poly Pizza,
Sketchfab, marketplace deep links, jsDelivr mirrors, and Aura index records.
Key-gated or marketplace sources are explicit opt-in adapters; they are not
treated as automatically pullable by default.

## Package Boundary

This package is the catalog and resolver layer. The CLI pulls selected
candidates through the typed asset pipeline, and public Aura3D routes should
still render generated `assets.name` references instead of raw URLs or guessed
model IDs.
