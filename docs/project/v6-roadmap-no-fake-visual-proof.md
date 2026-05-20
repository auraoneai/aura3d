# V6 No Fake Visual Proof Policy

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 release visuals must be real renderer output.

## Forbidden

- Canvas 2D drawing used as flagship proof.
- Inline `page.setContent()` scenes used as release screenshots.
- Mock renderer output.
- Primitive-only flagship screenshots.
- Hardcoded visual parity scores.
- Synthetic product scenes made from circles, rectangles, triangles, or stick figures.
- Screenshots with no real asset ids.
- Screenshots with no HDR environment id.
- Screenshots with zero textures, zero draw calls, or zero material count.
- Screenshots with missing pixel statistics.

## Required

- WebGL2 or WebGPU renderer backend.
- Real glTF/GLB asset ids from the V6 manifest.
- Real HDR environment id from the V6 manifest.
- Runtime renderer stats.
- Framebuffer capture from renderer canvas.
- Pixel quality statistics.
- Same-scene Three.js reference for parity scenes.
- Human review that cannot override automated failures.

## Release Rule

If a release screenshot can be generated without a real renderer backend and a real imported asset, it cannot count toward V6 completion.
