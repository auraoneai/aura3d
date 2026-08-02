# Aura3D Showcase Quality Gates

Date: 2026-07-01
Status: canonical showcase release gate

These gates decide whether a route can move from prototype/diagnostic to
release-ready candidate.

## Route-Health Gate

Each route must declare:

- route id and classification;
- primary assets and typed asset names;
- primitive count and budget;
- renderer backend and fallback state;
- claimed capabilities;
- evidence paths;
- known limitations.

The release must fail if claims exceed detected capability.

## Asset Gate

- Primary character, vehicle, world, product, creature, weapon, track, or
  environment must be a typed GLB/glTF asset unless the route is explicitly
  abstract.
- Source must not contain `model("...")`, raw GLB/GLTF URLs, `unsafeModelUrl`,
  `GLTFLoader`, `three` imports, or renderer asset hacks.
- Assets must have durable source/license/provenance metadata.
- Placeholder-like assets, unreadable materials, bad scale, duplicate hashes
  without explanation, and temp provenance block release.

## Primitive Gate

Primitives are allowed for:

- board cells and puzzle blocks;
- set dressing;
- collision/debug guides;
- HUD anchors;
- abstract data visualization;
- temporary internal prototypes.

Primitives are blocked as the primary subject for real-world, product, character,
vehicle, world, weapon, or primary environment claims.

## Screenshot Gate

Each route needs:

- first-load desktop screenshot;
- first-load mobile screenshot;
- nonblank pixel check;
- main-subject visibility/readability check;
- UI overlap/clipping check;
- crop checks for the primary subject region.

File size is not enough.

## Interaction Gate

Non-game routes must prove that controls change scene state, telemetry, camera,
material, lighting, data mapping, or asset inspection state where claimed.

Game routes must prove:

- keyboard input changes state visibly;
- reset works;
- objective/scoring/fail/progression loop exists;
- genre-specific mechanics pass tests.

Public racing and platformer routes also need retained game-geometry evidence:

- racing routes need hash-bound road topology, car-to-road alignment, meaningful
  lap length, checkpoint coverage, and camera-safe racing framing;
- platformer routes need hash-bound playable surfaces, character foot/contact
  alignment, character/world scale validation, checkpoint or finish flow, and
  camera-safe side-scroller framing.

Route-primary, deploy, and gameplay state changes are necessary. They are not
enough to make a public game example release-ready.

Geometry binding, contact, camera projection, scale, and debug-guide checks are
structural validation. They must not be described as visual-quality approval.
Image-derived checks separately inspect visible-versus-suppressed subject
pixels, desktop/mobile clipping, UI overlap, subject occupancy,
foreground/background balance, giant foreground occluders, empty staging, and
material scene change outside excluded HUD regions.

Art direction, lighting hierarchy, scene coherence, polish, and public-demo
acceptability still require an identified human reviewer. Machine checks are a
floor and a downward veto; they cannot issue human approval.

All required retained-evidence tests must also pass. A stale screenshot,
source, route-health, or composition hash in a required visual-QA test blocks
the overall release even when the configured route-library build/check sub-gate
reports 7/7.

## Animation And Effects Gate

- Animation claims require pixel deltas in the animated subject region.
- Particle claims require mode/density/state changes with pixel and telemetry
  evidence.
- Postprocess/material/lighting claims require before/after or route-specific
  pixel evidence.
- WebGPU claims require adapter/backend/dispatch/render/fallback evidence.

## Copy Gate

README, route-health, public copy, and docs must agree on:

- route classification;
- public API scope;
- primary assets;
- renderer mode;
- limitations;
- evidence status.

Prototype-blocked, internal-diagnostic, and index routes cannot be shown as
public release candidates.
