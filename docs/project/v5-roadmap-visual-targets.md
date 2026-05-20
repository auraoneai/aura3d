# V5 Visual Targets

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


G3D V5 is being built as a premium browser 3D engine that can credibly sit beside Three.js for mainstream product, architecture, material, asset inspection, animation, postprocess, VFX, and large-scene workflows. The visual target is not "a few objects render"; the target is a full product surface with real assets, believable lighting, HDR environment use, PBR material variation, postprocess, controls, migration proof, and external package proof.

## Required Flagship Scenes

The release bundle must include final screenshots for:

- Premium product viewer: `tests/reports/v5-gallery/product/premium-product-viewer.png`
- Automotive configurator: `tests/reports/v5-gallery/automotive/automotive-configurator.png`
- Architecture daylight: `tests/reports/v5-gallery/architecture-day/interior-daylight.png`
- Architecture night: `tests/reports/v5-gallery/architecture-night/interior-night.png`
- Material library: `tests/reports/v5-gallery/materials/material-library.png`
- Asset inspector: `tests/reports/v5-gallery/assets/asset-inspector.png`
- Character animation: `tests/reports/v5-gallery/character/character-animation.png`
- Cinematic postprocess: `tests/reports/v5-gallery/postprocess/cinematic-postprocess.png`
- Particle VFX: `tests/reports/v5-gallery/vfx/particle-vfx.png`
- Large instanced scene: `tests/reports/v5-gallery/large-scene/large-instanced-scene.png`
- Shader lab: `tests/reports/v5-gallery/shader-lab/shader-lab.png`
- Migrated Three.js scene: `tests/reports/v5-gallery/threejs-migration/migrated-threejs-scene.png`

## Quality Bar

Each flagship screenshot must answer yes to these release questions:

- Is this recognizably a premium browser 3D product page or professional developer tool?
- Is the lighting believable enough to show form, scale, and material?
- Are HDR/IBL reflections or environment contributions visible where the scene needs them?
- Are materials distinguishable and physically plausible enough for inspection?
- Are shadows or contact cues present where they affect depth?
- Does postprocess improve the image instead of hiding weak rendering?
- Is scene complexity materially above primitive geometry examples?
- Does the G3D result compare credibly to the matching Three.js scene?

## Numeric Evidence

The visual target is gated by `tests/reports/v5-threejs-visual-parity.json`, which must include at least 13 same-scene comparisons and at least 10 visual score passes at or above the V5 threshold. The release is also gated by `docs/project/v5-roadmap-human-visual-review.md`, which must explicitly approve every flagship scene.

## What This Does Not Claim

Passing this target does not mean full Three.js API parity, full WebXR parity, Unreal parity, Unity parity, or broad performance superiority. Those claims remain blocked until separate implementation and external evidence exist.
