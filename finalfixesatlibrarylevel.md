# Final Fixes At Library Level

## Direct Diagnosis

Turbo Drift and Skyline Runner were not primarily failing because GLBs could not render or because deploy metadata was missing. They were failing because the game geometry was not reliably certified from, and bound back to, the visible asset geometry.

The broken loop was:

typed asset -> separately placed model -> route-local proof points/rectangles -> input proof -> bad public game screenshot

The required contract is:

typed game asset -> extracted or validated game geometry -> shared scene binding -> generated route -> gameplay proof tied to visible geometry -> visual review

## Implementation Plan

1. Preserve structured game geometry in the asset manifest and typed asset output so the CLI does not drop topology/surface evidence.
2. Accept only public-safe geometry sources:
   - `asset-mesh-extracted`
   - `manifest-authored-overlay-validated`
   - `compiler-authored-overlay-validated`
3. Require hash-bound overlay evidence and model-alignment anchors for authored topology/surface maps.
4. Reject route-local presentation offsets that visually decouple gameplay geometry from retained model evidence.
5. Reject weak model-anchor fits that would allow a retained overlay to drift away from the real asset.
6. Keep public status blocked unless route-primary, deploy/release, gameplay alignment, and visual review all pass.

## Racing Track Topology Implementation

Aura3D now supports retained racing topology evidence for public game generation.

Implemented/validated pieces:

- `extractRacingTrackTopologyFromAsset(...)` derives mesh-backed road topology where possible.
- Overlay-authored topology is accepted only when it is hash-bound, has retained route overlay evidence, has enough route/checkpoint length, carries model-alignment anchors, and has no remaining extraction blockers.
- Racing scene bindings reject `trackModelPresentationOffset`, because that offset made it possible to move the visible track independently from the gameplay route.
- Racing scene bindings reject poor multi-anchor model fits with `asset geometry is not scene-bound to game geometry`.
- Replacement scoring records mesh-derived topology reasons and rejects candidates that are not release-quality or lack retained release probes.
- Evidence validation no longer lets overlay-authored geometry suppress extraction blockers.

Current retained Turbo topology evidence:

- asset: `showcaseTsukubaCircuit`
- asset hash: `sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031`
- report topology source: `asset-bound-road-topology`
- binding topology source: `asset-mesh-extracted`
- road centerline points: `19`
- checkpoints: `6`
- authored estimated lap seconds: `100`
- mesh extraction: `pass`
- mesh reasons: `mesh-derived racing topology from 7 road primitive(s)`, `lapLengthMeters:27.869`, `estimatedLapSeconds:100`
- evidence: `tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json`

This closes the old generic blocker `asset-pipeline:mesh-derived-racing-topology-extraction-and-scene-binding-missing`.

## Platformer Playable Surface Implementation

Aura3D now supports retained playable-surface evidence for public platformer generation, but Skyline's current active world asset does not meet the stricter mesh-derived public bar.

Implemented/validated pieces:

- `extractPlatformerPlayableSurfaceMapFromAsset(...)` derives mesh-backed playable surfaces where possible.
- Overlay-authored surface maps are no longer treated as enough if the extractor still reports blockers.
- Platformer scene bindings reject `worldModelPresentationOffset`, because that offset made it possible to move the visible world independently from the gameplay surfaces.
- Platformer scene bindings reject poor multi-anchor model fits with `asset geometry is not scene-bound to game geometry`.
- Replacement scoring records mesh-derived surface reasons and rejects candidates that are not release-quality or lack retained release probes.
- Evidence validation now reports `fail` for overlay maps when mesh extraction still reports blockers.

Current retained Skyline playable-surface evidence:

- asset: `showcaseSideScrollerWorld`
- asset hash: `sha256-68e115700a600bb3cfee70d0e0f75083c07cb6e38f29379aa935d871681a59b4`
- report surface source: `asset-bound-playable-surfaces`
- binding surface source: `manifest-authored-overlay-validated`
- retained public playable surfaces: `5`
- retained checkpoints: `6`
- authored playable seconds: `30`
- mesh extraction: `fail`
- extraction blocker: `asset-extraction:platformer-playable-surface-columns-ambiguous:showcaseSideScrollerWorld`
- evidence: `tests/reports/showcase-spec-compiler/skyline-runner/game-template/showcase-skyline-runner-platformer-playable-surfaces.json`

