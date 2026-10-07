# Migration guide — Aura3D 3.x → 4.0.0

Derived from `aura.exports.json#deprecated` (single resolution truth) plus the
PRD-15 §11 removal table, updated at removal time (T8.1). Two buckets below:
**removed** (gone at 4.0.0 — rewrite now) and **still deprecated** (kept at
4.0.0 because an in-repo lane still consumes it; removing in the next minor).

## What is removed at 4.0.0

Every entry below is deleted in 4.0.0. Rewrite imports of the form
`@aura3d/engine/<subpath>` to named imports from `@aura3d/engine`.

### Removed subpath aliases (22)

| Removed subpath | Import from instead | Symbols defined in |
|---|---|---|
| `./animation/browser` | `.` (or `@aura3d/animation/browser`) | `packages/animation/src/browser-index.ts` |
| `./assets/advanced-gallery` | `@aura3d/assets` | `packages/assets/src/advanced-gallery/index.ts` |
| `./assets/asset-corpus` | `@aura3d/assets` | `packages/assets/src/asset-corpus/index.ts` |
| `./assets/gltf-runtime` | `@aura3d/assets` | `packages/assets/src/gltf-runtime.ts` |
| `./assets/production-runtime` | `@aura3d/assets` | `packages/assets/src/asset-corpus/index.ts` |
| `./core` | `.` | `packages/core/src/index.ts` |
| `./create-aura3d` | `create-aura3d` | `packages/create-aura3d/src/index.ts` |
| `./debug` | `.` | `packages/debug/src/index.ts` |
| `./editor` | `.` (or `@aura3d/engine/editor-runtime`) | `packages/editor-runtime/src/index.ts` |
| `./engine` | `.` | `packages/engine/src/index.ts` |
| `./engine-runtime` | `.` | `packages/engine/src/index.ts` |
| `./environments` | `.` | `packages/engine/src/devtools/environmentDiagnostics.ts` |
| `./lean` | `.` | — |
| `./lean-game` | `.` | — |
| `./lean-product` | `.` | — |
| `./materials` | `.` | `packages/engine/src/devtools/materialDiagnostics.ts` |
| `./product-studio` | `@aura3d/product-studio` | `packages/product-studio/src/index.ts` |
| `./rendering/advanced-runtime` | `.` | `packages/rendering/src/advanced-runtime/index.ts` |
| `./scene-kits/humanoid-walk` | `.` | `packages/engine/src/agent-api/humanoid-walk-runtime.ts` |
| `./scene-kits/particle-fountain` | `.` | `packages/engine/src/agent-api/particle-fountain-runtime.ts` |
| `./scene-kits/product-viewer` | `.` | `packages/engine/src/agent-api/product-viewer-runtime.ts` |
| `./workflows/production-runtime` | `.` (or `@aura3d/workflows`) | `packages/workflows/src/production-runtime/index.ts` |

### Removed package-level names and aliases

| Removed | Replacement |
|---|---|
| `AdvancedRenderer` (type alias) | `Renderer` |
| `@aura3d/lean` (package) | `@aura3d/engine` |
| CCR-15-1 types `AuraRendererMode`, `AuraRendererFallbackMode` | `renderer.quality` literals (`"safe-basic" \| "production"` / `"safe-basic"`) |
| 85 deprecated `.` union re-exports | canonical names from `aura.exports.json` (full list in `evidence/prd15/phase8-removal-sweep.md`) |

## Still deprecated in 4.0.0

These entries carry `@deprecated` JSDoc and emit the same migration
diagnostics, but are retained because a sibling quality-rebuild lane still
consumes them in-repo (§6.6 step 3). They remove in the next minor once the
open request lands.

### Deprecated subpath aliases kept at 4.0.0 (10)

`./media-node`, `./apps`, `./contracts`, `./rendering`,
`./rendering/production-runtime`, `./rendering/webgpu`,
`./production-runtime`, `./advanced-runtime`, `./assets/browser`,
`./workflows/production`

### Deprecated `.` names kept at 4.0.0 (64)

See `docs/project/aura3d-400-release-notes.md` for the full name list and
`evidence/prd15/phase8-removal-sweep.md` for per-name blocking owners.

### Renderer aliases kept at 4.0.0

`A3DRenderer` (engine `.`) and `ProductionRuntimeRenderer` (`@aura3d/rendering`)
— consumers remain in lanes 01/02/05/09/11/12/13/14.

### Other kept deprecated surfaces

- `packages/input/src/controls` + its `@aura3d/input` re-export lines — blocked
  by `examples/game-slice/main.ts` (request **Q-13-10**).
- `AuraRendererQualityProfile` deprecated fields — populated by 11-owned
  `rendererOptions.ts` (request **Q-11-6**).

## Timeline

- **3.1.0** — aliases introduced; `deprecated` entries carry `removeIn: "4.0.0"`.
- **3.2.x** — `no-silent-fallback` landed; lean collapse shims emit
  `removed-in-4.0` diagnostics when imported.
- **4.0.0** — the 22 subpaths, `@aura3d/lean`, the 85 `.` names, the
  `AdvancedRenderer` alias, and the CCR-15-1 mode types removed.
  `arch-gates` `export-budget`/`unique-ownership` are the enforced truth.
- **next minor** — the still-deprecated bucket above removes as each lane's
  request closes.
