# Aura3D Public Racing Presentation Report

## Scope

This report records the public racing presentation layer added on
2026-07-03. The claim label is `createAuraApp` root safe API. The route uses
public `@aura3d/engine` helpers and generated typed assets only; it does not
claim production renderer parity, WebGPU rendering, native vehicle physics, a
reusable commercial racing kit, or a general collision system.

## Public Route

`apps/showcase-public-racing-presentation-proof` is the public racing
presentation proof route.

- Vehicle asset: `assets.showcaseTexturedSportsCar`.
- Track topology provenance asset: `assets.showcaseTsukubaCircuit`.
- Visible racing geometry: generated public racing road mesh, styled curbs,
  checkpoint gates, start/finish gantry, launch grid, and camera framing from
  root-safe `game` helpers.
- Route evidence global:
  `window.__AURA3D_SHOWCASE_PUBLIC_RACING_PRESENTATION_PROOF__`.
- Route health:
  `apps/showcase-public-racing-presentation-proof/route-health.json`.

The route intentionally does not promote Turbo Drift Circuit. The typed
Tsukuba circuit remains the certified manifest-backed topology provenance
asset, while the visible racing route is a clean public presentation generated
through public helpers.

## Public API Surface

The root-safe racing presentation helpers are exposed through `game` from
`@aura3d/engine`:

- `game.assetBoundRacingRoute`
- `game.racingSceneBinding`
- `game.racingRoadMesh`
- `game.racingCheckpointGate`
- `game.racingStartFinish`
- `game.publicRacingPresentation`
- `game.racingCameraRig`
- `game.certifyRacingPresentation`

The helper layer keeps diagnostic geometry contracts separate from public
presentation geometry. Public examples still use typed `assets.*` references,
and do not import `three`, `GLTFLoader`, renderer internals, raw GLB URLs, raw
asset IDs, or DOM/CSS/canvas fake 3D effects.

## Evidence

- Route-primary probe:
  `tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.json`.
- Route-primary screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-public-racing-presentation-proof.png`.
- Route-primary screenshot SHA-256:
  `sha256-3f4c83fa739c76e48787902f7169e683a658618e95e446c092c52ceb140c8c44`.
- Retained racing topology report:
  `tests/reports/showcase-spec-compiler/public-racing-presentation-proof/game-template/showcase-public-racing-presentation-proof-racing-track-topology.json`.
- Gameplay proof:
  `tests/reports/showcase-gameplay/showcase-public-racing-presentation-proof.json`.
- Manual desktop visual QA:
  `tests/reports/manual-visual-qa/showcase-public-racing-presentation-proof-desktop.png`.
- Manual mobile visual QA:
  `tests/reports/manual-visual-qa/showcase-public-racing-presentation-proof-mobile.png`.
- Visual review registry:
  `docs/project/showcase-visual-review.json`.
- Launch evidence:
  `docs/project/showcase-launch-evidence.json`.

`aura.assets.json` and generated `src/aura-assets.ts` bind
`showcaseTexturedSportsCar` and `showcaseTsukubaCircuit` to the new public
racing presentation proof with `visualReview: "pass"`,
`assetPairPass: true`, no blockers, the current screenshot hash, and the
public retained geometry report.

## Classification

- `showcase-public-racing-presentation-proof` is a public release-ready
  candidate.
- `showcase-racing-game-layer-proof` remains a `game-layer-diagnostic` route.
  It continues to prove geometry contracts and evidence plumbing, not public
  racing presentation.
- Turbo Drift Circuit remains prototype-blocked.
- Skyline Runner remains prototype-blocked.

`node tools/showcase-library/build-and-check.mjs` now reports:

```text
Showcase public release evidence passed for 8/8 release candidates; 2 internal diagnostics retained; 2 game-layer diagnostics retained; 1 index route handled separately.
```

## Verification

The following commands passed for this report:

```bash
pnpm typecheck:raw
pnpm exec vitest run tests/unit/game-runtime/public-game-geometry.test.ts tests/unit/tools/showcase-game-release-gates.test.ts tests/unit/tools/showcase-route-gates.test.ts --reporter=dot
pnpm exec vitest run tests/unit/create-aura3d/showcase-racing-spec.test.ts tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/create-aura3d/showcase-spec-evidence.test.ts tests/unit/create-aura3d/showcase-spec-compiler.test.ts --reporter=dot
pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line
pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line
node tools/showcase-library/build-and-check.mjs
pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-public-racing-presentation-proof/dist --release --source apps/showcase-public-racing-presentation-proof/src --asset showcaseTexturedSportsCar --asset showcaseTsukubaCircuit
```

The public racing route was also manually viewed at desktop and mobile
viewport sizes. The desktop view shows the typed sports car visibly bound to
styled racing geometry with route, gates, and HUD readable. The mobile view
keeps the car and road in frame with controls visible and no text overlap.
