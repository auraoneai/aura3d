# Animation Runtime Support

Version: `1.0.0`

Aura3D has first-party animation runtime code in `packages/animation` and glTF animation binding code in `packages/assets`.

## Implemented Runtime Areas

- Track values cover scalar, vector2, vector3, quaternion, object values, and numeric arrays.
- Runtime actions expose play, pause, stop, scrubbing, playback speed, looping, weights, crossfades, and deterministic state transitions.
- Keyframes, tracks, clips, events, actions, mixers, and layers.
- Bone, skeleton, inverse-bind, skinning-palette, and GPU-skinning helpers.
- Skinning output includes renderer-facing joint matrices.
- Blend trees, state machines, locomotion, root motion, retargeting, crowd animation, and motion-quality diagnostics.
- IK helpers and imported glTF animation runtime utilities.
- Scene/ECS bridge helpers for applying animation state to runtime objects.
- The public runtime includes scene and ECS animation bridges.

Primary entrypoints:

- `packages/animation/src/index.ts`
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/ShaderLibrary.ts`

## Browser Evidence

Current app-route evidence is limited to the consolidated local registry: `apps/advanced-examples-gallery/` plus the allowed `apps/wow-*` showcase routes. Focused browser tests include `tests/browser/current-routes-route-health.spec.ts`, `tests/browser/advanced-examples-gallery.spec.ts`, and the retained `tests/browser/threejs-parity-*-parity.spec.ts` animation/skinning specs.

## Limits

- Current skinning uses uniform-array palette paths with documented limits in renderer code and tests; data-texture skinning is not documented as a complete public feature.
- Route evidence covers selected local assets and parity slices. It is not a blanket claim for every external character rig, retargeting convention, animation state graph, or DCC export style.
- Visual quality claims must be tied to generated route screenshots and visual review reports.
- Retargeting is future work for broad DCC interoperability.
- Timeline authoring is future work; this is not a production character-animation toolchain.
- A rig profile format and Browser evidence using at least two real externally authored skinned glTF characters are required before claiming broad character-animation readiness.
