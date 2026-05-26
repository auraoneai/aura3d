# Go-To-Market Strategy

Version: 1.0.0

## Wedge

A3D should lead with workflow-first browser 3D:

- product viewers and configurators;
- asset inspection and GLB/glTF diagnostics;
- material/HDR/PBR review;
- animation, skinning, morph, and IK inspection;
- migration from selected Three.js patterns into package-owned A3D workflows;
- internal browser 3D tools where repeatable screenshots and diagnostics matter.

## Message

Use evidence-backed wording:

> A3D provides first-party browser 3D workflows, diagnostics, and package boundaries for teams building product, asset, material, animation, physics, and migration tools.

Stronger parity/superiority language must wait for the relevant report suite to be regenerated and passing.

## Proof Assets

- Current package exports in `package.json`.
- Route apps under `apps/`.
- Templates under `templates/` and `packages/create-aura3d/templates/`.
- Generated reports under `tests/reports/threejs-parity/` and `tests/reports/superiority/`.
- Comparison reports under `tests/reports/comparison-threejs.json` and `tests/reports/comparison-babylon.json`.

## Avoid

- Unqualified "better than Three.js".
- Unity/Unreal replacement language.
- Broad WebGPU/device claims.
- Broad asset ecosystem claims.
- Any claim that contradicts `docs/project/threejs-superiority-status.md`.
