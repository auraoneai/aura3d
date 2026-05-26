# V3 Known Gaps

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V3 is not complete until `pnpm v3:release` exists and passes. These gaps must remain visible in public docs and reports.

## Product Scope Gaps

- A3D is not a broad Three.js replacement.
- A3D is not a Unity replacement.
- A3D is not an Unreal replacement.
- A3D is not a full game engine.
- A3D is public-claim-ready when backed by the V10 reports without the final release gate.

## Rendering Gaps

- WebGPU parity is not proven.
- Broad PBR parity is not proven.
- HDR, shadow, and postprocess coverage is limited to current verified gates.
- Visual diff evidence is local and scene-specific, not a formal perceptual benchmark.

## Asset Gaps

- Full glTF parity is not proven.
- The fixture corpus is intentionally bounded.
- Loader coverage does not imply arbitrary production asset support.
- Meshopt, Draco, KTX2, animation, skinning, material extensions, and variant coverage must stay scoped to tested evidence.

## Ecosystem Gaps

- Three.js has a much larger ecosystem, loader catalog, plugin set, examples base, documentation footprint, and production deployment history.
- A3D package proof currently covers temp local tarball installation, not public registry publishing.
- External consumer proof is a generated temp app on the local machine, not independent third-party reproduction.

## Execution Gaps

- `pnpm v3:release` still needs to be created and passed.
- Documentation must stay aligned with reports.
- Any failed or stale screenshot must not be used as current product proof.
