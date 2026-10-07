# Migration guide — Aura3D 3.x → 4.0.0

This file is generated from `aura.exports.json#deprecated` (single resolution truth)
plus the PRD-15 §11 removal table. Do not hand-edit the tables; regenerate by
re-deriving from `aura.exports.json`.

## What removes at 4.0.0

Every subpath below is a deprecated alias shim. At 4.0.0 each entry is deleted and
the `.` export becomes the only home for its symbols. Rewrite imports of the form
`@aura3d/engine/<subpath>` to named imports from `@aura3d/engine`.

### Deprecated subpath aliases (32 entries)

| Removed subpath | Import from instead | Symbols defined in |
|---|---|---|
| `./advanced-runtime` | `.` | `packages/engine/src/advanced-runtime/index.ts` |
| `./animation/browser` | `.` | `packages/animation/src/browser-index.ts` |
| `./apps` | `.` | `packages/apps/src/index.ts` |
| `./assets/advanced-gallery` | `.` | `packages/assets/src/advanced-gallery/index.ts` |
| `./assets/asset-corpus` | `.` | `packages/assets/src/asset-corpus/index.ts` |
| `./assets/browser` | `.` | `packages/assets/src/browser-index.ts` |
| `./assets/gltf-runtime` | `.` | `packages/assets/src/gltf-runtime.ts` |
| `./assets/production-runtime` | `.` | `packages/assets/src/asset-corpus/index.ts` |
| `./contracts` | `.` | `packages/engine/src/contracts/index.ts` |
| `./core` | `.` | `packages/core/src/index.ts` |
| `./create-aura3d` | `.` | `packages/create-aura3d/src/index.ts` |
| `./debug` | `.` | `packages/debug/src/index.ts` |
| `./editor` | `.` | `packages/editor-runtime/src/index.ts` |
| `./engine` | `.` | `packages/engine/src/index.ts` |
| `./engine-runtime` | `.` | `packages/engine/src/index.ts` |
| `./environments` | `.` | `packages/engine/src/devtools/environmentDiagnostics.ts` |
| `./lean` | `.` | `packages/engine/src/agent-api/lean.ts` |
| `./lean-game` | `.` | `packages/engine/src/agent-api/lean-game.ts` |
| `./lean-product` | `.` | `packages/engine/src/agent-api/lean-product.ts` |
| `./materials` | `.` | `packages/engine/src/devtools/materialDiagnostics.ts` |
| `./media-node` | `.` | `packages/engine/src/agent-api/media-node.ts` |
| `./product-studio` | `.` | `packages/product-studio/src/index.ts` |
| `./production-runtime` | `.` | `packages/engine/src/production-runtime/index.ts` |
| `./rendering` | `.` | `packages/rendering/src/index.ts` |
| `./rendering/advanced-runtime` | `.` | `packages/rendering/src/advanced-runtime/index.ts` |
| `./rendering/production-runtime` | `.` | `packages/rendering/src/production-runtime/index.ts` |
| `./rendering/webgpu` | `.` | `packages/rendering/src/webgpu.ts` |
| `./scene-kits/humanoid-walk` | `.` | `packages/engine/src/agent-api/humanoid-walk-runtime.ts` |
| `./scene-kits/particle-fountain` | `.` | `packages/engine/src/agent-api/particle-fountain-runtime.ts` |
| `./scene-kits/product-viewer` | `.` | `packages/engine/src/agent-api/product-viewer-runtime.ts` |
| `./workflows/production` | `.` | `packages/workflows/src/production-runtime/index.ts` |
| `./workflows/production-runtime` | `.` | `packages/workflows/src/production-runtime/index.ts` |

### Removed package-level names and aliases

| Removed | Replacement |
|---|---|
| `A3DRenderer` (type alias) | `Renderer` |
| `ProductionRuntimeRenderer` (type alias) | `Renderer` |
| `AdvancedRenderer` (type alias) | `Renderer` |
| `@aura3d/lean` (package) | `@aura3d/engine` |
| `@aura3d/input/controls` (subpath) | `@aura3d/input` |
| CCR-15-1 deprecated types (`AgentAPI*` legacy unions) | concrete `agent-api` node/app/devtools types |
| Deprecated `.` union re-exports (146 names) | canonical names from `aura.exports.json` |

## Timeline

- **3.1.0** — aliases introduced; `deprecated` entries carry `removeIn: "4.0.0"`.
- **3.2.x** — `no-silent-fallback` landed; lean collapse shims emit `removed-in-4.0`
  diagnostics when imported.
- **4.0.0** — all of the above deleted; `arch-gates` `export-budget`/`unique-ownership`
  become the enforced truth.
