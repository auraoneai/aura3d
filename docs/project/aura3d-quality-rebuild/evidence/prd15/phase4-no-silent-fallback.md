# Phase 4 — no-silent-fallback evidence (T4.1–T4.10)

**Date:** 2026-10-06 · **Branch:** `qr/prd15-no-silent-fallback` (cut from
`qr/prd15-agent-api-split` @ `17e6800f`)

## T4.1 — C-36 degrade sink (compiler/renderer.ts)

`agent-api/compiler/degradation.ts` — `createDegradationSink({strict,onDegradation,warn})`:
strict → `AuraRuntimeError(code,message,{cause})`; non-strict → C-38 `onDegradation`
+ warn-once per `(code,nodeId)`. Implementation lives in `compiler/` because
`compiler/renderer.ts` consumes it and compiler may not value-import `app/`
(layering gate); `app/degradation.ts` re-exports to keep the import surface.

`AuraRuntimeError.code` union extended with `AuraDegradationCode`;
`{cause}` ctor option added (`compiler/errors.ts`).

Wiring: `MountSceneCompileContext.degrade` set from `degradation?.strict ??
flags.on("A3D_QR_STRICT")` in `createProductionRuntimeSceneRenderer`;
`app/mountRenderer.ts` forwards `AuraSceneDegradationOptions` through.

Tests: `tests/qr/prd15/app/degradation.test.ts` — 10/10.

## T4.2 — strict mount path

`mountRenderer` honours `A3D_QR_STRICT`: mount failures surface as
`AuraRuntimeError("renderer-mount-failed")` instead of silently degrading.

Tests: `tests/qr/prd15/app/mountRenderer-strict.test.ts` — 6/6.

## T4.3 — error overlay

`agent-api/app/errorOverlay.ts` — DOM-overlay for hard failures:
`errorOverlayDetails()` extracts code/message/cause-stack (first 5 lines);
`attachErrorOverlay` paints it. Unit-verified with a DOM double
(`tests/qr/prd15/app/errorOverlay.test.ts` 5/5). The macos-14 browser/axe
companion test is queued for the captures lane — the runtime already wires
the overlay on mount failure.

## T4.4 — DEFERRED (per spec's own gate)

Flipping `A3D_QR_STRICT` default-on needs two consecutive green sentinel
checkpoints; the flag is not default-on yet anywhere, so the hard cutover is
deferred — documented here rather than faked.

## T4.5 — `renderer:{mode,fallback}` strict guard

`AuraMigrationError` added in `compiler/errors.ts`
(`{removedApi,replacement,prd}`, `code:"removed-api"`); `createAuraApp`
throws it under `A3D_QR_STRICT` when callers pass the deprecated
`renderer.mode`/`renderer.fallback` options. `AuraRendererMode` /
`AuraRendererFallbackMode` marked `@deprecated` (CCR-15-1). Companion
`renderer-mode` codemod (C-39 registered) + fixtures landed; Q-13-2/Q-14-1
filed for template/doc migrations.

Tests: `tests/qr/prd15/app/renderer-mode-strict.test.ts` — 4/4;
`tests/qr/prd15/renderer-mode-codemod.test.ts` — codemod fixtures.

## T4.6 — lean collapsed to §7.5 shims

`packages/lean/src/{index,product,game}.ts` rewritten to the §7.5 surface:
one-time guarded `console.warn` (`globalThis.__AURA3D_LEAN_DEPRECATION_WARNED__`)
then deprecated re-exports from `@aura3d/engine`. `game.ts` additionally maps
the names the mini-game template uses (`game` export, `AuraNodeBuilder as
AuraLeanNodeBuilder`, `GamePlatformerEvent as LeanPlatformerEvent`).

- Deleted: `packages/lean/src/base.ts`, `packages/lean/src/ArcadeRuntime.ts`
  (`rg -l ArcadeRuntime apps templates packages examples` → 0 external hits;
  §6.7 delete branch taken).
- `packages/lean/package.json`: `dependencies: {"@aura3d/engine":"workspace:*"}`,
  `sideEffects:true` (the warn is a real side-effect).
- `eslint.config.js`: `packages/lean/src/**` exempted from
  `no-upward-package-import` — the upward re-export is the shim's whole
  (deprecated) purpose.
- Dead test `tests/unit/engine/lean-game-surface.test.ts` deleted — it asserted
  the removed lean-only runtime (`createLeanCameraRig` & friends).
