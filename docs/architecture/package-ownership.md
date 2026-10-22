# Package ownership and dependency direction

Canonical Aura3D 4.0 package ownership record. The generated file-level ledger
is [`final-subsystem-ownership.md`](./final-subsystem-ownership.md).
Machine-enforced by `pnpm check:package-graph` (`tools/package-graph/index.ts`), which writes
`tests/reports/package-graph.json` and `docs/architecture/package-graph.dot`. **This document is
descriptive; the tool is authoritative.** If they disagree, the tool is right and this file is stale.

Measured 2026-10-21 · 25 workspace packages · 0 undeclared dependencies · **0 cycles — the graph is
acyclic.** The former `input -> controls` upward edge is resolved: `packages/input/src/controls/*`
deprecated `@aura3d/controls` re-export shims (PRD-15 T6.9, "remove in 4.0.0") were deleted along
with the `@aura3d/controls` dependency in `packages/input/package.json`. Consumers import camera
controls from `@aura3d/controls` directly.

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
| 3 | Subsystems composing other subsystems | `assets`, `controls`, `debug`, `editor-runtime` |
| 4 | Product surfaces | `product-studio`, `apps`, `workflows` |
| 5 | Aggregate runtime | `engine`, `game` |
| 6 | Consumers of the aggregate / standalone tools | `react`, `aura3d-cli`, `create-aura3d` |

Nothing may depend on tier 5 or 6 except tier 6.

## Ownership

`Public` is the root-manifest `exports` subpath a consumer imports. `LOC` is `packages/<name>/src`.

| Package | Tier | LOC | Public subpath | Owns | Dependencies (union of declared + source) |
|---|---|---|---|---|---|
| `math` | 0 | 6,309 | `@aura3d/math` | vectors, matrices, quaternions, curves | — |
| `navigation-recast` | 0 | 317 | `@aura3d/navigation-recast` | optional Recast/Detour navmesh, path-query, crowd, and tile-cache adapter | — |
| `physics` | 0 | 7,339 | `@aura3d/physics` | compatibility contract over Rapier plus explicitly non-physical authored arcade motion | `physics-rapier` |
| `physics-rapier` | 0 | 875 | `@aura3d/physics-rapier` | optional async Rapier physical-simulation adapter; separate WASM | — |
| `scripting` | 0 | 4,123 | `@aura3d/scripting` | compatibility-only GOAP / HTN / behaviour trees / utility AI | — |
| `asset-index` | 0 | 3,983 | `@aura3d/asset-index` | asset catalogue index and search | — |
| `core` | 1 | 1,186 | `@aura3d/core` | base object model. **Transitive dep of `engine`, `scene`, `ecs`, `apps`** | — |
| `scene` | 1 | 1,832 | `@aura3d/scene` | scene graph, transforms, traversal | `core`, `math` |
| `animation` | 2 | 14,927 | `@aura3d/animation` | clips, mixers, blending, skinning, morphs | `math` |
| `rendering` | 2 | 123,050 | `@aura3d/rendering` | WebGL2 + WebGPU devices, materials, shaders, lighting, shadows, postprocess | `math`, `scene` |
| `input` | 2 | 2,362 | `@aura3d/input` | keyboard/pointer/touch/gamepad/XR, action maps, replay. | `math`, `scene` |
| `audio` | 2 | 5,080 | `@aura3d/audio` | sole browser-standard Web Audio graph, buses, effects, positional audio | `scene` |
| `ecs` | 2 | 1,480 | `@aura3d/ecs` | entity/component store. **One consumer — WS-3.3** | `core`, `math` |
| `assets` | 3 | 22,852 | `@aura3d/assets` | glTF/GLB/KTX2/Draco loading, provenance, admission | `animation`, `rendering`, `scene` |
| `controls` | 3 | 3,820 | `@aura3d/controls` | orbit/fly/pointer camera controls | `input`, `math`, `scene` |
| `debug` | 3 | 1,133 | `@aura3d/debug` | inspectors, overlays, physics/animation visualisers | `animation`, `physics`, `rendering` |
| `editor-runtime` | 3 | 7,663 | `@aura3d/editor-runtime` | editor document model and commands | `animation`, `math`, `scene` |
| `product-studio` | 4 | 740 | `@aura3d/product-studio` | product-viewer application surface | `assets`, `rendering`, `scene` |
| `apps` | 4 | 162 | `@aura3d/apps` | application shell contracts. **`engine` depends on it** | `core`, `rendering`, `workflows` |
| `workflows` | 4 | 1,175 | `@aura3d/workflows` | composed authoring workflows, production example runtime | `animation`, `assets`, `product-studio`, `rendering`, `scene` |
| `engine` | 5 | 111,406 | `@aura3d/engine` (root) | compatibility-heavy agent API, game runtime, kits, production runtime, plus isolated `media-node`. Private as `@aura3d/engine-runtime` | `animation`, `apps`, `assets`, `audio`, `core`, `ecs`, `editor-runtime`, `input`, `math`, `navigation-recast`, `physics`, `product-studio`, `rendering`, `scene`, `scripting`, `workflows` |
| `game` | 5 | 6,815 | `@aura3d/game`, `@aura3d/engine/game`, `/game/art`, `@aura3d/engine/game/capture`, `@aura3d/engine/game/util` | genre kits, game runtime implementation, HUD/evidence, juice, capture, art-direction, util | `audio`, `engine`, `input`, `math`, `rendering` |
| `react` | 6 | 567 | `@aura3d/react` | React bindings | `engine` |
| `aura3d-cli` | 6 | 19,885 | `@aura3d/cli` | asset pipeline CLI | `asset-index`, `audio`, `rendering` |
| `create-aura3d` | 6 | 9,069 | `create-aura3d` | project scaffolding | `asset-index` |

## Over-declarations (weight, not failures)

Reported by the gate, retained deliberately for now — removing a dependency from a published
manifest is a consumer-visible change and belongs in WS-3.6d, not here.

- `animation` declares `math`, no `src` import
- `game` declares `audio`, no `src` import

## The rule that matters

> A package may import only from the same or a lower tier, only through a package `exports` subpath,
> and only what its own manifest declares.

Deep imports (`@aura3d/*/src/*`) are already blocked by ESLint. Upward imports are blocked by
`check:package-graph`, which runs inside `pnpm check:release`.
