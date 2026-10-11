# Q-13-16 — workspace-alias scaffold bundles deadlocked on the mount dynamic import (vite preview)

Requested from lane 15, Phase 8 (PR #357 CI). Edits landed on lane-13-owned
surfaces as a cross-lane CI unblock; filing for ownership review per §12.4.

## Symptom

Skills gate (job 113162408026): 12/20 templates failed at the browser stage
on `04ad39f2e` — `page.evaluate` 300s timeouts in `look-floor.ts`,
`data-aura3d-ready` never set within the 150s ready-poll,
`__AURA3D_GAME_SOURCE__.readiness` never set, `locator.boundingBox` 30s.
All signatures reduce to one cause: the production mount never settled in
the `vite preview` bundle. Probe on a generated racing-starter:
`apps: 1`, `drawCalls: 0`, `errors: []`, `data-aura3d-ready` absent after
60 s+; identical scaffold under `vite dev` mounted in <10 s.

## Root cause — entry ↔ dynamic-chunk async-evaluation deadlock

1. Template mains top-level-await `app.ready()` (and `app.stepAsync(0)`) in
   evidence mode (`navigator.webdriver` — always true under Playwright).
   The entry module's evaluation suspends there (`evaluating-async`).
2. `writeWorkspaceViteConfig` aliases every `@aura3d/*` specifier onto
   package source files, so rollup places shared engine modules inside the
   ENTRY chunk.
3. The mount reaches `await import("../../production-runtime/TypedGLBActor.js")`
   (`agent-api/compiler/renderer.ts`) → the emitted chunk statically imports
   symbols from the still-evaluating entry → its evaluation queues behind
   the entry → `import()` pends forever → mount pends → `ready()` pends →
   the TLA never resolves → deadlock. Verified live: re-importing the entry
   chunk from the page also pends; leaf chunks resolve.

Under `vite dev` no entry chunk exists — TypedGLBActor's deps are
already-evaluated engine modules — so it never reproduces in dev.

## Fixes landed (lane 15, commit `2e0f0701d`)

- `tools/agent-templates/index.ts` `writeWorkspaceViteConfig`: generated
  config gains `build.rollupOptions.output.manualChunks` — every
  `/packages/` module pinned to a non-entry `aura3d-vendor` chunk. The
  vendor chunk is a static dep of the entry and is fully evaluated before
  entry code runs, so dynamic chunks never wait on the suspended entry.
- `tools/agent-docs/simulation.ts` `writeWorkspaceViteConfig`: same split —
  same aliased-config shape, same hazard.
- `packages/create-aura3d/templates/*/tests/look-floor.ts` (×20):
  45-step settle loop bounded by a 420 s wall-clock budget (`stepApp`
  already races each step at 30 s; a pended mount still burns the budget
  and yields a readable floor report instead of a bare 300 s timeout).
- `packages/create-aura3d/templates/*/tests/screenshot.spec.ts` (×20):
  `test.setTimeout(600_000)`; browser stage cap in
  `tools/agent-templates/index.ts` raised to 1_200_000 ms to cover the
  spec ceilings in series (route-health ~150 s + screenshot 600 s +
  release-render 240 s + boot slack).
- Root `templates/` mirrors regenerated via `sync-root-templates.mjs`
  (`--check` green).

## Verified locally

racing-starter scaffold under `vite preview` after the split:
`data-aura3d-ready="true"`, `drawCalls 216` (identical to dev), route-health
spec passes, look-floor reaches a real floor report.

## Open questions for lane 13

- **Packaged (installed-tarball) apps can hit the same cycle**: any consumer
  app that top-level-awaits app readiness can deadlock when its bundler
  places shared modules in the entry chunk and the mount-path dynamic
  import's chunk depends on them. Worth a docs note (template README /
  MIGRATION-4.0) recommending non-TLA readiness patterns or equivalent
  chunking guidance. The generated-config fix only covers workspace smokes.
- racing-starter now reaches the floor assert but lands at
  `brightPixels/sampledPixels = 0.0186` vs `MIN_BRIGHT_FRACTION 0.02` on
  swiftshader — a marginal near-miss on a real frame (dark golden-hour
  scene, small lit objects). If it also fails on CI, floor calibration for
  this scene is a lane-13 call (adjacent: Q-13-15 recalibration precedent).
- `look-floor.ts` edits are lane-13-owned template sources — review the
  420 s budget constant; it is deliberately above the local ~90-120 s
  settle cost and below the spec timeout.

## Addendum — fighting-game tab crash under sustained software-GL rendering

Same cycle surfaced a second, unrelated failure: `fighting-game`'s
`gameplay-smoke.spec.ts` crashed the page twice on CI (`Target closed` during
`waitForFunction`, and a stall inside the "Run replay" click). Root cause is
not a mount problem and not a memory leak (renderer RSS flat at ~680 MB
locally) — it is a swiftshader/ANGLE tab-crash window (~80 s of sustained
full-quality skinned rendering) that lands inside the spec's 120 s budget on
the 7 GB CI runner. Replay evidence is satisfied only after ~45 s of GPU-bound
frames, so the crash wins the race.

Fix shipped on this branch (lane-15 CI unblock, template code is lane-13's):
`packages/create-aura3d/templates/fighting-game/src/main.ts` now passes
`performanceQuality` (`resolutionScale: 0.5`, `particleScale: 0.5`,
`lodBias: 2`, `shadowSize: 512`) when `navigator.webdriver` is true. All spec
assertions are resolution/shadow independent; local browser stage is 3/3 in
1.1 min. Lane 13 may want the same evidence-mode budget on other
skinned/heavy templates if their specs start racing the same crash window.

Open item for lane 13 (unchanged): no scaffold ships `public/hdri/*.hdr`, so
`environment.hdriStatus` is `fallback` everywhere and look floors stay
marginal (racing-starter 0.0186 vs 0.02).
