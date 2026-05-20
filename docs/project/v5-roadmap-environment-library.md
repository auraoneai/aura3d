# V5 Environment Library

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The V5 environment library exists to make HDR lighting and image-based lighting a first-class product feature. It is tracked in `fixtures/v5/environments/manifest.json` and exposed through `packages/environments`.

## Required Capabilities

The environment system must provide:

- Real HDRI-backed presets for studio, outdoor, sunset, sky, industrial, and field lighting.
- PMREM preset metadata for renderer integration.
- Preview metadata for documentation, examples, and app selection controls.
- Explicit license tracking for downloaded HDRI assets.
- Runtime selection APIs that can be used by apps and templates without reaching into test fixtures.

## Product Workflows

The environment library must support:

- Product viewers where reflective materials show believable studio response.
- Automotive scenes where paint and glass respond to environment changes.
- Architecture scenes with daylight and night lighting variants.
- Material authoring where roughness, metallic, clearcoat, sheen, transmission, and specular differences are visible.

## Acceptance Evidence

The environment readiness gate is `pnpm v5:environments`. It must prove that at least 12 environment presets exist and that at least 6 real HDRI files are present, checked, and license documented.

## Release Boundary

V5 may claim HDR environment support for the shipped V5 examples and templates. It must not claim a full production lighting pipeline, full offline renderer parity, or full WebGPU lighting parity.