- `tests/browser/lean-entry-runtime.spec.ts` game test rewritten to engine
  semantics: the old assertions (`game.runtime === "lean-deterministic-arcade"`,
  `game.platformer({platforms:[…]})` lean-level shape, `platformer.step`)
  tested the deleted lean runtime; the test now asserts the §7.5 surface
  (`typeof game.input/game.platformer === "function"`, `app.input` controller)
  plus the same production-WebGL2 diagnostics.
- `packages/lean/dist/` is a build artifact — `pnpm build:raw` (run by
  `qr-prd15-captures.yml`/`qr-prd15-pack-check.yml` before packing) regenerates
  it; the stale pre-Phase-4 copy on a dev box is inert and untracked.

Tests: `tests/qr/prd15/app/lean-deprecation.test.ts` — 4/4.

## T4.7 — `lean-imports` codemod + fixtures + C-30 scenes

- `packages/aura3d-cli/src/codemods/lean-imports.ts` (C-39): rewrites
  `@aura3d/lean{,/product,/game}` imports/exports/dynamic-imports to
  `@aura3d/engine`, renames lean-only bindings via `as`-aliases
  (`AuraLeanNodeBuilder`→`AuraNodeBuilder`, `LeanPlatformerEvent`→
  `GamePlatformerEvent`, …), flags lean-only APIs as `mapping:"none"`, and
  preserves bare side-effect imports (the warn IS the effect). Registered in
  `commands/prd15/index.ts`; CLI: `aura3d codemod lean-imports <glob>`.
- Codemod fixtures: `tests/qr/prd15/fixtures/lean-imports/{before,after}/`
  (3 pairs from the real templates). Test 7/7.
- C-30 lane scenes: `tests/qr/prd15/fixtures/lean-templates/{product,minigame}/`
  — full vite-app copies (index.html, tsconfig, package.json, public GLBs);
  mini-game gains the §6.7 key light + `environments.studio()` + shadow
  ground. Registered in `benchmarks/quality-rebuild/scenes/prd15/index.ts`.
- `tools/lean-fixture-capture/index.ts` + `qr-prd15-captures.yml` (macos-14):
  packs engine+lean tarballs, builds fixtures **from the tarballs** (§16.3),
  serves dist/ over an inline static server, captures 1920×1080 + 390×844
  with Playwright chromium (`--use-angle=metal`), writes PNG + `__AURA3D*`
  diagnostics JSON + artifact upload. Judge features (key-light gradient,
  contact shadow, IBL reflection, rotated primitives) are inspectable from
  the PNGs when the artifact lands — the scene builds them deterministically.
- `tools/packed-consumer-check` generalized: `packTarballAt`, `extraDeps`,
  `--extra-dir`/`--extra-pkg` flags; `qr-prd15-pack-check.yml` gained the
  lean-fixture step (`--only prd15-lean --extra-pkg packages/lean:@aura3d/lean`).
- **Q-13-1 filed** (`requests/Q-13-1-lean-imports-codemod.md` + 38-row report
  JSON): 34 exact + 4 approximate rewrites across the 8 template source files
  (PRD says 16 files — only `src/*.ts` carry lean imports), plus the mini-game
  lighting request and `package.json` dep swap instructions.

## T4.8 — lean renderer/device deletion

- Deleted: `lean/LeanProductionRenderer.ts`, `lean/LeanProductRenderer.ts`,
  `LeanWebGL2Device.ts`, `lean-runtime.ts`, `lean-core-runtime.ts`,
  `tests/unit/rendering/lean-webgl2-boundary.test.ts` (15-owned).
- Safety `rg` after deletion: only the lean-shim deprecation comment +
  `release-metrics-rollup.test.ts` historical-diff allowlist remain.
- Resolution truth updated: `aura.exports.json` entries removed; generated
  maps regenerated (`tsconfig.paths.generated.json`,
  `vite.aliases.generated.ts`, `tsconfig.base.json`,
  `tools/finalize-dist/manifest.generated.json`); `packages/rendering/package.json`
  `./lean-runtime`/`./lean-core-runtime` exports removed; `vitest.config.ts`
  + `tests/browser/example-dev-server.ts` alias rows removed;
  `api-docs.test.ts` expected-subpath list updated.
- `QR_OWNERSHIP.json` corrected: `packages/rendering/src/{lean/,lean-runtime.ts,lean-core-runtime.ts,LeanWebGL2Device.ts,diagnostics}` now resolve to lane 15 (the CONTRACTS §4.1 `lean*` glob was missing from the map; the deleted files reported owner 01 before this fix).
- `ShaderLibraryCore.ts` untouched (Q-01-4 do-not-touch).

