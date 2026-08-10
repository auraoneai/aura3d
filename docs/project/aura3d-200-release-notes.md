# Aura3D 2.0.0 Release Notes

Version: 2.0.0

Status: release candidate; unpublished

Aura3D 2.0 is a major competitive replatform, not a relabeled 1.6 build. The
major version records a changed public contract: fewer duplicate public hosts,
clear ownership for retained subsystems, typed real assets as the default
public proof path, and explicit separation between the safe root API,
production runtime, lower-level rendering packages, internal contracts, and
prototype work.

## Public-surface changes

- The public `examples/` inventory is reduced to retained routes that have a
  declared owner and an honest claim boundary.
- Duplicate or contract-only product, material, character, physics, shadow,
  HDR, WebGPU, editor-output, asset-gallery, interaction, and interior hosts
  are internal fixtures rather than public showcase entries.
- Distorted or misleading game and racing routes are removed from the public
  surface. Their existence is not counted as game-quality or ecosystem-parity
  evidence.
- Public named subjects use typed manifest assets. Raw model URLs, guessed
  sample URLs, primitive substitutes, and DOM/Canvas2D imitations are excluded
  from safe public examples.

## Visual-quality work

The 2.0 audit reviews each retained route at both canvas and full-page level.
Repairs completed in the current candidate include:

- a real typed expressive robot and changed-pose proof for Character Animation
  Viewer;
- unobscured material swatches, corrected orthographic framing, and preserved
  16:9 geometry in Material Showroom;
- spherical, evenly spaced, labeled PBR extension variants with corrected
  readback points and aspect ratio;
- a typed headphones subject and sharper 384x216 processing targets in
  Postprocess Lab;
- readable multi-row Renderer Stress Lab framing while retaining off-frustum
  culling evidence;
- continuous presentation and viewport-bounded telemetry for the deterministic
  Large Scene renderer harness;
- explicit diagnostic labeling for particles, state machines, custom
  materials, raycast/CCD, stress, and large-scene workloads.

Automated capture is not human acceptance. The final unfiltered 13-route audit
after the last repairs is green with zero failures, and every retained route has
an evidence-backed source/canvas/page disposition. Independent comparison,
full-suite, packaging, website, and publication gates remain open.

## Three.js comparison boundary

Historical `three@0.165.0` reports remain historical. Aura3D 2.0 comparison
work uses the repository-locked current target, `three@0.185.1`, and requires
same-workload and same-asset evidence. Passing an internal contract, rendering
a different scene, or retaining a route with the right title does not prove
head-to-head parity. Universal Three.js ecosystem parity is not currently
claimed.

## Publication status

`2.0.0` is not published yet. npm publication, the GitHub tag/release, website
deployment, and deprecation/supersession of older versions occur only after:

1. all final PRD implementation and comparison rows are complete;
2. the complete type, unit, integration, browser, visual, build, package-smoke,
   documentation, and release suites pass from the release commit;
3. the package inventory and tarballs are verified at version 2.0.0;
4. the public website matches the accepted examples and claim boundaries;
5. the exact npm and GitHub version inventories are captured for rollback;
6. the new package and GitHub release are verified before any older version is
   deprecated or marked superseded.

The live completion ledger is `1.6-FINAL-PRD-Finishes.md`; the filename is
retained for audit continuity, while its title and release target are 2.0.
