# Aura3D Game Layer Proof Report

> **Historical snapshot:** This document preserves the pre-presentation diagnostic proof snapshot. It is superseded for current classification and release counts by `docs/project/aura3d-144-release-notes.md`, `docs/project/showcase-launch-evidence.json`, and `tools/showcase-library/route-gates.json`. Current aggregate status is 9/9 public release candidates plus one superseded historical platformer route, two internal diagnostics, two game-layer diagnostics, and zero prototype-blocked routes.

## Scope

This report records the current diagnostic proof state for the root-safe Aura3D
game layer. The claim label is `createAuraApp` root safe API for contracts,
certification helpers, retained evidence plumbing, and route-local gameplay
proof. It does not claim public-quality racing/platformer presentation,
production rendering parity, reusable commercial game kits, native physics, or a
general-purpose collision system.

## Public API Surface

- `packages/engine/src/agent-api/PublicGameGeometry.ts` defines the public
  geometry certification contracts.
- `game.certifyRacingGeometry` validates certified racing route topology,
  checkpoints, road width, drivable bounds, camera bounds, vehicle scale, and
  retained proof metadata.
- `game.certifyPlatformerGeometry` validates certified platformer surfaces,
  hazards, checkpoints, finish, world bounds, camera bounds, character scale,
  and retained proof metadata.
- The root `@aura3d/engine` export exposes the certification helpers through
  `game`, so public routes do not import renderer internals.

## Game-Layer Diagnostic Routes

`showcase-racing-game-layer-proof`

- Uses `assets.showcaseTexturedSportsCar` and
  `assets.showcaseTsukubaCircuit`.
- Uses `game.assetBoundRacingRoute`, `game.racingSceneBinding`,
  `game.racingPresentationTrack`, `game.racing`, and
  `game.certifyRacingGeometry`.
- Retains route-primary evidence at
  `tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.json`.
- Retains gameplay evidence at
  `tests/reports/showcase-gameplay/showcase-racing-game-layer-proof.json`.
- Retains topology evidence at
  `tests/reports/showcase-spec-compiler/racing-game-layer-proof/game-template/showcase-racing-game-layer-proof-racing-track-topology.json`.
- Current public visual blockers:
  `visual:racing-proof-reads-as-diagnostic-harness`,
  `visual:racing-track-scale-and-camera-not-public-quality`,
  `visual:racing-debug-gates-visible`, and
  `visual:racing-scene-not-polished-game-presentation`.

`showcase-platformer-game-layer-proof`

- Uses `assets.showcaseWalkAnimatedGirl` and
  `assets.showcaseSideScrollerWorld`.
- Uses `game.assetBoundPlatformerLevel`, `game.platformerSceneBinding`,
  `game.platformerPresentationSurfaces`, `game.platformer`, and
  `game.certifyPlatformerGeometry`.
- Retains route-primary evidence at
  `tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.json`.
- Retains gameplay evidence at
  `tests/reports/showcase-gameplay/showcase-platformer-game-layer-proof.json`.
- Retains playable-surface evidence at
  `tests/reports/showcase-spec-compiler/platformer-game-layer-proof/game-template/showcase-platformer-game-layer-proof-platformer-playable-surfaces.json`.
- Current public visual blockers:
  `visual:platformer-proof-reads-as-diagnostic-harness`,
  `visual:character-not-visibly-grounded-on-platform`,
  `visual:debug-surface-guides-visible`, and
  `visual:character-world-composition-not-public-quality`.

## Gate Results

- Route-primary screenshot proof is retained for both diagnostic proof routes.
- Gameplay proof passed for all five game routes:
  Turbo Drift Circuit, Racing Game Layer Proof, Skyline Runner, Platformer Game
  Layer Proof, and Blockfall Reactor.
- Launch evidence passes public release accounting with 6/6 release candidates,
  2 internal diagnostics, 2 game-layer diagnostics, and 2 prototype-blocked
  game routes:
  `docs/project/showcase-launch-evidence.json`.
- Visual review records the two proof routes as public visual failures retained
  for diagnostic evidence:
  `docs/project/showcase-visual-review.json`.

## Hashes

- Racing proof screenshot:
  `sha256-3482e556b3532d191166b83a7b11c05e846b3d8eeba190073ddbe9513c1a7710`.
- Platformer proof screenshot:
  `sha256-258c3c3787cc28f2903a69cc4d2b9518b5e29ed796c6c96874756623d820709c`.
- Asset manifest:
  `sha256-9d78be7f9a236a153a1afd97e21c867fbad198d86155b88e90719877e1773993`.

## Prototype Holdbacks

Turbo Drift Circuit and Skyline Runner remain prototype-blocked. Racing Game
Layer Proof and Platformer Game Layer Proof remain game-layer diagnostics. Their
retained proof is useful as regression context, but none of these four routes is
promoted by the current game layer work. The exact remaining layer is public
presentation: a route composition that reads as a real racing or platformer game
instead of a diagnostic harness, with current retained geometry reports,
matching screenshot hashes, manifest-backed certification, browser gameplay
proof, route-health agreement, visual-review pass, and launch-evidence agreement.
