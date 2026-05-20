# Timeline And Editor Integration

The animation runtime can play clips, blend actions, drive state machines, build skinning palettes, apply root motion, and power v8 route demos. Timeline authoring is still not production-ready. The current editor slice is an inspection and preview surface, not a saved timeline-authoring product.

## Initial Editor UI

- `apps/editor/src/panels/TimelinePanel.ts` lists imported animation-capable assets and the selected project node.
- The panel exposes play, pause, scrub, and loop controls as UI state only.
- The editor renders the panel in the right rail so browser/editor inspection can verify that animation authoring is not hidden behind docs-only claims.
- `packages/editor-runtime/src/TimelineModel.ts` provides deterministic timeline model primitives, but it is not yet wired into a full clip/track authoring workflow with imported animation assets.

## Required Before Authoring Claims

1. Define a serialized timeline asset format with clip references, track bindings, root-motion policy, loop ranges, and events.
2. Add deterministic playback tests that compare editor timeline state with runtime `AnimationMixer` state.
3. Add drag/drop clip assignment from imported glTF animations.
4. Add curve/dopesheet editing for scalar, vector, quaternion, and morph-weight tracks.
5. Add project save/load tests for timeline assets and missing asset references.
6. Add browser visual tests for timeline scrubbed poses on imported skinned glTF assets.

## Current Boundary

The panel and model are evidence for initial timeline integration only. They are not a claim of Unity/Unreal-style timeline authoring, retargeting, non-linear animation editing, production event authoring, or a DCC-grade animation editor.
