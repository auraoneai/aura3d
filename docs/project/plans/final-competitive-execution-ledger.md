# Aura3D Final Competitive Replatform Execution Ledger

Date: 2026-08-08
Controlling PRD: `1.6-FINAL-PRD-Finishes.md`
Current completed phase: Phase 1
Release state: release candidate; no npm publish, Git tag, GitHub release, or production deployment performed

This ledger records evidence against exact commits. It does not broaden a claim
past `docs/agents/claims-and-boundaries.md`, and it does not treat generated
reports, route boot success, or historical comparison results as product
approval.

## Phase 0 — baseline and truth reset

### Exact commits

| Purpose | Commit |
| --- | --- |
| Candidate implementation before the final PRD | `48fc6b87bdcffd15ee17d2221243bb9dc102ee65` |
| Final PRD introduction | `6f233c1be8c953102c735ebc26383d78bfb25a61` |
| Phase 0 current-baseline lock and truth correction | `62d2a5e6c4437fc286e0cb9d00fe62fc0cd41c1d` |

The worktree was clean after the PRD commit and again immediately after the
Phase 0 implementation commit. The immutable baseline manifest records the
candidate source commit, retained evidence provenance, tool versions, source
hashes, image hashes, report hashes, and baseline metrics.

### Immutable Aura3D before baseline

Producer: `tools/final-competitive-baseline/index.mjs`

Manifest: `tests/reports/final-competitive-baseline/manifest.json`

- 21 retained artifacts verify by SHA-256.
- Four exact desktop candidate captures are retained.
- Four text/HUD-masked derivatives are retained so later visual comparison
  cannot be won by changing copy or overlays.
- 27 route source files are bound to the candidate commit.
- Package graph, exports, public contract, negative complexity, route tiers,
  bundle reports, production-path measurements, visual-review state, and four
  interaction traces are snapshotted.
- Baseline metrics: 26 public packages; 200,924 package-source lines; 0 of 5 R12
  ownership violations; 148 filesystem routes; 145 classified routes; 47 root
  export subpaths; 360 engine-barrel exports.
- The retained visual review is explicitly a rejected `needs-work` before-state,
  not human approval.

| Route | Before SHA-256 | Text/HUD-masked SHA-256 |
| --- | --- | --- |
| Product Configurator | `d4974f55b2b692ef01b956b5f511e262d3bb38a355c128a994f1ced34661f4b2` | `b1ccf756604874e9e459bc44f1ca49ca35de61e80c9996a694aab2dfff9ed30c` |
| Smart City Control | `a75df7db870091deda0cfd6c9e55e3ea252f0622d622cd12c12f51f67e338d60` | `e98d0175f98fbfbb32217d5eaf2ca244dc854c47555cd7e28e6af896581345e8` |
| Cinematic Architecture | `f0be0e3682358fd03d176e5e802bb7560b73e4ee57ee7ff965661d7502864209` | `3a6cfad3961e5ecd13381f194eeff4ec44d81542a0f667358aa6c6e264e693d7` |
| Digital Twin Operations | `a4e32e17eb4e7a7230d0fed768342fa7846d63bcf7d4e4d63ae0c21a92456466` | `2f17314982cda3ea304756e21d8f2e9d191906f1ec14feeece31f80e67018a3a` |

### Current Three.js context lock

Producer: `tools/current-threejs-baseline/index.mjs`

Context: `benchmark/context/threejs-r185.1-20260808.json`

Surface inventory: `docs/project/parity/threejs-r185-surface-inventory.md`

Registry receipt: `tests/reports/current-threejs-baseline.json`

- npm target: exact `three@0.185.1`.
- npm integrity:
  `sha512-5aojFCXKwnjBRZvUnt3WFfEcvUJgkN5LlijRFN95hMy8WVkG4I0QNcJE+OuWvuJ0bOdStrbfXn0pkd6/QyiAlg==`.
- Release/tag: r185; release commit and npm `gitHead` both
  `2431a09f46f34c560bc8e44b33be0e567723d5b9`.