## T4.9 — `single-renderer` + `glsl-location` gates → fail mode

New rules `tools/arch-gates/rules/{singleRenderer,glslLocation}.ts`, wired
into `runGates` as enforced findings:

- `single-renderer`: `getContext("webgl"|"webgl2"|"webgpu")` and
  `new {WebGL2Device,WebGPUDevice,ProductionWebGPURenderer}` outside
  `WebGL2Device.ts`/`WebGPUDevice.ts`/`RenderBackend.ts`, scoped to
  `packages/*/src/**`.
- `glsl-location`: `#version` template strings outside
  `program/chunks/`, `shaders/`, `production-runtime/shaders/`,
  `post/`, `postprocess/`, `output/`, `cinematic/`,
  `contracts/testing/`.

Allowlist entries (`tools/arch-gates/allowlist.json`, expire 2026-11-30):
`webglRuntime.ts` safe-basic fallback (both rules, until T4.4),
`ResidentGPUParticleRenderer.ts` (Q-07-4),
`ProductionWebGPURenderer.ts` + `webgl2/Probe.ts` (Q-11-4),
`TemporalHistory.ts` + `webgl2/LegacyPost.ts` (Q-03-2),
`AnimationToonMaterial.ts` (Q-06-2),
`ShaderLibrary.ts` + `ShaderLibraryCore.ts` (Q-01-6),
`production-runtime/index.ts` skybox shader (15 self-debt).

`compiler/renderer.ts` was refactored instead of allowlisted: the
`MAX_TEXTURE_SIZE` `getContext` probe moved into `webglRuntime.ts`
(`webGL2MaxTextureSize`) — a capability probe now lives beside the only
sanctioned engine-side context.

Fixture tests (8 new in `arch-gates-rules.test.ts`): `getContext("webgl2")`
outside allowlist fails ✓; `new WebGPUDevice` outside device owners fails ✓;
device owners + allowlisted + clean files pass ✓; GLSL outside chunk dirs
fails ✓, inside passes ✓. Live assertion: zero enforced findings repo-wide.

## T4.10 — BUNDLE_SIZES.md re-measurement

`pnpm check:bundle-size` re-run on the post-T4.6 tree. `BUNDLE_SIZES.md` +
`tests/reports/bundle-size.json` regenerated from output only:

| Target | Before | After |
|---|---:|---:|
| `@aura3d/lean` critical path | 77,458 gzip **pass** | 516,090 gzip **fail** |
| product-viewer template | 207,889 pass | 516,328 fail |
| cinematic-scene | 398,503 pass | 540,812 fail |
| mini-game | 213,946 pass | 556,832 fail |
| engine compat root (info) | 575,343 | 735,138 |

The "77,458 B pass" row and "new-app budget applies to `@aura3d/lean`" text
are deleted. The `markdown.mjs` generator's Known-Overrun paragraph was
rewritten at the source: the lean shim now pulls the engine critical path —
an honest fail until Q-13-1 migrates consumers to engine subpaths and the
shim is removed at 4.0.0. No budget was raised to manufacture a pass.
(`tools/bundle-size/{index,markdown}.mjs` edits are lane-11 boundary crossings
forced by T4.8/T4.10 — recorded in Q-11-5.)

Also surfaced and fixed: `tests/qr/prd15/fixtures/` was covered by the
top-level `fixtures/` gitignore rule — PR #169's committed codemod test read
uncommitted files. `!tests/qr/prd15/fixtures/` negation added; all fixture
trees now tracked.

## Verification summary (this branch)

- `vitest run tests/qr/prd15/` — 71/71 green (incl. 8 new gate fixtures).
- `tsc -p tsconfig.build.json --noEmit` — clean except 3 pre-existing
  `tools/bundle-scenarios` errors (baseline breakage, files untouched).
- `eslint --max-warnings 0` on every changed `.ts` — clean.
- `tools/qr-ownership/check.mjs` — every changed path resolves to lane 15
  except `tools/bundle-size/{index.ts,markdown.mjs}` (11-owned; see Q-11-5).
- `tools/arch-gates` — 0 enforced findings (54 warn-mode findings are the
  pre-existing allowlisted debt).

## NOT-RUN

- §16.3 PNG capture for the lean fixtures — the `qr-prd15-captures.yml`
  workflow lands with this branch; the artifact lands on the first
  macos-14 run post-merge.
- T4.3 browser/axe overlay test — same lane.
- T4.4 flag default-on — deferred (needs two green sentinel checkpoints).
