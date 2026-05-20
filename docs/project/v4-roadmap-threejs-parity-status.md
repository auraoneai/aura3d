# V4 Three.js Parity Status

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Current Status

Same-scene Three.js visual parity is covered by:

```sh
pnpm v4:compare-threejs
```

The gate renders six scene intents in the browser:

- product configurator,
- asset review,
- material metals,
- transparent material review,
- gallery/interior scene,
- interactive orbit scene.

Each comparison captures:

- G3D screenshot,
- Three.js screenshot,
- diff image,
- setup line counts,
- draw-call/runtime stats,
- visual score,
- gap notes.

## Evidence

- Browser manifest: `tests/reports/v4-threejs-visual-parity/manifest.json`
- Readiness report: `tests/reports/v4-threejs-visual-parity.json`
- Gap report: `tests/reports/v4-threejs-visual-parity/gap-report.md`

## What It Proves

For supported workflows, G3D can produce comparable browser-rendered scenes with fewer public setup lines and first-class diagnostics/workflow APIs.

## What It Does Not Prove

It does not prove broad Three.js replacement, full Three.js API compatibility, full loader parity, full PBR extension parity, long-run input latency, or ecosystem parity.
