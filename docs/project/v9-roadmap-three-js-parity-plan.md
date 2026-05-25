# V9 Three.js Parity Plan

This file is the canonical V9 plan consumed by `tools/threejs-parity-completion-audit`. It now records the completed high-priority construction pass and the remaining measured parity surface.

## Plan State

- [x] Inventory the tracked Three.js example surface.
- [x] Build code-backed G3D routes for every high-priority tracked example.
- [x] Generate V9 inventory, claim-registry, completion, route-health, same-scene, package, external-consumer, migration, runtime-import, performance, and visual-review reports.
- [x] Keep broad full-parity and "exceeds Three.js" claims blocked while any inventory item remains partial.
- [x] Document V9 as a scoped parity milestone, not a final Three.js replacement release.

## Real Public Surface

- [x] `@galileo3d/engine/v9` exports `G3DRenderer`, `G3DScene`, and `G3DAppLifecycle`.
- [x] `@galileo3d/rendering/v9` exports `RendererV9`.
- [x] `@galileo3d/assets/v9` exports GLTF/renderable-asset helpers.
- [x] Root package exports include math, scene, rendering, controls, assets, animation, input, workflows, three-compat, debug, rendering/v9, assets/v9, and v9.
- [x] V9 code depends on first-party G3D packages for the G3D side, not runtime Three.js rendering.

## Current Inventory Result

- [x] 54 tracked examples inventoried.
- [x] 30 tracked examples matched.
- [x] 24 tracked examples partial.
- [x] 0 tracked examples unsupported.
- [x] 0 tracked examples exceeded.
- [x] 0 high-priority tracked examples open.

## Matched High-Priority Tracks

- [x] Animation keyframes, walk, and multiple clone playback.
- [x] Skinning blend, additive, and IK routes.
- [x] Morph target route.
- [x] GLTF, compressed GLTF, GLTF instancing, KTX2/Basis, physical material extensions, and environment-map routes.
- [x] Basic/physical material routes including clearcoat and transmission.
- [x] Physical lights and base shadow map routes.
- [x] Bloom/postprocess baseline.
- [x] Stereo and parallax effects.
- [x] Orbit and transform controls.
- [x] Cube picking, decals, and instancing performance routes.

## Remaining Partial Work

The following are intentionally not checked off as full parity. They are documented in current status reports and block broad claims:

- GLTF variants and OBJ completeness.
- Texture anisotropy.
- Spotlight and shadow-map viewer fidelity.
- Outline, DOF, SSAO, and anaglyph effects.
- Trackball controls and point raycasting.
- Draw range, points/sprites, fat lines, and helpers.
- Multiple elements/views.
- WebGPU RTT, compute, materials, instance uniforms.
- WebXR VR/AR routes and real-device evidence.

## Claim Rule

V9 is complete as a high-priority construction pass, not as full parity. Public language must say "scoped", "tracked", "matched examples", or "partial" where appropriate.

Do not claim full Three.js parity or broad superiority until `tests/reports/v9/claim-registry.json` allows it and every partial inventory item is resolved with code-backed evidence.
