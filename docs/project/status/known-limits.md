# Aura3D Known Limits

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
- Turbo Drift Circuit and Skyline Runner retain bounded certified asset-pair,
  mounted gameplay, route-local AI/challenge, and deploy evidence. They are
  prototype-blocked during the current visual rebuild; the July 19 review is
  stale and does not approve current source. None of this generalizes to
  arbitrary assets or production games.

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
- Directional shadow maps now carry mounted browser evidence with a caster-free negative control
  (`tests/browser/external-parity-shadow-cascade-evidence.spec.ts`): a measured 1,538-pixel
  shadow footprint whose mean darkening is roughly 20x the whole-receiver mean, against a receiver
  that darkens by 0.024 when no occluder is present at all. Bounded same-scene shadow visual comparison against Three.js and Babylon.js also
  passes with all three engines using their real shadow pipelines. None of this establishes
  Unity/Unreal shadow parity or production shadow atlas/cascade selection, which remain blocked.
- Slope-scaled shadow bias is evaluated per PCF sample and scaled by the tangent of the
  receiver/light angle. Before this, wide PCF kernels made every receiver shadow itself
  (measured mean RGB-sum 15.31 with no occluder in the scene); the clamp on the tangent bounds
  worst-case bias so removing acne does not introduce peter-panning.
- browser visual stress for long moving-camera paths remains required before broad shadow or culling claims.

## Instanced Rendering Limits

- Native instanced submission requires an instancing-aware material. `InstancedPBRMaterial`
  selects `aura3d/instanced-pbr`, whose vertex stage declares the per-instance matrix and colour
  attributes. A plain `PBRMaterial` compiles `aura3d/pbr-direct`, which declares none of them, so
  the forward pass correctly falls back to expanding the batch into one draw per instance. The
  fallback is a correct degradation, not a defect, but the cost difference is large and silent:
  the same 4,096-instance scene measured **1 draw call at ~88 FPS** with `InstancedPBRMaterial`
  and **4,096 draw calls at 9 FPS** with `PBRMaterial`. There is no diagnostic that warns about
  this today.
- `Scene.createInstancedMesh` registers the node in the scene's id map but does not parent it.
  Callers must attach it (for example `scene.root.addChild(mesh)`) or the renderer collects
  nothing and reports zero draw calls. This matches the rest of the `Scene.create*` family.
- Instanced evidence is bounded to the 4,096-instance shared benchmark descriptor. Frame time and
  draw calls tie with Three.js on that scene; bundle size is a measured loss. No general
  instancing performance advantage is claimed.

## Physics Backend Limits

- `@aura3d/physics` exposes a conservative swept-bounds `timeOfImpact(...)` query and an opt-in adaptive-substep continuous-collision wrapper on both `aura-js` and `cannon-es`. The wrapper bounds linear/angular travel and rejects a step when its configured substep guarantee would be exceeded.
- The native `aura-js` contact solver now uses accumulated Coulomb friction impulses; penetration depth is not part of the friction impulse bound.
- Native `aura-js` now has focused proof for rotated box SAT, convex-hull GJK/EPA, box/convex/sphere/capsule contacts against indexed triangle meshes and heightfields, and contact-point angular response from a native corner-drop tumble. Surface↔surface pairs remain excluded, and broad production collision parity is not inferred from these bounded tests.
- Turbo Drift Circuit and Blockfall Reactor use `cannon-es@0.20.0` for angular contact fidelity. Their fast-body protection is Aura3D's adaptive-substep wrapper, not native Cannon swept-TOI support.
