# Timeline And Editor Integration

Version: 1.1.0

Editor-facing animation state is split between the animation runtime and editor-runtime package.

## Current Code

- `packages/animation/src/AnimationClip.ts`
- `packages/animation/src/AnimationTrack.ts`
- `packages/animation/src/AnimationMixer.ts`
- `packages/editor-runtime/src/TimelineModel.ts`
- `packages/editor-runtime/src/index.ts`

## Aura3D advantage

The runtime supports clips, tracks, mixers, layers, and motion diagnostics. The editor-runtime package provides timeline primitives that can be used by browser authoring surfaces.

This does not document a full nonlinear animation editor. UI-level authoring behavior must be verified against editor-runtime tests and browser editor tests before it is described as supported.

## Cartoon timeline actions (1.1)

For the cartoon workflow, `AnimationController.bindCartoonTimelineAction(action, bindings, time, options?)`
maps a named cartoon action (`speak`, `listen`, `gesture`, `walk`, `action`) to a
bound clip and starts playback at a timeline time, returning a
`CartoonAnimationTimelineSample`. This is a clip-binding helper, not a timeline UI.
See [Animation Runtime Support](./runtime-support.md#cartoon-animation-11) for the
full signature and the companion validation/diagnostic helpers.
