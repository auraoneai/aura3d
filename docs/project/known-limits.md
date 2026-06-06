# Aura3D Known Limits

Version: 1.0.9 planning alignment

## Current Report Limits

- `tests/reports/` is ignored by git, so report state is local and must be regenerated in clean checkouts, release jobs, and any workspace used for public claim evidence.
- Passing local reports support only the exact measured categories and routes named by those reports.

## Rendering Limits

- Renderer scene frustum culling is implemented, but it is not a broad large-scene performance claim.
- WebGPU behavior depends on browser and hardware support.
- PBR/IBL/material claims are feature-specific and route/report-specific. HDR environment map input is supported on named paths, but it is not physically complete image-based lighting.
- Postprocess support covers named passes and routes, not every low-level renderer code or game-engine post stack.
- Material coverage includes one primary UV path for glTF render resources, bounded KTX2/Basis transcoding coverage, GPU capability-driven format selection, and no product-studio material-matrix visual coverage.
- Shadow coverage includes unit-level moving-camera cascade split stress and point/spot shadow maps, but browser visual stress for long moving-camera paths remains evidence-bound.
- Skinning palette strategy and external character breadth remain evidence-bound.

## Asset Limits

- glTF/GLB support is strongest for checked fixtures and tested extension paths.
- Compression depends on decoder/transcoder availability and browser/device texture support.
- External marketplace and DCC export coverage requires explicit fixture and report evidence.

## Workflow Limits

- A3D is not documented as a Unity or Unreal replacement.
- Aura3D is not documented as Babylon.js parity or a mature commercial game engine.
- Local examples are not public hosted demo evidence.
- Template scaffolds are starter projects and require build/run verification.

## Game Runtime And Showcase Limits

- Aura3D 1.0.5 has useful browser game-runtime helpers, but the reusable 1.0.9 game-engine foundation is not complete.
- Aura Clash Arena is a development showcase and runtime proof target, not a flagship-quality game.
- The showcase has not yet proven distinct production fighters, engine-owned combat state, reliable special/guard/down behavior, stable KO/reset flow, audio, performance budgets, and deployed/local parity at the 1.0.9 bar.
- Same-model tinting, debug-like hit artifacts, repeated KO loops, weak move readability, and one/two-hit accidental rounds remain release blockers if reproduced.
- Homepage and marketing pages should use a static approved poster/link until the live playable route passes visual and gameplay gates.

## Asset Catalog Limits

- `npx @aura3d/cli@latest assets search` can discover catalog candidates, but search success is not proof that an asset is production-ready.
- Game-character prompts require `--profile fighting-character` plus validation, visual review, license/provenance evidence, bounds checks, clip checks, and route proof.
- The catalog does not generate new production art, guarantee matching rigs, guarantee animation quality, or replace artist direction.
