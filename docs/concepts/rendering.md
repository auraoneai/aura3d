# Rendering

The public authoring layer is `createAuraApp` plus declarative scene helpers
from `@aura3d/engine`. That is the path normal apps, templates, and
agent-authored examples should use.

## Current Root Boundary

Root `createAuraApp` can mount a browser route, load typed GLB/glTF assets,
render static model meshes and primitives, apply root-proven base colors,
limited metallic/roughness material contrast, emissive color/intensity, run
frame callbacks, expose diagnostics, and capture screenshots. Typed texture
metadata and textured asset rendering are partial until a controlled root
texture on/off pixel test is retained.

Do not imply that the root path currently proves the full production renderer
feature set by default. In particular, claims about full PBR parity, HDR/IBL
prefiltering, production shadows, postprocess stacks, WebGPU rendering,
skinned GLB deformation, morph-target rendering, normal maps, physically
accurate clearcoat, or glass/transmission require browser evidence from a route
that imports only `@aura3d/engine`.

The current root material contract evidence lives at
`tests/reports/createAuraApp-material-pbr-contract/material-contract.json`.
It proves only the features marked `pass` in that file. Features marked
`partial` or `unsupported` must be described with those labels.

## Lower-Level Renderer Packages

`@aura3d/rendering` contains lower-level renderer, production-runtime,
material, environment, WebGPU, postprocess, and visual-quality helpers. Those
exports are real package surfaces, but a package-level proof is not the same as
a root `createAuraApp` proof.

Every rendering claim should name its path:

- `root createAuraApp`: public safe API route and browser screenshot/test.
- `@aura3d/rendering`: lower-level package API or production-runtime proof.
- `source diagnostics`: scene plan or metadata only.
- `roadmap/prototype`: planned or route-local work.

## Unsupported Workarounds

Public examples must not import `three`, use `GLTFLoader`, paste raw GLB URLs,
fake scene effects with CSS/DOM overlays, or replace a named primary model with
primitives. Primitives are acceptable for set dressing, debug markers, simple
abstract visuals, and collision guides; they are not a substitute for a primary
character, vehicle, product, creature, or environment.