- Published: 2026-07-01T14:04:30.373Z.
- Context SHA-256:
  `3ad155ede7c82e58f4f7898fd014d333285e7e6c296eaa09ff68c6b1b0c6829b`.
- Official renderer, WebGPU, TSL, node-material, postprocessing, loader,
  animation, controls, text, instancing, LOD, WebXR, and lifecycle surfaces are
  inventoried from official Three.js material.
- The companion stack is locked per workload, including React Three Fiber,
  drei, postprocessing, Troika text, Rapier, recast-navigation, Howler, glTF
  Transform, Meshopt, Draco, and stats.js.
- The context binds 15 required workloads, six exact asset hashes, browser, OS,
  CPU/GPU/backend, viewport, DPR, camera, lighting, tone mapping, sampling, and
  non-inferiority thresholds.
- The freshness gate rejects any active reintroduction of `three@0.165.0` and
  requires an online delta review when the frozen target falls more than two
  stable releases behind npm latest.

### Documentation truth correction

- The generated historical ecosystem inventory now reports 57 rows: 3
  `exceed`, 45 `parity`, 8 `parity-unproven`, and 1 `gap`.
- Its producer labels the matrix as a historical `three@0.165.0` capability
  inventory, not current r185 parity.
- The README, changelog, migration guide, release notes, release checklist,
  handoff, completion audit, current-state and known-limits pages, comparison
  status, original PRD, architecture decision, and historical comparison plans
  now preserve the old results only with their exact frozen-version boundary.
- The original PRD's Phase 5 completion is narrowed to technical route health
  and interaction/browser sub-gates. Material visual rebuilding and independent
  human approval remain open in the final PRD.
- New release-checklist blockers require the material flagship rebuild, current
  r185 comparisons, and completion of the final PRD.

### Verified commands

| Command | Result |
| --- | --- |
| `pnpm current-threejs:baseline` | pass; npm latest exactly 0.185.1, integrity and commit match |
| `pnpm check:current-threejs-baseline` | pass; 12 locked-source checks |
| `pnpm final-competitive:baseline:verify` | pass; 21 artifacts |
| `node tools/product-remediation/build-threejs-parity.mjs` | pass; 57 / 3 / 45 / 8 / 1 |
| `pnpm threejs-parity:inventory` | pass; generated historical 54-row construction inventory with explicit 0.165.0 scope |
| focused baseline, parity-consumer, and evidence-freshness Vitest suites | pass; 64 tests, then 8 post-regeneration tests |
| `pnpm check:package-graph` | pass; 26 packages, no undeclared dependencies, cycles, or layer violations |
| `pnpm check:negative-complexity` | pass; 200,924 lines and 0 of 5 R12 violations |
| `pnpm check:agent-docs` | pass |
| `pnpm check:docs-codeblocks` | pass |
| `pnpm typecheck` | pass after upgrading Three.js and `@types/three` |

### Phase 0 claim and limitations

Phase 0 proves only that the old candidate and comparison state are preserved,
the current target is reproducibly locked, active wording is honest, and the
repository still passes the focused structural/type gates. It does not prove
current renderer parity, a completed subsystem bake-off, material example
improvement, release readiness, publication, or deployment.

## Remaining program

Phases 2 through 9 remain open. The next irreversible operation is any subsystem
deprecation or deletion; none is authorized until Phase 2 adds the required
workload bake-off, ADR, migration, rollback, and deletion-safety evidence to the
Phase 1 consumer graph.

## Phase 1 — subsystem ownership and external-candidate audit

### Exact source commit and generated evidence

| Purpose | Commit or artifact |
| --- | --- |
| Ownership/audit producers and gates | `c108150216f9ac2714b97193d11a42bd9c64bf2d` |
| Generated ownership report | `tests/reports/final-subsystem-ownership.json` |
| Generated human ownership record | `docs/architecture/final-subsystem-ownership.md` |
| Isolated candidate package/security report | `tests/reports/external-candidate-package-audit.json` |

