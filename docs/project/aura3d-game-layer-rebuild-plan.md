# Aura3D Game Layer Rebuild Plan

## Decision

Turbo Drift Circuit and Skyline Runner are intentionally removed from the public
showcase examples. They remain retained prototype evidence routes only.

The current engine APIs and asset catalog can render typed GLBs, validate
deploy metadata, prove simple input state changes, and retain some structured
game-geometry evidence. That is still not enough to turn arbitrary racing and
platformer assets into public-quality game examples.

## Current Implemented Pieces

- Turbo Drift Circuit has retained mesh-derived topology evidence for
  `showcaseTsukubaCircuit`.
- The engine exposes scene-bound racing/platformer helpers that reject obvious
  presentation offsets between visible assets and gameplay geometry.
- Skyline Runner has retained platformer surface-map evidence, but the active
  world asset falls back to authored overlay data because mesh-derived surface
  extraction is ambiguous.

These pieces prevent the old route-local proof-loop from being silently treated
as public game quality. They do not yet solve public game composition,
catalog-certified asset pairing, camera-safe framing, or replacement coverage.

## Missing Racing Capabilities

- Certified racing track catalog entries with road centerline, road width,
  lap length, scene bounds, start pose, checkpoint positions, and car scale
  compatibility.
- Public-quality racing asset-pair certification proving the active car,
  topology, camera, and visible road surface compose into a readable race scene.
- Game-to-scene transform validation proving the car, checkpoints, camera, and
  lap path are bound to the visible road surface in retained screenshots.
- Category-level racing camera rules that keep the car readable while showing a
  coherent track environment.
- Gameplay proof tied to visible topology, including car-to-road alignment,
  meaningful lap duration, checkpoint progression, reset, and finish state.

## Missing Platformer Capabilities

- Mesh-derived platformer playable-surface extraction from real world/stage GLBs.
- Certified platformer world catalog entries with ground surfaces, platforms,
  hazards, checkpoints, finish zones, level length, scene bounds, and character
  scale compatibility.
- Game-to-scene transform validation proving the character feet/contact point,
  collision surfaces, checkpoints, hazards, and camera are bound to the visible
  stage geometry in retained screenshots.
- Category-level side-scroller camera and framing rules that keep the character
  grounded, readable, and correctly scaled against the world.
- Gameplay proof tied to visible surfaces, including movement, jump, contact,
  hazard/respawn or retry, checkpoint progression, and finish state.

## Asset Catalog Requirements

Racing assets must not be selected only because they are valid GLBs. A public
racing candidate must include retained, hash-bound topology evidence and
car/track scale compatibility evidence.

Platformer assets must not be selected only because they are valid GLBs. A
public platformer candidate must include retained, hash-bound surface-map
evidence and character/world scale compatibility evidence.

## Release Gate Requirements

Visual review remains a hard public-release gate. Route-primary, deploy, and
gameplay proof are necessary but insufficient for public game examples.

A game route can return to the public showcase only when all of the following
are true:

- It has retained game-geometry evidence bound to current asset hashes.
- The release checker runs retained-file validation against the repo root; a
  shape-valid JSON object without current screenshot/report/manifest reads is
  not enough.
- The release checker can read the retained topology/surface report from disk
  and confirm the report passes for the current route.
- The route-primary screenshot hash recorded in the game geometry evidence
  matches the current retained screenshot file.
- Its gameplay proof uses that geometry evidence instead of route-local proof
  points or rectangles.
- Its retained screenshot reads as a credible public game example.
- Its route-health, route-gates, visual review, and launch evidence all agree.

## Current Prototype Status

Turbo Drift Circuit remains blocked by
`asset-pair:racing-public-composition-bounds-missing`.

Skyline Runner remains blocked by
`asset-catalog:release-ready-platformer-world-with-mesh-derived-playable-surfaces-missing`.

Neither route is counted as a public release candidate until the game layer is
rebuilt.
