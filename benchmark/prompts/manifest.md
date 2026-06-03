# Prompt Manifest

This manifest freezes prompt order and filenames for a benchmark round. Editing this file, renaming prompt files, reordering prompts, or changing prompt wording during a run voids the run.

| Order | File | Asset Requirement |
|---:|---|---|
| 1 | `01-physics-playground.md` | none |
| 2 | `02-particle-fountain.md` | none |
| 3 | `03-procedural-solar-system.md` | none |
| 4 | `04-neon-tunnel-flythrough.md` | none |
| 5 | `05-3d-data-visualization.md` | none |
| 6 | `06-mini-golf-hole.md` | none |
| 7 | `07-material-lab.md` | none |
| 8 | `08-procedural-city-block.md` | none |
| 9 | `09-animated-primitive-humanoid.md` | none external; library built-ins allowed |
| 10 | `10-product-viewer-sneaker.md` | `benchmark/assets/sneaker.glb` only |

Prompts 1 through 9 intentionally provide no prompt-specific external assets. Aura3D may use public scene kits, helpers, and bundled built-in assets exposed by the library context. manual renderer code must not fetch, invent, or copy external assets unless the prompt explicitly provides them. Aura3D must show value through public API leverage, geometry, animation, physics, materials, lights, effects, controls, bundled library capabilities, and developer ergonomics, not through asset discovery.
