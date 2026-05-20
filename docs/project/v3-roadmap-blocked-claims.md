# V3 Blocked Claims

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


These claims are blocked until the explicit release gates in `docs/project/v3-roadmap-product-workflow-plan.md` pass.

## Blocked Product Claims

- G3D is a Unity replacement.
- G3D is an Unreal replacement.
- G3D is a full game engine replacement.
- G3D is a full Three.js API replacement.
- G3D is a broad Three.js replacement.
- G3D has full glTF parity.
- G3D has full WebGPU parity.
- G3D is broadly faster than Three.js.
- G3D is broadly superior to Three.js.

## Allowed Current Claim

G3D is building toward a high-end Three.js competitor for supported browser product, asset-viewer, material, scene, and lightweight interactive workflows.

## Future Limited Claim

A limited replacement claim is allowed only after `pnpm v3:release` passes and the same-scene comparison evidence supports the exact workflows named in `docs/project/v3-roadmap-supported-workflows.md`.

## Enforcement

`tools/v3-truth/index.ts` must fail if public docs introduce unqualified blocked claims before the release gate passes.
