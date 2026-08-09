# Aura3D Known Limits

Date: 2026-08-08
Status: canonical limitations doc

This file is the public limitations source for project docs, release copy, and
showcase review. If a guide or README makes a claim narrowed by this file, the
guide or README must include the narrower wording.

## Root `createAuraApp` Renderer Limits

- The public root path defaults to `production-runtime` for renderable safe
  authored scenes. This proves backend selection and lifecycle plumbing, not
  every renderer feature.
- Root screenshots currently prove basic GLB rendering, base-color material and
  texture paths, scene composition, simple effects, runtime transforms, and
  non-skinned node animation on tested routes.
- Root-wide PBR parity is not a current public claim. HDR/IBL lighting,
  PMREM-style filtering, production tone mapping, high-quality shadows, and
  broad postprocess likewise require path-specific evidence.
- Bloom, SSAO, DOF, FXAA/TAA, color grading, cinematic fog, and similar effects
  require exact route screenshot proof before public use.
- Internal renderer evidence still does not prove root `createAuraApp` feature
  support unless a root-only browser route proves that exact behavior.

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
- The six named WebGPU evidence routes and the production SDK imported-asset
  workload have bounded native proof in
  `tests/reports/webgpu-current-architecture/report.json`. This does not
  generalize to root-default WebGPU, TSL, WebXR, or every renderer feature.

## Evidence Limits

- The retained 54-row Three.js comparison and its bundle/developer-friction
  measurements use `three@0.165.0`. They are historical regression evidence,
  not evidence of parity with the locked current `three@0.185.1` ecosystem.
- The current r185 comparison program now includes the bounded WebGPU
  architecture row, but TSL/node-material and realistic companion-stack
  workloads remain incomplete. Aura3D therefore makes
  no current broad head-to-head, replacement, or ecosystem-parity claim.
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

- `@aura3d/physics` has one production solver owner: `cannon-es@0.20.0`.
  The removed `aura-js` backend is not a fallback and must not be described as
  available in 1.6.0.
- The public contract has named production-backend invariants for stacking,
  fixed joints, adaptive-substep tunnelling protection, sleeping/waking,
  repeatability, grounding, slope/step movement, suspension response, and
  browser lifecycle. Those bounded fixtures do not establish universal physics
  or arbitrary-mesh game-engine parity.
- The adaptive-substep continuous-collision mitigation is an Aura3D wrapper;
  it is not native Cannon swept-TOI support.
- Capsule grounding and rotated ray/sphere queries are corrected in 1.6.0. A
  project that compensated for the earlier flat-ended capsule or axis-aligned
  query behavior should remove and retest that workaround.
- Racing uses shared authored-unit arcade motion, not a physical tyre model.
  It does not claim weight transfer, understeer, slip/yaw inertia, or physical
  vehicle parity. See ADR 0003 for the ownership decision.
