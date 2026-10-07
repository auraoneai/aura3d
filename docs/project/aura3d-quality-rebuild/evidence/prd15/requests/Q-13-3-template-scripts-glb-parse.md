# Q-13-3 — animation-studio template scripts should import `@aura3d/engine/assets` (lane 13)

**Filed by:** Lane 15 (PRD-15 T6.10)
**Status:** request — lane 15 does not edit `packages/create-aura3d/**`
**PRD refs:** §984 (GLB parsing row: "Template scripts importing `@aura3d/engine/assets` → request Q-13-3"), T6.10 (line 1729), request-table row Q-13-3 (line 1452).

## Ask

`packages/create-aura3d/templates/animation-studio/scripts/` re-implements the GLB
header/JSON-chunk walk locally:

- `build-clip-library.ts:139` — `parseGlb(buf)`: magic check, `readUInt32LE` chunk
  offsets, JSON.parse
- `resolve-asset.ts:188` — the same magic + `jsonLen` reads

Route them through the public parse instead of a local parser:

- Document-level inspection: `parseGlbDocument` (exported from `@aura3d/assets`,
  added this phase for exactly this purpose — returns `{ json, version,
  jsonChunkBytes, byteLength }`; also surfaced via `@aura3d/engine/assets` if the
  engine subpath re-exports it), or
- Full decode when the template needs the scene: `GLTFLoader` (`@aura3d/assets`
  public export; `data:model/gltf-binary;base64,…` or fetch URL + `LoadContext`).

## Context

Lane 15 unified the same duplication in `packages/assets/src/asset-corpus/
ProductionAssetCorpus.ts` and `packages/assets/src/AdvancedAssetCorpus.ts` (both
now call `parseGlbDocument`). These template scripts are the remaining local GLB
walkers; see `tests/qr/prd15/assets/gltf-parse-equivalence.test.ts` for the
equivalence contract the unified path satisfies.
