# Audio System PRD

## Purpose
Audio provides Web Audio playback, mixers, buses, spatial sources, listener integration, streaming hooks, and runtime diagnostics. It must integrate with scene transforms without creating separate transform state.

## Lessons From Failed Attempts
- Current and 2025 attempts had large audio systems and docs claiming complete implementations.
- Broad claims were not enough; audio must be validated against browser constraints such as user gesture unlock and suspended contexts.
- Old-G3D mixed audio-reactive rendering, visualization, and advanced systems into broader platform scope too early.

Reuse conceptually:

- Audio source/listener.
- Mixer and buses.
- Spatial audio.
- Audio asset loading.

Discard:

- Audio-reactive rendering before base audio works.
- Browser autoplay assumptions.
- Separate audio transform hierarchy.

## Target Architecture
Audio consumes assets and scene transforms. It has explicit lifecycle for browser context unlock, suspend, resume, and dispose.

## File-By-File Implementation Plan

### `packages/audio/src/AudioSystem.ts`
- Purpose: public audio owner.
- Edge cases: context suspended, unlock gesture, disposal.
- Tests: mocked AudioContext lifecycle.

### `packages/audio/src/AudioContextManager.ts`
- Purpose: Web Audio context abstraction.
- Tests: unlock/resume/suspend.

### `packages/audio/src/AudioClip.ts`
- Purpose: decoded audio asset wrapper.
- Tests: duration/channels metadata.

### `packages/audio/src/AudioSource.ts`
- Purpose: playback source.
- Edge cases: play before clip loaded, looping, stop timing.
- Tests: state transitions.

### `packages/audio/src/AudioListener.ts`
- Purpose: listener bound to scene camera/node.
- Tests: transform sync.

### `packages/audio/src/SpatialAudio.ts`
- Purpose: panner configuration and distance models.
- Tests: panner values from scene transforms.

### `packages/audio/src/AudioBus.ts`
- Purpose: bus routing and gain.
- Tests: routing graph.

### `packages/audio/src/AudioMixer.ts`
- Purpose: bus graph and master output.
- Tests: volume/mute/solo.

### `packages/audio/src/AudioEffect.ts`
- Purpose: effect interface.
- Tests: connect/disconnect.

### `packages/audio/src/effects/Reverb.ts`
- Purpose: convolver/reverb effect.
- Tests: node graph.

### `packages/audio/src/effects/Filter.ts`
- Purpose: filter effect.
- Tests: frequency/Q set.

### `packages/audio/src/SceneAudioBridge.ts`
- Purpose: sync scene transforms to listener/sources.
- Tests: source position update.

### `packages/audio/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Audio context handles locked/suspended browser states.
- Clip playback, pause, stop, loop, volume, and bus routing work.
- Spatial source follows a scene node.
- Listener follows active camera.
- Audio resources dispose cleanly.

## Testing Checklist
- Unit: source states, mixer routing, effects, transform sync.
- Browser/runtime: context unlock and simple playback.
- Integration: asset loader to audio clip, scene source to listener.
- Regression: no audio node leaks after dispose.

## Implementation Order
1. Context manager.
2. Clip and source.
3. Mixer and buses.
4. Listener and spatial audio.
5. Scene bridge.
6. Effects.

