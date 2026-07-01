# Aura3D Game Layer Rebuild Plan

## Decision

Turbo Drift Circuit and Skyline Runner are intentionally removed from the public
showcase examples. They remain retained prototype evidence routes only.

The current engine APIs and asset catalog can render typed GLBs, validate
deploy metadata, and prove simple input state changes. They do not yet provide
the game-geometry layer required to turn arbitrary racing and platformer assets
into public-quality game examples.

## Missing Racing Capabilities

- Mesh-derived racing topology extraction from real track GLBs.
- Certified racing track catalog entries with road centerline, road width,
  lap length, scene bounds, start pose, checkpoint positions, and car scale
  compatibility.
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
- Its gameplay proof uses that geometry evidence instead of route-local proof
  points or rectangles.
- Its retained screenshot reads as a credible public game example.
- Its route-health, route-gates, visual review, and launch evidence all agree.

## Current Prototype Status

Turbo Drift Circuit remains blocked by
`asset-pair:racing-public-composition-bounds-missing`.

Skyline Runner remains blocked by
`asset-pair:platformer-public-character-world-binding-missing`.

Neither route is counted as a public release candidate until the game layer is
rebuilt.
