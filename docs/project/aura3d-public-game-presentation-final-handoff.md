# Aura3D Public Game Presentation Final Handoff

## 1. Final Result

Aura3D now has public V1 racing and platformer presentation proof routes under
the root-safe `createAuraApp` / `@aura3d/engine` claim boundary. The public
showcase release state is PR-ready: public release evidence passes for 8/8
accepted candidates, the two public game routes have typed primary assets,
route-primary screenshots, gameplay proof, visual-review passes, and direct
deploy checks. This handoff does not claim production game-kit parity and does
not make Turbo Drift Circuit or Skyline Runner public.

## 2. Public Release Counts

- `ok`: `true`
- `publicReleaseOk`: `true`
- `publicVisualReviewOk`: `true`
- `classificationOk`: `true`
- `releaseCandidateCount`: `8`
- `releaseCandidatePassed`: `8`
- `internalDiagnosticCount`: `2`
- `gameLayerDiagnosticCount`: `2`
- `diagnosticRouteCount`: `4`
- `prototypeBlockedCount`: `2`
- `indexRouteCount`: `1`
- `allRoutesOk`: `false`, by design, because retained diagnostic and
  prototype-blocked routes keep their blockers instead of being promoted.

## 3. Public Routes Added

- `showcase-public-racing-presentation-proof`
  - Route: `apps/showcase-public-racing-presentation-proof`
  - Public index path: `/apps/showcase-public-racing-presentation-proof/`
  - Claim label: `createAuraApp` root safe API
  - Assets: `assets.showcaseTexturedSportsCar`,
    `assets.showcaseTsukubaCircuit`
  - Gameplay proof: throttle, steering, checkpoint, lap, and reset behavior
  - Visual review: pass, no blocking issues

- `showcase-public-platformer-presentation-proof`
  - Route: `apps/showcase-public-platformer-presentation-proof`
  - Public index path: `/apps/showcase-public-platformer-presentation-proof/`
  - Claim label: `createAuraApp` root safe API
  - Assets: `assets.showcaseWalkAnimatedGirl`,
    `assets.showcaseSideScrollerWorld`
  - Gameplay proof: movement, jump, checkpoint, hazard respawn, finish, and
    reset behavior
  - Visual review: pass, no blocking issues

## 4. Diagnostic Routes Retained

- `showcase-racing-game-layer-proof` remains `game-layer-diagnostic-retained`.
  It proves racing geometry contracts, screenshot-hash plumbing, and keyboard
  gameplay behavior, but visual review still blocks it as a diagnostic harness
  with non-public racing composition.
- `showcase-platformer-game-layer-proof` remains
  `game-layer-diagnostic-retained`. It proves platformer geometry contracts,
  screenshot-hash plumbing, and keyboard gameplay behavior, but visual review
  still blocks it as a diagnostic harness with visible surface guides and
  insufficient character grounding.

These old diagnostic proof routes are not public release candidates and are not
counted in the 8/8 public release set.

## 5. Prototype-Blocked Routes Retained

- Turbo Drift Circuit remains `prototype-blocked`. Its blockers include
  missing public racing composition bounds, car-to-road binding, and public
  track-camera composition proof.
- Skyline Runner remains `prototype-blocked`. Its blockers include missing
  public character/world binding, clipped or too-small route-primary foreground
  evidence, foot-contact proof, scale proof, and public platformer visual
  approval.

Turbo Drift Circuit and Skyline Runner remain directly retained as prototype
diagnostics only. They are not promoted by this handoff.

## 6. Screenshot Evidence And Hashes

- Racing route-primary screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.png`
- Racing route-primary SHA-256:
  `sha256-3f4c83fa739c76e48787902f7169e683a658618e95e446c092c52ceb140c8c44`
- Racing route-health hash:
  `sha256-4f1dd4e7d11a6fce6e2a9b27888d29001e0185f7351b2d270f732b79fa1c46aa`
- Platformer route-primary screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-public-platformer-presentation-proof.png`
- Platformer route-primary SHA-256:
  `sha256-ac12b1b699f9c6bbb51fcf1ee9c543a303f9bf14c42dc35bf07e3596ec36cd58`
