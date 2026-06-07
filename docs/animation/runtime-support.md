# Animation Runtime Support

Version: 1.1.0

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

## Cartoon animation (1.1)

Aura3D 1.1 adds focused helpers for the cartoon-character workflow (talk, listen,
gesture, walk, action). They are all exported from the public `@aura3d/animation`
entrypoint. These helpers do not replace the general runtime; they validate inputs
and bind named cartoon actions to existing clips, state graphs, and diagnostics.

### `bindCartoonTimelineAction`

Method on `AnimationController`. Resolves a named cartoon action to its bound clip
and starts playback at a timeline time, returning the resulting sample.

- Signature: `controller.bindCartoonTimelineAction(action, bindings, time, options?)`
  - `action: CartoonAnimationAction` — one of `"speak" | "listen" | "gesture" | "walk" | "action"`.
  - `bindings: readonly CartoonAnimationTimelineBinding<TClipId>[]` — each binding has `action`, `clipId`, `loop`, and `restartOnEnter`.
  - `time: number` — timeline time recorded on the playback metadata.
  - `options?` — `AnimationPlayOptions` minus `loop`/`restart` (those come from the binding).
- Returns `CartoonAnimationTimelineSample<TClipId>`: `{ time, action, clipId, playback }`.
- Throws if no binding is registered for the requested action.

```ts
import { AnimationController } from "@aura3d/animation";

const controller = new AnimationController<"idle_clip" | "talk_clip">();
controller.registerClip({ id: "talk_clip", duration: 1.2, tracks: [/* ... */], events: [] });

const bindings = [
  { action: "speak", clipId: "talk_clip", loop: true, restartOnEnter: false }
] as const;

const sample = controller.bindCartoonTimelineAction("speak", bindings, 0.5);
// sample.clipId === "talk_clip", sample.playback is the active playback state
```

### `createCartoonAnimationStateGraph`

Builds a ready-made `AnimationStateMachine` wired for the cartoon action set
(idle, listen, speak, gesture, walk, action) with sensible priorities and one-shot
gesture/action states.

- Signature: `createCartoonAnimationStateGraph(options?): AnimationStateMachine`
  - `options?: CartoonAnimationStateGraphOptions` — `{ idleState?: string }` (defaults to `"idle"`).
- Drive it with the standard state-machine API: `setParameter(name, value)` then `update(delta)`.
- Recognized parameters: `isSpeaking`, `isListening`, `isWalking`, `gesture`, `action`.

```ts
import { createCartoonAnimationStateGraph } from "@aura3d/animation";

const graph = createCartoonAnimationStateGraph();
graph.setParameter("isSpeaking", true);
const state = graph.update(1 / 30); // -> "speak"
```

### `validateCartoonClipMap`

Checks that a clip map covers every required cartoon action and that each mapped
clip id is actually registered.

- Signature: `validateCartoonClipMap(registry, options): CartoonClipMapReadiness<TClipId>`
  - `registry: AnimationClipRegistry` — used to confirm clip ids exist.
  - `options: CartoonClipMapReadinessOptions` — `clipMap` (action -> clip id or ids), optional `requiredActions` (defaults to `["speak","listen","gesture","walk","action"]`), optional `aliases`, and optional `segmentedFallbackDeclared`.
- Returns `CartoonClipMapReadiness`: `{ ok, segmentedFallbackDeclared, requiredActions, missingActions, missingClipIds, aliasActions, diagnostics }`.
- Missing actions and missing clip ids are reported as `error` diagnostics and set `ok: false`. If `segmentedFallbackDeclared: true` is passed, those gaps are downgraded to `warning` diagnostics, and `ok` then only depends on whether any required action is still completely unmapped. In other words, validation fails when required clips are missing unless you explicitly declare a segmented fallback.