This does not make Skyline public. It replaces the old vague category-template blocker with a lower-level asset-catalog blocker:

`asset-catalog:release-ready-platformer-world-with-mesh-derived-playable-surfaces-missing`

## Implementation Attempt: Racing Track Topology

The implementation attempt succeeded at the geometry layer for the active Turbo track:

- The compiler generated retained topology evidence from the `showcaseTsukubaCircuit` mesh.
- The topology is bound to the current track hash.
- The route has 19 route points, 6 checkpoints, and an authored 100 second lap estimate.
- The engine now rejects nonzero presentation offsets and bad model-anchor fits, so future generated routes cannot move the visible track away from the gameplay route and still claim public evidence.

The remaining Turbo failure is not missing topology. It is public game composition and candidate readiness:

- active track/car screenshot still fails `asset-pair:car-route-not-visibly-bound-to-road-surface`
- active track/camera still fails `asset-pair:track-camera-composition-reads-as-proof-harness`
- replacement tracks with mesh topology exist, but candidates such as `showcaseMiniRaceTrack` and `showcaseSlotCarTrack` are not release-quality and lack passing retained release probes

## Implementation Attempt: Platformer Playable Surfaces

The implementation attempt succeeded at the scene-binding invariant layer, but failed honestly at the active Skyline world asset:

- The engine now rejects nonzero presentation offsets and bad model-anchor fits.
- The compiler now refuses to let a hash-bound overlay map hide a failed mesh extraction.
- `showcaseSideScrollerWorld` exposes flat horizontal mesh candidates, but the extractor cannot unambiguously distinguish true playable columns/surfaces from decorative columns in the current asset.
- Replacement candidates with mesh-derived playable surfaces exist, including `showcaseBeachRaceMap`, `showcaseDesertRaceMap`, `showcaseIsometricRaceTrack`, `showcaseMarbleTrack`, and `showcaseRaceGameEnvironment`, but they are not release-quality and lack passing retained release probes.

The remaining Skyline failure is:

`asset-catalog:release-ready-platformer-world-with-mesh-derived-playable-surfaces-missing`

## Extracted / Authored Geometry Evidence

Turbo:

- topology report: `tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json`
- report topology source: `asset-bound-road-topology`
- binding topology source: `asset-mesh-extracted`
- extraction status: `pass`
- asset binding: `aura-game-asset-bound-racing-route`

Skyline:

- surface report: `tests/reports/showcase-spec-compiler/skyline-runner/game-template/showcase-skyline-runner-platformer-playable-surfaces.json`
- report surface source: `asset-bound-playable-surfaces`
- binding surface source: `manifest-authored-overlay-validated`
- extraction status: `fail`
- extraction blocker: `asset-extraction:platformer-playable-surface-columns-ambiguous:showcaseSideScrollerWorld`

## Scene-Bound Game Kit Implementation

The public game scene-binding contract now has a geometry layer:

- `game.assetBoundRacingRoute(...)`
- `game.assetBoundPlatformerLevel(...)`
- racing and platformer scene-binding helpers in `packages/engine/src/agent-api/GameSceneGeometryBindings.ts`

These helpers keep one shared geometry transform for:

- visible model placement
- car or character gameplay position
- checkpoints/surfaces
- camera framing
- evidence validation

New invariants added in this pass:

- `game.racingSceneBinding` rejects `trackModelPresentationOffset`
- `game.platformerSceneBinding` rejects `worldModelPresentationOffset`
- both bindings reject bad multi-anchor fits through `assertModelAnchorFitQuality`
- compiler evidence treats overlay-authored geometry as failed if extraction blockers remain

Latest implementation change:

