# Aura3D Game Layer Implementation Report

> **Historical snapshot:** This document preserves the 2026-07-02 diagnostic implementation snapshot. It is superseded for current classification and release counts by `docs/project/aura3d-144-release-notes.md`, `docs/project/showcase-launch-evidence.json`, and `tools/showcase-library/route-gates.json`. Current aggregate status is 10/10 public release candidates, two internal diagnostics, two game-layer diagnostics, and zero prototype-blocked routes.

## Scope

This report records the corrected root-safe Aura3D game-layer diagnostic state
as of 2026-07-02. The claim label is `createAuraApp` root safe API for the
contract helpers and diagnostic proof routes. The work does not claim public
quality racing/platformer presentation, production renderer parity, native
physics, a general collision system, WebGPU rendering, or reusable commercial
game kits.

## Corrected Status

- Aura3D now has a root-safe diagnostic game-geometry certification layer: yes.
- Aura3D does not yet have public-quality racing/platformer presentation layer: no.
- The proof routes validate contracts/evidence plumbing, not public game quality.
- The screenshots currently fail public visual QA.
- Turbo/Skyline remain prototype-blocked.
- The proof routes are internal diagnostics until visual presentation is rebuilt.

The required next layer is specifically:

1. public racing presentation renderer/template
   - polished road mesh
   - no debug gates as primary visual
   - car visibly on track
   - camera reads as racing
   - coherent scale/framing

2. public platformer presentation renderer/template
   - character visibly grounded
   - collision guides hidden or styled as game geometry
   - platforms look like platforms
   - side-scroller camera/framing
   - coherent character/world scale

3. separation of diagnostic overlays from public visuals
   - diagnostic geometry may exist
   - public screenshots must hide/debug-style guides unless they are
     intentionally styled game elements

## Final Answers

1. Aura3D now has a reusable racing geometry contract layer: yes.
   `packages/engine/src/agent-api/PublicGameGeometry.ts` defines the public
   racing geometry contract and `game.certifyRacingGeometry` exposes the
   certification helper through root `@aura3d/engine`. The retained proof route
   is diagnostic-only and does not prove public-quality racing presentation.

2. Aura3D now has a reusable platformer geometry contract layer: yes.
   `packages/engine/src/agent-api/PublicGameGeometry.ts` defines the public
   platformer geometry contract and `game.certifyPlatformerGeometry` exposes the
   certification helper through root `@aura3d/engine`. The retained proof route
   is diagnostic-only and does not prove public-quality platformer presentation.

3. Diagnostic routes proving the contract layer:
   `apps/showcase-racing-game-layer-proof` and
   `apps/showcase-platformer-game-layer-proof`. They are classified as
   `game-layer-diagnostic`, not `release-ready candidate`.

4. Screenshots proving diagnostic plumbing:
   `tests/reports/showcase-route-primary-probes/showcase-racing-game-layer-proof.png`
   with SHA-256
   `sha256-3482e556b3532d191166b83a7b11c05e846b3d8eeba190073ddbe9513c1a7710`,
   and
   `tests/reports/showcase-route-primary-probes/showcase-platformer-game-layer-proof.png`
   with SHA-256
   `sha256-258c3c3787cc28f2903a69cc4d2b9518b5e29ed796c6c96874756623d820709c`.
   These screenshots are retained as diagnostic evidence; the visual review
   marks both as public-release failures.

5. Assets certified:
   `showcaseTexturedSportsCar` is `certified-racing-vehicle`,
   `showcaseTsukubaCircuit` is `certified-racing-track`,
   `showcaseWalkAnimatedGirl` is `certified-platformer-character`, and
   `showcaseSideScrollerWorld` is `certified-platformer-world`.

6. Generated diagnostic game geometry retained:
   the racing proof route retains circuit topology, checkpoints, start/finish
   binding, car placement, and screenshot-hash evidence from retained track
   topology. The platformer proof route retains surfaces, hazards, checkpoints,
   finish, character placement, and screenshot-hash evidence from retained
   playable-surface evidence. These prove contracts and evidence plumbing, not
   a public racing or platformer scene.

7. Tests and gates passed in this implementation pass:
   `pnpm typecheck:raw`;
   `pnpm exec vitest run tests/unit/create-aura3d/showcase-racing-spec.test.ts tests/unit/create-aura3d/showcase-platformer-spec.test.ts tests/unit/create-aura3d/showcase-spec-evidence.test.ts tests/unit/create-aura3d/showcase-spec-compiler.test.ts --reporter=dot`;
   `pnpm exec vitest run tests/unit/game-runtime/game-runtime-source-gates.test.ts --reporter=dot`;
   `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`;
   `pnpm exec vitest run tests/unit/tools/showcase-game-release-gates.test.ts --reporter=dot`;
   `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line`;
   `pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line`;
   `pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line`;
   `node tools/showcase-library/build-and-check.mjs`; and direct deploy checks
   for both proof routes.

