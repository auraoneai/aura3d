# Known Limits

Date: 2026-07-27
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
- Root-wide PBR parity is not a current public claim. HDR/IBL lighting,
  PMREM-style filtering, production tone mapping, high-quality shadows, and
  broad postprocess likewise require path-specific evidence.
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
- Platformer and racing helpers support bounded certified presentations; they are not production game-generation APIs or automatic arbitrary-mesh converters.
- Route-local game logic can be a prototype or showcase candidate, but it is not
  a reusable game runtime claim.
- A game route is not public-ready unless input visibly changes state and tests
  prove objective/scoring/fail/reset/progression.
- Public racing routes require retained topology evidence that binds the car,
  route, checkpoints, camera, and visible road surface.
- Public platformer routes require retained playable-surface evidence that
  binds the character, contact point, collision, checkpoint path, hazards,
  finish, camera, and visible world geometry.
- Turbo Drift Circuit and Skyline Runner have bounded certified asset-pair and gameplay evidence, but current public-ready wording remains blocked while the retained racing visual-QA unit gate is non-passing. This does not generalize to arbitrary assets or production games.

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

## Lower-Level Renderer Coverage And Limits

- Renderer scene frustum culling is implemented and covered by focused moving-camera unit tests; this is not a broad large-scene performance claim.
- Rendering-internal cubemap and equirectangular backgrounds, GGX PMREM, RGBE HDR file loading, live cube-camera probes, bounded scene-color transmission/refraction, depth-aware radial volumetric light, and generated terrain heightfields have focused unit and browser-pixel evidence. None of those package-level proofs automatically establishes root `createAuraApp` support.
- OpenEXR decoding and physical Rayleigh/Mie atmosphere remain explicitly unsupported. Rendering-internal finite rectangular emitters now have deterministic size-dependent and one-sided WebGL2 PBR pixel proof; exact three.js LTC lookup-table identity, rectangular-light shadow maps, GI, automatic preset attachment, and root `createAuraApp` support remain excluded. Rendering-internal linear and exponential-squared fog also have deterministic WebGL2 object-pixel proof, but this does not establish volumetric scattering or physical atmosphere.
- Current glTF render resources expose one primary UV path for glTF render resources.
- Texture support has bounded KTX2/Basis transcoding coverage and GPU capability-driven format selection; it is not universal compressed-texture support.
- There is no product-studio material-matrix visual coverage broad enough to claim all material combinations.
- Shadow coverage includes unit-level moving-camera cascade split stress. Directional cascades do not imply production-ready point/spot shadow maps.
- browser visual stress for long moving-camera paths remains required before broad shadow or culling claims.

## Physics Backend Limits

- `@aura3d/physics` exposes a conservative swept-bounds `timeOfImpact(...)` query and an opt-in adaptive-substep continuous-collision wrapper on both `aura-js` and `cannon-es`. The wrapper bounds linear/angular travel and rejects a step when its configured substep guarantee would be exceeded.
- The native `aura-js` contact solver now uses accumulated Coulomb friction impulses; penetration depth is not part of the friction impulse bound.
- Native `aura-js` now has focused proof for rotated box SAT, convex-hull GJK/EPA, and box/convex/sphere/capsule contacts against indexed triangle meshes and heightfields. Surface↔surface pairs remain excluded, and contact impulses remain linear-only until the native angular-contact gate passes; tumbling claims still require a backend and test that prove them.
- Turbo Drift Circuit and Blockfall Reactor use `cannon-es@0.20.0` for angular contact fidelity. Their fast-body protection is Aura3D's adaptive-substep wrapper, not native Cannon swept-TOI support.