- `game.racingPresentationTrack(...)` now has a `game-circuit` mode. It renders the visible race surface from the validated racing topology: terrain pad, wider road bands, curbs, dashed lane markings, pit apron, checkpoints, and route markers. This removes the old failure mode where Turbo showed a decorative track GLB while gameplay used a separate proof loop.
- `game.platformerPresentationSurfaces(...)` now has a `game-level` mode. It renders the visible platformer stage from the validated playable-surface map: grounded platforms, trims, hazards, collectibles, checkpoints, finish marker, and backdrop. This removes the old failure mode where Skyline showed a decorative world GLB while collision used separate rectangles.
- The Turbo and Skyline compiler templates now emit those bound game-stage modes and no longer render the track/world GLB as the public game board. The track/world typed assets remain hash-bound evidence sources for topology/surface metadata, while the visible gameplay surface is generated from the certified geometry.
- Live Turbo and Skyline routes were patched to the same generated pattern so browser screenshots exercise the root template behavior, not a one-off route tweak.

## Public Release Gate Enforcement

The public showcase checker now treats game geometry evidence as retained file
evidence, not review prose:

- `tools/showcase-library/build-and-check.mjs` passes the repo root into the
  game release validator for any release-ready route with game template status.
- `tools/showcase-library/showcase-game-release-gates.mjs` verifies the current
  route-primary screenshot hash, current manifest asset hashes, retained
  topology/surface report path, report route id, report pass status, and report
  failures.
- The game release validator now fails without a repo root, so shape-valid
  JSON cannot be treated as public game evidence unless the checker can read
  the current retained files from disk.
- Racing public candidates must have a passing retained
  `aura3d-racing-track-topology/1.0` report with mesh extraction passing and an
  overlay bound to the current route-primary screenshot.
- Platformer public candidates must have a passing retained
  `aura3d-platformer-playable-surfaces/1.0` report with a surface map bound to
  the current route-primary screenshot.
- Unit coverage proves that synthetic screenshot hashes and stale asset hashes
  are rejected when the validator runs in release-check mode.

This means Turbo and Skyline cannot return to the public release path by
passing route-primary, deploy, and input/gameplay checks alone. They need
current visual review plus retained game-geometry evidence that matches the
actual files in the repo.

## Turbo Rebuild Result

Turbo was regenerated through the compiler path with mesh-derived topology from `showcaseTsukubaCircuit`.

Current implementation result before fresh browser evidence:

- geometry binding: implemented and retained
- visible gameplay stage: generated from `game-circuit` topology-bound geometry
- route-primary: requires regeneration after the latest template change
- gameplay: prototype input proof exists
- deploy/release: active assets are deploy-checkable
- visual review: still fail until a current screenshot proves the new composition is public-quality
- public status: blocked

The current lower-level Turbo blocker before fresh QA is:

`asset-pair:racing-public-composition-bounds-missing`

The retained compiler report rejects public status because the screenshot still fails the car/track public composition evidence:

- `asset-pair:car-route-not-visibly-bound-to-road-surface`
- `asset-pair:track-camera-composition-reads-as-proof-harness`

## Skyline Rebuild Result

Skyline was regenerated through the compiler path and now uses the validated surface map as the visible platformer stage instead of rendering the decorative `showcaseSideScrollerWorld` GLB as the public world.

Current implementation result before fresh browser evidence:

- geometry binding invariants: implemented
- visible gameplay stage: generated from `game-level` surface-map-bound geometry
- mesh-derived playable-surface extraction: still fail for active world; retained authored overlay evidence remains the current fallback
- route-primary: requires regeneration after the latest template change
- gameplay: prototype input proof exists
- deploy/release: active assets are deploy-checkable
- visual review: still fail until a current screenshot proves the new composition is public-quality
- public status: blocked

The current lower-level Skyline blocker before fresh QA is:

`asset-catalog:release-ready-platformer-world-with-mesh-derived-playable-surfaces-missing`

The retained compiler report rejects public status because:

