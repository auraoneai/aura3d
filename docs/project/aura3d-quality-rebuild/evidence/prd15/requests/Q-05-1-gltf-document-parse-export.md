# Q-05-1 — asset-corpus GLB parse unification (APPLIED BY LANE 15)

**Filed by:** Lane 15 (PRD-15 T6.10)
**Status:** applied — recorded per single-writer rule because the touched files are lane-05

## Ownership divergence

PRD-15 labels the T6.10 files "(15)" but `tools/qr-ownership` resolves them to lane 05:

- `packages/assets/src/asset-corpus/ProductionAssetCorpus.ts` → 05
- `packages/assets/src/AdvancedAssetCorpus.ts` → 05
- `packages/assets/src/GLTFLoader.ts`, `index.ts`, `browser-index.ts` → 05

The PRD's intent is unambiguous ("parse via the public `GLTFLoader` export of
`@aura3d/assets`"), and lane 05 does not run a competing phase touching these files,
so the change was applied here and marked `APPLIED BY LANE 15` — same pattern as
Q-11-2 (NodeMaterial relocation).

## What changed

- `GLTFLoader.ts`: internal `GLTFDocument` gained `version` + `jsonChunkBytes`
  (populated by `parseGLB`; `0` on `.gltf` JSON documents). New exported
  `GLBDocumentInspection` interface + `parseGlbDocument(data, url)` wrapping the
  canonical `parseGLB` — the document-level walk is now shared, not triplicated.
- `index.ts` / `browser-index.ts`: export `parseGlbDocument` + `GLBDocumentInspection`
  (additive; public-surface-diff remains green).
- `ProductionAssetCorpus.inspectProductionGlb` and
  `AdvancedAssetCorpus.inspectCurrentRoutesGlb`: the hand-rolled
  `GLB_MAGIC`/`readUInt32LE`/fixed-offset JSON-chunk reads deleted; both call
  `parseGlbDocument`. Their counting logic (materials, textures, extensions,
  accessor/triangle tallies) is unchanged.

## Behaviour deltas (intentional, stricter)

- `parseGLB` validates `declaredLength === byteLength` and walks all chunks with
  bounds checks (the old corpus read trusted the first chunk header only).
- Non-GLB input still throws, message now `Invalid GLB magic`/`GLB file is too
  small` instead of `Not a GLB file`/`GLB missing JSON chunk`.

## Equivalence

`tests/qr/prd15/assets/gltf-parse-equivalence.test.ts` — 5 checked-in fixtures
(avocado, damaged-helmet, clear-coat-test, sheen-test-grid, antique-camera): corpus
inspection vs `GLTFLoader.load` agree on material count, vertex count (Σ POSITION
accessor counts), triangle count, GLB version 2, non-zero JSON chunk. 6/6 pass.