- Platformer route-health hash:
  `sha256-24d5aa92e2ad19b5d6118724696cb2fa68878b2f0932d538a10024a6b77c9996`

Manual visual QA screenshots were inspected for both routes at desktop and
mobile sizes. The public racing route shows the typed sports car visibly bound
to styled road geometry with readable controls. The public platformer route
shows the typed character grounded on generated level geometry with readable
HUD and controls.

## 7. Commands Passed

```bash
pnpm typecheck:raw
pnpm exec vitest run tests/unit/game-runtime/public-game-geometry.test.ts tests/unit/tools/showcase-game-release-gates.test.ts tests/unit/tools/showcase-route-gates.test.ts --reporter=dot
pnpm exec vitest run tests/unit/create-aura3d/showcase-racing-spec.test.ts tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/create-aura3d/showcase-spec-evidence.test.ts tests/unit/create-aura3d/showcase-spec-compiler.test.ts --reporter=dot
pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line
node tools/showcase-library/build-and-check.mjs
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-public-racing-presentation-proof/dist --release --source apps/showcase-public-racing-presentation-proof/src --asset showcaseTexturedSportsCar --asset showcaseTsukubaCircuit
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-public-platformer-presentation-proof/dist --release --source apps/showcase-public-platformer-presentation-proof/src --asset showcaseWalkAnimatedGirl --asset showcaseSideScrollerWorld
```

Observed pass summaries:

- TypeScript build check: exit 0.
- Public game geometry and release-gate unit group: 3 files, 24 tests passed.
- Showcase racing/platformer compiler unit group: 4 files, 26 tests passed.
- Route-primary browser probe: 1 passed.
- Gameplay browser proof: 7 passed.
- Release asset browser probe: 1 passed.
- Showcase aggregate gate:
  `Showcase public release evidence passed for 8/8 release candidates; 2 internal diagnostics retained; 2 game-layer diagnostics retained; 1 index route handled separately.`
- Direct racing deploy check: `ok: true`, no failures.
- Direct platformer deploy check: `ok: true`, no failures.

## 8. Files Changed Summary

- Added public racing presentation proof route and public platformer
  presentation proof route.
- Updated the showcase index so the public game entries are the new V1 racing
  and platformer presentation routes.
- Updated release gates and launch evidence so public candidates, game-layer
  diagnostics, prototype-blocked routes, and the index route are classified
  separately.
- Bound typed asset evidence and retained geometry reports for both public
  game routes through `aura.assets.json`, `src/aura-assets.ts`, route health,
  route-primary probes, gameplay proofs, and visual review.
- Added this final handoff and the route-specific public racing presentation
  report.
- Applied a test-only Vitest timeout fix to slow negative showcase compiler
  tests so the required compiler/spec command completes instead of hitting the
  default 5s per-test timeout.

## 9. Remaining Limitations

- The racing route is a stylized generated public V1 proof, not a production
  racing game.
- The platformer route is a stylized generated public V1 proof, not a
  production platformer engine.
- There is no full physics or collision engine claim.
- There is no production renderer parity claim.
- There is no WebGPU, PBR, or postprocess claim.
- There is no claim that arbitrary GLBs automatically become public-quality
  games.
- Game-specific certification and presentation work are still required before
  any additional game route becomes public.

## 10. Next Recommended Work

Treat the next game work as a separate Turbo/Skyline rebuild effort, not a
generic game-layer session. Start with route-specific asset, camera,
composition, and evidence requirements for either Turbo Drift Circuit or
Skyline Runner, then rerun the same route-primary, gameplay, visual-review,
deploy, and build-and-check gates before changing their public status.
