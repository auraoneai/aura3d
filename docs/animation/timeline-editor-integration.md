# Timeline and Editor Integration Plan

The v2 animation runtime can play clips, blend actions, drive state machines, build skinning palettes, and extract root motion. Timeline authoring is not claimed as production-ready yet. The current editor slice is an inspection and preview surface that makes animation state visible without adding a saved timeline asset format.

## Initial Editor UI

- `apps/editor/src/panels/TimelinePanel.ts` lists imported animation-capable assets and the selected project node.
- The panel exposes play, pause, scrub, and loop controls as UI state only.
- The editor renders the panel in the right rail so browser/editor inspection can verify that animation authoring is not hidden behind docs-only claims.

## Required Before Authoring Claims

1. Define a serialized timeline asset format with clip references, track bindings, root-motion policy, loop ranges, and events.
2. Add deterministic playback tests that compare editor timeline state with runtime `AnimationMixer` state.
3. Add drag/drop clip assignment from imported glTF animations.
4. Add curve/dopesheet editing for scalar, vector, quaternion, and morph-weight tracks.
5. Add project save/load tests for timeline assets and missing asset references.
6. Add browser visual tests for timeline scrubbed poses on imported skinned glTF assets.

## Current Boundary

The panel is evidence for initial timeline integration only. It is not a claim of full Unity/Unreal-style timeline authoring, retargeting, non-linear animation editing, or production animation event authoring.
