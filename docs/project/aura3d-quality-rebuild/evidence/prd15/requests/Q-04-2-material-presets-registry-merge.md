# Q-04-2 — material-preset merge into MaterialPresetsRegistry + nodes/material.ts wiring

Status: PARTIALLY APPLIED BY LANE 15 (T6.6, qr/prd15-honest-packages)

## Applied by lane 15 (cross-lane edits, marked)

The PRD-15 unified-registry merge is a pure value move into
`packages/rendering/src/MaterialPresets.ts` (owner 01):

- `packages/rendering/src/cinematic/CinematicMaterialPresets.ts` (owner 07)
  → merged verbatim into `MaterialPresets.ts` (comment-marked section),
  leaf file deleted; `cinematic/index.ts` re-exports the same names from
  `../MaterialPresets.js`.
- `packages/rendering/src/ArchitecturalMaterialCatalog.ts` (owner 01)
  → merged verbatim; deleted.
- `packages/rendering/src/animation/AnimationMaterialStyle.ts` (owner 01)
  → merged verbatim; deleted; `animation/index.ts` and
  `AnimationRenderPreset.ts`/`applyAnimationRenderPreset.ts` repointed to
  `../MaterialPresets.js`.
- `rendering/src/index.ts` leaf-path exports repointed to
  `./MaterialPresets.js` — the published `.` surface is unchanged
  (`public-api-contracts.test.ts` passes).

Snapshot proof: `tests/qr/prd15/materials/preset-merge-snapshot.test.ts`
(10 snapshots: cinematic preset ids+pbr+diagnostics, rendererOwnedEvidence
flag, architectural catalog descriptors, 4 animation treatments, registry
default instantiations).

## Still owned by lane 04 (NOT applied)

`packages/rendering/src/production-runtime/nodes/material.ts` (owner 04)
currently instantiates its own material assembly rather than going through
`MaterialPresetsRegistry`. Per PRD-15 T6.6 the nodes material path should
be rewired to `MaterialPresetsRegistry` so the production-runtime material
path is a consumer of the registry rather than a sibling implementation.
