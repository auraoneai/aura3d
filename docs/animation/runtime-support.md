# Animation Runtime Support

Aura3D has animation runtime code in `packages/animation`, public
engine-level controller exports in `@aura3d/engine`, glTF inspection and
metadata paths in `packages/assets`, and renderer package code for skinning and
morph data. These layers are related, but they are not the same proof.

## Public Root Pattern

Agent-authored browser routes should use the public engine surface:

```ts
import {
  createAnimationController,
  createAuraApp,
  game,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.character).runtime(game.runtimeNode("character")))
    .add(lights.studio())
});

const node = app.nodes.require("character");

const animation = createAnimationController({
  clipRegistry: assets.character,
  requiredClips: ["Idle", "Run"],
  suppressRootMotion: true
});

animation.bindRuntimeNode(node, {
  id: "character-animation",
  defaultClipId: "Idle"
});

app.onFrame(({ dt }) => {
  animation.update(dt);
});
```

Clip names, skeleton names, and morph target names must come from generated
typed asset metadata, `aura.assets.json`, or an inspection report. Do not guess
names in docs or examples.

## Supported Source-Level Capabilities

The public controller/source layer supports:

- named clip registration and embedded GLB clip metadata registration;
- play, stop, pause, resume, restart, scrub, speed, loop, weight, and crossfade;
- layer metadata such as base/locomotion/upper-body/attack roles;
- clip-local event sampling with `onEvent(...)`;
- pose capture and diagnostics for missing clips, skeleton metadata, bones, and
  tracks;
- runtime-node binding metadata through `bindRuntimeNode(...)`;
- runtime-node pose and morph source state through `setAnimationPose(...)`,
  `setMorphTarget(...)`, and `setMorphTargets(...)`;
- source-level retarget metadata and diagnostics.

This is enough to drive deterministic gameplay state, hitbox events, source
evidence, and tests.

## Renderer-Backed Boundary

Do not claim root `createAuraApp` visibly renders skinned GLB animation, morph
targets, viseme blendshapes, broad retargeting, motion matching, IK locomotion,
or production character control from metadata alone.

Those claims require browser evidence:

- a route importing only `@aura3d/engine`;
- typed GLB provenance and inspection output;
- controller snapshots that show the intended clip/morph state;
- screenshot/video frame pairs at deterministic times;
- pixel delta in the character/face region, not only camera movement, HUD
  updates, whole-model translation, or full-frame shake;
- route-health/evidence JSON that records renderer backend and fallback state.

If a named clip exists only as metadata or a pose-baked fallback, label it as a
source-level fallback until rendered pixels prove mesh deformation.

Named root evidence currently includes
`tests/browser/createAuraApp-animation-bridge-contract.spec.ts` for one typed
skinned GLB pose change and `tests/browser/createAuraApp-morph-targets.spec.ts`
for one typed morph-target asset. Those proofs are asset- and route-specific;
they do not establish generic compatibility with arbitrary rigs or blendshape
layouts.

## Package-Level Capabilities

`@aura3d/animation` and `@aura3d/rendering` contain additional primitives and
test helpers for tracks, clips, state machines, skeletons, skinning palettes,
motion summaries, visual-quality metrics, and frame-motion analysis. Package
exports can be documented as package-level capabilities, but they do not
automatically prove the root app path.

Examples:

- `summarizeAnimationAnimationMotion(...)` can reject static source samples.
- `analyzeAnimationHumanoidRetargeting(...)` can report rig metadata gaps.
- `analyzeRgbaFrameMotionRegions(...)` can detect suspicious global-only motion
  in captured frames.

Use those helpers as evidence inputs, not as a substitute for route screenshots.

## Limits

- Broad automatic humanoid retargeting is not a production root-path claim.
- Whole-character inverse-kinematics rigs, production foot locking, spring
  bones, cloth, hair, ragdoll blending, and motion matching are not public
  reusable game-animation systems.
- Timeline authoring and DCC interoperability are not complete production
  toolchains.
- A character stuck in T-pose, bind pose, or a first frame is a failed
  asset/runtime binding until evidence proves clip sampling, skeleton binding,
  palette updates, and visible mesh deformation.
- Primitive mouth cards or transform-only animation can be valid fallbacks, but
  they must not be labeled as GLB blendshape or skeletal animation proof.

## Evidence Checklist

For release-facing animation claims, archive:

- asset add/resolve/inspect output with license and provenance;
- generated typed asset metadata;
- unit/source diagnostics for required clips, bones, events, and morph targets;
- deterministic `app.step(dt)` proof;
- browser screenshots or video frames with hashes;
- pixel-delta or motion-region analysis;
- route-health JSON naming backend/fallback state;
- package smoke reports when lower-level package exports are part of the claim.

## Package Runtime Contract

At the package/source level, tracks support scalar, vector2, vector3, quaternion, object values, and numeric arrays. Controllers support play, pause, stop, scrubbing, playback speed, looping, weights, crossfades, and deterministic state transitions. Skeleton helpers can produce renderer-facing joint matrices, and scene and ECS animation bridges exist as package-level integration surfaces. These statements do not upgrade the root renderer boundary described above.

## Current Limits

Retargeting is future work for a broad automatic production root path. Timeline authoring is future work as a complete DCC-style workflow. The current stack is not a production character-animation toolchain. A rig profile format must document mappings, rest pose, scale, and constraints before interoperability can be claimed. Browser evidence using at least two real externally authored skinned glTF characters is required before widening the public retargeting claim.
