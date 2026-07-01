# Known Limits

Date: 2026-07-01
Status: canonical limitations doc

This file is the public limitations source for project docs, release copy, and
showcase review. If a guide or README makes a claim narrowed by this file, the
guide or README must include the narrower wording.

## Root `createAuraApp` Renderer Limits

- The public root path does not yet default to the full production-runtime
  renderer.
- Root screenshots currently prove basic GLB rendering, base-color material and
  texture paths, scene composition, simple effects, runtime transforms, and
  non-skinned node animation on tested routes.
- Full PBR parity, HDR/IBL lighting, PMREM-style filtering, production tone
  mapping, high-quality shadows, and broad postprocess are not root-wide public
  claims.
- Bloom, SSAO, DOF, FXAA/TAA, color grading, cinematic fog, and similar effects
  require exact route screenshot proof before public use.
- Internal renderer or production-runtime evidence does not prove root
  `createAuraApp` behavior until the bridge and public tests exist.

## Animation Limits

- Non-skinned glTF node animation can be claimed only for routes that prove it.
- Skinned GLB animation is not a root-public screenshot claim until a browser
  route imports only `@aura3d/engine`, plays a real skinned asset, and produces
  meaningful pixel deltas in the character region.
- Morph target rendering and viseme/lip-sync claims require route-specific
  pixel evidence.
- Counters, metadata, or camera movement are not enough to prove animated
  character motion.

## Game Runtime Limits

- The current public game story includes useful input, runtime node, frame loop,
  replay, HUD, and fighting-game helper surfaces.
- Platformer and racing reusable kits are not public-quality game-generation
  APIs until the library roadmap work lands.
- Route-local game logic can be a prototype or showcase candidate, but it is not
  a reusable game runtime claim.
- A game route is not public-ready unless input visibly changes state and tests
  prove objective/scoring/fail/reset/progression.
- Public racing routes require retained topology evidence that binds the car,
  route, checkpoints, camera, and visible road surface.
- Public platformer routes require retained playable-surface evidence that
  binds the character, contact point, collision, checkpoint path, hazards,
  finish, camera, and visible world geometry.
- Turbo Drift Circuit and Skyline Runner are prototype-blocked until the current
  asset catalog and game layer can satisfy those contracts.

## Asset Limits

- The CLI asset workflow provides typed references and metadata; it does not
  create new production art.
- Catalog search can find candidates, but search success is not proof of visual
  quality, rig quality, scale suitability, license readiness, or gameplay
  readiness.
- Primary showcase assets require durable source/license/provenance metadata,
  bounds/material/texture/animation inspection where relevant, screenshots, and
  visual review.
- Temp-path provenance, duplicate hashes without explanation, placeholder-like
  assets, unreadable materials, and primitive substitutions are release blockers
  for public showcases.

## WebGPU Limits

- WebGPU behavior depends on browser and hardware support.
- Native WebGPU claims require adapter/backend state, dispatch/render evidence,
  fallback state, telemetry, and pixels.
- A route named "WebGPU" must demote itself when running in WebGL or simulated
  fallback mode.

## Evidence Limits

- `tests/reports/` artifacts may be local or ignored; they must be regenerated
  in release runs or attached as immutable artifacts.
- Nonblank screenshots prove only that something rendered.
- Browser route boot success does not prove readability, interaction quality,
  animation, material correctness, or game playability.
- A deployed URL proves hosting only when route/asset checks and hosted
  screenshots are generated from that origin.
