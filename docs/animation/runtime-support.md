# Animation Runtime Support

Version: 1.0.10

Aura3D has first-party animation runtime code in `packages/animation` and glTF animation binding code in `packages/assets`.

## Implemented Runtime Areas

- Track values cover scalar, vector2, vector3, quaternion, object values, and numeric arrays.
- Runtime actions expose play, pause, stop, scrubbing, playback speed, looping, weights, crossfades, and deterministic state transitions.
- Keyframes, tracks, clips, events, actions, mixers, and layers.
- Bone, skeleton, inverse-bind, skinning-palette, and GPU-skinning helpers.
- Skinning output includes renderer-facing joint matrices.
- Blend trees, state machines, locomotion, root-motion metadata, and motion-quality diagnostics exist as runtime/source capabilities. Broad automatic retargeting and crowd-character production workflows are not complete release claims.
- IK helpers and imported glTF animation runtime utilities.
- Scene/ECS bridge helpers for applying animation state to runtime objects.
- The public runtime includes scene and ECS animation bridges.

Primary entrypoints:

- `packages/animation/src/index.ts`
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/ShaderLibrary.ts`

## Browser Evidence

Current browser evidence is scoped to named local routes and selected typed GLB
fixtures. Release-facing claims should cite generated reports and screenshots,
for example:

- `tests/reports/animation-runtime/evidence.json`
- `tests/reports/animation-runtime/named-clip-playback.png`
- `tests/reports/animation-runtime/clip-restart.png`
- `tests/reports/animation-runtime/clip-blend.png`
- `tests/reports/animation-runtime/animation-event-hitbox.png`
- `tests/reports/animation-runtime/viseme-blendshape-sync.png`

This evidence proves selected playback, restart, blend, event, skinning, and
viseme paths. It does not prove every external rig or DCC export convention.

## Limits

- Current skinning uses uniform-array palette paths with documented limits in renderer code and tests; data-texture skinning is not documented as a complete public feature.
- Route evidence covers selected local assets and parity slices. It is not a blanket claim for every external character rig, retargeting convention, animation state graph, or DCC export style.
- If a character appears in T-pose, bind pose, or a stuck first frame, treat it as an asset/runtime binding failure until the route evidence proves clip sampling, skeleton binding, palette updates, and visible mesh deformation.
- If a named clip exists only as metadata but does not visibly deform the mesh in browser screenshots, do not claim that clip is release-ready.
- If a route has to fake attack motion with whole-model translation only, document it as a fallback, not as skeletal animation proof.
- Visual quality claims must be tied to generated route screenshots and visual review reports.
- Retargeting is future work for broad DCC interoperability.
- Timeline authoring is future work; this is not a production character-animation toolchain.
- A rig profile format and Browser evidence using at least two real externally authored skinned glTF characters are required before claiming broad character-animation readiness.