The generated ownership report is bound to the producer commit above. It covers
all 26 workspace packages, 35 classified subsystem groups, and all 899 package
source files exactly once. Its graph searches static source use, dynamic import
use, package exports, CLI/tool/worker generators, documentation, tests and
fixtures, routes and templates, and external-consumer/clean-room proofs.

### Ownership decisions

- Renderer, scene, math, controls, animation, materials, environments, and input
  remain `AURA-CORE`.
- The typed agent API, typed asset/provenance pipeline, CLI, scaffolds,
  diagnostics, workflows, product studio, and app helpers remain `AURA-MOAT`.
- React and the current physical solver surface are adapter territory.
- ECS, scripting, and `three-compat` are `COMPATIBILITY-ONLY`; their public
  exports prevent minor-release deletion.
- Editor/editor-runtime are `OPTIONAL-PLUGIN` application dependencies.
- Browser audio is `BROWSER-STANDARD` pending the one-owner Phase 2 selection.
- Custom physical character/kinematic/vehicle controllers form a
  `DEPRECATE-REMOVE` queue, not an immediate deletion.
- Physics, audio, asset, and editor fixture/descriptor modules identified by the
  audit are `EVIDENCE-ONLY` and cannot support shipped runtime claims.
- Node/cloud/FFmpeg/YouTube publishing is an optional-integration queue; browser
  capture and WebCodecs/MediaRecorder remain a separate browser-standard group.
- No package is `DELETE-NOW`: every published package has an export barrier, and
  the private engine-runtime package has real source consumers. R8 must run on
  individual displaced files after consumers are migrated.

### External maintenance, package, bundle, and security facts

All candidates are locked by exact version and integrity. One isolated npm
lockfile and audit reports zero known vulnerabilities across the candidate set.
Tarball and all-export browser bundles are measured rather than inferred:

| Candidate | Maintenance reading | All-export browser gzip |
| --- | --- | ---: |
| Rapier main 0.20.0 | active | requires explicit `.wasm` loader; naïve bundle correctly fails |
| Rapier compat 0.20.0 | active | remeasure in the current bake-off artifact |
| Cannon 0.20.0 | dormant-risk | 62,507 B |
| Recast Navigation 0.43.1 | active | 258,473 B |
| Howler 2.2.4 | aging | 15,336 B |
| Yuka 0.7.8 | dormant-risk | 64,295 B |
| bitECS 0.4.0 | active | 6,663 B |
| Miniplex 2.0.0 | dormant-risk | 8,824 B |

These figures do not select an implementation. Phase 2 must still measure real
features, initialization, workers, determinism, resource disposal, browser
lifecycle, and workload performance. In particular, neither Yuka nor Cannon may
be called “mature” merely because it is familiar.

### Architecture lock and verified commands

The architecture lock uses baseline
`ce01b95f6a200175b3db7d47f30f8e6fea911018`. Any added
`packages/*/src` file must map to an existing ADR in
`tools/final-subsystem-ownership/adr-registry.json`; a new package also fails
until it has an explicit disposition.

| Command | Result |
| --- | --- |
| `pnpm audit:external-candidate-packages` | pass; 8 packages, zero audit vulnerabilities |
| `pnpm final-subsystem:ownership` | pass; 26 packages, 35 subsystems, 899 files |
| final subsystem, external audit, and evidence-freshness Vitest suites | pass; 63 tests |
| `pnpm check:package-graph` | pass; no undeclared dependencies, cycles, or layer violations |
| `pnpm check:agent-docs` | pass |
| `pnpm check:docs-codeblocks` | pass |
| `pnpm typecheck` | pass |

### Phase 1 claim boundary

Phase 1 establishes classification, consumer and export barriers, measured
maintenance/built-module costs, current package/security facts, and migration
queues. It does not authorize deletion, select Rapier/Recast/Howler or any other
candidate, prove current Three.js parity, or change release status.
