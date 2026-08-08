# Aura3D Game Examples Stop Decision

## Decision

NO, Aura3D cannot currently support `showcase-turbo-drift-circuit` and
`showcase-skyline-runner` as public-quality game examples with the current
engine APIs and current asset catalog.

This is not a route HUD, camera, or evidence-text problem. The current library
can render the assets and can prove some input/state changes, but it cannot yet
reliably generate public-quality game examples where gameplay geometry is
visibly and structurally bound to the rendered asset geometry.

## Evidence Checked

- Turbo screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.png`
- Skyline screenshot:
  `tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png`
- Turbo route-primary JSON:
  `tests/reports/showcase-route-primary-probes/showcase-turbo-drift-circuit.json`
- Skyline route-primary JSON:
  `tests/reports/showcase-route-primary-probes/showcase-skyline-runner.json`
- Turbo topology report:
  `tests/reports/showcase-spec-compiler/turbo-drift-circuit/game-template/showcase-turbo-drift-circuit-racing-track-topology.json`
- Skyline surface report:
  `tests/reports/showcase-spec-compiler/skyline-runner/game-template/showcase-skyline-runner-platformer-playable-surfaces.json`
- Active assets inspected in `aura.assets.json`:
  `showcaseTsukubaCircuit`, `showcaseTexturedSportsCar`,
  `showcaseSideScrollerWorld`, `showcaseWalkAnimatedGirl`

## Turbo Finding

Turbo technically has a retained topology report:

- `source`: `asset-mesh-extracted`
- `lapLengthMeters`: `27.869`
- `estimatedLapSeconds`: `100`
- `checkpoints`: `6`
- `meshExtraction.status`: `pass`

But the current retained screenshot still does not read as a public racing
game. The visible output shows a weak car/track composition, stray or oversized
track/terrain presentation, cars not presented in a credible racing camera, and
a proof-harness composition rather than a race scene. A route-primary pass would
only prove visible pixels and readable foreground; it would not prove public
racing quality.

Therefore Turbo is not blocked by deploy metadata. It is blocked by game
category quality: track topology, car placement, camera framing, and route
presentation are not yet sufficient as a reusable public racing template.

## Skyline Finding

Skyline currently fails public game quality even when it can render the runner
and stage. Retained route-primary evidence has alternated between too-small and
clipped foreground failures as the route was patched, but the public blocker is
stable: the character, playable surfaces, contact points, and camera framing are
not certified from the visible world asset in a way that reads as a polished
platformer.

The retained platformer surface report shows that the active world asset is not
usable as a public mesh-derived platformer source:

- `meshExtraction.status`: `fail`
- blocker: `asset-extraction:platformer-playable-surface-columns-ambiguous:showcaseSideScrollerWorld`
- fallback surface source: `manifest-authored-overlay-validated`

The screenshot confirms the result: character/world scale, foot contact,
camera framing, and level composition do not read as a polished platformer.

Therefore Skyline is not blocked by deploy metadata. It is blocked because the
current catalog/library cannot extract and bind game-ready platformer surfaces
from the active world asset well enough to produce a public-quality game.

## Active Asset Assessment

### `showcaseTsukubaCircuit`

The asset is deploy-valid and has a readable release probe, but the current
route still presents large stray geometry and a weak race composition. It needs
stronger certified racing topology plus camera-safe scene bounds before it can
serve as a public racing template source.

### `showcaseTexturedSportsCar`

The asset is deploy-valid and readable as a vehicle. It is not the primary
blocker. The blocker is binding the vehicle convincingly to a playable racing
track and camera system.

### `showcaseSideScrollerWorld`

The asset is deploy-valid as a world model, but it is not currently certified
as a game-ready platformer world. Mesh-derived playable-surface extraction is
ambiguous for this asset, so the route falls back to authored overlays that do
not produce a public-quality platformer.

### `showcaseWalkAnimatedGirl`

The asset is deploy-valid and readable in isolation. It is not the primary
blocker. The blocker is character/world scale, surface contact, camera framing,
and level binding against a suitable platformer world.

## Missing Capabilities

1. Certified racing asset catalog entries with validated road topology,
   route length, road width, car scale compatibility, and scene bounds.
2. Public racing asset-pair validation that proves the car, topology, camera,
   and retained screenshot compose into a credible racing scene.
3. Platformer playable-surface extraction that can identify usable ground,
   platform, hazard, checkpoint, and finish geometry from the world mesh.
4. Certified platformer world assets with playable surfaces, level length,
   character scale compatibility, and retained contact/alignment evidence.
5. Game-to-scene transform binding that is visually validated in screenshots,
   not only numerically recorded in route-local state.
6. Category-level camera zones and gameplay framing for racing and platformer
   examples, so generated screenshots read as games rather than proof harnesses.
7. Public game visual review that rejects technical passes when the screenshot
   still looks like a debug/prototype scene.

## Recommendation

Remove Turbo Drift Circuit and Skyline Runner from public examples until the
game layer is rebuilt.

They may remain as internal prototypes or diagnostics, but they should not be
presented as public Aura3D game examples with the current engine APIs and asset
catalog. The next real implementation task is not more route polishing. It is
to build and certify the game-geometry layer and asset catalog support needed
for racing and platformer generation.

## Release Gate Enforcement

The repo now enforces this decision in public release checks. A racing or
platformer route cannot return to the public candidate set by passing
route-primary, deploy, and quick gameplay proof alone. Public game promotion
requires route-health asset-pair evidence, retained topology/surface evidence,
current route-primary screenshot hash validation, current manifest asset hash
validation, a passing retained geometry report, and human visual review that
the current screenshot reads as a real public game.
