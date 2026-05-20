# V8 GLTF Animation

> Historical note: This V8 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V8 animation work targets imported GLB/GLTF animation examples that can stand next to the corresponding Three.js examples without using Three.js runtime code.

## Clip Playback

Required behavior:

- load animation clips from GLB/GLTF assets
- select clips by name
- play, pause, resume, and scrub time
- advance animation state every rendered frame
- publish clip name, local time, frame count, and draw calls in runtime diagnostics

The route cannot report `running` while a clip is still loading or while `frameCount` is zero.

## Blending

Required behavior:

- crossfade between skeletal clips
- expose blend weights
- keep mesh skinning stable during transitions
- avoid pose snapping on route startup

The `V8 Skinning Blending` route is the current dedicated route for this evidence.

## Additive Layers

Required behavior:

- apply additive upper-body or pose layers over a base clip
- expose additive weight
- keep base locomotion or idle motion visible

The `V8 Skinning Additive` route is the current dedicated route for this evidence.

## Morph Weights

Required behavior:

- load morph targets from GLTF
- animate morph weights over time
- expose current morph weight diagnostics
- render morph deformation and material response in the same frame

The `V8 Skinning Morph` route is the current dedicated route for this evidence.

## IK

Required behavior:

- solve a visible target or constraint
- update the skinned pose every frame
- expose target position and solve status
- keep visual output polished enough for V8 visual review

The `V8 Skinning IK` route is the current dedicated route for this evidence.

## Known Unsupported Or Not-Yet-Proven Features

Do not claim support until a route and report prove it:

- full retargeting between arbitrary skeletons
- full animation state-machine authoring UI
- animation compression parity with Three.js ecosystem tools
- every GLTF animation interpolation edge case
- production crowd animation beyond current route evidence
- full IK rig authoring

## Evidence

Generated evidence belongs in `tests/reports/v8-animation-examples.json` and screenshots under `tests/reports/v8/`. Visual acceptance still requires `tools/v8-visual-review/index.ts`.