- `asset-extraction:platformer-playable-surface-columns-ambiguous:showcaseSideScrollerWorld`
- `asset-pair:character-foot-contact-not-visibly-bound-to-platform-surface`
- `asset-pair:character-world-scale-and-art-direction-not-public-quality`

## Evidence

Compiler reports:

- `tests/reports/showcase-spec-compiler/turbo-drift-circuit/showcase-spec-compile-report.json`
- `tests/reports/showcase-spec-compiler/skyline-runner/showcase-spec-compile-report.json`

Geometry reports:

- `tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json`
- `tests/reports/showcase-spec-compiler/skyline-runner/game-template/showcase-skyline-runner-platformer-playable-surfaces.json`

Route-primary evidence:

- `tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.json`
- `tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png`
- `tests/reports/showcase-route-primary-probes/showcase-skyline-runner.json`
- `tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png`

Gameplay evidence:

- `tests/reports/showcase-gameplay/showcase-turbo-drift-circuit.json`
- `tests/reports/showcase-gameplay/showcase-skyline-runner.json`

Visual review:

- `docs/project/showcase-visual-review.json`

## Final Status

Turbo no longer fails for missing racing topology extraction or missing scene binding. It has retained mesh-derived topology evidence and now fails lower at public composition/candidate readiness.

Skyline no longer fails for a missing scene-binding invariant. It now fails lower because the active world asset does not provide mesh-derived playable surfaces, and no release-ready replacement candidate with passing probes exists in the catalog.

Neither route should be called a public-quality game example.

## Remaining Lower-Level Blocker

Turbo:

`asset-pair:racing-public-composition-bounds-missing`

Skyline:

`asset-catalog:release-ready-platformer-world-with-mesh-derived-playable-surfaces-missing`

## Remaining Blocker

Turbo still needs a release-certified racing asset pair whose camera/composition proves the car is visibly bound to the road surface.

Skyline still needs a release-certified platformer world asset with mesh-derived playable surfaces and a passing retained release probe.

## Final Binary Assessment: 2026-07-01

Can Aura3D, with the current engine APIs and current asset catalog, produce
public-quality Turbo Drift and Skyline Runner game examples?

No.

Turbo has partial root-layer support now: retained mesh-derived racing topology
exists for `showcaseTsukubaCircuit`, and scene-bound racing helpers reject the
old visible-model/gameplay-route separation. The remaining blocker is lower and
more specific: the current catalog does not provide a release-certified racing
asset pair whose topology, visible road surface, car scale, camera, and retained
screenshot compose into a credible public racing scene. The exact retained
blocker remains:

`asset-pair:racing-public-composition-bounds-missing`

Skyline has retained surface-map evidence and scene-binding invariants, but the
active `showcaseSideScrollerWorld` asset does not provide mesh-derived playable
surfaces that pass the public platformer bar. Authored overlay fallback data is
not enough to certify a public platformer route. The exact retained blocker is:

`asset-catalog:release-ready-platformer-world-with-mesh-derived-playable-surfaces-missing`

Both routes must remain out of public examples until the catalog contains
release-ready game assets with retained geometry evidence and the generated
screenshots pass human visual review as real games.

## Release Gate Enforcement: 2026-07-01

The showcase release gate now rejects any public racing/platformer route that
tries to pass on route-primary, deploy, gameplay, and visual-review wording
alone. A public game route must include structured geometry evidence in
`route-health.json`:

- category-specific geometry kind (`racing-track-topology` or
  `platformer-playable-surface-map`)
- accepted geometry source (`asset-mesh-extracted`,
  `manifest-authored-overlay-validated`, or
  `compiler-authored-overlay-validated`)
- retained compiler report path under `tests/reports/showcase-spec-compiler/`
- retained route-primary screenshot path plus a `sha256-*` screenshot hash
- current primary asset ids with `sha256-*` asset hashes
- repo-root retained-file validation; shape-valid evidence without live
  screenshot/report/manifest checks is rejected

This keeps Turbo/Skyline from being promoted by stale screenshots, manual visual
QA paths, or input-state proof without asset-bound game geometry.
