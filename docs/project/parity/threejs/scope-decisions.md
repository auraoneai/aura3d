# Three.js and External-Renderer Scope Decisions

> **Historical comparison scope:** the Three.js inventory governed by these
> decisions uses frozen `three@0.165.0`; this record does not establish current
> parity with r185.

**Status:** Active product boundary  
**Decision date:** 2026-07-28  
**Applies to:** the release tracked by
`docs/project/plans/final-remaining-work-prd.md`

These decisions remove unproven compatibility work from the active release
goal. They do not convert an unsupported or partial feature into parity.
Inventory rows, generated reports, public claims, and release gates must retain
the lower status until separate implementation and browser evidence land.

**Update:** the three exclusions covering skinning, fat lines, and
TransformControls were **not** accepted. Each was implemented in full with retained
browser evidence, and those sections are marked SUPERSEDED below. They are kept
rather than deleted so the record of what was proposed, and what actually happened,
stays auditable.

## Skinning beyond the current bounded contract — SUPERSEDED, implemented

**This exclusion no longer applies.** The work it removed was implemented instead.

Joint palettes above the 96-joint uniform-array limit upload as an RGBA32F data
texture (four texels per matrix, ceiling 1024 joints), and the active path is
selected per submission. `JOINTS_1`/`WEIGHTS_1` are parsed, retained, validated,
and rendered through eight-influence shader variants with normal and tangent
handling.

The `skinning-palette-limit-fallback` and
`unsupported:skinning-extra-influences:JOINTS_1/WEIGHTS_1` diagnostics were
replaced by `skinning-data-texture-palette` and `skinning-eight-influences`,
which record the active path rather than implying a downgrade. A third influence
set (`JOINTS_2` and beyond) remains unsupported because nothing consumes it.

Evidence: `tests/reports/skinning-over-cap/skinning-over-cap.json` plus
`tests/browser/skinning-over-cap.spec.ts`. Retained claim bound: this proves
over-cap and eight-influence skinning render correct pixels; it is not a claim of
overall Three.js skinning parity.

## Fat lines — SUPERSEDED, implemented

**This exclusion no longer applies.** Screen-space fat lines were implemented.

`Geometry.screenSpaceLineSegments()` and `ScreenSpaceLineMaterial` expand strokes
in device pixels in the vertex stage, so width is stable across camera distance,
field of view, viewport size, and device pixel ratio. Butt, square, and round caps
and world-unit dashes are supported. `Geometry.wideLineSegments()` is retained for
callers that genuinely want world-space width.

Measured: an 8 CSS-pixel request renders at exactly 8 CSS pixels across seven
configurations (distance 4/16, FOV 20/50/80, viewport 240/400/640, DPR 1/2), for a
maximum deviation of 0. The same run measures the world-space quad thinning from
10px to 4px over the same distance change.

`webgl_lines_fat` is now `matched` on the strength of that measurement plus a
mounted `/apps/lines-helpers/` route. Retained claim bound: this proves
screen-space width behaviour and cap/dash support; it is not a claim of a
pixel-identical image match against Three.js `Line2`.

## TransformControls — SUPERSEDED, implemented

**This exclusion no longer applies.** Interactive transform controls were
implemented.

`@aura3d/controls` `TransformControls` exposes rendered gizmo handle geometry, ray
picking, a `pointerDown`/`pointerMove`/`pointerUp` drag lifecycle, axis and plane
constrained mutation, snapping, and distinct local/world handle orientation. The
explicit-delta `apply()` API is retained for source compatibility, and
`TRANSFORM_CONTROLS_DEPRECATION` was removed rather than left describing behaviour
that no longer applies. `@aura3d/editor-runtime` additionally exports
`InteractiveTransformGizmo` for command-history-backed editor use.

Measured: an X-arm drag moves position to `[0.5, 0, 0]` leaving Y and Z untouched,
a Z-ring drag rotates 0.785 rad on Z only, an X scale drag reaches `[1.5, 1, 1]`,
a raw 0.68 movement snaps to 0.5, and a missed pointer returns false so viewport
selection still works.

`misc_controls_transform` is now `matched`, backed by that evidence plus a mounted
`/apps/controls-transform/` route. Retained claim bound: this proves interactive
gizmo behaviour; it is not a claim of a pixel-identical image match against
Three.js `TransformControls`.

## Root renderer feature boundary

The production bridge remains explicit through
`renderer: { mode: "production" }`; it is not the default. The active root
contract includes typed-manifest GLB actors, bounded PBR scalar materials,
generated environment lighting, one bounded shadow path, and the LDR
bloom/tone-map/color-grade/FXAA plan only where root-only browser evidence
names the exact feature.

Controlled root texture toggling, file-backed HDR/PMREM/IBL comparison,
cascaded and point/spot shadow parity, SSAO, SSR, depth of field, motion blur,
TAA, native WebGPU postprocess, OpenEXR, and physical atmosphere are excluded
from the release claim. Package or production-runtime implementations remain
available under their own labels; they do not become root claims.

## Comparative performance

No Three.js performance-superiority or equivalence claim is in the active
release. The performance report must remain non-passing and non-promotional
while any of its six canonical input reports is absent. Raw comparable samples,
the frozen environment, and the 100-reload lifecycle run are prerequisites for
reopening that claim.

## Unity and Unreal

Unity and Unreal replacement/parity language is removed from the active release
goal. Real baselines require licensed/editor-installed external machines and
cannot be synthesized in this repository. Local Aura3D reference captures and
the ingestion/validation tooling may remain, but Unity/Unreal comparison
reports must stay non-passing and explicitly say that no editor-produced
baseline was captured.

This exclusion does not authorize placeholder screenshots, hand-authored
metrics, or treating runner manifests as renderer output.
