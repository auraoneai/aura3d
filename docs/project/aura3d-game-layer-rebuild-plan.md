# Aura3D Game Layer Rebuild Plan

## Decision

Aura3D now has a root-safe diagnostic proof layer for racing and platformer game
geometry. The public showcase does not currently include public-quality racing
or platformer examples from this layer.

The Racing Game Layer Proof and Platformer Game Layer Proof routes are retained
as `game-layer-diagnostic` routes. Turbo Drift Circuit and Skyline Runner remain
retained `prototype-blocked` routes. None of these four routes is a public
release candidate until visible asset composition, geometry evidence,
route-primary screenshot, gameplay proof, route-health, visual review, and
launch evidence all pass public release gates.

## Implemented Public Layer

- `packages/engine/src/agent-api/PublicGameGeometry.ts` defines reusable public
  racing and platformer certification states and validators.
- `game.certifyRacingGeometry` and `game.certifyPlatformerGeometry` are exported
  through the root `@aura3d/engine` safe API.
- `aura.assets.json` records `gameGeometry` certification metadata for the four
  proof assets, and `src/aura-assets.ts` mirrors that manifest.
- The showcase spec parser, artifact writer, and release evidence path now carry
  retained game-geometry evidence.
- `tools/showcase-library/showcase-game-release-gates.mjs` rejects public game
  routes that do not have current retained screenshot, report, manifest,
  asset-hash evidence, visual review pass, and no blockers.
- `tools/showcase-library/build-and-check.mjs` now separates
  `game-layer-diagnostic` from public release candidates.

## Game-Layer Diagnostic Routes

`showcase-racing-game-layer-proof` is a retained racing diagnostic route.

- Primary vehicle: `assets.showcaseTexturedSportsCar`.
- Secondary track: `assets.showcaseTsukubaCircuit`.
- Certification: `certified-racing-vehicle` plus `certified-racing-track`.
- Retained topology report:
  `tests/reports/showcase-spec-compiler/racing-game-layer-proof/game-template/showcase-racing-game-layer-proof-racing-track-topology.json`.
- Retained route-primary screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.png`.
- Screenshot SHA-256:
  `sha256-3482e556b3532d191166b83a7b11c05e846b3d8eeba190073ddbe9513c1a7710`.
- Browser gameplay proof:
  `tests/reports/showcase-gameplay/showcase-racing-game-layer-proof.json`.
- Current public visual blockers:
  `visual:racing-proof-reads-as-diagnostic-harness`,
  `visual:racing-track-scale-and-camera-not-public-quality`,
  `visual:racing-debug-gates-visible`, and
  `visual:racing-scene-not-polished-game-presentation`.

`showcase-platformer-game-layer-proof` is a retained platformer diagnostic
route.

- Primary character: `assets.showcaseWalkAnimatedGirl`.
- Secondary world: `assets.showcaseSideScrollerWorld`.
- Certification: `certified-platformer-character` plus
  `certified-platformer-world`.
- Retained playable-surface report:
  `tests/reports/showcase-spec-compiler/platformer-game-layer-proof/game-template/showcase-platformer-game-layer-proof-platformer-playable-surfaces.json`.
- Retained route-primary screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.png`.
- Screenshot SHA-256:
  `sha256-258c3c3787cc28f2903a69cc4d2b9518b5e29ed796c6c96874756623d820709c`.
- Browser gameplay proof:
  `tests/reports/showcase-gameplay/showcase-platformer-game-layer-proof.json`.
- Current public visual blockers:
  `visual:platformer-proof-reads-as-diagnostic-harness`,
  `visual:character-not-visibly-grounded-on-platform`,
  `visual:debug-surface-guides-visible`, and
  `visual:character-world-composition-not-public-quality`.

The retained manifest evidence is bound per certified asset through that asset's
manifest `hash` field, but the current asset-pair evidence is diagnostic-only:
`visualReview` is `fail`, `assetPairPass` is `false`, and blockers are retained
until the presentation layer is rebuilt.

- `showcaseTexturedSportsCar`:
  `sha256-2cb94499492c96cbe6414206c292871cdf8b6c883b5389a4f4c96a05c2ebc935`.
- `showcaseTsukubaCircuit`:
  `sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031`.
- `showcaseWalkAnimatedGirl`:
  `sha256-93872fc24240a071b6195d6f1339f40b09b3308dc998311252d21ebd9042d8c6`.
- `showcaseSideScrollerWorld`:
  `sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4`.

## Release Gate Requirements

Visual review remains a hard public-release gate. Route-primary, deploy, and
gameplay proof are necessary but insufficient for public game examples.

A game route can be public only when all of the following are true:

- It has retained game-geometry evidence bound to current asset hashes.
- The release checker validates retained files from disk, not only shape-valid
  JSON.
- The retained topology or surface report exists, parses, and passes for the
  current route.
- The route-primary screenshot hash recorded in game geometry evidence matches
  the current retained screenshot file.
- The asset manifest records matching `gameGeometry` certification for each
  participating public asset.
- Gameplay proof uses the certified geometry evidence instead of route-local
  proof-only points or rectangles.
- The retained screenshot reads as a credible public game example, without
  diagnostic debug gates, debug surface guides, or ungrounded character/world
  composition.
- Route-health, route-gates, visual review, route-primary evidence, gameplay
  evidence, and launch evidence agree.

## Current Evidence State

- `pnpm typecheck:raw` is the required typecheck for this corrected state.
- `pnpm exec vitest run tests/unit/create-aura3d/showcase-racing-spec.test.ts tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/create-aura3d/showcase-spec-evidence.test.ts tests/unit/create-aura3d/showcase-spec-compiler.test.ts --reporter=dot`
  passes.
- `pnpm exec vitest run tests/unit/game-runtime/game-runtime-source-gates.test.ts --reporter=dot`
  passes.
- `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts tests/unit/tools/showcase-game-release-gates.test.ts --reporter=dot`
  is the required unit contract suite for this corrected state.
- `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line`
  is the required retained screenshot/route-primary evidence suite.
- `pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line`
  passes five gameplay routes, including the two new proof routes.
- `pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line`
  passes.
- `node tools/showcase-library/build-and-check.mjs` must pass public release
  accounting with 6/6 public release candidates, 2 retained internal
  diagnostics, 2 retained game-layer diagnostics, 2 prototype-blocked game
  routes, and the index route handled separately.

## Current Prototype Status

Turbo Drift Circuit remains prototype-blocked by racing public-presentation
blockers, including `asset-pair:racing-public-composition-bounds-missing`.

Skyline Runner remains prototype-blocked by platformer public-presentation
blockers, including
`asset-pair:platformer-public-character-world-binding-missing`.

These routes can become public only after they pass the new reusable game layer
gates with current retained evidence. The exact remaining layer is public
presentation: a route composition that reads as an actual racing or platformer
game, not a diagnostic harness, with typed assets visibly bound to the play
surface and all debug proof guides removed from the public presentation path.
