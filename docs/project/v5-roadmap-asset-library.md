# V5 Asset Library

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The V5 asset library is the content backbone for proving that G3D can render real-world browser 3D workloads instead of toy meshes. Assets are tracked in `fixtures/three-compat/assets/manifest.json` and exposed through `packages/assets/src/threejs-compatibility/V5AssetRegistry.ts`.

## Product Scope

The library must support:

- Product inspection scenes with metal, plastic, glass, emissive, and texture-backed materials.
- Automotive configurator scenes with paint, trim, glass, tire, and interior material families.
- Architecture scenes with furniture, lights, environment context, and scale cues.
- Character and animation scenes using real animated glTF assets.
- VFX and shader scenes that combine mesh assets with particles, sprites, lines, trails, and custom materials.

## Acceptance Evidence

The asset readiness gate is `pnpm three-compat:assets`. It must prove:

- At least 40 tracked assets exist in the manifest.
- At least 12 local, license-tracked visual assets are checked in and hash verified.
- Required visual slots are filled for product, material, asset viewer, architecture, automotive, character, animation, VFX, postprocess, shader, controls, and large-scene workflows.
- Provenance and license metadata are available so the package does not depend on anonymous or unverifiable assets.

## Developer Ergonomics

Developers should consume assets through the V5 registry instead of hard-coding fixture paths. Examples, templates, and apps must use public package imports and stable manifest identifiers wherever possible. Internal fixture paths are allowed in tests and readiness tools, but not in shipped V5 templates.

## Release Boundary

The V5 asset library is sufficient for the V5 broad replacement track. It is not a claim that G3D supports every glTF extension, every DCC export pipeline, or every commercial asset pipeline. Those gaps remain in `docs/project/three-compat-roadmap-known-gaps.md`.