```ts
import { AnimationClipRegistry, validateCartoonClipMap } from "@aura3d/animation";

const registry = new AnimationClipRegistry();
registry.register({ id: "talk_clip", duration: 1.2, tracks: [], events: [] });

const readiness = validateCartoonClipMap(registry, {
  clipMap: { speak: "talk_clip" },        // listen/gesture/walk/action missing
  segmentedFallbackDeclared: true          // gaps become warnings instead of errors
});
// readiness.missingActions includes "listen", "gesture", "walk", "action"
```

### `summarizeCartoonAnimationMotion`

Wraps `summarizeAnimationMotion` and flags a static pose that is being presented as
animation.

- Signature: `summarizeCartoonAnimationMotion(samples, options?): CartoonAnimationMotionQualityReport`
  - `samples: readonly AnimationMotionSample[]` — each `{ timeSeconds, tracksApplied?, skinningPalettesUpdated?, stride?, animatedSubjects? }`.
  - `options?` — `minimumSamples` (8), `minimumTimeRangeSeconds` (0.18), `minimumPoseDiversityScore` (0.08).
- Returns `CartoonAnimationMotionQualityReport` (the base report plus `kind: "cartoon-animation-motion-quality"`, `staticPoseRejected`, and a human-readable `issues` list).
- `staticPoseRejected` is `true` (and `healthy` is `false`) when there are too few samples, too short a time range, too little pose diversity, or no active track/skinning/subject motion. This catches a frozen pose that reports no real frame-to-frame change.

```ts
import { summarizeCartoonAnimationMotion } from "@aura3d/animation";

// A static pose: time advances but nothing deforms.
const report = summarizeCartoonAnimationMotion([
  { timeSeconds: 0, tracksApplied: 0 },
  { timeSeconds: 0.5, tracksApplied: 0 }
]);
// report.staticPoseRejected === true, report.healthy === false
```

### `analyzeCartoonHumanoidRetargeting`

Runs the humanoid rig analysis with cartoon-specific gates: required mouth metadata,
required clips, and an external retarget map.

- Signature: `analyzeCartoonHumanoidRetargeting(rig, options?): CartoonHumanoidRetargetingDiagnostics`
  - `rig: HumanoidRigDefinition`.
  - `options?: CartoonHumanoidRetargetingOptions` — extends `HumanoidRetargetingOptions` with `requiredClips` (defaults to `["Idle","Talk","Gesture","Walk"]`), `availableClips`, `mouthBlendshapeNames`, and `retargetMapProvided`.
- Returns `CartoonHumanoidRetargetingDiagnostics`: the base rig diagnostics plus `kind: "cartoon-humanoid-retargeting-diagnostics"`, `mouthReady`, `clipReady`, and `retargetMapProvided`.
- Adds `error` diagnostics (and sets `ok: false`) when mouth blendshape/card metadata is missing, when any required clip is absent, or when no external bone-map/retarget metadata is provided. It defaults to a strict `minRequiredCoverage` of `0.9` and requires a rest pose.

```ts
import { analyzeCartoonHumanoidRetargeting } from "@aura3d/animation";

const diagnostics = analyzeCartoonHumanoidRetargeting(rig, {
  availableClips: ["Idle", "Talk", "Gesture", "Walk"],
  mouthBlendshapeNames: ["mouthOpen", "mouthSmile"],
  retargetMapProvided: true
});
// diagnostics.ok, diagnostics.mouthReady, diagnostics.clipReady, diagnostics.retargetMapProvided
```

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

## Non-Goals (explicit)

The following are NOT provided as production systems and must not be claimed as parity (see `docs/project/known-limits.md`; enforced by the `animation-engine-docs-claims` gate):

- Motion matching is a deterministic fixture, NOT a real engine; inertialization is NOT implemented.
- Ragdoll is a physics-sandbox preset only — there is no production ragdoll controller, joint limits, or animation-to-physics blend.
- Full-body IK / FABRIK / CCD are NOT implemented; only analytical two-bone IK exists.
- Production foot-locking, spring-bone, cloth, and hair simulation are fixtures/non-goals.
- Unity Mecanim / Unity Animation Rigging / Unreal Control Rig parity is NOT a goal.
