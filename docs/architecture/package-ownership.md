# Package ownership and dependency direction

Canonical record for **WS-3.6a** of [`Aura3D-1.6-Replatform-PRD.md`](../../Aura3D-1.6-Replatform-PRD.md).
Machine-enforced by `pnpm check:package-graph` (`tools/package-graph/index.ts`), which writes
`tests/reports/package-graph.json` and `docs/architecture/package-graph.dot`. **This document is
descriptive; the tool is authoritative.** If they disagree, the tool is right and this file is stale.

Measured 2026-08-09 · 29 workspace packages · graph acyclic · 0 undeclared dependencies · 0 layer violations.

## How the graph is measured

Two edge sets are computed separately, because in this repository they disagree:

- **Declared** — `@aura3d/*` keys in each package's `dependencies` / `peerDependencies`.
- **Source** — `@aura3d/...` specifiers actually imported under `packages/<name>/src`.

A source edge with no declared edge is an **undeclared dependency**: it resolves only through
workspace hoisting or a `tsconfig.base.json` path alias and breaks for anyone installing from the
registry. That count must stay at zero. A declared edge with no source edge is an
**over-declaration**: it ships install weight nobody imports. It is reported, not failed.

Subpath specifiers resolve through `tsconfig.base.json` `paths`, not by their prefix.
`@aura3d/engine/rendering` aliases to `packages/rendering/src/index.ts` — it does **not** resolve
into `packages/engine`. Attributing it to `engine` would invent cycles that do not exist and hide
the one that does. Generated code inside template literals is stripped before scanning, because
`packages/create-aura3d` emits route source containing `import ... from "@aura3d/engine"` as text.

## Tiers

Dependencies point **down only**. An edge from tier N to tier M where M > N is a layer violation
and fails the gate.

| Tier | Meaning | Packages |
|---|---|---|
| 0 | Foundation and low-level optional adapters — no upward Aura3D dependencies | `math`, `navigation-recast`, `physics`, `physics-rapier`, `scripting`, `asset-index` |
| 1 | Core data model | `core`, `scene` |
| 2 | Subsystems over the data model | `animation`, `rendering`, `input`, `audio`, `ecs` |
| 3 | Subsystems composing other subsystems | `assets`, `controls`, `materials`, `environments`, `debug`, `editor-runtime` |
| 4 | Product surfaces | `product-studio`, `apps`, `workflows`, `editor`, `lean` |
| 5 | Aggregate runtime | `engine` |
| 6 | Consumers of the aggregate / standalone tools | `react`, `three-compat`, `aura3d-cli`, `create-aura3d` |

Nothing may depend on tier 5 or 6 except tier 6.

## Ownership

`Public` is the root-manifest `exports` subpath a consumer imports. `LOC` is `packages/<name>/src`.