8. Release gates updated:
   `tools/showcase-library/showcase-game-release-gates.mjs` still requires
   public game geometry evidence, retained route-primary screenshot hash
   validation, retained geometry report validation, manifest asset hash
   validation, visual review pass, asset-pair pass, and per-asset
   `gameGeometry` certification with retained evidence for public game routes.
   `tools/showcase-library/build-and-check.mjs` now separates
   `game-layer-diagnostic` from public release candidates.

9. Turbo Drift Circuit returned to public examples: no.
   It remains prototype-blocked. It is retained as a diagnostic route, but it
   does not currently pass the full public-quality racing composition and
   certification standard required by the new game layer gates.

10. Skyline Runner returned to public examples: no.
    It remains prototype-blocked. It is retained as a diagnostic route, but it
    does not currently pass the full public-quality platformer composition and
    certification standard required by the new game layer gates.

11. Remaining blocked work:
    Turbo needs a rebuilt public racing presentation with typed car-to-road
    binding, track scale, camera framing, gameplay, visual review, route-health,
    and launch evidence that pass the public release gates. Skyline needs a
    rebuilt public platformer presentation with visible character grounding,
    playable-surface binding, scale, framing, gameplay, visual review,
    route-health, and launch evidence that pass the public release gates.

## Racing Proof

`showcase-racing-game-layer-proof` uses typed public assets:

- Vehicle: `assets.showcaseTexturedSportsCar`.
- Track: `assets.showcaseTsukubaCircuit`.
- Retained topology report:
  `tests/reports/showcase-spec-compiler/racing-game-layer-proof/game-template/showcase-racing-game-layer-proof-racing-track-topology.json`.
- Retained gameplay proof:
  `tests/reports/showcase-gameplay/showcase-racing-game-layer-proof.json`.
- Retained route-health evidence:
  `apps/showcase-racing-game-layer-proof/route-health.json`.

The route proves a road centerline, road width, start pose, checkpoints,
finish/lap state, drivable bounds, vehicle scale compatibility, retained
screenshot hashing, keyboard input, checkpoint progression, and reset. It uses
public `@aura3d/engine` game helpers and typed assets rather than `three`,
`GLTFLoader`, renderer internals, raw GLB URLs, or DOM/CSS fake 3D gameplay.
It does not prove public racing presentation. Current public visual blockers
are `visual:racing-proof-reads-as-diagnostic-harness`,
`visual:racing-track-scale-and-camera-not-public-quality`,
`visual:racing-debug-gates-visible`, and
`visual:racing-scene-not-polished-game-presentation`.

## Platformer Proof

`showcase-platformer-game-layer-proof` uses typed public assets:

- Character: `assets.showcaseWalkAnimatedGirl`.
- World: `assets.showcaseSideScrollerWorld`.
- Retained playable-surface report:
  `tests/reports/showcase-spec-compiler/platformer-game-layer-proof/game-template/showcase-platformer-game-layer-proof-platformer-playable-surfaces.json`.
- Retained gameplay proof:
  `tests/reports/showcase-gameplay/showcase-platformer-game-layer-proof.json`.
- Retained route-health evidence:
  `apps/showcase-platformer-game-layer-proof/route-health.json`.

The route proves ground surfaces, platform surfaces, hazards, checkpoints,
finish, spawn, world bounds, character scale compatibility, retained screenshot
hashing, keyboard movement, jump/progression, checkpoint events, hazard/respawn,
reset, and finish state. It uses public `@aura3d/engine` game helpers and typed
assets rather than `three`, `GLTFLoader`, renderer internals, raw GLB URLs, or
DOM/CSS fake 3D gameplay. It does not prove public platformer presentation.
Current public visual blockers are
`visual:platformer-proof-reads-as-diagnostic-harness`,
`visual:character-not-visibly-grounded-on-platform`,
`visual:debug-surface-guides-visible`, and
`visual:character-world-composition-not-public-quality`.

## Asset Certification

`aura.assets.json` and generated `src/aura-assets.ts` carry game certification
states:

- `not-game-ready`.
- `candidate-needs-geometry`.
- `certified-racing-track`.
- `certified-racing-vehicle`.
- `certified-platformer-world`.
- `certified-platformer-character`.
- `certified-generated-game-world`.

The release gate does not certify public game readiness from filenames, roles,
labels, deploy passes, release probes, or generic GLB validity. Public game
release readiness requires retained evidence with the current route-primary
screenshot, current screenshot hash, geometry report, per-asset manifest hash,
visual review pass, asset-pair pass, and no blockers. The four proof-route
assets currently retain diagnostic evidence with `visualReview: "fail"`,
`assetPairPass: false`, and explicit public visual blockers.

## Release State

`tools/showcase-library/route-gates.json` includes six public release
candidates, retains the two proof routes as `game-layer-diagnostic`, and keeps
Turbo Drift Circuit and Skyline Runner as prototype-blocked diagnostics.
`docs/project/showcase-visual-review.json` and
`docs/project/showcase-launch-evidence.json` agree with that classification.

`node tools/showcase-library/build-and-check.mjs` currently reports:

```text
Showcase public release evidence passed for 6/6 release candidates; 2 internal diagnostics retained; 2 game-layer diagnostics retained; 1 index route handled separately.
```
