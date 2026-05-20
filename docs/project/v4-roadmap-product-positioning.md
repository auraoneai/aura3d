# V4 Product Positioning

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Product

G3D Visual Engine V4 is an installable browser 3D SDK/runtime/toolchain for developers building production-shaped web 3D applications in supported workflows.

The primary artifact is `@galileo3d/engine`.

Proof artifacts include apps, examples, screenshots, reports, templates, and same-scene comparisons. They do not replace the package/API/toolchain contract.

## Supported Position

G3D Visual Engine V4 is being built as a high-quality Three.js competitor for:

- premium product visualization,
- asset review and glTF diagnostics,
- material authoring/review,
- architecture/interior scene review,
- animated character preview,
- lightweight interactive scenes.

## Why A Developer Would Use It

- `createG3DApp` creates a browser runtime with quality presets and diagnostics.
- `workflows` expose app-ready rendering paths for supported use cases.
- `createEnvironment`, diagnostics helpers, asset helpers, and screenshot capture reduce repeated Three.js setup.
- `create-g3d` and Vite templates prove a fresh external project can build from a packed package.
- Same-scene Three.js reports compare setup, runtime stats, screenshots, and gaps.

## Evidence

- Public API: `tests/reports/v4-api-readiness.json`
- Template install/build: `tests/reports/v4-template-readiness.json`
- Three.js parity: `tests/reports/v4-threejs-visual-parity.json`
- Gallery/visual QA: `tests/reports/v4-examples-readiness.json`
- External package consumer: `tests/reports/v4-external-consumer.json`

## Boundary

V4 does not claim broad Three.js replacement, full Three.js API compatibility, Unity replacement, Unreal replacement, full glTF ecosystem parity, broad performance superiority, or production release readiness until the final release gate proves it.
