# Aura3D Public Platformer Presentation Report

## Scope

This report records the public platformer presentation layer added on
2026-07-03. The claim label is `createAuraApp` root safe API. The route uses
public `@aura3d/engine` helpers and generated typed assets only; it does not
claim production renderer parity, WebGPU rendering, native physics, a reusable
commercial platformer kit, or a general collision system.

## Public Route

`apps/showcase-public-platformer-presentation-proof` is the public platformer
presentation proof route.

- Character asset: `assets.showcaseWalkAnimatedGirl`.
- Surface provenance asset: `assets.showcaseSideScrollerWorld`.
- Visible level geometry: generated public platformer ground, platforms,
  hazards, checkpoints, collectibles, and finish marker from root-safe
  `game` helpers.
- Route evidence global:
  `window.__AURA3D_SHOWCASE_PUBLIC_PLATFORMER_PRESENTATION_PROOF__`.
- Route health:
  `apps/showcase-public-platformer-presentation-proof/route-health.json`.

The route intentionally does not render the old side-scroller GLB wall as the
public stage. The typed side-scroller world remains the certified
manifest-backed surface-map provenance asset, while the visible stage is a
clean side-scroller presentation generated through public helpers.

## Public API Surface

The root-safe platformer presentation helpers are exposed through
`game` from `@aura3d/engine`:

- `game.publicPlatformerPresentation`
- `game.platformerGroundMesh`
- `game.platformerPlatformMesh`
- `game.platformerHazard`
- `game.platformerCheckpoint`
- `game.platformerFinish`
- `game.platformerCameraRig`
- `game.certifyPlatformerPresentation`

The helper layer keeps diagnostic geometry contracts separate from public
presentation geometry. Public examples still use typed `assets.*` references,
and do not import `three`, `GLTFLoader`, renderer internals, raw GLB URLs, raw
asset IDs, or DOM/CSS/canvas fake 3D effects.

## Evidence

- Route-primary probe:
  `tests/reports/showcase-route-primary-probes/showcase-public-platformer-presentation-proof.json`.
- Route-primary screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-public-platformer-presentation-proof.png`.
- Route-primary screenshot SHA-256:
  `sha256-ac12b1b699f9c6bbb51fcf1ee9c543a303f9bf14c42dc35bf07e3596ec36cd58`.
- Retained platformer playable-surface report:
  `tests/reports/showcase-spec-compiler/public-platformer-presentation-proof/game-template/showcase-public-platformer-presentation-proof-platformer-playable-surfaces.json`.
- Gameplay proof:
  `tests/reports/showcase-gameplay/showcase-public-platformer-presentation-proof.json`.
- Manual desktop visual QA:
  `tests/reports/manual-visual-qa/showcase-public-platformer-presentation-proof-desktop.png`.
- Manual mobile visual QA:
  `tests/reports/manual-visual-qa/showcase-public-platformer-presentation-proof-mobile.png`.
- Visual review registry:
  `docs/project/showcase-visual-review.json`.
- Launch evidence:
  `docs/project/showcase-launch-evidence.json`.

`aura.assets.json` and generated `src/aura-assets.ts` now bind
`showcaseWalkAnimatedGirl` and `showcaseSideScrollerWorld` to the new public
platformer presentation proof with `visualReview: "pass"`,
`assetPairPass: true`, no blockers, the current screenshot hash, and the
public retained geometry report.

## Classification

- `showcase-public-platformer-presentation-proof` is a public release-ready
  candidate.
- `showcase-platformer-game-layer-proof` remains a `game-layer-diagnostic`
  route. It continues to prove geometry contracts and evidence plumbing, not
  public platformer presentation.
- Skyline Runner remains prototype-blocked.
- Turbo Drift Circuit remains prototype-blocked.

`node tools/showcase-library/build-and-check.mjs` now reports:

```text
Showcase public release evidence passed for 8/8 release candidates; 2 internal diagnostics retained; 2 game-layer diagnostics retained; 1 index route handled separately.
```

## Verification

The following commands passed for this report:

```bash
pnpm typecheck:raw
pnpm exec vitest run tests/unit/game-runtime/public-game-geometry.test.ts tests/unit/tools/showcase-game-release-gates.test.ts tests/unit/tools/showcase-route-gates.test.ts --reporter=dot
pnpm exec vitest run tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/create-aura3d/showcase-spec-evidence.test.ts tests/unit/create-aura3d/showcase-spec-compiler.test.ts --reporter=dot
pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line
node tools/showcase-library/build-and-check.mjs
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-public-platformer-presentation-proof/dist --release --source apps/showcase-public-platformer-presentation-proof/src --asset showcaseWalkAnimatedGirl --asset showcaseSideScrollerWorld
```

The public platformer route was also manually viewed at desktop and mobile
viewport sizes. The desktop view shows the grounded typed character, styled
platforms, hazards, checkpoint markers, and public HUD without diagnostic rails
or the old GLB wall. The mobile view keeps the character and first platform in
frame with controls visible and no text overlap.