| Package | Tier | LOC | Public subpath | Owns | Dependencies (union of declared + source) |
|---|---|---|---|---|---|
| `math` | 0 | 1,220 | `@aura3d/math` | vectors, matrices, quaternions, curves | — |
| `navigation-recast` | 0 | 196 | `@aura3d/navigation-recast` | optional Recast/Detour navmesh, path-query, crowd, and tile-cache adapter | — |
| `physics` | 0 | 12,715 | `@aura3d/physics` | solver, collision, joints, character, vehicle. **Internals re-platformed by P4** | `physics-rapier` |
| `physics-rapier` | 0 | 160 | `@aura3d/physics-rapier` | optional async Rapier physical-simulation adapter; separate WASM | — |
| `scripting` | 0 | 5,837 | `@aura3d/scripting` | GOAP / HTN / behaviour trees / utility AI. **Zero consumers — WS-3.3** | — |
| `asset-index` | 0 | 3,438 | `@aura3d/asset-index` | asset catalogue index and search | — |
| `core` | 1 | 1,186 | `@aura3d/core` | base object model. **Transitive dep of `engine`, `scene`, `ecs`, `apps`** | `math` |
| `scene` | 1 | 1,704 | `@aura3d/scene` | scene graph, transforms, traversal | `core`, `math` |
| `animation` | 2 | 7,988 | `@aura3d/animation` | clips, mixers, blending, skinning, morphs | `math` |
| `rendering` | 2 | 54,859 | `@aura3d/rendering` | WebGL2 + WebGPU devices, materials, shaders, lighting, shadows, postprocess | `math`, `scene` |
| `input` | 2 | 2,463 | `@aura3d/input` | keyboard/pointer/touch/gamepad/XR, action maps, replay | `math`, `scene` |
| `audio` | 2 | 2,225 | `@aura3d/audio` | Web Audio graph, buses, effects, positional audio | `scene` |
| `ecs` | 2 | 1,480 | `@aura3d/ecs` | entity/component store. **One consumer — WS-3.3** | `core`, `math` |
| `assets` | 3 | 16,574 | `@aura3d/assets` | glTF/GLB/KTX2/Draco loading, provenance, admission | `animation`, `rendering`, `scene` |
| `controls` | 3 | 2,389 | `@aura3d/controls` | orbit/fly/pointer camera controls | `input` |
| `materials` | 3 | 360 | `@aura3d/materials` | material presets. **Public export, self-consumed only** | `assets`, `rendering` |
| `environments` | 3 | 469 | `@aura3d/environments` | IBL/environment presets. **Public export, self-consumed only** | `rendering` |
| `debug` | 3 | 1,133 | `@aura3d/debug` | inspectors, overlays, physics/animation visualisers | `animation`, `physics`, `rendering` |
| `editor-runtime` | 3 | 7,915 | `@aura3d/editor-runtime` | editor document model and commands | `animation`, `math`, `scene` |
| `product-studio` | 4 | 696 | `@aura3d/product-studio` | product-viewer application surface | `assets`, `rendering`, `scene` |
| `apps` | 4 | 162 | `@aura3d/apps` | application shell contracts. **`engine` depends on it** | `core`, `rendering`, `workflows` |
| `workflows` | 4 | 1,174 | `@aura3d/workflows` | composed authoring workflows, production example runtime | `animation`, `assets`, `product-studio`, `rendering`, `scene` |
| `editor` | 4 | 1 | `@aura3d/editor` | placeholder aggregate over `editor-runtime` | `editor-runtime` |
| `lean` | 4 | 971 | `@aura3d/lean`, `/product`, `/game` | dependency-isolated WebGL2 primitive, typed-product, and solver-free deterministic arcade runtime | `assets`, `rendering`, `scene` |
| `engine` | 5 | 56,172 | `@aura3d/engine` (root) | compatibility-heavy agent API, game runtime, kits, production runtime, plus deprecated lean aliases. Private as `@aura3d/engine-runtime` | `animation`, `apps`, `assets`, `audio`, `core`, `ecs`, `lean`, `physics`, `product-studio`, `rendering`, `scene`, `workflows` |
| `react` | 6 | 173 | `@aura3d/react` | React bindings | `engine` |
| `three-compat` | 6 | 1,185 | `@aura3d/three-compat` | Three.js migration surface | `animation`, `controls`, `debug`, `rendering` |
| `aura3d-cli` | 6 | 8,756 | `@aura3d/cli` | asset pipeline CLI | `asset-index` |
| `create-aura3d` | 6 | 8,574 | `create-aura3d` | project scaffolding | `asset-index` |

## Over-declarations (weight, not failures)

Reported by the gate, retained deliberately for now — removing a dependency from a published
manifest is a consumer-visible change and belongs in WS-3.6d, not here.

- `animation` declares `math`, no `src` import
- `core` declares `math`, no `src` import
- `environments` declares `rendering`, no `src` import
- `materials` declares `assets` and `rendering`, no `src` import
- `three-compat` declares `rendering`, no `src` import

## The rule that matters

> A package may import only from the same or a lower tier, only through a package `exports` subpath,
> and only what its own manifest declares.

Deep imports (`@aura3d/*/src/*`) are already blocked by ESLint. Upward imports are blocked by
`check:package-graph`, which runs inside `pnpm check:release`.
