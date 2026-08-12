# PROJECT KNOWLEDGE BASE

**Generated:** 2026-06-20T14:38:27-0700
**Commit:** 40d3e7ca
**Branch:** main

## OVERVIEW

Aura3D is a pnpm TypeScript monorepo for browser 3D: public agent APIs,
asset/CLI pipeline, scaffold templates, showcase routes, docs, tests, evidence
tools, benchmarks, and release artifacts live side by side. Read `llms.txt`
first; read `docs/agents/claims-and-boundaries.md` before editing examples,
routes, templates, README text, release copy, or public claims.

## AURA3D 2.0 RELEASE CONTEXT

- The target version is `2.0.0` across all 29 public packages.
- `@aura3d/lean`, `/product`, and `/game` are the recommended isolated entries;
  the root engine remains the compatibility-heavy safe authoring surface.
- Rapier is the sole physical-simulation owner. Recast is optional navigation;
  authored arcade motion is explicitly non-physical.
- Current comparison uses repository-locked `three@0.185.1`. Historical
  `three@0.165.0` results must remain labeled historical.
- All 19 scaffolds must pass both source and exact-installed-tarball lifecycles.
- A route is not approved merely because automated evidence is green; exact
  final artifacts require independent human review.

## STRUCTURE

```text
aura3d/
|-- packages/        # published packages, engine/runtime internals, CLI, generator
|-- apps/            # public showcase/demo apps with route-health evidence
|-- examples/        # small public example routes
|-- templates/       # root package template surface
|-- docs/            # claim boundaries, API docs, release/process records
|-- tests/           # Vitest, Playwright, route-health, reports
|-- tools/           # evidence, release, parity, readiness gates
|-- benchmark/       # benchmark runner, scoring, frozen context bundles
|-- workers/         # workspace worker packages such as asset-index cron
|-- marketing/       # separate Vite marketing site
|-- archive/         # legacy and held-back content, not active source
|-- public/aura-assets/  # CLI-generated asset blobs and thumbnails
|-- dist/            # generated package output
`-- src/aura-assets.ts   # CLI-generated typed asset map
```

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Public safe API | `packages/engine/src/agent-api/` | Root `@aura3d/engine` claims must be proven through this surface. |
| Renderer internals | `packages/rendering/src/` | Internal/runtime claims only unless root browser tests prove them. |
| Asset catalog/manifest logic | `packages/aura3d-cli/src/`, `packages/assets/src/`, `packages/asset-index/src/` | CLI provenance and typed asset generation live here. |
| Scaffold generator | `packages/create-aura3d/src/` | Template list and copy/report logic. |
| Public templates | `packages/create-aura3d/templates/`, `templates/` | Route-health and screenshot tests are part of the contract. |
| Showcase apps | `apps/` | Treat route-health JSON and launch evidence as generated proof. |
| Public wording | `docs/agents/`, `docs/project/`, `docs/api/` | Claim labels and release gates are canonical here. |
| Browser evidence | `tests/browser/` | Pixel/screenshot/runtime proof, not DOM-only proof. |
| Release/readiness gates | `tools/`, `.github/workflows/` | Prefer named scripts over ad hoc checks. |
| Generated reports | `tests/reports/`, `release-artifacts/` | Read as evidence; do not hand-author as source. |

## CODE MAP

TypeScript LSP was unavailable in this harness; centrality below is from source
scan, package exports, configs, and explorer findings.

| Symbol | Type | Location | Refs | Role |
| --- | --- | --- | --- | --- |
| `@aura3d/engine` export root | package export | `package.json` | scan | Published root maps to public agent API output. |
| `createAuraApp` | public API | `packages/engine/src/agent-api/` | scan | Browser runtime owner for safe agent-authored routes. |
| `game`, `games` helpers | public API | `packages/engine/src/agent-api/` | scan | Route-local gameplay helpers and evidence contracts. |
| `CREATE_AURA3D_TEMPLATES` | const | `packages/create-aura3d/src/index.ts` | scan | Authoritative scaffold template list. |
| `createA3DProject` | function | `packages/create-aura3d/src/index.ts` | scan | Copies templates and writes package version/report data. |
| `@aura3d/cli` asset commands | CLI/API | `packages/aura3d-cli/src/index.ts` | scan | Adds, resolves, validates, hashes, and type-generates assets. |
| `ProductionRuntimeRenderer` | internal/runtime | `packages/rendering/src/` | scan | Renderer proof belongs to production/runtime labels unless surfaced. |
| `collectTypedGLBActorRenderItems` | runtime helper | `packages/engine/src/production-runtime/TypedGLBActor.ts` | scan | Typed GLB production-runtime bridge, not automatic root proof. |
| `tests/browser/current-routes-route-health.spec.ts` | Playwright spec | `tests/browser/` | scan | Canonical route-health evidence pattern. |

## CONVENTIONS

- Package manager is `pnpm@11.1.3`; CI workflows still contain older pnpm
  setup versions in some legacy jobs, so check the workflow being touched.
- TypeScript is strict with `moduleResolution: "Bundler"`,
  `isolatedModules`, `verbatimModuleSyntax`, and path aliases in
  `tsconfig.base.json`.
- ESLint blocks `@aura3d/*/src/*` and cross-package deep imports; use package
  exports or local relative imports inside the owning package.
- Public agent-authored code uses normal TypeScript/JavaScript against
  `@aura3d/engine`; renderer internals are only for tasks explicitly inside
  renderer/runtime packages.
- `aura.assets.json` and `src/aura-assets.ts` are generated by the CLI. Routes
  import typed `assets.*`; they do not invent IDs or URLs.
- Route or release evidence is command output: route-health JSON, screenshots,
  launch evidence, and report files must match the command that produced them.

## ANTI-PATTERNS

- No `three`, `three/examples/...`, `GLTFLoader`, `OrbitControls`, hand-made
  renderer loops, or raw loader code in public examples, showcase routes,
  templates, README snippets, or agent docs.
- No `model("id")`, `model("/path/model.glb")`, raw `.glb/.gltf` URLs,
  guessed sample-model URLs, or `unsafeModelUrl(...)` in safe public examples.
- No primitive-only primary subject for a named character, vehicle, product,
  creature, weapon, world, or hero environment; primitives are set dressing,
  debug/collision guides, HUD anchors, or explicit abstract visualization.
- DOM/CSS/canvas overlays are UI only; they are not fake Aura3D particles,
  lighting, labels, shadows, trails, explosions, or rendering evidence.
- Do not claim production rendering, PBR parity, HDR/IBL, WebGPU, postprocess,
  skinned animation, morph targets, reusable game kits, or collision systems
  from root `createAuraApp` unless root-only browser evidence proves it.
- Do not edit `dist/`, nested `dist/`, `coverage/`, `test-results/`,
  `tests/reports/`, `release-artifacts/`, or generated asset blobs as source.

## UNIQUE STYLES

Public claims must use one label from `docs/agents/claims-and-boundaries.md`:
`createAuraApp` root safe API, `production-runtime`, `rendering` internals, CLI
asset pipeline, template-only scaffold, prototype, or roadmap. If proof is
missing, lower the label instead of broadening the claim.

Game routes need keyboard input that changes state, objective, scoring or fail
condition, reset, progression, typed primary assets, and automated proof for at
least one meaningful mechanic. Screenshots prove only what is visible.

## COMMANDS

```bash
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm test:visual
pnpm build
pnpm check:agent-docs
pnpm check:docs-site
pnpm check:docs-codeblocks
pnpm verify:release:quick
pnpm check:release
```

Use narrower named scripts from `package.json` for feature areas:
`game-runtime:*`, `animation-runtime:*`, `prompt-animation:*`,
`engine-readiness:*`, `product-studio:*`, `foundation:*`,
`external-parity:*`, and `threejs-parity:*`.

## NOTES

- This worktree may contain many user changes and untracked showcase assets;
  do not revert them while performing unrelated tasks.
- `packages/create-aura3d/templates/animation-studio/AGENTS.md` is a deeper
  special case: the agent is the animation director and must drive the scene
  tool. Do not copy that language into generic routes.
- Benchmark context folders and archived legacy trees are reference material.
  Do not treat them as current source or cite them for current capability.
