# Animation System PRD

## Purpose
Animation provides time-based property animation, clips, tracks, skeletal animation, skinning data, blending, state machines, events, root motion, and runtime control. It must integrate with scene nodes and ECS without owning the frame loop.

## Lessons From Failed Attempts
- The prompt objective states animation does not fully work.
- Current and 2025 attempts implemented wide animation APIs, motion matching, IK, timelines, and summaries, but integration gaps remained.
- `G3D2025` data-flow docs called out missing skinned mesh component integration.
- Old attempts accumulated advanced material/scene failures, showing that animation visual correctness must be validated in renderer examples.

Reuse conceptually:

- Clips/tracks/mixers.
- Skeleton and skinning.
- Blend trees and state machines.
- Timeline/cinematic concepts later.

Discard:

- Motion matching and advanced IK before clips, skeletons, and blending are proven.
- Animation systems that mutate renderer state directly.
- Claims based on line count rather than sampled output.

## Target Architecture
Animation is data-driven. It samples animation data into target bindings. Scene and ECS bridges apply sampled values to scene nodes or components.

Public API:

```ts
const mixer = new AnimationMixer(target);
const action = mixer.play(clip);
mixer.update(deltaTime);
```

## File-By-File Implementation Plan

### `packages/animation/src/AnimationClip.ts`
- Purpose: named animation asset.
- Contains: duration, tracks, events, metadata.
- Edge cases: zero duration, mismatched track times.
- Tests: validation and duration calculation.

### `packages/animation/src/AnimationTrack.ts`
- Purpose: typed keyframe track.
- Contains: scalar, vector, quaternion, color, boolean/string event tracks.
- Edge cases: unsorted keys, duplicate times, extrapolation.
- Tests: interpolation and boundary sampling.

### `packages/animation/src/Keyframe.ts`
- Purpose: keyframe types and tangent/easing data.
- Tests: serialization.

### `packages/animation/src/AnimationMixer.ts`
- Purpose: runtime update owner for one target graph.
- Edge cases: multiple actions, pause, time scale, dispose.
- Tests: update, crossfade, stop.

### `packages/animation/src/AnimationAction.ts`
- Purpose: clip playback instance.
- Contains: play/pause/stop, weight, loop mode, time.
- Tests: looping, clamp, event emission.

### `packages/animation/src/AnimationLayer.ts`
- Purpose: weighted layer blending.
- Edge cases: additive blending, masks.
- Tests: layer priority and blending.

### `packages/animation/src/Skeleton.ts`
- Purpose: bone hierarchy and bind poses.
- Edge cases: invalid parent index, non-invertible bind matrix.
- Tests: world bone transforms and bind pose.

### `packages/animation/src/Bone.ts`
- Purpose: bone metadata and transform.
- Tests: hierarchy.

### `packages/animation/src/Skinning.ts`
- Purpose: skinning matrices and joint texture/buffer prep.
- Edge cases: too many bones, missing weights.
- Tests: matrix palette output.

### `packages/animation/src/BlendTree.ts`
- Purpose: 1D/2D blending.
- Edge cases: parameter outside range, empty tree.
- Tests: weights sum to 1.

### `packages/animation/src/AnimationStateMachine.ts`
- Purpose: states, transitions, conditions.
- Edge cases: transition interruption, exit time, cyclic transitions.
- Tests: deterministic transition order.

### `packages/animation/src/AnimationEvents.ts`
- Purpose: event dispatch during sampling.
- Edge cases: looping over event time, reverse playback later.
- Tests: event fires once.

### `packages/animation/src/SceneAnimationBridge.ts`
- Purpose: bind tracks to scene node transforms/properties.
- Edge cases: missing target, reparenting.
- Tests: animated scene node transform.

### `packages/animation/src/ECSAnimationBridge.ts`
- Purpose: bind tracks to ECS components.
- Edge cases: component removed during playback.
- Tests: ECS component value changes.

### `packages/animation/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Clip sampling is deterministic.
- Transform, quaternion, and scalar tracks interpolate correctly.
- Mixer supports play, stop, pause, loop, weight, and crossfade.
- State machine transitions are deterministic and test-covered.
- Skeleton matrix palette is correct for a simple two-bone rig.
- Renderer can display a skinned or transform-animated object in a browser demo.

## Testing Checklist
- Unit: tracks, clips, mixer, actions, skeleton, blend tree, state machine.
- Integration: scene bridge and ECS bridge.
- Browser/runtime: animated cube and simple skeletal demo.
- Visual: looping animation baseline, crossfade baseline.
- Animation correctness: event timing, root motion later, bone matrices.

## Implementation Order
1. Keyframes and tracks.
2. Clips and actions.
3. Mixer.
4. Scene bridge.
5. Skeleton and skinning data.
6. State machine.
7. Blend tree.
8. ECS bridge and demos.

